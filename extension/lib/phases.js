// The shape of a task's phase journal as the server serves it, with no browser
// API in sight.
//
// The payload comes from a server this project does not own, so nothing here
// trusts it: an unusable phase is dropped rather than allowed to reach the DOM,
// and a state this version has never heard of degrades to "not yet" instead of
// rendering as a fourth unstyled thing.
//
// No fold lives here, and none ever will — the reset cascade, the stale-checks
// downgrade and duplicate suppression all belong to the server. `cascadeFrom`
// only predicts what the server is about to do, to put it in a confirmation.

export const PHASE_STATES = new Set(['done', 'skip', 'open']);

const text = (value) => (typeof value === 'string' ? value : '');

const normalizePhase = (raw) => ({
  phase: raw.phase,
  state: PHASE_STATES.has(raw.state) ? raw.state : '',
  by: text(raw.by),
  ts: text(raw.ts),
  detail: text(raw.detail),
});

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

// A closed phase's control is inert: undoing `done` or `skip` is `reset`, which
// cascades, and the spec keeps that off the checkbox. `open` stays clickable —
// what a human may not do is *author* `open`; closing one by hand ("I ran the
// checks myself") is a mutation the server accepts.
export const isSettable = (entry) => entry.state === '' || entry.state === 'open';

export const cascadeFrom = (phases, phase) => {
  const at = phases.findIndex((p) => p.phase === phase);
  if (at < 0) return [];
  return phases.slice(at + 1).map((p) => p.phase);
};

export const resetWarning = (phases, phase) => {
  const later = cascadeFrom(phases, phase);
  if (later.length === 0) return `Reset ${phase}? Nothing follows it. Continue?`;
  return `Resetting ${phase} will also reopen ${later.join(', ')}. Continue?`;
};

export const closedCount = (phases) =>
  phases.filter((p) => p.state === 'done' || p.state === 'skip').length;

export const hasRecords = (phases) => phases.some((p) => p.state !== '');
