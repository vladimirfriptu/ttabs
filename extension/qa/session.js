// Idle → a session appears → the panel is up → the session ends → idle again.
//
// The poll only ticks while idle. Once a panel is up the server is asked again
// only after something happened — a save, or the tab coming back into view —
// so an open session does not keep a request going every few seconds in every
// local tab the developer has open.

import { IDLE_POLL_MS } from './config.js';
import { readState, setPassed, finish } from './bridge.js';
import { createPanel } from './panel.js';
import { normalizeState, applyPassed, finishWarning } from '../lib/qa-cases.js';

export const startSessionWatch = () => {
  let timer = null;
  let panel = null;
  let state = null;

  const stopIdlePolling = () => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };

  const startIdlePolling = () => {
    if (timer !== null) return;
    timer = setInterval(() => { poll(); }, IDLE_POLL_MS);
  };

  const close = () => {
    panel?.destroy();
    panel = null;
    state = null;
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
    const warning = finishWarning(state.cases);
    if (warning && !window.confirm(warning)) return;

    try {
      await finish('');
    } catch (e) {
      // The panel stays up: the CLI on the other end is still blocked, so
      // pretending the session ended would hide that from the developer.
      panel?.showError(state.cases[0]?.id, `could not finish: ${e.message}`);
      return;
    }

    panel?.showEnded();
    stopIdlePolling();
    setTimeout(close, 2000);
  };

  const open = (next) => {
    state = next;
    if (!panel) panel = createPanel({ onToggle, onFinish });
    panel.render(state);
  };

  const poll = async () => {
    const next = normalizeState(await readState());

    if (!next) {
      if (panel) close();
      return;
    }

    stopIdlePolling();
    open(next);
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') poll();
  });

  poll();
  startIdlePolling();
};
