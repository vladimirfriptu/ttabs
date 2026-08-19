// The panel's DOM, and nothing else — it renders what it is given and reports
// clicks back. Deciding what to do with a click is session.js's business.

import { closedCount, hasRecords, isSettable } from '../lib/phases.js';
import { PANEL_CSS } from './styles.js';

const HOST_ID = 'task-tabs-phase-panel';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const CLASS_FOR_STATE = { '': 'pending', done: 'done', skip: 'skip', open: 'open' };

const phaseRow = (entry, onCheck, onReset) => {
  const wrapper = el('div', `phase ${CLASS_FOR_STATE[entry.state]}`);
  wrapper.dataset.phase = entry.phase;

  const row = el('div', 'row');

  const checkbox = el('input');
  checkbox.type = 'checkbox';
  checkbox.checked = entry.state === 'done' || entry.state === 'open';
  // Undoing a closed phase is `reset`, which cascades — that is the button
  // below, behind a confirmation, and never this checkbox. `open` stays
  // clickable: a human may close it by hand, only never author it.
  checkbox.disabled = !isSettable(entry);
  checkbox.title = checkbox.disabled ? 'already recorded — use ⟲ to reopen' : 'click: done · alt-click: skip';
  // Alt-click is a skip. The listener is on click rather than change because
  // change carries no modifier keys, and the box is repainted from the server's
  // answer anyway.
  checkbox.addEventListener('click', (event) => {
    event.preventDefault();
    onCheck(entry.phase, event.altKey ? 'skip' : 'done');
  });

  const name = el('span', 'name', entry.phase);

  const reset = el('button', 'reset', '⟲');
  reset.type = 'button';
  reset.title = `reset ${entry.phase} and everything after it`;
  reset.addEventListener('click', () => onReset(entry.phase));

  row.append(checkbox, name);
  if (entry.state === 'skip') row.append(el('span', 'badge skipped', 'skipped'));
  if (entry.state === 'open') row.append(el('span', 'badge open', 'open'));
  row.append(reset);
  wrapper.append(row);

  // `open` means the phase ran and left something outstanding, and the detail is
  // the whole reason it is not done — it goes on the row, not in a tooltip.
  if (entry.state === 'open' && entry.detail) wrapper.append(el('div', 'detail', entry.detail));
  else if (entry.state === 'skip' && entry.detail) wrapper.append(el('div', 'meta', entry.detail));

  if (entry.by || entry.ts) {
    const stamp = [entry.by, entry.ts].filter(Boolean).join(' · ');
    row.title = stamp;
  }

  return wrapper;
};

export const createPanel = ({ onCheck, onReset }) => {
  const host = el('div');
  host.id = HOST_ID;
  // Closed so a script elsewhere on the page cannot reach shadowRoot to forge
  // clicks on a checklist that writes to disk.
  const root = host.attachShadow({ mode: 'closed' });

  // Collapsed state is UI-only and lives here, not in session.js: a poll
  // re-renders every five seconds and must not undo a collapse the developer
  // just did to see the page underneath.
  let collapsed = false;

  const style = el('style', null, PANEL_CSS);
  const panel = el('div', 'panel');
  // The header itself is the collapse control (a real button, so it is
  // keyboard-reachable) rather than a div wrapping its own button — nesting a
  // clickable button inside a clickable div would fire both listeners.
  const head = el('button', 'head');
  head.type = 'button';
  const task = el('span', 'task');
  const round = el('span', 'round');
  const count = el('span', 'count');
  const chevron = el('span', 'chevron', '–');
  const body = el('div', 'body');

  const applyCollapsed = () => {
    body.hidden = collapsed;
    panel.classList.toggle('collapsed', collapsed);
    head.setAttribute('aria-label', collapsed ? 'expand' : 'collapse');
    chevron.textContent = collapsed ? '🧭' : '–';
    head.title = collapsed ? `${task.textContent} — ${count.textContent}` : '';
  };

  head.addEventListener('click', () => {
    collapsed = !collapsed;
    applyCollapsed();
  });

  head.append(task, round, count, chevron);
  panel.append(head, body);
  root.append(style, panel);
  document.documentElement.append(host);

  return {
    render(state) {
      task.textContent = state.task;
      // A task that has been round the pipeline more than once is important
      // context; round 1 is the default and needs no badge.
      round.textContent = state.round > 1 ? `round ${state.round}` : '';
      round.hidden = state.round <= 1;
      count.textContent = `${closedCount(state.phases)}/${state.phases.length}`;

      const scrollTop = body.scrollTop;
      body.replaceChildren();
      for (const entry of state.phases) body.append(phaseRow(entry, onCheck, onReset));
      if (!hasRecords(state.phases)) body.append(el('div', 'empty', 'no records yet'));
      else if (state.next) body.append(el('div', 'empty', `next: ${state.next}`));
      body.scrollTop = scrollTop;

      applyCollapsed();
    },

    // Attached to the row that failed, and wiped by the next render — the poll
    // five seconds later carries the server's own answer, which is the better
    // explanation of what actually happened.
    showError(phase, message) {
      const row = body.querySelector(`.phase[data-phase="${CSS.escape(phase)}"]`);
      if (!row) return;
      const existing = row.querySelector('.error');
      if (existing) existing.remove();
      row.append(el('div', 'error', message));
      if (collapsed) {
        collapsed = false;
        applyCollapsed();
      }
    },

    destroy() {
      host.remove();
    },
  };
};
