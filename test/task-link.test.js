import test from 'node:test';
import assert from 'node:assert';

import { taskUrl } from '../extension/lib/task-link.js';

test('a task url is the site plus the browse path', () => {
  assert.strictEqual(taskUrl('https://acme.atlassian.net', 'ACME-1234'), 'https://acme.atlassian.net/browse/ACME-1234');
});

test('a trailing slash on the stored site does not double up', () => {
  assert.strictEqual(taskUrl('https://acme.atlassian.net/', 'ACME-1234'), 'https://acme.atlassian.net/browse/ACME-1234');
});

test('no site means no link', () => {
  assert.strictEqual(taskUrl('', 'ACME-1234'), '');
});

test('no key means no link', () => {
  assert.strictEqual(taskUrl('https://acme.atlassian.net', ''), '');
});
