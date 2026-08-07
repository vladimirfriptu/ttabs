// Idle → a session appears → the panel is up → the session ends → idle again.
//
// Two interval timers, never both live: a fast one while idle, a slow
// keep-alive once a panel is up. The slow one exists so a tab that is visible
// but never focused — a second monitor, the normal manual-QA layout — still
// notices the session ending instead of the panel going zombie forever.

import { IDLE_POLL_MS, ACTIVE_POLL_MS, COMMENT_DEBOUNCE_MS } from './config.js';
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
    stopActivePolling();
    startIdlePolling();
  };

  const onToggle = async (id, passed) => {
    state = applyPassed(state, id, passed);
    try {
      await setPassed(id, passed);
    } catch (e) {
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

    try {
      await comments.flush();
      await finish('');
    } catch (e) {
      finishing = false;
      // The panel stays up: the CLI on the other end is still blocked, so
      // pretending the session ended would hide that from the developer.
      panel?.showError(state?.cases?.[0]?.id, `could not finish: ${e.message}`);
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
      // A transport hiccup, not a definitive answer — the server may be
      // restarting or the service worker asleep. Leave the panel and its
      // typed text exactly as they are; the next tick tries again.
      return;
    }

    const next = normalizeState(raw);

    if (!next) {
      if (panel) close();
      return;
    }

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
