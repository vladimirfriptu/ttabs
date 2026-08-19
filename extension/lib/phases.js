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

const LINK_SCHEMES = new Set(['http:', 'https:']);

// The one field the widget hands to the page it is injected into, so it is the one
// the payload is not trusted about: a `javascript:` or `data:` url reaching an
// anchor on someone's app is a hole, and a chip is better absent than lying.
const usableAction = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.kind === 'qa') return { kind: 'qa' };
  if (raw.kind !== 'link') return null;
  if (typeof raw.label !== 'string' || raw.label === '') return null;
  if (typeof raw.url !== 'string' || raw.url === '') return null;

  let parsed;
  try {
    parsed = new URL(raw.url);
  } catch {
    return null;
  }
  if (!LINK_SCHEMES.has(parsed.protocol)) return null;

  return { kind: 'link', label: raw.label, url: raw.url };
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

export const cascadeFrom = (phases, phase) => {
  const at = phases.findIndex((p) => p.phase === phase);
  if (at < 0) return [];
  return phases.slice(at + 1).map((p) => p.phase);
};

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

// What `reset` is about to do, drawn locally so the row responds to the click at
// once. The cascade itself belongs to the server — this is the same kind of guess
// as applyAction, and the answer that comes back replaces it wholesale.
export const clearFrom = (state, phase) => {
  const at = state.phases.findIndex((p) => p.phase === phase);
  if (at < 0) return state;

  return {
    ...state,
    phases: state.phases.map((p, i) => (i >= at ? { ...p, state: '', detail: '' } : p)),
  };
};

// Which phase opens the checklist. The widget never learns its name from anywhere
// else — that is the whole point of the server saying so.
export const qaPhase = (phases) => phases.find((p) => p.action?.kind === 'qa')?.phase ?? '';

export const hasRecords = (phases) => phases.some((p) => p.state !== '');
