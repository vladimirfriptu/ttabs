// No task group → nothing. No server → nothing, quietly, and ask again in a
// minute. A task with a journal → a panel that re-reads it every five seconds
// while the tab is visible and not at all while it is not.
//
// One self-rescheduling timeout rather than an interval, because the two
// cadences (a live poll and a minute-long backoff) and the hidden-tab pause are
// three states of the same timer, and an interval can only express one.

import { POLL_MS, DEAD_RETRY_MS, TASK_KEY_PATTERN, PHASE_BASE } from './config.js';
import { readState, mutate, HttpStatusError } from './bridge.js';
import { readTaskKey } from '../lib/task-key.js';
import { createPanel } from './panel.js';
import { applyAction, resetWarning } from '../lib/phases.js';

export const startPhaseWatch = () => {
  let timer = null;
  let panel = null;
  let state = null;
  let key = null;
  let reading = false;
  let deadUntil = 0;

  // The identity of "which task this panel currently belongs to" — bumped
  // only in close() and when the tab's key turns out to have changed, never on
  // an ordinary render. A read or a mutation captures it before its await and
  // compares after: a mismatch means the panel has since closed or moved to
  // another task, so this reply is stale and must neither paint over it nor
  // re-arm a timer that whoever superseded it already re-armed.
  let epoch = 0;

  // How many mutations are currently awaiting the server. While it is
  // non-zero, a routine poll's GET is not the authoritative answer for
  // whatever the click is changing — the mutation's own reply is — so read()
  // skips painting its snapshot but still keeps the timer running.
  let mutating = 0;

  // How many mutation answers have been rendered, ever. It covers the ordering
  // `mutating` cannot: a GET that left before a click and lands after that
  // click's answer has already been painted, by which time `mutating` is back
  // to zero and the snapshot in hand predates the change. read() captures this
  // before its awaits and drops its answer if it has moved since.
  let mutated = 0;

  // The last "why nothing is showing" reason printed for this tab, or null when
  // there is nothing to explain. Printed once per reason, and again only once
  // the reason changes, so a tab that sits outside a task group forever does not
  // spam the console every five seconds. console.debug throughout: Chrome hides
  // it unless the level filter is Verbose, and most localhost tabs have no phase
  // server behind them — anything louder would be a line of someone else's
  // console on nearly every page load.
  let notice = null;
  const note = (reason) => {
    if (notice === reason) return;
    notice = reason;
    if (reason) console.debug(`[task-tabs] ${reason}`);
  };

  const close = () => {
    epoch += 1;
    panel?.destroy();
    panel = null;
    state = null;
  };

  const stop = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  const schedule = (delay) => {
    stop();
    // A hidden tab keeps no timer: the visibilitychange handler is what brings
    // it back, so a backgrounded tab costs nothing at all.
    if (document.hidden) return;
    timer = setTimeout(() => { poll(); }, delay);
  };

  const markDead = (reason, detail) => {
    note(`${reason} ${detail}`);
    close();
    deadUntil = Date.now() + DEAD_RETRY_MS;
    schedule(DEAD_RETRY_MS);
  };

  const poll = async () => {
    // A read still in flight is a read that will reschedule when it lands; a
    // second one would only queue writes behind a server that is already slow.
    if (reading) return;
    reading = true;
    try {
      await read();
    } catch (e) {
      // A timer callback reaches no catch of its own, so a bug anywhere in
      // read() — not just its two guarded network calls — would otherwise take
      // the whole widget down silently (no timer left armed while the tab is
      // visible) and loudly, as an "Uncaught (in promise)" Chrome logs at the
      // default console level regardless of the level filter.
      note(`the phase widget hit an internal error — ${e.message}`);
      schedule(POLL_MS);
    } finally {
      reading = false;
    }
  };

  const read = async () => {
    let at = epoch;
    const mutatedAt = mutated;

    let tabKey;
    try {
      tabKey = await readTaskKey();
    } catch (e) {
      // A rejection here is the runtime-message round-trip failing (the service
      // worker restarting, the extension reloading), not an answer of "no task"
      // — so it gets the server's backoff rather than closing the panel for good.
      markDead('cannot ask the extension what this tab\'s task is —', e.message);
      return;
    }

    if (!tabKey || !TASK_KEY_PATTERN.test(tabKey)) {
      note("this tab isn't in a task's tab group — no phases to show");
      close();
      key = null;
      schedule(POLL_MS);
      return;
    }

    // A key that changed under us — the tab moved to another group — starts a
    // new epoch too, so an answer already in flight for the old key cannot
    // later paint itself over this task.
    if (tabKey !== key) { epoch += 1; at = epoch; }
    key = tabKey;

    let next;
    try {
      next = await readState(key);
    } catch (e) {
      if (e instanceof HttpStatusError) {
        // The server is up and refusing — a 409 (two branches carry this task
        // key) is a state its contract names and the owner acts on. Closing the
        // panel and going quiet for a minute is what an absent server looks
        // like, so this keeps the panel, says so where it can be seen, and
        // holds the ordinary cadence.
        note(`the phase server answered ${e.status} for ${key}`);
        panel?.showNotice(`the phase server answered ${e.status}`);
        deadUntil = 0;
        schedule(POLL_MS);
        return;
      }
      markDead(`cannot reach the phase server at ${PHASE_BASE} —`, e.message);
      return;
    }

    // Something fresher has already been painted since this read left: the
    // panel closed or moved to another task (epoch), or a mutation's answer —
    // the journal after the server's own fold, not a guess — landed first
    // (mutated). Whoever painted it re-armed the timer, so there is nothing to
    // arm here. Neither counter covers a GET still in flight while a mutation
    // is outstanding; `mutating` below is what holds that ordering.
    if (epoch !== at || mutated !== mutatedAt) return;

    deadUntil = 0;

    if (!next) {
      note(`the phase server has no journal for ${key} — nothing to show`);
      close();
      schedule(POLL_MS);
      return;
    }

    // The server answers a task it was asked about, but a tab dragged between
    // groups mid-request would otherwise paint another task's phases over this
    // one's page.
    if (next.task !== key) {
      note(`the server answered for ${next.task}, not this tab's ${key} — hiding its phases`);
      close();
      schedule(POLL_MS);
      return;
    }

    note(null);
    // A poll that got an answer is the proof that whatever the foot complained
    // about is over.
    panel?.clearNotice();

    // A mutation is in flight for this exact task: its own answer is the
    // authoritative one for whatever it is changing, so this poll's snapshot
    // sits out this round rather than racing it — the timer still ticks, and
    // the next read (or the mutation's own render) catches up regardless.
    if (mutating > 0) {
      schedule(POLL_MS);
      return;
    }

    show(next);
    schedule(POLL_MS);
  };

  const show = (next) => {
    state = next;
    if (!panel) panel = createPanel({ onCheck, onReset });
    panel.render(state);
  };

  const onCheck = async (phase, action) => {
    const previous = state;
    show(applyAction(state, phase, action));
    const at = epoch;

    let answer;
    mutating += 1;
    try {
      answer = await mutate(phase, { task: key, action });
    } catch (e) {
      // A close or a fresher render since the optimistic tick means the panel
      // — or the task it belongs to — has already moved on; reverting now
      // would resurrect exactly what close() just took down.
      if (epoch !== at) return;
      // Revert before re-rendering: the optimistic tick claimed something the
      // journal does not say, and the panel is the only place that claim exists.
      state = previous;
      panel?.render(state);
      panel?.showError(phase, `not saved: ${e.message}`);
      return;
    } finally {
      // Unblocks read()'s rendering whether the mutation succeeded or failed —
      // a rejected write must not wedge every poll behind it forever.
      mutating -= 1;
    }

    // Same guard on the success path — a read or another mutation that landed
    // first already replaced what this click touched.
    if (epoch !== at) return;

    // The server's answer replaces the optimistic guess wholesale — it is the
    // journal after the fold, which may differ from the single field we flipped.
    // Counting it is what makes a GET older than this answer drop its snapshot.
    mutated += 1;
    show(answer);
    schedule(POLL_MS);
  };

  // A confirmation is modal, so a second click cannot land while it is open —
  // but it can while the accepted reset is still in flight, and asking again
  // about a cascade already under way is worse than ignoring the click.
  let resetting = false;

  const onReset = async (phase) => {
    if (resetting) return;

    // The cascade is the server's, and it reaches every later phase — so the
    // confirmation names them, read off the canonical order in the response
    // rather than a list this widget keeps of its own.
    if (!window.confirm(resetWarning(state.phases, phase))) return;
    const at = epoch;

    let answer;
    resetting = true;
    mutating += 1;
    try {
      answer = await mutate(phase, { task: key, action: 'reset' });
    } catch (e) {
      if (epoch !== at) return;
      panel?.showError(phase, `not reset: ${e.message}`);
      return;
    } finally {
      resetting = false;
      mutating -= 1;
    }

    if (epoch !== at) return;

    mutated += 1;
    show(answer);
    schedule(POLL_MS);
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop();
      return;
    }
    // Coming back into view reads immediately — the tab has been blind for as
    // long as it was hidden — unless the server was found dead less than a
    // minute ago, in which case the backoff still owns the timer.
    const wait = deadUntil - Date.now();
    if (wait > 0) schedule(wait);
    else poll();
  });

  // A link opened straight into a background tab is hidden at document_idle
  // too; a hidden tab costs nothing, so this waits for visibilitychange
  // rather than firing one request just to be told to stop.
  if (!document.hidden) poll();
};
