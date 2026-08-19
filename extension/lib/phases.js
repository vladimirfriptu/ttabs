// The shape of a task's phase journal as the server serves it, with no browser
// API in sight.
//
// The payload comes from a server this project does not own, so nothing here
// trusts it: an unusable phase is dropped rather than allowed to reach the DOM,
// and a state this version has never heard of degrades to "not yet" instead of
// rendering as a fourth unstyled thing.
//
// No fold lives here, and none ever will — the stale-checks downgrade and
// duplicate suppression belong to the server. `clearOne` and `applyAction` are
// optimistic guesses at what the server is about to do, drawn locally so a click
// repaints at once; the server's own answer always replaces the guess wholesale,
// never merges with it.

import { safeHref } from './href.js';

export const PHASE_STATES = new Set(['done', 'skip', 'open']);

const text = (value) => (typeof value === 'string' ? value : '');

// The one field the widget hands to the page it is injected into, so it is the one
// the payload is not trusted about: a `javascript:` or `data:` url reaching an
// anchor on someone's app is a hole, and a chip is better absent than lying.
const usableAction = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.kind === 'qa') return { kind: 'qa' };
  if (raw.kind !== 'link') return null;
  if (typeof raw.label !== 'string' || raw.label === '') return null;

  const url = safeHref(raw.url);
  if (url === '') return null;

  return { kind: 'link', label: raw.label, url };
};

const normalizePhase = (raw) => {
  const entry = {
    phase: raw.phase,
    state: PHASE_STATES.has(raw.state) ? raw.state : '',
    by: text(raw.by),
    ts: text(raw.ts),
    detail: text(raw.detail),
    stage: text(raw.stage),
  };

  const action = usableAction(raw.action);
  if (action) entry.action = action;

  return entry;
};

const usablePhase = (raw) => raw && typeof raw.phase === 'string' && raw.phase !== '';

export const normalizeState = (raw) => {
  if (!raw || typeof raw.task !== 'string' || !Array.isArray(raw.phases)) return null;

  return {
    task: raw.task,
    branch: text(raw.branch),
    // A round is 1 until the server says otherwise: the panel prints the
    // number, and "round NaN" is worse than a round it under-reports.
    round: Number.isInteger(raw.round) && raw.round > 0 ? raw.round : 1,
    next: text(raw.next),
    phases: raw.phases.filter(usablePhase).map(normalizePhase),
  };
};

export const applyAction = (state, phase, action) => ({
  ...state,
  phases: state.phases.map((p) => (p.phase === phase ? { ...p, state: action } : p)),
});

export const closedCount = (phases) =>
  phases.filter((p) => p.state === 'done' || p.state === 'skip').length;

// Groups on a change of stage rather than by collecting equal ones: the server
// promises the phases of a stage are contiguous, and if it ever breaks that
// promise two groups is the honest rendering — reordering to repair it would put
// a second opinion about the canonical order in the widget.
export const groupByStage = (phases) => {
  const groups = [];
  for (const entry of phases) {
    const last = groups[groups.length - 1];
    if (last && last.stage === entry.stage) last.phases.push(entry);
    else groups.push({ stage: entry.stage, phases: [entry] });
  }
  for (const group of groups) {
    group.total = group.phases.length;
    group.closed = closedCount(group.phases);
  }
  return groups;
};

// What `clear` is about to do, drawn locally so the row answers the click at once.
// One phase, nothing after it — the cascade `reset` performs is not something this
// widget asks for any more.
export const clearOne = (state, phase) => ({
  ...state,
  phases: state.phases.map((p) => (p.phase === phase ? { ...p, state: '', detail: '' } : p)),
});

// Which phase opens the checklist. The widget never learns its name from anywhere
// else — that is the whole point of the server saying so.
export const qaPhase = (phases) => phases.find((p) => p.action?.kind === 'qa')?.phase ?? '';

export const hasRecords = (phases) => phases.some((p) => p.state !== '');

// The one line under the list: where the journal stands, in the fewest words the
// state allows. Four outcomes, the last of them silence — records exist, the
// server named no next phase, and something is still not closed. There is
// nothing honest to say there: which phase would come next is the server's
// opinion to hold, and this widget has none.
export const hintText = (state) => {
  if (!hasRecords(state.phases)) return 'no records yet';
  if (state.next) return `next: ${state.next}`;
  // Only the count the header already shows, read the other way round — no
  // opinion here about which phase would be next if one were left.
  if (closedCount(state.phases) === state.phases.length) return 'all closed';
  return '';
};
