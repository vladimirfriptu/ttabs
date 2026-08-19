// The screen behind the `test` chip: the QA session's checklist, drawn inside
// the phase panel. Like panel.js it only renders what it is given and reports
// clicks back — which session is live, what a click writes and where the phase
// name came from are all session.js's business.
//
// The anatomy and every value are lifted from `design/Testing.dc.html`, the
// note field's from `design/Notes.dc.html`.
//
// The behaviours it shares with the standalone QA widget are reproduced from it
// rather than re-decided: a passed case folds its steps away and a title click
// overrides that, a draft the server has echoed back is dropped, a field the
// developer never touched is not committed on blur, and losing focus never
// closes anything. Each of those was a bug there first.

import { groupByArea, uncheckedCount } from '../lib/qa-cases.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

// Drawn rather than typed, for the reason the phase list gives: a font's ✓ and
// ‹ differ in weight and baseline between platforms, and these sit in a 16px box.
const icon = ({ size, stroke, width, d }) => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', stroke);
  svg.setAttribute('stroke-width', width);
  svg.setAttribute('stroke-linecap', 'round');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
};

const TICK_PATH = 'M2.5 6.5 5 9l4.5-6';
const BACK_PATH = 'M7.5 2.5 4 6l3.5 3.5';

const stepsBlock = (item) => {
  const box = el('div', 'steps');
  item.steps.forEach((text, at) => {
    const line = el('div', 'step');
    line.append(el('span', 'step-n', `${at + 1}.`), el('span', null, text));
    box.append(line);
  });
  if (item.expectedResult) box.append(el('div', 'expected', `→ ${item.expectedResult}`));
  return box;
};

const discrepancySection = (discrepancies) => {
  const box = el('section', 'discrepancies');
  box.append(el('div', 'discrepancies-title', 'requirement discrepancies'));

  for (const item of discrepancies) {
    const entry = el('div', 'discrepancy');
    entry.append(el('div', 'discrepancy-summary', `${item.id} — ${item.summary}`));
    if (item.source) entry.append(el('div', 'discrepancy-meta', `source: ${item.source}`));
    if (item.implemented) entry.append(el('div', 'discrepancy-meta', `implemented: ${item.implemented}`));
    box.append(entry);
  }

  return box;
};

// `folds` holds only the cases whose fold the developer overrode by clicking the
// title; an id absent from it follows the default for its current pass state.
// `drafts` and `edited` are the text this screen has typed but not yet seen come
// back from the server, kept across the rebuilds a poll causes.
const caseBlock = (item, { folds, drafts, edited, onToggle, onComment, onCommentCommit }) => {
  // A draft that now matches the server's echo has already landed there —
  // keeping it afterwards would only let it drift out of sync with a later edit
  // made elsewhere instead of tracking the server.
  if (drafts.has(item.id) && drafts.get(item.id) === item.comment) {
    drafts.delete(item.id);
    edited.delete(item.id);
  }
  const text = () => (drafts.has(item.id) ? drafts.get(item.id) : item.comment);

  const wrapper = el('div', `case ${item.status}${item.passed ? ' passed' : ''}`);
  wrapper.dataset.id = item.id;

  const row = el('div', 'row');

  const check = el('span', 'check');
  check.setAttribute('role', 'checkbox');
  check.setAttribute('aria-checked', item.passed ? 'true' : 'false');
  // A span says nothing to the tab order on its own.
  check.tabIndex = 0;
  if (item.passed) check.append(icon({ size: 11, stroke: '#fff', width: 2, d: TICK_PATH }));

  const flip = () => {
    // The pass state is about to change, so whatever fold the developer chose
    // under the old state no longer applies — the new default takes back over.
    folds.delete(item.id);
    onToggle(item.id, !item.passed);
  };

  check.addEventListener('click', flip);
  check.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    // A held key repeats, and every repeat would be another write.
    if (event.repeat) return;
    // Space on a focused span scrolls the page the panel is floating over.
    event.preventDefault();
    flip();
  });

  const title = el('button', 'title', item.title);
  title.type = 'button';

  row.append(check, title);
  if (item.status === 'new' || item.status === 'updated') {
    row.append(el('span', `badge ${item.status}`, item.status));
  }

  const steps = stepsBlock(item);
  const noteBox = el('div', 'note-box');
  const note = el('textarea', 'quoted');
  note.rows = 1;
  note.placeholder = 'note…';
  note.value = text();
  noteBox.append(note);
  const comment = el('div', 'comment-text');

  let folded = folds.has(item.id) ? folds.get(item.id) : item.passed;

  // Folded, a case shows the note as a line rather than a field: the fold hides
  // what to do, never what was found.
  const applyFold = () => {
    steps.hidden = folded;
    noteBox.hidden = folded;
    comment.textContent = text();
    comment.hidden = !folded || text().trim() === '';
  };
  applyFold();

  title.addEventListener('click', () => {
    folded = !folded;
    folds.set(item.id, folded);
    applyFold();
  });

  note.addEventListener('input', () => {
    drafts.set(item.id, note.value);
    edited.add(item.id);
    onComment(item.id, note.value);
  });

  // An untouched field already shows the server's own text, so committing it
  // would resend identical text. Losing focus must not fold the case either:
  // the rebuild a poll causes takes focus off this node, and a field folded by
  // that is a field rendered hidden — which focus() cannot restore.
  note.addEventListener('blur', () => {
    if (edited.has(item.id)) onCommentCommit(item.id, note.value);
  });

  wrapper.append(row, steps, noteBox, comment);
  return wrapper;
};

export const createQaView = ({
  phase,
  task,
  onBack,
  onToggle,
  onComment,
  onCommentCommit,
  onFinish,
  onCloseWithout,
}) => {
  const folds = new Map();
  const drafts = new Map();
  const edited = new Set();
  const handlers = { folds, drafts, edited, onToggle, onComment, onCommentCommit };

  // The tree that knows which of its own children has the focus. The panel's
  // shadow root is closed, so document.activeElement stops at its host and
  // getRootNode from a mounted node is the only way in.
  let root = null;

  const head = el('div', 'qa-head');
  const back = el('button', 'back');
  back.type = 'button';
  back.title = 'back to the phases';
  back.setAttribute('aria-label', 'back to the phases');
  back.append(icon({ size: 13, stroke: '#4a4a4a', width: 1.6, d: BACK_PATH }));
  back.addEventListener('click', onBack);
  const tally = el('span', 'qa-tally');
  head.append(back, el('span', 'qa-phase', phase), el('span', 'qa-key', task), tally);

  const body = el('div', 'qa-body');

  const foot = el('div', 'qa-foot');
  // Nothing to offer until an answer arrives: the button names how many cases
  // are unpassed, and it has no honest label before there is a checklist.
  foot.hidden = true;
  const finishError = el('div', 'error');
  finishError.hidden = true;
  const finishButton = el('button', 'finish');
  finishButton.type = 'button';
  finishButton.addEventListener('click', onFinish);
  // Naming the other side is the honest version of "this closes the phase": the
  // click finishes the session, and the QA server is what records the phase.
  const finishNote = el('div', 'finish-note', `finishes the QA session — the QA server records ${phase} itself`);
  foot.append(finishError, finishButton, finishNote);

  const snapshot = () => {
    const focused = root?.activeElement;
    const row = focused?.closest?.('.case');
    if (!row) return null;
    for (const kind of ['quoted', 'check', 'title']) {
      if (!focused.classList.contains(kind)) continue;
      const at = kind === 'quoted' ? { start: focused.selectionStart, end: focused.selectionEnd } : null;
      return { id: row.dataset.id, kind, at };
    }
    return null;
  };

  const restore = (snap) => {
    if (!snap) return;
    const node = body.querySelector(`.case[data-id="${CSS.escape(snap.id)}"] .${snap.kind}`);
    if (!node) return;
    node.focus();
    if (snap.at) node.setSelectionRange(snap.at.start, snap.at.end);
  };

  return {
    mount(host) {
      host.append(head, body, foot);
      root = host.getRootNode();
    },

    render(state) {
      const passed = state.cases.length - uncheckedCount(state.cases);
      tally.textContent = `${passed}/${state.cases.length}`;
      tally.hidden = false;

      const known = new Set(state.cases.map((c) => c.id));
      for (const id of [...folds.keys()]) if (!known.has(id)) folds.delete(id);
      for (const id of [...drafts.keys()]) if (!known.has(id)) drafts.delete(id);
      for (const id of [...edited]) if (!known.has(id)) edited.delete(id);

      const scrollTop = body.scrollTop;
      const snap = snapshot();
      // A pass state flipped from outside this tab would otherwise fold the very
      // field being typed into, and a hidden field cannot take the focus back.
      if (snap?.kind === 'quoted') folds.set(snap.id, false);

      body.replaceChildren();
      for (const group of groupByArea(state.cases)) {
        body.append(el('div', 'area', group.area));
        for (const item of group.cases) body.append(caseBlock(item, handlers));
      }
      if (state.discrepancies.length > 0) body.append(discrepancySection(state.discrepancies));

      body.scrollTop = scrollTop;
      restore(snap);

      const left = uncheckedCount(state.cases);
      finishButton.textContent = left === 0 ? `close ${phase}` : `close ${phase} — ${left} not passed`;
      finishButton.classList.toggle('remaining', left > 0);
      finishError.hidden = true;
      finishError.textContent = '';
      foot.hidden = false;
    },

    // Two things look like this from here — no session at all, and a session
    // belonging to another task — and the answer to both is the same: there is
    // no checklist, and closing the phase by hand is a thing a developer who
    // tested without a session actually wants.
    showEmpty() {
      const box = el('div', 'empty');
      box.append(
        el('div', 'empty-line', 'no checklist — no QA session is running'),
        el('div', 'empty-hint', "start one in the task's session and the cases appear here by themselves"),
      );
      const close = el('button', 'close-without', 'close the phase without a checklist');
      close.type = 'button';
      close.addEventListener('click', onCloseWithout);
      box.append(close);

      body.replaceChildren(box);
      tally.hidden = true;
      foot.hidden = true;
    },

    // Attached to the case that failed and wiped by the next render, which
    // carries the server's own answer about what actually happened.
    showError(id, message) {
      const row = body.querySelector(`.case[data-id="${CSS.escape(id)}"]`);
      if (!row) return;
      const existing = row.querySelector('.error');
      if (existing) existing.remove();
      row.append(el('div', 'error', message));
    },

    // A finish failure fits no single case — cases: [] is a valid session — so
    // it goes above the button that failed.
    showFinishError(message) {
      finishError.textContent = message;
      finishError.hidden = false;
    },

    destroy() {
      head.remove();
      body.remove();
      foot.remove();
    },
  };
};
