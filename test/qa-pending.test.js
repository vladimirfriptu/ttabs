import test, { mock } from 'node:test';
import assert from 'node:assert';

import { createPendingSends } from '../extension/lib/qa-pending.js';

// Every test drives time by hand: a real 1000 ms wait would make the suite slow
// and flaky, and what is under test here is exactly when the timer fires.
const withFakeTimers = (body) => async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    await body();
  } finally {
    mock.timers.reset();
  }
};

const recorder = () => {
  const calls = [];
  const send = (id, text) => {
    calls.push([id, text]);
    return Promise.resolve();
  };
  return { calls, send };
};

test('sends queued text once the delay passes', withFakeTimers(async () => {
  const { calls, send } = recorder();
  const pending = createPendingSends(send, 1000);

  pending.queue('TC-1', 'looks wrong');
  assert.deepEqual(calls, []);

  mock.timers.tick(1000);
  assert.deepEqual(calls, [['TC-1', 'looks wrong']]);
}));

test('does not send before the delay passes', withFakeTimers(async () => {
  const { calls, send } = recorder();
  const pending = createPendingSends(send, 1000);

  pending.queue('TC-1', 'looks wrong');
  mock.timers.tick(999);
  assert.deepEqual(calls, []);
}));

test('a second keystroke restarts the delay instead of sending twice', withFakeTimers(async () => {
  const { calls, send } = recorder();
  const pending = createPendingSends(send, 1000);

  pending.queue('TC-1', 'looks');
  mock.timers.tick(900);
  pending.queue('TC-1', 'looks wrong');
  mock.timers.tick(900);
  assert.deepEqual(calls, []);

  mock.timers.tick(100);
  assert.deepEqual(calls, [['TC-1', 'looks wrong']]);
}));

test('keeps a timer per case', withFakeTimers(async () => {
  const { calls, send } = recorder();
  const pending = createPendingSends(send, 1000);

  pending.queue('TC-1', 'first');
  mock.timers.tick(500);
  pending.queue('TC-2', 'second');
  mock.timers.tick(500);
  assert.deepEqual(calls, [['TC-1', 'first']]);

  mock.timers.tick(500);
  assert.deepEqual(calls, [['TC-1', 'first'], ['TC-2', 'second']]);
}));

test('sends early on demand and cancels the pending timer', withFakeTimers(async () => {
  const { calls, send } = recorder();
  const pending = createPendingSends(send, 1000);

  pending.queue('TC-1', 'looks wrong');
  await pending.sendNow('TC-1');
  assert.deepEqual(calls, [['TC-1', 'looks wrong']]);

  mock.timers.tick(1000);
  assert.deepEqual(calls, [['TC-1', 'looks wrong']]);
}));

test('sending early with nothing queued sends nothing', withFakeTimers(async () => {
  const { calls, send } = recorder();
  const pending = createPendingSends(send, 1000);

  await pending.sendNow('TC-1');
  assert.deepEqual(calls, []);
}));

test('flush sends every queued case and leaves nothing pending', withFakeTimers(async () => {
  const { calls, send } = recorder();
  const pending = createPendingSends(send, 1000);

  pending.queue('TC-1', 'first');
  pending.queue('TC-2', 'second');
  await pending.flush();

  assert.deepEqual(calls, [['TC-1', 'first'], ['TC-2', 'second']]);
  assert.deepEqual(pending.pending(), []);

  mock.timers.tick(1000);
  assert.deepEqual(calls.length, 2);
}));

test('flush with nothing queued sends nothing', withFakeTimers(async () => {
  const { calls, send } = recorder();
  const pending = createPendingSends(send, 1000);

  await pending.flush();
  assert.deepEqual(calls, []);
}));

test('flush waits for the sends it started', withFakeTimers(async () => {
  const settled = [];
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const send = (id) => blocked.then(() => settled.push(id));

  const pending = createPendingSends(send, 1000);
  pending.queue('TC-1', 'first');

  const flushed = pending.flush();
  assert.deepEqual(settled, []);

  release();
  await flushed;
  assert.deepEqual(settled, ['TC-1']);
}));

test('flush awaits a send already in flight from an earlier sendNow', withFakeTimers(async () => {
  const settled = [];
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const send = (id) => blocked.then(() => settled.push(id));

  const pending = createPendingSends(send, 1000);
  pending.queue('TC-1', 'first');

  const sent = pending.sendNow('TC-1');
  assert.deepEqual(pending.pending(), []);

  const flushed = pending.flush();
  assert.deepEqual(settled, []);

  release();
  await sent;
  await flushed;
  assert.deepEqual(settled, ['TC-1']);
}));

test('flush with nothing queued and nothing in flight resolves without sending', withFakeTimers(async () => {
  const { calls, send } = recorder();
  const pending = createPendingSends(send, 1000);

  await pending.flush();
  assert.deepEqual(calls, []);
}));

test('clear cancels everything and sends nothing', withFakeTimers(async () => {
  const { calls, send } = recorder();
  const pending = createPendingSends(send, 1000);

  pending.queue('TC-1', 'first');
  pending.clear();
  assert.deepEqual(pending.pending(), []);

  mock.timers.tick(1000);
  assert.deepEqual(calls, []);
}));

test('reports what is still waiting', withFakeTimers(async () => {
  const { send } = recorder();
  const pending = createPendingSends(send, 1000);

  pending.queue('TC-1', 'first');
  pending.queue('TC-2', 'second');
  assert.deepEqual(pending.pending(), ['TC-1', 'TC-2']);

  mock.timers.tick(1000);
  assert.deepEqual(pending.pending(), []);
}));
