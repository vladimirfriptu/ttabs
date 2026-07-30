import test from 'node:test';
import assert from 'node:assert';

import { planUpdates } from '../extension/lib/plan.js';

const group = (id, title) => ({ group: { id, title }, key: title.match(/[A-Z]+-\d+/)[0] });

test('rewrites a bare key into a prefixed title', () => {
  const tracked = [group(1, 'ACME-2253')];
  const { updates } = planUpdates(tracked, { 'ACME-2253': 'In dev' }, {});
  assert.deepEqual(updates, [{ groupId: 1, title: 'DEV|ACME-2253' }]);
});

test('leaves a title that already says the right thing', () => {
  const tracked = [group(1, 'DEV|ACME-2253')];
  const { updates } = planUpdates(tracked, { 'ACME-2253': 'In dev' }, {});
  assert.deepEqual(updates, []);
});

test('skips a group whose status did not come back', () => {
  const tracked = [group(1, 'ACME-2253')];
  const { updates } = planUpdates(tracked, {}, {});
  assert.deepEqual(updates, []);
});

test('skips a title the user typed themselves', () => {
  const tracked = [{ group: { id: 1, title: '[1] ACME-2253' }, key: 'ACME-2253' }];
  const { updates } = planUpdates(tracked, { 'ACME-2253': 'In dev' }, {});
  assert.deepEqual(updates, []);
});

test('remembers every title it decided on', () => {
  const tracked = [group(1, 'ACME-1'), group(2, 'REV|ACME-2')];
  const statuses = { 'ACME-1': 'In dev', 'ACME-2': 'In review' };
  const { titles } = planUpdates(tracked, statuses, {});
  assert.deepEqual(titles, { 'ACME-1': 'DEV|ACME-1', 'ACME-2': 'REV|ACME-2' });
});

test('forgets keys whose groups are gone', () => {
  const tracked = [group(1, 'ACME-1')];
  const written = { 'ACME-1': 'DEV|ACME-1', 'ACME-999': 'DONE|ACME-999' };
  const { titles } = planUpdates(tracked, { 'ACME-1': 'In dev' }, written);
  assert.deepEqual(titles, { 'ACME-1': 'DEV|ACME-1' });
});

test('keeps remembering a group it could not refresh this round', () => {
  const tracked = [{ group: { id: 1, title: 'NEWL|ACME-1' }, key: 'ACME-1' }];
  const written = { 'ACME-1': 'NEWL|ACME-1' };
  const { titles, updates } = planUpdates(tracked, {}, written);
  assert.deepEqual(updates, []);
  assert.deepEqual(titles, { 'ACME-1': 'NEWL|ACME-1' });
});

test('keeps updating a fallback prefix it wrote itself', () => {
  const tracked = [{ group: { id: 1, title: 'NEWL|ACME-1' }, key: 'ACME-1' }];
  const written = { 'ACME-1': 'NEWL|ACME-1' };
  const { updates } = planUpdates(tracked, { 'ACME-1': 'In dev' }, written);
  assert.deepEqual(updates, [{ groupId: 1, title: 'DEV|ACME-1' }]);
});
