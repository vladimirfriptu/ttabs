// The panel's DOM, and nothing else — it renders what it is given and reports
// clicks back. Deciding what to do with a click is session.js's business.

import { groupByArea } from '../lib/qa-cases.js';
import { PANEL_CSS } from './styles.js';

const HOST_ID = 'task-tabs-qa-panel';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const details = (item) => {
  const box = el('div', 'details');

  if (item.steps.length > 0) {
    const list = el('ol');
    for (const step of item.steps) list.append(el('li', null, step));
    box.append(list);
  }

  if (item.expectedResult) box.append(el('div', 'expected', `→ ${item.expectedResult}`));

  return box;
};

const caseRow = (item, onToggle) => {
  const wrapper = el('div', `case ${item.status}`);
  wrapper.dataset.id = item.id;

  const row = el('div', 'row');

  const checkbox = el('input');
  checkbox.type = 'checkbox';
  checkbox.checked = item.passed;
  checkbox.addEventListener('change', () => onToggle(item.id, checkbox.checked));

  const title = el('button', 'title', item.title);
  const expanded = details(item);
  expanded.hidden = true;
  title.addEventListener('click', () => { expanded.hidden = !expanded.hidden; });

  row.append(checkbox, title);
  if (item.status === 'new' || item.status === 'updated') {
    row.append(el('span', `badge ${item.status}`, item.status));
  }

  wrapper.append(row, expanded);
  return wrapper;
};

const discrepancySection = (discrepancies) => {
  const box = el('section', 'discrepancies');
  box.append(el('h2', null, 'requirement discrepancies'));

  for (const item of discrepancies) {
    const entry = el('div', 'discrepancy');
    entry.append(el('div', 'summary', `${item.id} — ${item.summary}`));
    if (item.source) entry.append(el('div', 'meta', `source: ${item.source}`));
    if (item.implemented) entry.append(el('div', 'meta', `implemented: ${item.implemented}`));
    box.append(entry);
  }

  return box;
};

export const createPanel = ({ onToggle, onFinish }) => {
  const host = el('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'open' });

  // Collapsed state is UI-only and lives here, not in session.js: a poll can
  // re-render at any time and must not undo a collapse the developer just did
  // to see the page underneath.
  let collapsed = false;

  const style = el('style', null, PANEL_CSS);
  const panel = el('div', 'panel');
  const head = el('div', 'head');
  const task = el('span', 'task');
  const count = el('span', 'count');
  const collapseToggle = el('button', 'collapse-toggle', '–');
  collapseToggle.type = 'button';
  const body = el('div', 'body');
  const foot = el('div', 'foot');
  const done = el('button', 'done', 'Done');

  const applyCollapsed = () => {
    body.hidden = collapsed;
    foot.hidden = collapsed;
    collapseToggle.textContent = collapsed ? '▸' : '–';
    collapseToggle.setAttribute('aria-label', collapsed ? 'expand' : 'collapse');
  };

  collapseToggle.addEventListener('click', () => {
    collapsed = !collapsed;
    applyCollapsed();
  });

  done.addEventListener('click', onFinish);
  head.append(task, count, collapseToggle);
  foot.append(done);
  panel.append(head, body, foot);
  root.append(style, panel);
  document.documentElement.append(host);

  return {
    render(state) {
      task.textContent = state.task;
      const passed = state.cases.filter((c) => c.passed).length;
      count.textContent = `${passed}/${state.cases.length}`;

      body.replaceChildren();
      for (const group of groupByArea(state.cases)) {
        body.append(el('div', 'area', group.area));
        for (const item of group.cases) body.append(caseRow(item, onToggle));
      }
      if (state.discrepancies.length > 0) body.append(discrepancySection(state.discrepancies));

      foot.hidden = false;
      applyCollapsed();
    },

    showError(id, message) {
      const row = body.querySelector(`.case[data-id="${CSS.escape(id)}"]`);
      if (!row) return;
      const existing = row.querySelector('.error');
      if (existing) existing.remove();
      row.append(el('div', 'error', message));
    },

    showEnded() {
      body.replaceChildren(el('div', 'ended', 'session ended'));
      foot.hidden = true;
    },

    destroy() {
      host.remove();
    },
  };
};
