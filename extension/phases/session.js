// No task group → nothing. No server → nothing, quietly, and ask again in a
// minute. A task with a journal → a panel that re-reads it every five seconds
// while the tab is visible and not at all while it is not.
//
// One self-rescheduling timeout rather than an interval, because the two
// cadences (a live poll and a minute-long backoff) and the hidden-tab pause are
// three states of the same timer, and an interval can only express one.

import { POLL_MS, DEAD_RETRY_MS, TASK_KEY_PATTERN, PHASE_BASE } from './config.js';
import { readState, mutate } from './bridge.js';
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
    } finally {
      reading = false;
    }
  };

  const read = async () => {
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

    key = tabKey;

    let next;
    try {
      next = await readState(key);
    } catch (e) {
      markDead(`cannot reach the phase server at ${PHASE_BASE} —`, e.message);
      return;
    }

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

    let answer;
    try {
      answer = await mutate(phase, { task: key, action });
    } catch (e) {
      // Revert before re-rendering: the optimistic tick claimed something the
      // journal does not say, and the panel is the only place that claim exists.
      state = previous;
      panel?.render(state);
      panel?.showError(phase, `not saved: ${e.message}`);
      return;
    }

    // The server's answer replaces the optimistic guess wholesale — it is the
    // journal after the fold, which may differ from the single field we flipped.
    show(answer);
    schedule(POLL_MS);
  };

  const onReset = async (phase) => {
    // The cascade is the server's, and it reaches every later phase — so the
    // confirmation names them, read off the canonical order in the response
    // rather than a list this widget keeps of its own.
    if (!window.confirm(resetWarning(state.phases, phase))) return;

    let answer;
    try {
      answer = await mutate(phase, { task: key, action: 'reset' });
    } catch (e) {
      panel?.showError(phase, `not reset: ${e.message}`);
      return;
    }

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

  poll();
};
