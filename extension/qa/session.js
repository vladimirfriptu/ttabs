// Idle → a session appears → the panel is up → the session ends → idle again.
//
// Two interval timers, never both live: a fast one while idle, a slow
// keep-alive once a panel is up. The slow one exists so a tab that is visible
// but never focused — a second monitor, the normal manual-QA layout — still
// notices the session ending instead of the panel going zombie forever.
//
// "The session ended" and "the server process died" arrive the same way — a
// failed poll — so a panel only closes once POLL_TOLERANCE_MS has passed
// since the last definitive answer, giving a restart that long to come back.

import { IDLE_POLL_MS, ACTIVE_POLL_MS, COMMENT_DEBOUNCE_MS, POLL_TOLERANCE_MS } from './config.js';
import { readState, setPassed, setComment, finish } from './bridge.js';
import { createPanel } from './panel.js';
import { normalizeState, applyPassed, finishWarning } from '../lib/qa-cases.js';
import { createPendingSends } from '../lib/qa-pending.js';

export const startSessionWatch = () => {
  let timer = null;
  let activeTimer = null;
  let panel = null;
  let state = null;
  let finishing = false;

  // When the last definitive answer (a session, or a real 404) arrived. Only
  // consulted while a panel is up: at idle with no server every poll fails
  // forever, and there is nothing meaningful to measure it against.
  let lastOk = Date.now();

  // The pending module deliberately does not catch, so the failure has to be
  // absorbed here — an unhandled rejection in a timer reaches nobody.
  const sendComment = (id, text) =>
    setComment(id, text).catch((e) => panel?.showError(id, `not saved: ${e.message}`));

  const comments = createPendingSends(sendComment, COMMENT_DEBOUNCE_MS);

  const onComment = (id, text) => comments.queue(id, text);

  const onCommentCommit = (id, text) => {
    comments.queue(id, text);
    return comments.sendNow(id);
  };

  const stopIdlePolling = () => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };

  const startIdlePolling = () => {
    if (timer !== null) return;
    timer = setInterval(() => { poll(); }, IDLE_POLL_MS);
  };

  const stopActivePolling = () => {
    if (activeTimer === null) return;
    clearInterval(activeTimer);
    activeTimer = null;
  };

  const startActivePolling = () => {
    if (activeTimer !== null) return;
    activeTimer = setInterval(() => { poll(); }, ACTIVE_POLL_MS);
  };

  const close = () => {
    comments.clear();
    panel?.destroy();
    panel = null;
    state = null;
    finishing = false;
    lastOk = Date.now();
    stopActivePolling();
    startIdlePolling();
  };

  const onToggle = async (id, passed) => {
    const previous = state;
    state = applyPassed(state, id, passed);
    try {
      await setPassed(id, passed);
    } catch (e) {
      // Revert the optimistic flip before re-rendering, or onFinish's warning
      // would count a case the server never actually recorded as passed.
      state = previous;
      panel?.render(state);
      panel?.showError(id, `not saved: ${e.message}`);
      return;
    }
    await poll();
  };

  const onFinish = async () => {
    if (finishing) return;

    const warning = finishWarning(state.cases);
    if (warning && !window.confirm(warning)) return;

    finishing = true;
    panel?.clearFinishError();

    try {
      await comments.flush();
      await finish('');
    } catch (e) {
      finishing = false;
      // The panel stays up: the CLI on the other end is still blocked, so
      // pretending the session ended would hide that from the developer.
      // No single row fits — cases: [] is valid — so this goes in the foot.
      panel?.showFinishError(`could not finish: ${e.message}`);
      return;
    }

    panel?.showEnded();
    stopActivePolling();
    setTimeout(close, 2000);
  };

  const open = (next) => {
    state = next;
    if (!panel) panel = createPanel({ onToggle, onComment, onCommentCommit, onFinish });
    panel.render(state);
  };

  const poll = async () => {
    let raw;
    try {
      raw = await readState();
    } catch {
      // Not a definitive answer on its own — a lone hiccup is the server
      // restarting or the service worker asleep, and the panel's typed text
      // must survive that. But the same rejection is also what "the server
      // process is gone" looks like, so once nothing but failures has
      // arrived for POLL_TOLERANCE_MS, while a panel is up, it is read as
      // the session having ended — however many polls that took.
      if (panel && Date.now() - lastOk >= POLL_TOLERANCE_MS) close();
      return;
    }

    lastOk = Date.now();
    const next = normalizeState(raw);

    if (!next) {
      if (panel) close();
      return;
    }

    // A finish already succeeded and the "session ended" notice is showing;
    // a poll landing in that two-second grace window must not repaint over
    // it with a live-looking checklist.
    if (finishing) return;

    stopIdlePolling();
    open(next);
    startActivePolling();
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') poll();
  });

  poll();
  startIdlePolling();
};
