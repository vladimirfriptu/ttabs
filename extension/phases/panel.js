// The panel's DOM, and nothing else — it renders what it is given and reports
// clicks back. Deciding what to do with a click is session.js's business.

import { closedCount, groupByStage, hasRecords, qaPhase } from '../lib/phases.js';
import { safeHref } from '../lib/href.js';
import { PANEL_CSS } from './styles.js';
import { makeDraggable } from '../lib/draggable.js';
import { createQaView } from './qa-view.js';

const HOST_ID = 'task-tabs-phase-panel';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

// The list's glyphs are drawn rather than typed: a font's ✓ and – differ in
// weight and baseline between platforms, and these sit in a 15px box.
const icon = ({ className, size, stroke, width, paths }) => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', stroke);
  svg.setAttribute('stroke-width', width);
  svg.setAttribute('stroke-linecap', 'round');
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
};

const OUT_PATHS = ['M4.5 2.5h5v5', 'M9.5 2.5 4 8', 'M8 9.5H2.5V4'];
const TICK_PATHS = ['M2.5 6.5 5 9l4.5-6'];
const DASH_PATHS = ['M2.5 6h7'];
const ARROW_PATHS = ['M4.5 2.5 8 6l-3.5 3.5'];

const outIcon = ({ className, stroke, size, width }) =>
  icon({ className, size, stroke, width, paths: OUT_PATHS });

const CLASS_FOR_STATE = { '': 'pending', done: 'done', skip: 'skip', open: 'open' };

const chipFor = (entry, onChipQa) => {
  if (entry.action.kind === 'link') {
    const chip = el('a', 'chip link', entry.action.label);
    // The url came from the server and was already filtered to http(s); the rel
    // is what keeps the tracker from reaching back into the page under test.
    chip.href = entry.action.url;
    chip.target = '_blank';
    chip.rel = 'noreferrer noopener';
    chip.append(outIcon({ className: 'icon', stroke: '#7a7a7a', size: 10, width: 1.5 }));
    return chip;
  }

  if (entry.action.kind === 'qa') {
    const chip = el('button', 'chip qa', 'test');
    chip.type = 'button';
    chip.append(icon({ className: 'icon', size: 10, stroke: '#2b6b2b', width: 1.5, paths: ARROW_PATHS }));
    chip.addEventListener('click', () => onChipQa());
    return chip;
  }

  return null;
};

const phaseRow = (entry, index, onCheck, onChipQa) => {
  const wrapper = el('div', `phase ${CLASS_FOR_STATE[entry.state]}`);
  wrapper.dataset.phase = entry.phase;
  // The hover handler is delegated to the body, which outlives any one row — so
  // the row has to say where it sits in the list rather than close over it.
  wrapper.dataset.index = String(index);

  const gutter = el('span', 'gutter');
  const box = el('span', 'box');
  const recorded = entry.state !== '';
  box.setAttribute('role', 'checkbox');
  box.setAttribute('aria-checked', entry.state === 'done' ? 'true' : entry.state === 'open' ? 'mixed' : 'false');
  // A span says nothing to the tab order on its own, and this is the only thing
  // in the list that writes — the reset button that used to be focusable is gone.
  box.tabIndex = 0;
  box.title = recorded
    ? 'click: clear this phase and every one after it'
    : 'click: done · alt-click: skip';

  // A tick would read as "ran, nothing outstanding", which is the opposite of
  // what `open` records; the dash is what the state actually means.
  if (entry.state === 'done') box.append(icon({ className: 'mark', size: 11, stroke: '#fff', width: 2, paths: TICK_PATHS }));
  else if (entry.state === 'open') box.append(icon({ className: 'mark', size: 9, stroke: '#a8760a', width: 2, paths: DASH_PATHS }));

  // Alt is a skip, so this reads the modifier off whatever event arrived rather
  // than off a change event, which carries none. `open` is settable like the
  // rest — a human may close it by hand, only never author it.
  const toggle = (event) => {
    if (recorded) onCheck(entry.phase, 'reset');
    else onCheck(entry.phase, event.altKey ? 'skip' : 'done');
  };

  box.addEventListener('click', (event) => {
    event.preventDefault();
    toggle(event);
  });

  box.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    // A held key repeats; the mouse cannot produce that, and neither should the
    // keyboard — every repeat would be another write.
    if (event.repeat) return;
    // Space on a focused span scrolls the page the panel is floating over.
    event.preventDefault();
    toggle(event);
  });

  gutter.append(box, el('span', 'rail'));

  const main = el('div', 'main');
  const row = el('div', 'row');
  row.append(el('span', 'name', entry.phase));
  if (entry.state === 'skip') row.append(el('span', 'badge skipped', 'skipped'));
  if (entry.state === 'open') row.append(el('span', 'badge open', 'open'));

  if (entry.action) {
    const chip = chipFor(entry, onChipQa);
    if (chip) row.append(chip);
  }

  main.append(row);

  // `open` means the phase ran and left something outstanding, and the detail is
  // the whole reason it is not done — it goes on the row, not in a tooltip.
  if (entry.state === 'open' && entry.detail) main.append(el('div', 'detail', entry.detail));
  else if (entry.state === 'skip' && entry.detail) main.append(el('div', 'meta', entry.detail));

  if (entry.by || entry.ts) {
    const stamp = [entry.by, entry.ts].filter(Boolean).join(' · ');
    row.title = stamp;
  }

  wrapper.append(gutter, main);
  return wrapper;
};

const stageCaption = (group) => {
  const caption = el('div', 'stage');
  caption.append(
    el('span', 'stage-name', group.stage),
    el('span', 'stage-rule'),
    el('span', 'stage-tally', `${group.closed}/${group.total}`),
  );
  return caption;
};

// The one line under the list, and the peek owns it while there is one: how far
// the click reaches is the thing worth reading at that moment.
const hintText = (state, peek) => {
  if (peek >= 0) {
    const count = state.phases.length - peek;
    return `clears ${count} ${count === 1 ? 'phase' : 'phases'}, from ${state.phases[peek].phase}`;
  }
  if (!hasRecords(state.phases)) return 'no records yet';
  if (state.next) return `next: ${state.next}`;
  // Only the count the header already shows, read the other way round — no
  // opinion here about which phase would be next if one were left.
  if (closedCount(state.phases) === state.phases.length) return 'all closed';
  return '';
};

export const createPanel = ({ onCheck, onChipQa, qa }) => {
  const host = el('div');
  host.id = HOST_ID;
  // Closed so a script elsewhere on the page cannot reach shadowRoot to forge
  // clicks on a checklist that writes to disk.
  const root = host.attachShadow({ mode: 'closed' });

  // Collapsed state is UI-only and lives here, not in session.js: a poll
  // re-renders every five seconds and must not undo a collapse the developer
  // just did to see the page underneath.
  let collapsed = false;

  // Which screen the panel shows. The phase list is not torn down to show the
  // checklist — it stays built and current behind it, so coming back is a change
  // of visibility rather than a rebuild — but exactly one of the two is visible.
  let mode = 'phases';
  const qaHost = el('div', 'qa-screen');
  qaHost.hidden = true;
  let view = null;
  // The phase the chip drilled in from, and the name the view's header was built
  // with. A journal that stops carrying the qa action takes the screen down with
  // it, and one that moves the action elsewhere rebuilds the view.
  let qaAt = '';
  let viewPhase = '';
  let viewTask = '';

  const style = el('style', null, PANEL_CSS);
  const panel = el('div', 'panel');
  // The header is a plain row that drags, and the collapse control is a real
  // button inside it taking everything the key and the round badge leave — the
  // key is a link, and interactive content cannot be nested inside a button.
  const head = el('div', 'head');
  const fold = el('button', 'fold');
  fold.type = 'button';
  // Two elements for one key, because whether it links anywhere depends on a
  // site the developer may never have configured, and swapping an <a> for a
  // <span> on every render would rebuild the header under the drag handle.
  const taskText = el('span', 'task');
  const taskLink = el('a', 'task');
  taskLink.target = '_blank';
  taskLink.rel = 'noreferrer noopener';
  const taskKey = el('span', 'key');
  // Inside the anchor, not beside it: the icon says "this opens the tracker",
  // and a click on it has to do what it advertises.
  taskLink.append(taskKey, outIcon({ className: 'icon', stroke: '#9a9a9a', size: 11, width: 1.4 }));
  const round = el('span', 'round');
  const count = el('span', 'count');
  const chevron = el('span', 'chevron', '–');
  const body = el('div', 'body');
  // A message that belongs to no single row — the server refusing the whole
  // read, say — has nowhere else to go, and the foot only exists while there is
  // one to show.
  const foot = el('div', 'foot');
  foot.hidden = true;
  let noticeText = '';

  // What the panel was last told, kept because the panel repaints on its own
  // when the pointer or the focus moves — the preview is nobody else's business.
  let current = null;
  let href = '';

  // The row the preview is drawn from, and the two things that can point at one:
  // the pointer hovering a row, and the keyboard focusing a box. The pointer
  // wins while it is over a row — it is the more recent intent — and letting go
  // of it falls back to wherever the focus still is, rather than to nothing.
  let peek = -1;
  let hoverAt = -1;
  let focusAt = -1;

  // The payload the body currently shows, as JSON. Two consecutive polls almost
  // always carry the same one, and rebuilding the rows throws away whatever had
  // the keyboard focus. The preview is not in it: dimming is presentation, and a
  // hover that rebuilt the list would pull the box out from under the click that
  // is on its way.
  let rendered = null;

  // The line under the list, kept across rebuilds because the preview rewrites
  // its text without touching anything else.
  const hint = el('div', 'hint');

  // Declared before the two apply* functions below use it: a change of mode
  // re-clamps the panel's position, and the handle it moves by is the phase
  // header, which exists whichever screen is up.
  const drag = makeDraggable(panel, head);

  const applyCollapsed = () => {
    const drilled = mode === 'qa';
    // The checklist brings its own header, scroller and foot: the phase screen's
    // three go away whole rather than being reused for another anatomy. Collapse
    // goes with them — there is nothing to collapse a screen you left to.
    head.hidden = drilled;
    body.hidden = drilled || collapsed;
    foot.hidden = drilled || collapsed || noticeText === '';
    panel.classList.toggle('collapsed', !drilled && collapsed);
    fold.setAttribute('aria-label', collapsed ? 'expand' : 'collapse');
    chevron.textContent = collapsed ? '🧭' : '–';
    fold.title = collapsed ? `${taskText.textContent} — ${count.textContent}` : '';
  };

  const applyMode = () => {
    qaHost.hidden = mode !== 'qa';
    // A case's steps do not read at 360, which is the reason the design widens
    // the panel for this screen and only this one.
    panel.classList.toggle('wide', mode === 'qa');
    applyCollapsed();
    // The 60px it just grew by would hang off the edge of a panel that had been
    // dragged flush to the right. Clamping belongs to whoever moved it — the
    // arithmetic is not repeated here.
    drag.settle();
  };

  const exitQa = () => {
    mode = 'phases';
    applyMode();
  };

  // The two ways the screen closes itself. session.js is told, because it is
  // what stops reading the QA server — a closed view must not leave a poll
  // behind on every localhost tab.
  const back = () => {
    exitQa();
    qa.onBack();
  };

  const enterQa = () => {
    if (!current) return;
    // Asked of the journal, not of the row that was clicked: which phase the
    // checklist belongs to is the server's to say, and this widget's never to
    // know by name.
    const phase = qaPhase(current.phases);
    if (!phase) return;
    qaAt = phase;

    // Kept between drill-ins, so the drag handle in its header is registered
    // once — a view rebuilt on every entry would register another every time.
    // Both names it was built with are checked, because both are drawn into it:
    // a tab dragged into another task's group keeps this panel alive (session.js
    // bumps its epoch rather than closing it), so a journal that puts the action
    // on a phase of the same name would otherwise leave the old task's key in
    // the header of the one screen whose whole guard is that the session's task
    // is this tab's.
    if (view && (viewPhase !== phase || viewTask !== current.task)) {
      view.destroy();
      view = null;
    }

    if (!view) {
      viewPhase = phase;
      viewTask = current.task;
      view = createQaView({
        phase,
        task: current.task,
        onBack: back,
        onToggle: qa.onToggle,
        onComment: qa.onComment,
        onCommentCommit: qa.onCommentCommit,
        onFinish: qa.onFinish,
        onCloseWithout: qa.onCloseWithout,
      });
      view.mount(qaHost);
      // The phase header is hidden on this screen, so the panel would stop being
      // draggable without this. The class is the one the stylesheet in this
      // widget already names.
      makeDraggable(panel, qaHost.querySelector('.qa-head'));
    }

    mode = 'qa';
    applyMode();
    onChipQa(phase);
  };

  // One listener for the whole header, the fold button included — its click
  // bubbles here, which is what makes Enter and Space on it collapse the panel.
  head.addEventListener('click', () => {
    // The header is the drag handle as well as the collapse control, and a drag
    // ends in a click on it — without this, moving the panel would fold it too.
    if (drag.moved()) return;
    collapsed = !collapsed;
    applyCollapsed();
  });

  taskLink.addEventListener('click', (event) => {
    // Following the link is not folding the panel, and a drag that ended on the
    // key is not a click on it either.
    event.stopPropagation();
    if (drag.moved()) event.preventDefault();
  });

  const paint = () => {
    if (!current) return;

    const key = current.task;
    taskText.textContent = key;
    taskKey.textContent = key;
    taskLink.href = href;
    taskLink.hidden = href === '';
    taskText.hidden = href !== '';

    // A task that has been round the pipeline more than once is important
    // context; round 1 is the default and needs no badge.
    round.textContent = current.round > 1 ? `round ${current.round}` : '';
    round.hidden = current.round <= 1;
    count.textContent = `${closedCount(current.phases)}/${current.phases.length}`;

    const payload = JSON.stringify({ state: current, href });
    if (payload !== rendered) {
      rendered = payload;
      const scrollTop = body.scrollTop;
      // A keyboard write rebuilds the list on the spot — session.js renders the
      // tick optimistically — so without this, ticking a phase would cost a whole
      // Tab traversal to reach the next one. Only a payload change gets here; a
      // preview never rebuilds and so never needs saving from.
      //
      // The kind of control is remembered along with the row: restoring a row's
      // box to someone who was on its chip would put a write under the next Space
      // they press, and that write clears the phase and every one after it.
      const focused = root.activeElement;
      let focusedKind = '';
      if (focused?.classList.contains('box')) focusedKind = '.box';
      else if (focused?.classList.contains('chip')) focusedKind = '.chip';
      const focusedRow = focusedKind ? focused.closest('.phase') : null;
      const focusedPhase = focusedRow?.dataset.phase ?? '';

      body.replaceChildren();

      let index = 0;
      for (const group of groupByStage(current.phases)) {
        // A stage the server left empty gets no caption — a rule and a tally
        // over a nameless group would be a heading for nothing.
        if (group.stage) body.append(stageCaption(group));
        for (const entry of group.phases) {
          body.append(phaseRow(entry, index, onCheck, enterQa));
          index += 1;
        }
      }

      // Always appended, empty text included: the panel is anchored to the
      // bottom of the window, so a hint line that came and went would push the
      // whole panel up and down under the pointer.
      body.append(hint);
      body.scrollTop = scrollTop;
      // The restored control's own focusin recomputes the preview against the list
      // just drawn, so nothing here has to say what it should be. A row that has
      // since lost its chip restores nothing, which is the honest answer.
      if (focusedPhase) body.querySelector(`.phase[data-phase="${CSS.escape(focusedPhase)}"] ${focusedKind}`)?.focus();
      applyPeek();
    } else {
      // The rebuild is what normally clears a row's error; without one, the
      // same wiping has to happen by hand or a failed click's message would
      // outlive every explanation the server has since given.
      for (const stale of body.querySelectorAll('.error')) stale.remove();
    }

    applyCollapsed();
  };

  // Which row a node belongs to, but only when clearing it is a thing that could
  // happen: an unrecorded row has nothing to clear and previews nothing.
  const recordedIndexOf = (node) => {
    const row = node?.closest?.('.phase');
    if (!row) return -1;
    const index = Number(row.dataset.index);
    const entry = current?.phases[index];
    return entry && entry.state !== '' ? index : -1;
  };

  // The preview is drawn onto the rows that are already there, never by building
  // new ones: the box a click is landing on has to survive until the click.
  //
  // The index is re-checked against the state in hand rather than trusted — the
  // pointer can still be over a row a poll has since cleared or dropped, and an
  // index past the end would take hintText down with it.
  const applyPeek = () => {
    if (!current) return;

    const peeked = peek >= 0 ? current.phases[peek] : undefined;
    const at = peeked && peeked.state !== '' ? peek : -1;

    const rows = body.querySelectorAll('.phase');
    rows.forEach((row, index) => row.classList.toggle('fading', at >= 0 && index >= at));
    hint.textContent = hintText(current, at);
  };

  const repeek = () => {
    const next = hoverAt >= 0 ? hoverAt : focusAt;
    if (next === peek) return;
    peek = next;
    applyPeek();
  };

  // Delegated to the body rather than bound per row: a repaint replaces every
  // row, and a listener on the node the pointer is over would go with it.
  body.addEventListener('mouseover', (event) => {
    hoverAt = recordedIndexOf(event.target);
    repeek();
  });

  body.addEventListener('mouseleave', () => {
    hoverAt = -1;
    repeek();
  });

  // The keyboard reaches the same write the pointer does, so it gets the same
  // warning — the preview is what this widget has instead of a confirmation.
  body.addEventListener('focusin', (event) => {
    // Only a box previews. A chip in a recorded row is a link out, and dimming
    // half the list because the tab order passed through it would be a lie.
    focusAt = event.target.classList?.contains('box') ? recordedIndexOf(event.target) : -1;
    repeek();
  });

  body.addEventListener('focusout', () => {
    focusAt = -1;
    repeek();
  });

  fold.append(count, chevron);
  head.append(taskText, taskLink, round, fold);
  panel.append(head, body, foot, qaHost);
  root.append(style, panel);
  document.documentElement.append(host);

  return {
    render(state, link) {
      current = state;
      // The site comes from the developer's own configuration, but it reaches
      // this href through storage and a message, and a scheme-less one would
      // resolve against the page under test.
      href = safeHref(link);
      paint();

      // Two ways the screen stops being about anything: the chip it was reached
      // through is gone from the journal, or the tab has moved to another task's
      // group — which this panel survives (session.js re-keys it rather than
      // closing it) and the checklist does not. Its cases are about to be
      // replaced by another task's, and re-labelling a checklist mid-read would
      // be a worse answer than putting the developer back in the list.
      //
      // Against viewTask, not the task the last render saw: the header's text is
      // fixed when the view is built, so the view is the only thing whose idea of
      // the task can go stale, and it is the thing being judged.
      if (mode === 'qa' && (qaPhase(current.phases) !== qaAt || viewTask !== current.task)) back();
    },

    // Everything below belongs to the drilled-in screen, and every one of them
    // checks the mode: a QA reply that was already on the wire when the
    // developer stepped back must not paint over the phase list.
    renderQa(qaState) {
      if (mode === 'qa') view?.render(qaState);
    },

    showQaEmpty() {
      if (mode === 'qa') view?.showEmpty();
    },

    showQaError(id, message) {
      if (mode === 'qa') view?.showError(id, message);
    },

    showQaFinishError(message) {
      if (mode === 'qa') view?.showFinishError(message);
    },

    // The way out that session.js takes itself, having just done the writing
    // that ends the screen — it needs no telling that the screen is closing.
    leaveQa() {
      if (mode === 'qa') exitQa();
    },

    // Attached to the row that failed, and wiped by the next render — the poll
    // five seconds later carries the server's own answer, which is the better
    // explanation of what actually happened.
    showError(phase, message) {
      const main = body.querySelector(`.phase[data-phase="${CSS.escape(phase)}"] .main`);
      if (!main) return;
      const existing = main.querySelector('.error');
      if (existing) existing.remove();
      main.append(el('div', 'error', message));
      if (collapsed) {
        collapsed = false;
        applyCollapsed();
      }
    },

    // A read the server refused fits no row — the panel is showing the last
    // journal it managed to get, and nothing in it is what went wrong. Expanding
    // on a notice rather than leaving it behind a fold.
    showNotice(message) {
      if (noticeText === message) return;
      noticeText = message;
      foot.textContent = message;
      if (collapsed) collapsed = false;
      applyCollapsed();
    },

    clearNotice() {
      if (noticeText === '') return;
      noticeText = '';
      foot.textContent = '';
      applyCollapsed();
    },

    destroy() {
      host.remove();
    },
  };
};
