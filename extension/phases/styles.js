// Lives inside the panel's shadow root, so nothing here can leak into the page
// under test — and nothing the page ships can reach in and restyle the panel.

export const PANEL_CSS = `
  :host { all: initial; }

  /* An author rule setting display beats the user-agent stylesheet's rule for
     [hidden], and several rules below set it — without this the hidden property
     the panel toggles everywhere would quietly do nothing. */
  [hidden] { display: none !important; }

  /* Bottom-left, because the QA checklist owns bottom-right and the two are
     open at the same time during manual QA. */
  .panel {
    position: fixed;
    left: 16px;
    bottom: 16px;
    z-index: 2147483646;
    width: 320px;
    max-width: calc(100vw - 32px);
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    font: 14px/1.4 -apple-system, system-ui, sans-serif;
    color: #1a1a1a;
    background: #fff;
    border: 1px solid #d0d0d0;
    border-radius: 8px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  }

  .head {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 7px;
    padding: 9px 12px;
    border: 0;
    border-bottom: 1px solid #e6e6e6;
    background: none;
    font: inherit;
    color: inherit;
    text-align: left;
    /* The header both collapses the panel and drags it; the grab cursor is the
       only hint that the second is possible. */
    cursor: grab;
    /* Pointer events on a header that scrolls the page under a drag would fight
       each other on a touchscreen or a trackpad. */
    touch-action: none;
    user-select: none;
  }

  .panel.dragging .head { cursor: grabbing; }

  .task { font-weight: 600; }
  .round {
    font-size: 12px;
    padding: 0 5px;
    border-radius: 3px;
    background: #ede4ff;
    color: #4a2a86;
  }
  .count { color: #777; margin-left: auto; }
  .chevron { line-height: 1; color: #777; }

  /* Collapsed, the header is the whole panel: a small square icon-only button,
     so it stays clickable to expand without any body below it. */
  .panel.collapsed { width: auto; }
  .panel.collapsed .head {
    width: 44px;
    height: 44px;
    padding: 0;
    justify-content: center;
    border-bottom: 0;
  }
  .panel.collapsed .task,
  .panel.collapsed .round,
  .panel.collapsed .count { display: none; }
  .panel.collapsed .chevron { font-size: 20px; }

  .body { overflow-y: auto; padding: 5px 0; }

  .phase { padding: 3px 12px; }
  .row { display: flex; align-items: baseline; gap: 7px; }
  .row input { margin: 0; }
  .row input[type="checkbox"] { width: 15px; height: 15px; }

  .name { flex: 1; }
  .phase.pending .name { color: #888; }
  .phase.skip .name { text-decoration: line-through; color: #999; }
  .phase.open input[type="checkbox"] { outline: 2px solid #d99b00; outline-offset: 1px; }

  .badge {
    font-size: 12px;
    padding: 0 5px;
    border-radius: 3px;
    background: #eee;
    color: #666;
  }
  .badge.open { background: #fff3cd; color: #7a5c00; }

  /* Reset is destructive and cascades, so it stays a quiet glyph until the row
     is hovered rather than a button competing with the checkbox. */
  .reset {
    padding: 0 4px;
    font: inherit;
    color: #999;
    background: none;
    border: 0;
    border-radius: 3px;
    cursor: pointer;
    opacity: 0;
  }
  .phase:hover .reset,
  .reset:focus { opacity: 1; }
  .reset:hover { color: #b00020; background: #f6f6f6; }

  .detail {
    margin-left: 22px;
    color: #7a5c00;
    font-size: 12px;
    white-space: pre-wrap;
  }
  .meta { margin-left: 22px; color: #888; font-size: 12px; }
  .error { margin-left: 22px; color: #b00020; font-size: 12px; }

  .empty { padding: 4px 12px 8px; color: #888; font-size: 12px; }

  /* Below every row rather than beside one, because what goes here belongs to
     the whole read: the panel above it is the last journal that arrived. */
  .foot {
    padding: 7px 12px;
    border-top: 1px solid #e6e6e6;
    color: #b00020;
    font-size: 12px;
  }
`;
