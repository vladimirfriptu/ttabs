import test from 'node:test';
import assert from 'node:assert';

import { allows } from '../extension/phases/client.js';

test('a state read is allowed with a task key and nothing else', () => {
  assert.strictEqual(allows('GET', '/api/phase/state?task=ACME-1234'), true);
  assert.strictEqual(allows('GET', '/api/phase/state'), false);
  assert.strictEqual(allows('GET', '/api/phase/state?task='), false);
  assert.strictEqual(allows('GET', '/api/phase/state?task=ACME-1234&x=1'), false);
});

test('a mutation is allowed on a phase name and nothing else', () => {
  assert.strictEqual(allows('POST', '/api/phase/checks'), true);
  assert.strictEqual(allows('POST', '/api/phase/code-review'), true);
  assert.strictEqual(allows('POST', '/api/phase/'), false);
  assert.strictEqual(allows('POST', '/api/phase/checks/../../evil'), false);
});

test('a path that would leave the loopback address is refused', () => {
  assert.strictEqual(allows('GET', '/api/phase/state?task=@evil.example'), false);
  assert.strictEqual(allows('POST', '//evil.example/api/phase/dev'), false);
  assert.strictEqual(allows('POST', '/api/phase/dev?task=@evil.example'), false);
});

test('the method decides which shape applies', () => {
  assert.strictEqual(allows('POST', '/api/phase/state?task=ACME-1234'), false);
  assert.strictEqual(allows('GET', '/api/phase/checks'), false);
  assert.strictEqual(allows('DELETE', '/api/phase/checks'), false);
});

test('the read endpoint is not a mutation target', () => {
  assert.strictEqual(allows('POST', '/api/phase/state'), false);
  assert.strictEqual(allows('POST', '/api/phase/state?task=ACME-1234'), false);
  // Only the exact name is excluded — a phase whose name starts with it is a
  // phase like any other.
  assert.strictEqual(allows('POST', '/api/phase/stateful'), true);
});
