import test from 'node:test';
import assert from 'node:assert';

import { clampToViewport } from '../extension/lib/draggable.js';

const viewport = { width: 1000, height: 800 };
const box = { width: 320, height: 200 };

test('an ordinary move lands where it was dragged', () => {
  const at = clampToViewport({ left: 100, top: 100 }, box, viewport);
  assert.deepStrictEqual(at, { left: 100, top: 100 });
});

test('a panel dragged off the left or top edge stops at the edge', () => {
  assert.deepStrictEqual(clampToViewport({ left: -40, top: 100 }, box, viewport), { left: 0, top: 100 });
  assert.deepStrictEqual(clampToViewport({ left: 100, top: -40 }, box, viewport), { left: 100, top: 0 });
});

test('a panel dragged off the right or bottom edge stays fully visible', () => {
  assert.deepStrictEqual(clampToViewport({ left: 900, top: 100 }, box, viewport), { left: 680, top: 100 });
  assert.deepStrictEqual(clampToViewport({ left: 100, top: 700 }, box, viewport), { left: 100, top: 600 });
});

// A window narrower than the panel has no position that satisfies both edges;
// the left edge wins, because a panel whose header is off-screen cannot be
// dragged back.
test('a viewport smaller than the panel pins it to the top left', () => {
  const at = clampToViewport({ left: 50, top: 50 }, box, { width: 200, height: 150 });
  assert.deepStrictEqual(at, { left: 0, top: 0 });
});

test('the edges themselves are allowed', () => {
  assert.deepStrictEqual(clampToViewport({ left: 0, top: 0 }, box, viewport), { left: 0, top: 0 });
  assert.deepStrictEqual(clampToViewport({ left: 680, top: 600 }, box, viewport), { left: 680, top: 600 });
});

test('a fractional pointer position is not rounded away', () => {
  const at = clampToViewport({ left: 100.5, top: 100.25 }, box, viewport);
  assert.deepStrictEqual(at, { left: 100.5, top: 100.25 });
});
