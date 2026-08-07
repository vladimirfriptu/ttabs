// Lives inside the panel's shadow root, so nothing here can leak into the page
// under test — and nothing the page ships can reach in and restyle the panel.

export const PANEL_CSS = `
  :host { all: initial; }

  .panel {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 2147483647;
    width: 340px;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    font: 13px/1.4 -apple-system, system-ui, sans-serif;
    color: #1a1a1a;
    background: #fff;
    border: 1px solid #d0d0d0;
    border-radius: 8px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid #e6e6e6;
  }

  .task { font-weight: 600; }
  .count { color: #777; margin-left: auto; }

  .body { overflow-y: auto; padding: 4px 0; }

  .area {
    padding: 6px 10px 2px;
    color: #777;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .case { padding: 3px 10px; }

  .row { display: flex; align-items: baseline; gap: 6px; }
  .row input { margin: 0; }

  .title {
    flex: 1;
    cursor: pointer;
    text-align: left;
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    color: inherit;
  }

  .case.outdated .title { text-decoration: line-through; color: #999; }

  .badge {
    font-size: 10px;
    padding: 0 4px;
    border-radius: 3px;
    background: #eee;
    color: #666;
  }
  .badge.new { background: #e3f2e3; color: #2b6b2b; }
  .badge.updated { background: #fff3cd; color: #7a5c00; }

  .details {
    margin: 4px 0 6px 22px;
    padding-left: 8px;
    border-left: 2px solid #eee;
    color: #444;
  }
  .details ol { margin: 0 0 4px; padding-left: 18px; }
  .details .expected { color: #222; }

  .error { color: #b00020; font-size: 11px; margin-left: 22px; }

  .discrepancies {
    border-top: 1px solid #e6e6e6;
    margin-top: 6px;
    padding: 6px 10px;
    background: #fcfaf5;
  }
  .discrepancies h2 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; color: #7a5c00; }
  .discrepancy { margin-bottom: 6px; }
  .discrepancy .summary { font-weight: 600; }
  .discrepancy .meta { color: #666; font-size: 11px; }

  .foot { padding: 8px 10px; border-top: 1px solid #e6e6e6; }

  .done {
    width: 100%;
    padding: 6px;
    font: inherit;
    color: #fff;
    background: #2b6b2b;
    border: 0;
    border-radius: 5px;
    cursor: pointer;
  }

  .ended { padding: 16px 10px; text-align: center; color: #777; }
`;
