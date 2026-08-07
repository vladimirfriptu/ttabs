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

const caseRow = (item, onToggle, collapsedIds, openComments, commentText, editedIds, onComment, onCommentCommit) => {
  const wrapper = el('div', `case ${item.status}`);
  wrapper.dataset.id = item.id;

  const row = el('div', 'row');

  const checkbox = el('input');
  checkbox.type = 'checkbox';
  checkbox.checked = item.passed;
  checkbox.addEventListener('change', () => onToggle(item.id, checkbox.checked));

  const title = el('button', 'title', item.title);
  const expanded = details(item);
  expanded.hidden = collapsedIds.has(item.id);
  title.addEventListener('click', () => {
    expanded.hidden = !expanded.hidden;
    if (expanded.hidden) collapsedIds.add(item.id);
    else collapsedIds.delete(item.id);
  });

  row.append(checkbox, title);
  if (item.status === 'new' || item.status === 'updated') {
    row.append(el('span', `badge ${item.status}`, item.status));
  }

  const comment = el('button', 'comment', '💬');
  comment.title = 'comment';

  const note = el('textarea', 'note');
  note.placeholder = 'note…';
  // A draft that now matches the server's echo has already landed there —
  // whatever sent it succeeded, so keeping the draft afterwards would only
  // let it drift silently out of sync with a later external edit (e.g. the
  // same session open in another tab) instead of tracking the server.
  if (commentText.has(item.id) && commentText.get(item.id) === item.comment) {
    commentText.delete(item.id);
    editedIds.delete(item.id);
  }
  note.value = commentText.has(item.id) ? commentText.get(item.id) : item.comment;
  note.hidden = !openComments.has(item.id);

  const markWritten = () => comment.classList.toggle('written', note.value.trim() !== '');
  markWritten();

  comment.addEventListener('click', () => {
    note.hidden = !note.hidden;
    if (note.hidden) openComments.delete(item.id);
    else {
      openComments.add(item.id);
      note.focus();
    }
  });

  note.addEventListener('input', () => {
    commentText.set(item.id, note.value);
    editedIds.add(item.id);
    markWritten();
    onComment(item.id, note.value);
  });

  // An untouched field already shows the server's own text (or the local
  // draft, if one exists) — committing it on blur would just resend
  // identical text, so only a field the developer actually edited here is
  // committed.
  note.addEventListener('blur', () => {
    if (editedIds.has(item.id)) onCommentCommit(item.id, note.value);
  });

  row.append(comment);

  wrapper.append(row, expanded, note);
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

export const createPanel = ({ onToggle, onComment, onCommentCommit, onFinish }) => {
  const host = el('div');
  host.id = HOST_ID;
  // Closed so a script elsewhere on the page cannot reach shadowRoot to read
  // notes or forge input/click events; the panel keeps its own reference below.
  const root = host.attachShadow({ mode: 'closed' });

  // Collapsed state is UI-only and lives here, not in session.js: a poll can
  // re-render at any time and must not undo a collapse the developer just did
  // to see the page underneath.
  let collapsed = false;

  // Steps and expected result are shown by default — they are what the
  // developer is here to follow — so what has to be remembered across a
  // re-render is which cases were folded away, not which were opened. Either
  // way the keep-alive poll rebuilds every row on a timer and must not undo
  // the developer's choice underneath them every 15 seconds.
  const collapsedIds = new Set();

  const openComments = new Set();
  const commentText = new Map();
  const editedIds = new Set();

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
  const finishError = el('div', 'error finish-error');
  finishError.hidden = true;

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
  foot.append(finishError, done);
  panel.append(head, body, foot);
  root.append(style, panel);
  document.documentElement.append(host);

  return {
    render(state) {
      task.textContent = state.task;
      const passed = state.cases.filter((c) => c.passed).length;
      count.textContent = `${passed}/${state.cases.length}`;

      const knownIds = new Set(state.cases.map((c) => c.id));
      for (const id of collapsedIds) {
        if (!knownIds.has(id)) collapsedIds.delete(id);
      }
      for (const id of openComments) {
        if (!knownIds.has(id)) openComments.delete(id);
      }
      for (const id of commentText.keys()) {
        if (!knownIds.has(id)) commentText.delete(id);
      }
      for (const id of editedIds) {
        if (!knownIds.has(id)) editedIds.delete(id);
      }

      const scrollTop = body.scrollTop;

      const focused = root.activeElement;
      const typing = focused?.classList.contains('note')
        ? {
            id: focused.closest('.case').dataset.id,
            start: focused.selectionStart,
            end: focused.selectionEnd,
          }
        : null;

      body.replaceChildren();
      for (const group of groupByArea(state.cases)) {
        body.append(el('div', 'area', group.area));
        for (const item of group.cases) {
          body.append(caseRow(item, onToggle, collapsedIds, openComments, commentText, editedIds, onComment, onCommentCommit));
        }
      }
      if (state.discrepancies.length > 0) body.append(discrepancySection(state.discrepancies));
      body.scrollTop = scrollTop;

      if (typing) {
        const restored = body.querySelector(`.case[data-id="${CSS.escape(typing.id)}"] .note`);
        if (restored) {
          restored.focus();
          restored.setSelectionRange(typing.start, typing.end);
        }
      }

      applyCollapsed();
    },

    showError(id, message) {
      const row = body.querySelector(`.case[data-id="${CSS.escape(id)}"]`);
      if (!row) return;
      const existing = row.querySelector('.error');
      if (existing) existing.remove();
      row.append(el('div', 'error', message));
    },

    // A finish failure has no single row to attach to — cases: [] is a valid
    // session — so it goes beside Done instead. Expanding on error rather than
    // leaving it silently behind a collapsed panel.
    showFinishError(message) {
      finishError.textContent = message;
      finishError.hidden = false;
      if (collapsed) {
        collapsed = false;
        applyCollapsed();
      }
    },

    clearFinishError() {
      finishError.hidden = true;
      finishError.textContent = '';
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
