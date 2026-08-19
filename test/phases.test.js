import test from 'node:test';
import assert from 'node:assert';

import {
  normalizeState,
  applyAction,
  closedCount,
  hasRecords,
  groupByStage,
  clearFrom,
  qaPhase,
} from '../extension/lib/phases.js';

const payload = () => ({
  task: 'ACME-1234',
  branch: 'front/ACME-1234-something',
  round: 2,
  next: 'crit',
  phases: [
    { phase: 'start', state: 'done', by: 'starting-a-task', ts: '2026-08-18T09:00:00Z', detail: '', stage: 'planning' },
    { phase: 'plan', state: '', by: '', ts: '', detail: '', stage: 'planning' },
    { phase: 'dev', state: 'skip', by: 'widget', ts: '2026-08-18T10:00:00Z', detail: 'reason=docs-only', stage: 'build' },
    { phase: 'checks', state: 'open', by: 'checks.sh', ts: '2026-08-18T11:20:00Z', detail: 'reason=stale', stage: 'build' },
    { phase: 'crit', state: '', by: '', ts: '', detail: '', stage: 'review', action: { kind: 'qa' } },
  ],
});

test('normalizeState keeps the server order and every field', () => {
  const state = normalizeState(payload());
  assert.deepStrictEqual(state.phases.map((p) => p.phase), ['start', 'plan', 'dev', 'checks', 'crit']);
  assert.strictEqual(state.task, 'ACME-1234');
  assert.strictEqual(state.branch, 'front/ACME-1234-something');
  assert.strictEqual(state.round, 2);
  assert.strictEqual(state.next, 'crit');
  assert.strictEqual(state.phases[3].detail, 'reason=stale');
});

test('normalizeState rejects a payload that is not a phase state', () => {
  assert.strictEqual(normalizeState(null), null);
  assert.strictEqual(normalizeState({ task: 'ACME-1', phases: 'nope' }), null);
  assert.strictEqual(normalizeState({ phases: [] }), null);
});

test('normalizeState drops an unusable phase and defaults the rest', () => {
  const state = normalizeState({ task: 'ACME-1', phases: [{ state: 'done' }, { phase: 'dev' }] });
  assert.strictEqual(state.phases.length, 1);
  assert.deepStrictEqual(state.phases[0], { phase: 'dev', state: '', by: '', ts: '', detail: '', stage: '' });
  assert.strictEqual(state.round, 1);
  assert.strictEqual(state.next, '');
  assert.strictEqual(state.branch, '');
});

test('normalizeState downgrades a state it does not know to not-yet', () => {
  const state = normalizeState({ task: 'ACME-1', phases: [{ phase: 'dev', state: 'reopened' }] });
  assert.strictEqual(state.phases[0].state, '');
});

test('normalizeState floors a nonsense round at 1', () => {
  const state = normalizeState({ task: 'ACME-1', phases: [], round: 'many' });
  assert.strictEqual(state.round, 1);
});

test('applyAction replaces one phase and leaves the others alone', () => {
  const state = normalizeState(payload());
  const next = applyAction(state, 'checks', 'done');
  assert.strictEqual(next.phases[3].state, 'done');
  assert.strictEqual(state.phases[3].state, 'open');
  assert.strictEqual(next.phases[0].state, 'done');
  assert.strictEqual(next.task, 'ACME-1234');
});

test('closedCount counts done and skip, not open', () => {
  const { phases } = normalizeState(payload());
  assert.strictEqual(closedCount(phases), 2);
});

test('normalizeState keeps the stage on every entry', () => {
  const state = normalizeState(payload());
  assert.deepStrictEqual(state.phases.map((p) => p.stage), ['planning', 'planning', 'build', 'build', 'review']);
});

test('a phase with no stage still normalises, with an empty one', () => {
  const state = normalizeState({ task: 'ACME-1', phases: [{ phase: 'dev' }] });
  assert.strictEqual(state.phases[0].stage, '');
});

test('a qa action survives, and a link action keeps its label and url', () => {
  const state = normalizeState({
    task: 'ACME-1',
    phases: [
      { phase: 'qa-manual', action: { kind: 'qa' } },
      { phase: 'mr', action: { kind: 'link', label: '!412', url: 'https://gitlab.example/g/r/-/merge_requests/412' } },
    ],
  });
  assert.deepStrictEqual(state.phases[0].action, { kind: 'qa' });
  assert.deepStrictEqual(state.phases[1].action, { kind: 'link', label: '!412', url: 'https://gitlab.example/g/r/-/merge_requests/412' });
});

// A url the widget would hand to the page is the one thing here that can do harm,
// so an unusable action is dropped rather than rendered as a chip that lies.
test('an unusable action is dropped rather than rendered', () => {
  const cases = [
    { kind: 'link', label: 'x', url: 'javascript:alert(1)' },
    { kind: 'link', label: 'x', url: 'data:text/html,hi' },
    { kind: 'link', label: 'x', url: '' },
    { kind: 'link', url: 'https://ok.example' },
    { kind: 'nonsense' },
    'qa',
    null,
  ];
  for (const action of cases) {
    const state = normalizeState({ task: 'ACME-1', phases: [{ phase: 'mr', action }] });
    assert.ok(!('action' in state.phases[0]), `should have dropped ${JSON.stringify(action)}`);
  }
});

test('a link over plain http is allowed — a local review app is not https', () => {
  const state = normalizeState({
    task: 'ACME-1',
    phases: [{ phase: 'mr', action: { kind: 'link', label: 'MR', url: 'http://gitlab.internal/g/r/-/merge_requests/1' } }],
  });
  assert.strictEqual(state.phases[0].action.url, 'http://gitlab.internal/g/r/-/merge_requests/1');
});

test('groupByStage runs the phases into contiguous groups with their tallies', () => {
  const { phases } = normalizeState(payload());
  const groups = groupByStage(phases);
  assert.deepStrictEqual(groups.map((g) => g.stage), ['planning', 'build', 'review']);
  assert.deepStrictEqual(groups.map((g) => g.phases.length), [2, 2, 1]);
  assert.deepStrictEqual(groups.map((g) => g.closed), [1, 1, 0]);
  assert.deepStrictEqual(groups.map((g) => g.total), [2, 2, 1]);
});

// The server promises contiguity; if it ever breaks that promise the widget shows
// two groups rather than silently reordering the canonical order to fix it.
test('groupByStage does not merge a stage that appears twice apart', () => {
  const { phases } = normalizeState({
    task: 'ACME-1',
    phases: [{ phase: 'a', stage: 'one' }, { phase: 'b', stage: 'two' }, { phase: 'c', stage: 'one' }],
  });
  const groups = groupByStage(phases);
  assert.deepStrictEqual(groups.map((g) => g.stage), ['one', 'two', 'one']);
});

test('clearFrom clears the phase and everything after it', () => {
  const state = normalizeState(payload());
  const next = clearFrom(state, 'dev');
  assert.deepStrictEqual(next.phases.map((p) => p.state), ['done', '', '', '', '']);
  assert.strictEqual(next.phases[3].detail, '');
  assert.strictEqual(state.phases[3].detail, 'reason=stale');
});

test('clearFrom leaves a state it does not recognise alone', () => {
  const state = normalizeState(payload());
  assert.deepStrictEqual(clearFrom(state, 'nope').phases.map((p) => p.state), state.phases.map((p) => p.state));
});

test('qaPhase names the phase that drills in, and nothing when none does', () => {
  const { phases } = normalizeState(payload());
  assert.strictEqual(qaPhase(phases), 'crit');
  const none = normalizeState({ task: 'ACME-1', phases: [{ phase: 'dev' }] });
  assert.strictEqual(qaPhase(none.phases), '');
});

test('qaPhase honours the first qa action when the server sends two', () => {
  const state = normalizeState({
    task: 'ACME-1',
    phases: [{ phase: 'a', action: { kind: 'qa' } }, { phase: 'b', action: { kind: 'qa' } }],
  });
  assert.strictEqual(qaPhase(state.phases), 'a');
});

test('hasRecords tells a fresh journal from a started one', () => {
  const { phases } = normalizeState(payload());
  assert.strictEqual(hasRecords(phases), true);
  const fresh = normalizeState({ task: 'ACME-1', phases: [{ phase: 'dev' }, { phase: 'crit' }] });
  assert.strictEqual(hasRecords(fresh.phases), false);
});
