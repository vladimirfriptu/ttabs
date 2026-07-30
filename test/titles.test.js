import test from 'node:test';
import assert from 'node:assert';

import { abbreviate } from '../extension/lib/statuses.js';
import { keyFromTitle, titleFor, isOurTitle } from '../extension/lib/titles.js';

test('maps a known status to its prefix', () => {
  assert.equal(abbreviate('In dev'), 'DEV');
  assert.equal(abbreviate('  ready for test '), 'RQA');
});

test('falls back to the first four letters of an unmapped status', () => {
  assert.equal(abbreviate('Newly Invented'), 'NEWL');
});

test('builds the group title', () => {
  assert.equal(titleFor('ACME-2253', 'In dev'), 'DEV|ACME-2253');
  assert.equal(titleFor('ABC-7', 'On hold'), 'HOLD|ABC-7');
});

test('reads the task key out of a title', () => {
  assert.equal(keyFromTitle('DEV|ACME-2253'), 'ACME-2253');
  assert.equal(keyFromTitle('[1] ACME-2253'), 'ACME-2253');
  assert.equal(keyFromTitle('ACME-2253'), 'ACME-2253');
  assert.equal(keyFromTitle('scratch'), null);
});

test('owns a bare key and its own prefixes', () => {
  assert.equal(isOurTitle('ACME-2253', 'ACME-2253'), true);
  assert.equal(isOurTitle('DEV|ACME-2253', 'ACME-2253'), true);
  assert.equal(isOurTitle('DONE|ACME-2253', 'ACME-2253'), true);
});

test('leaves a hand-written title alone', () => {
  assert.equal(isOurTitle('[1] ACME-2253', 'ACME-2253'), false);
  assert.equal(isOurTitle('[1]|ACME-2253', 'ACME-2253'), false);
  assert.equal(isOurTitle('ACME-2253 urgent', 'ACME-2253'), false);
});

test('keeps updating a fallback prefix it wrote itself', () => {
  assert.equal(isOurTitle('NEWL|ACME-2253', 'ACME-2253', 'NEWL|ACME-2253'), true);
  assert.equal(isOurTitle('NEWL|ACME-2253', 'ACME-2253', 'DEV|ACME-2253'), false);
});

test('does not claim a group belonging to another key', () => {
  assert.equal(isOurTitle('DEV|ACME-9999', 'ACME-2253'), false);
});
