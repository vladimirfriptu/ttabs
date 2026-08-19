// Lets a floating panel be dragged out of the way by its own header.
//
// Both widgets' headers collapse the panel as well as drag it — the QA panel's
// is a button, the phase panel's a row with a button and a link inside it — so
// the hard part is not the moving but telling a click apart from a drag. A
// caller asks `moved()` at the top of its click handler and bails out when the
// pointer travelled: nothing here cancels the event, because suppressing a
// click from a capture-phase listener makes the two features depend on listener
// order, and this way each one reads on its own.
//
// The position is deliberately not persisted. It lives as long as the page
// does, which is what was asked for — a panel in the way is a per-app
// annoyance, not a lasting preference.

// Far enough that a click with a shaking hand is still a click, close enough
// that a deliberate nudge is a drag.
const DRAG_THRESHOLD_PX = 4;

// Keeps the whole panel inside the window: dragged past an edge it stops there,
// rather than leaving part of itself unreachable.
//
// When the window is smaller than the panel the two edges cannot both be
// satisfied — the left/top edge wins, because a header dragged past the right
// edge is a panel that can never be dragged back.
export const clampToViewport = ({ left, top }, box, viewport) => ({
  left: Math.max(0, Math.min(left, viewport.width - box.width)),
  top: Math.max(0, Math.min(top, viewport.height - box.height)),
});

export const makeDraggable = (panel, handle) => {
  // Where the pointer went down, and where the panel's own corner was at that
  // moment — the delta between them is what the panel keeps as it moves.
  let origin = null;
  let moved = false;

  const place = (left, top) => {
    const box = { width: panel.offsetWidth, height: panel.offsetHeight };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const at = clampToViewport({ left, top }, box, viewport);

    panel.style.left = `${at.left}px`;
    panel.style.top = `${at.top}px`;
    // The stylesheet anchors each panel to a corner of its own (bottom-left
    // here, bottom-right for the QA checklist). Left untouched, those rules
    // fight every move — a panel with both `top` and `bottom` set is stretched
    // between them rather than positioned.
    panel.style.bottom = 'auto';
    panel.style.right = 'auto';
  };

  handle.addEventListener('pointerdown', (event) => {
    // Only the primary button drags; a right-click belongs to the page's own
    // context menu, and a middle-click to whatever the browser does with it.
    if (event.button !== 0) return;

    const box = panel.getBoundingClientRect();
    origin = { x: event.clientX, y: event.clientY, left: box.left, top: box.top };
    moved = false;

    // No capture yet — see pointermove. Otherwise the header's text starts
    // selecting under the drag.
    event.preventDefault();
  });

  handle.addEventListener('pointermove', (event) => {
    if (!origin) return;

    // A move with no button held, while an origin is still set, means the press
    // ended somewhere this listener never saw it: nothing is captured until the
    // threshold, so a flick that left the header before those 4px sent its
    // pointerup to another node and release() never ran. Left alone, the stale
    // origin makes the next bare hover over the header cross the threshold and
    // carry the panel off with the cursor.
    if (event.buttons === 0) {
      origin = null;
      return;
    }

    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;

    if (!moved && Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;

    if (!moved) {
      moved = true;
      // Captured on the transition to a drag, never on the press. An active
      // capture makes every later pointer event for this id — and the click
      // derived from it — dispatch at the handle, which steals the click from
      // any interactive child a header has (the phase panel's task link, its
      // collapse button). From here on it is what keeps a fast drag that
      // outruns the cursor from stranding the panel mid-move when the pointer
      // leaves the header, with no listener on the page's document. Within the
      // first 4px the pointer is still over the header, and a move over a child
      // bubbles to the handle anyway.
      handle.setPointerCapture(event.pointerId);
      panel.classList.add('dragging');
    }

    place(origin.left + dx, origin.top + dy);
  });

  const release = (event) => {
    if (!origin) return;
    origin = null;
    panel.classList.remove('dragging');
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  };

  handle.addEventListener('pointerup', release);
  // A capture lost to something outside this widget — the page opening a modal,
  // the window losing focus mid-drag — must still end the drag, or the next
  // pointermove would jump the panel from a stale origin.
  handle.addEventListener('pointercancel', release);
  handle.addEventListener('lostpointercapture', release);

  // A window shrunk after the panel was dragged would otherwise leave it
  // half-off the screen. Only a panel that has actually been dragged is
  // re-placed: an untouched one is still positioned by the stylesheet, and
  // writing left/top here would silently take that over.
  window.addEventListener('resize', () => {
    if (!panel.style.left) return;
    place(Number.parseFloat(panel.style.left), Number.parseFloat(panel.style.top));
  });

  // True when the pointer travelled far enough that this was a drag, so a
  // click handler on the same element can stand aside. Stays true until the
  // next pointerdown, which is exactly long enough for the click that follows
  // the drag to read it.
  return { moved: () => moved };
};
