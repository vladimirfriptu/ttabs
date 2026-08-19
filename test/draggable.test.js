import test from 'node:test';
import assert from 'node:assert';

import { clampToViewport, makeDraggable } from '../extension/lib/draggable.js';

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

// makeDraggable touches nothing but its two nodes, so the whole drag can be
// driven from plain fakes: what it does to them is the contract.
const fakeHandle = () => {
  const listeners = new Map();
  let captured = null;

  return {
    captures: [],
    releases: 0,
    addEventListener(type, fn) { listeners.set(type, fn); },
    setPointerCapture(id) { captured = id; this.captures.push(id); },
    hasPointerCapture(id) { return captured === id; },
    releasePointerCapture() { captured = null; this.releases += 1; },
    fire(type, event) { listeners.get(type)?.(event); },
    knows(type) { return listeners.has(type); },
  };
};

const fakePanel = () => ({
  style: {},
  offsetWidth: 320,
  offsetHeight: 400,
  getBoundingClientRect: () => ({ left: 100, top: 200 }),
  classList: {
    names: new Set(),
    add(name) { this.names.add(name); },
    remove(name) { this.names.delete(name); },
    has(name) { return this.names.has(name); },
  },
});

// makeDraggable reads window inside place() and registers a resize listener; the
// module itself touches neither at import time.
const withWindow = (run) => {
  const before = globalThis.window;
  globalThis.window = { innerWidth: 1200, innerHeight: 900, addEventListener() {} };
  try {
    return run();
  } finally {
    globalThis.window = before;
  }
};

const press = (handle, at) => handle.fire('pointerdown', { button: 0, pointerId: 1, clientX: at.x, clientY: at.y, preventDefault() {} });
const move = (handle, at, buttons = 1) => handle.fire('pointermove', { pointerId: 1, clientX: at.x, clientY: at.y, buttons });

test('a press that has not travelled far enough captures nothing and moves nothing', () => {
  withWindow(() => {
    const handle = fakeHandle();
    const panel = fakePanel();
    const drag = makeDraggable(panel, handle);

    press(handle, { x: 50, y: 50 });
    move(handle, { x: 52, y: 51 });

    assert.deepStrictEqual(handle.captures, []);
    assert.strictEqual(panel.style.left, undefined);
    assert.strictEqual(drag.moved(), false);
  });
});

// Capture belongs to the drag, not to the press: taken any earlier it retargets
// the click that a plain press ends in, and the header's own children never see it.
test('the pointer is captured once, on the move that becomes a drag', () => {
  withWindow(() => {
    const handle = fakeHandle();
    const panel = fakePanel();
    makeDraggable(panel, handle);

    press(handle, { x: 50, y: 50 });
    move(handle, { x: 52, y: 51 });
    assert.deepStrictEqual(handle.captures, []);

    move(handle, { x: 56, y: 50 });
    assert.deepStrictEqual(handle.captures, [1]);
    assert.strictEqual(panel.style.left, '106px');

    move(handle, { x: 60, y: 50 });
    assert.deepStrictEqual(handle.captures, [1], 'captured again on a later move');
    assert.strictEqual(panel.style.left, '110px');
  });
});

// A flick whose first move lands outside the handle is a press this listener
// never hears the end of: with nothing captured, pointerup goes to whatever node
// the pointer is over. The origin must not survive it — a later hover with no
// button held would otherwise cross the threshold against it and take the panel
// with the cursor.
test('a press whose release went elsewhere does not turn the next hover into a drag', () => {
  withWindow(() => {
    const handle = fakeHandle();
    const panel = fakePanel();
    const drag = makeDraggable(panel, handle);

    press(handle, { x: 50, y: 50 });

    move(handle, { x: 200, y: 300 }, 0);
    assert.deepStrictEqual(handle.captures, []);
    assert.strictEqual(panel.style.left, undefined);
    assert.strictEqual(drag.moved(), false);

    move(handle, { x: 210, y: 310 }, 0);
    assert.strictEqual(panel.style.left, undefined, 'still hovering, still not dragging');
  });
});

// The guard has to end the drag, not just ignore the move: a pointerup lost to
// window deactivation or a system dialog arrives as the next move with no button
// held, and a drag left open keeps the grabbing cursor and swallows the next
// click on the header.
test('a button-less move after the threshold ends the drag it interrupted', () => {
  withWindow(() => {
    const handle = fakeHandle();
    const panel = fakePanel();
    const drag = makeDraggable(panel, handle);

    press(handle, { x: 50, y: 50 });
    move(handle, { x: 70, y: 50 });
    assert.strictEqual(drag.moved(), true);
    assert.strictEqual(panel.classList.has('dragging'), true);

    move(handle, { x: 90, y: 50 }, 0);

    assert.strictEqual(panel.classList.has('dragging'), false, 'the grab cursor would stick');
    assert.strictEqual(drag.moved(), false, 'the next click on the header would be swallowed');
    assert.strictEqual(handle.releases, 1, 'the capture it took is not released');
  });
});

// The other side of that: an ordinary drag ends in a click on the handle, and
// the caller's click listener reads moved() to stand aside. It has to still be
// true at that point.
test('an ordinary release leaves moved() standing for the click that follows', () => {
  withWindow(() => {
    const handle = fakeHandle();
    const panel = fakePanel();
    const drag = makeDraggable(panel, handle);

    press(handle, { x: 50, y: 50 });
    move(handle, { x: 70, y: 50 });
    handle.fire('pointerup', { pointerId: 1 });

    assert.strictEqual(drag.moved(), true);
    assert.strictEqual(panel.classList.has('dragging'), false);
  });
});

test('a pointercancel is enough to end a drag that was never captured', () => {
  withWindow(() => {
    const handle = fakeHandle();
    const panel = fakePanel();
    makeDraggable(panel, handle);

    assert.ok(handle.knows('pointercancel'));
    press(handle, { x: 50, y: 50 });
    handle.fire('pointercancel', { pointerId: 1 });

    move(handle, { x: 200, y: 300 });
    assert.strictEqual(panel.style.left, undefined);
  });
});
