import test from 'node:test';
import assert from 'node:assert/strict';

import { safeHref } from '../extension/lib/href.js';

test('an https url passes through unchanged', () => {
  assert.strictEqual(safeHref('https://acme.atlassian.net/browse/ACME-1'), 'https://acme.atlassian.net/browse/ACME-1');
});

test('plain http passes — an internal tracker is not always https', () => {
  assert.strictEqual(safeHref('http://jira.internal/browse/ACME-1'), 'http://jira.internal/browse/ACME-1');
});

// The CLI accepts a bare host, and a bare host in an href is a *relative* link:
// it would point at the page under test instead of the tracker.
test('a scheme-less host is refused rather than left relative', () => {
  assert.strictEqual(safeHref('acme.atlassian.net'), '');
  assert.strictEqual(safeHref('acme.atlassian.net/browse/ACME-1'), '');
});

// URL parsing drops tabs and newlines, so a scheme broken across a line is still
// the scheme it spells — checking the parsed protocol sees through the disguise.
test('javascript: is refused in any casing, whitespace-split included', () => {
  assert.strictEqual(safeHref('javascript:alert(1)'), '');
  assert.strictEqual(safeHref('JavaScript:alert(1)'), '');
  assert.strictEqual(safeHref('JAVASCRIPT:alert(1)'), '');
  assert.strictEqual(safeHref('java\nscript:alert(1)'), '');
});

test('data: is refused', () => {
  assert.strictEqual(safeHref('data:text/html,<script>alert(1)</script>'), '');
});

test('a protocol-relative url is refused — there is no base to resolve it against', () => {
  assert.strictEqual(safeHref('//evil.example/browse/ACME-1'), '');
});

test('nothing in is nothing out', () => {
  assert.strictEqual(safeHref(''), '');
  assert.strictEqual(safeHref(undefined), '');
  assert.strictEqual(safeHref(null), '');
  assert.strictEqual(safeHref(42), '');
});
