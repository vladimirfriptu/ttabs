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
import { readTaskLink } from '../lib/task-link.js';
import { createPanel } from './panel.js';
import { applyAction, clearOne } from '../lib/phases.js';
import { QA_BASE, ACTIVE_POLL_MS, COMMENT_DEBOUNCE_MS, POLL_TOLERANCE_MS } from '../qa/config.js';
import { readState as readQaState, setPassed, setComment, finish } from '../qa/bridge.js';
import { normalizeState as normalizeQaState, applyPassed, matchesTask, finishWarning } from '../lib/qa-cases.js';
import { createPendingSends } from '../lib/qa-pending.js';

export const startPhaseWatch = () => {
  let timer = null;
  let panel = null;
  let state = null;
  let key = null;
  // The tracker URL for `key`, resolved once when the key changes rather than
  // on every poll — it cannot change while the key does not, and a rejected
  // lookup is not an error, just no link.
  let link = '';
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

  // The drilled-in checklist. `qaOpen` is the phase the chip came from while the
  // screen is up and '' when it is not, so it doubles as "is that screen open" —
  // and every QA read is gated on it, because a closed screen must not leave a
  // second poll of the QA server on every localhost tab. The QA widget already
  // reads that server for its own panel; this is the same tab's second reader of
  // it, so it borrows that widget's slower cadence rather than the journal's.
  let qaOpen = '';
  let qaState = null;
  let qaTimer = null;
  let qaReading = false;
  let qaFinishing = false;

  // The checklist's half of `epoch`, bumped every time the screen goes away.
  // A QA write captures it before its await and compares after, for the reason
  // the phase side does: `qaOpen` alone cannot tell "still the same screen"
  // from "left and drilled back into the same phase", and a revert on the
  // strength of that would restore a snapshot of a session the screen has since
  // re-read.
  let qaGen = 0;

  // When the last definitive answer arrived, and whether this outage has been
  // explained yet — the same tolerance the QA widget applies, because the reason
  // is the same: a restarting server must not wipe a note being typed.
  let qaLastOk = 0;
  let qaWarned = false;

  // Text on its way to the server, declared beside the rest of the checklist's
  // state because forgetQa() disposes of it along with the rest.
  //
  // Which case a comment belongs to travels with it; the module deliberately does
  // not catch, so the failure has to be absorbed here — an unhandled rejection in
  // a timer reaches nobody.
  const sendComment = (id, text) =>
    setComment(id, text).catch((e) => panel?.showQaError(id, `not saved: ${e.message}`));

  const comments = createPendingSends(sendComment, COMMENT_DEBOUNCE_MS);

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

  // Separate from note(): the two screens go quiet for unrelated reasons, and a
  // reason printed for one must not silence the other's.
  let qaNotice = null;
  const qaNote = (reason) => {
    if (qaNotice === reason) return;
    qaNotice = reason;
    if (reason) console.debug(`[task-tabs] ${reason}`);
  };

  const stopQa = () => {
    if (qaTimer === null) return;
    clearTimeout(qaTimer);
    qaTimer = null;
  };

  const scheduleQa = () => {
    stopQa();
    // A hidden tab keeps no timer here either; visibilitychange brings it back.
    if (qaOpen === '' || document.hidden) return;
    qaTimer = setTimeout(() => { qaPoll(); }, ACTIVE_POLL_MS);
  };

  // Everything the drilled-in screen holds, dropped. The panel is left alone:
  // one caller has already taken the screen down (the back chevron, or the
  // journal dropping the action), the other is about to.
  const forgetQa = () => {
    qaOpen = '';
    qaState = null;
    qaFinishing = false;
    qaNotice = null;
    qaWarned = false;
    qaGen += 1;
    stopQa();
    // A debounced note is a sentence the developer typed and meant to keep, and
    // most of the ways out of this screen are not theirs: the tab moved group,
    // or the journal dropped the action. Their own back blurs the field first,
    // which has already committed, so this is a no-op on that path. Not awaited
    // — nothing here can wait, and sendComment absorbs its own failure.
    comments.flush();
    comments.clear();
  };

  const close = () => {
    forgetQa();
    epoch += 1;
    panel?.destroy();
    panel = null;
    state = null;
    link = '';
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
    if (tabKey !== key) {
      epoch += 1;
      at = epoch;
      // A rejection is the same runtime-message failure as readTaskKey's own —
      // not "no site configured", which resolves '' — so it is swallowed the
      // same quiet way and the panel falls back to plain text.
      link = await readTaskLink(tabKey).catch(() => '');
    }
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

  const qaPoll = async () => {
    if (qaOpen === '' || qaReading) return;
    qaReading = true;

    let raw;
    try {
      raw = await readQaState();
    } catch (e) {
      if (!qaWarned) {
        qaWarned = true;
        console.debug(`[task-tabs] cannot reach the QA server at ${QA_BASE} —`, e.message);
      }
      // A hiccup keeps the checklist on screen: the notes typed into it live in
      // the view, and a restart that took them down would be worse than a
      // screen that is a few seconds stale. Only a real absence empties it —
      // and only a screen with a checklist on it has anything worth the wait,
      // so one that never got one answers at once instead of sitting blank.
      // The reason travels with it: a server that did not answer has established
      // nothing about whether a session exists, and the screen for that says so
      // rather than offering to record the phase on the strength of it.
      if (qaState === null || Date.now() - qaLastOk >= POLL_TOLERANCE_MS) {
        qaState = null;
        panel?.showQaEmpty('unreachable');
      }
      scheduleQa();
      return;
    } finally {
      qaReading = false;
    }

    // The screen closed while this read was on the wire, and whoever closed it
    // has already dropped the timer.
    if (qaOpen === '') return;

    qaLastOk = Date.now();
    qaWarned = false;
    const next = normalizeQaState(raw);

    // No session at all (a 404), and a session belonging to another task, are
    // one screen: there is no checklist here, and the way on is to close the
    // phase by hand. matchesTask is the QA widget's own rule, unchanged.
    if (!next || !matchesTask(next, key)) {
      qaNote(next ? `the running QA session is ${next.task}'s, not this tab's ${key} — no checklist to show` : null);
      qaState = null;
      panel?.showQaEmpty('no-session');
      scheduleQa();
      return;
    }

    qaNote(null);
    qaState = next;
    if (!qaFinishing) panel?.renderQa(qaState);
    scheduleQa();
  };

  // The chip is clicked; the panel has already swapped its body and says which
  // phase the journal put the action on.
  const onChipQa = (phase) => {
    qaOpen = phase;
    qaLastOk = Date.now();
    qaPoll();
  };

  const onQaBack = () => forgetQa();

  const onQaToggle = async (id, passed) => {
    // The checklist emptied under the click — a session that ended between the
    // render and the pointer — and there is nothing left to flip.
    if (!qaState) return;

    const previous = qaState;
    const at = qaGen;
    qaState = applyPassed(qaState, id, passed);
    // The box is drawn, not native, so it only shows the flip once re-rendered.
    panel?.renderQa(qaState);

    try {
      await setPassed(id, passed);
    } catch (e) {
      // The screen this snapshot belongs to is gone — forgetQa() has already
      // emptied qaState, and restoring it here would leave the next poll's
      // tolerance branch nursing a checklist nobody is looking at for a full
      // POLL_TOLERANCE_MS instead of emptying the screen at once.
      if (qaGen !== at) return;
      // Revert before re-rendering, or the finish warning would count a case the
      // server never recorded as passed.
      qaState = previous;
      panel?.renderQa(qaState);
      panel?.showQaError(id, `not saved: ${e.message}`);
      return;
    }

    await qaPoll();
  };

  const onQaComment = (id, text) => comments.queue(id, text);

  const onQaCommentCommit = (id, text) => {
    comments.queue(id, text);
    return comments.sendNow(id);
  };

  const onQaFinish = async () => {
    if (qaFinishing) return;

    const warning = finishWarning(qaState?.cases ?? []);
    if (warning && !window.confirm(warning)) return;

    qaFinishing = true;
    const at = qaGen;

    try {
      await comments.flush();
      await finish('');
    } catch (e) {
      // The screen left while the finish was on the wire: forgetQa() has already
      // cleared qaFinishing, and the complaint belongs to a foot that is gone —
      // or, worse, to the next session's.
      if (qaGen !== at) return;
      qaFinishing = false;
      // The screen stays up: the CLI on the other end is still blocked, so
      // pretending the session ended would hide that from the developer.
      panel?.showQaFinishError(`could not finish: ${e.message}`);
      return;
    }

    // Nothing here records the phase. The QA server does it itself on the way
    // out (`--by qa-test-server`), and two writes to two servers behind one
    // click is a half-done state nobody can reconcile — so this only goes back
    // to the list and reads the journal, which is where the closed row appears.
    forgetQa();
    panel?.leaveQa();
    poll();
  };

  // The one path on this screen that records the phase, and the reason it may:
  // there is no session to finish, so finishing cannot be what closes it. It
  // closes the phase the chip came from, which is the only one it knows.
  const onQaCloseWithout = async () => {
    const phase = qaOpen;
    forgetQa();
    panel?.leaveQa();
    await onCheck(phase, 'done');
  };

  const show = (next) => {
    state = next;
    if (!panel) {
      panel = createPanel({
        onCheck,
        onChipQa,
        qa: {
          onBack: onQaBack,
          onToggle: onQaToggle,
          onComment: onQaComment,
          onCommentCommit: onQaCommentCommit,
          onFinish: onQaFinish,
          onCloseWithout: onQaCloseWithout,
        },
      });
    }
    panel.render(state, link);
  };

  const onCheck = async (phase, action) => {
    const previous = state;
    const optimistic = action === 'clear' ? clearOne(state, phase) : applyAction(state, phase, action);
    show(optimistic);
    const at = epoch;
    const mutatedAt = mutated;

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
      //
      // Unless another mutation's answer landed in the meantime — a second click
      // while this one was on the wire. That answer is the server's own journal,
      // and `previous` predates it, so reverting would put a state on screen that
      // never existed anywhere. The same two counters read() drops a stale GET
      // on; `epoch` alone does not move for a mutation on the same task.
      if (mutated === mutatedAt) {
        state = previous;
        panel?.render(state, link);
      }
      // Said either way: the click failed, and the row it failed on is where that
      // belongs.
      panel?.showError(phase, `not saved: ${e.message}`);
      // Armed here rather than left to whichever path happened to arm it last: a
      // failed write must not be the reason the panel stops re-reading.
      schedule(POLL_MS);
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
    // journal after the server's own rules ran, which may differ from the single
    // field we flipped.
    // Counting it is what makes a GET older than this answer drop its snapshot.
    mutated += 1;
    show(answer);
    schedule(POLL_MS);
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop();
      stopQa();
      return;
    }

    // The checklist has been as blind as the journal for as long as the tab was.
    if (qaOpen !== '') qaPoll();
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
