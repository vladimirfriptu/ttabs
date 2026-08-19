import test from 'node:test';
import assert from 'node:assert';

import {
  normalizeState,
  applyAction,
  isSettable,
  cascadeFrom,
  resetWarning,
  closedCount,
  hasRecords,
} from '../extension/lib/phases.js';

const payload = () => ({
  task: 'ACME-1234',
  branch: 'front/ACME-1234-something',
  round: 2,
  next: 'crit',
  phases: [
    { phase: 'start', state: 'done', by: 'starting-a-task', ts: '2026-08-18T09:00:00Z', detail: '' },
    { phase: 'plan', state: '', by: '', ts: '', detail: '' },
    { phase: 'dev', state: 'skip', by: 'widget', ts: '2026-08-18T10:00:00Z', detail: 'reason=docs-only' },
    { phase: 'checks', state: 'open', by: 'checks.sh', ts: '2026-08-18T11:20:00Z', detail: 'reason=stale' },
    { phase: 'crit', state: '', by: '', ts: '', detail: '' },
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
  assert.deepStrictEqual(state.phases[0], { phase: 'dev', state: '', by: '', ts: '', detail: '' });
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

test('isSettable allows a click on not-yet and on open, never on a closed phase', () => {
  const { phases } = normalizeState(payload());
  assert.strictEqual(isSettable(phases[1]), true);
  assert.strictEqual(isSettable(phases[3]), true);
  assert.strictEqual(isSettable(phases[0]), false);
  assert.strictEqual(isSettable(phases[2]), false);
});

test('cascadeFrom lists every later phase in the server order', () => {
  const { phases } = normalizeState(payload());
  assert.deepStrictEqual(cascadeFrom(phases, 'dev'), ['checks', 'crit']);
  assert.deepStrictEqual(cascadeFrom(phases, 'crit'), []);
  assert.deepStrictEqual(cascadeFrom(phases, 'nope'), []);
});

test('resetWarning names every phase the server will reopen', () => {
  const { phases } = normalizeState(payload());
  assert.strictEqual(
    resetWarning(phases, 'dev'),
    'Resetting dev will also reopen checks, crit. Continue?',
  );
});

test('resetWarning says so when nothing follows', () => {
  const { phases } = normalizeState(payload());
  assert.strictEqual(resetWarning(phases, 'crit'), 'Reset crit? Nothing follows it. Continue?');
});

test('closedCount counts done and skip, not open', () => {
  const { phases } = normalizeState(payload());
  assert.strictEqual(closedCount(phases), 2);
});

test('hasRecords tells a fresh journal from a started one', () => {
  const { phases } = normalizeState(payload());
  assert.strictEqual(hasRecords(phases), true);
  const fresh = normalizeState({ task: 'ACME-1', phases: [{ phase: 'dev' }, { phase: 'crit' }] });
  assert.strictEqual(hasRecords(fresh.phases), false);
});
