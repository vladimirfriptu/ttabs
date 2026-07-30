const test = require('node:test');
const assert = require('node:assert');

const { abbreviate, keyFromTitle, titleFor, isOurTitle } = require('../extension/statuses.js');

test('maps a known status to its prefix', () => {
  assert.equal(abbreviate('In dev'), 'DEV');
  assert.equal(abbreviate('  ready for test '), 'RQA');
});

test('falls back to the first four letters of an unmapped status', () => {
  assert.equal(abbreviate('Newly Invented'), 'NEWL');
});

test('builds the group title', () => {
  assert.equal(titleFor('HRS-2253', 'In dev'), 'DEV|HRS-2253');
  assert.equal(titleFor('ABC-7', 'On hold'), 'HOLD|ABC-7');
});

test('reads the task key out of a title', () => {
  assert.equal(keyFromTitle('DEV|HRS-2253'), 'HRS-2253');
  assert.equal(keyFromTitle('[1] HRS-2253'), 'HRS-2253');
  assert.equal(keyFromTitle('HRS-2253'), 'HRS-2253');
  assert.equal(keyFromTitle('scratch'), null);
});

test('owns a bare key and its own prefixes', () => {
  assert.equal(isOurTitle('HRS-2253', 'HRS-2253'), true);
  assert.equal(isOurTitle('DEV|HRS-2253', 'HRS-2253'), true);
  assert.equal(isOurTitle('DONE|HRS-2253', 'HRS-2253'), true);
});

test('leaves a hand-written title alone', () => {
  assert.equal(isOurTitle('[1] HRS-2253', 'HRS-2253'), false);
  assert.equal(isOurTitle('[1]|HRS-2253', 'HRS-2253'), false);
  assert.equal(isOurTitle('HRS-2253 urgent', 'HRS-2253'), false);
});

test('keeps updating a fallback prefix it wrote itself', () => {
  assert.equal(isOurTitle('NEWL|HRS-2253', 'HRS-2253', 'NEWL|HRS-2253'), true);
  assert.equal(isOurTitle('NEWL|HRS-2253', 'HRS-2253', 'DEV|HRS-2253'), false);
});

test('does not claim a group belonging to another key', () => {
  assert.equal(isOurTitle('DEV|HRS-9999', 'HRS-2253'), false);
});
