// Lives inside the panel's shadow root, so nothing here can leak into the page
// under test — and nothing the page ships can reach in and restyle the panel.
//
// Every value below is lifted from an approved artboard rather than chosen here:
// the phase list from `design/Staged.dc.html`, the drilled-in checklist from
// `design/Testing.dc.html`, and its note field from `design/Notes.dc.html`.

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
    width: 360px;
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
    box-sizing: border-box;
    display: flex;
    align-items: center;
    width: 100%;
    gap: 7px;
    padding: 9px 12px;
    border-bottom: 1px solid #e6e6e6;
    /* The header both collapses the panel and drags it; the grab cursor is the
       only hint that the second is possible. */
    cursor: grab;
    /* Pointer events on a header that scrolls the page under a drag would fight
       each other on a touchscreen or a trackpad. */
    touch-action: none;
    user-select: none;
  }

  .panel.dragging .head { cursor: grabbing; }

  /* Takes everything the key and the round badge leave, so clicking the empty
     part of the header still collapses the panel — which is what the header
     being one big button used to give. */
  .fold {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 7px;
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    color: inherit;
    cursor: inherit;
  }

  /* Drawn glyphs must not be squeezed by the flex row they sit in. */
  .icon { flex: none; }

  .task { font-weight: 600; }
  /* A flex row, because the icon it opens with lives inside it — which also
     means the underline has to go on the text itself: a decoration on a flex
     container does not reach its items. */
  a.task {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #1a1a1a;
    text-decoration: none;
  }
  .key {
    text-decoration: underline;
    text-decoration-color: #b8b8b8;
    text-underline-offset: 2px;
  }
  a.task:hover { color: #000; }

  .round {
    font-size: 12px;
    padding: 0 5px;
    border-radius: 3px;
    background: #ede4ff;
    color: #4a2a86;
  }
  .count { color: #777; }
  .chevron { line-height: 1; color: #777; }

  /* Collapsed, the header is the whole panel: a small square icon-only button,
     so it stays clickable to expand without any body below it. */
  .panel.collapsed { width: auto; }
  .panel.collapsed .head {
    width: 44px;
    height: 44px;
    padding: 0;
    border-bottom: 0;
  }
  .panel.collapsed .fold { height: 100%; justify-content: center; }
  /* The key's icon goes with it — it is inside the anchor. */
  .panel.collapsed .task,
  .panel.collapsed .round,
  .panel.collapsed .count { display: none; }
  .panel.collapsed .chevron { font-size: 20px; }

  .body { overflow-y: auto; padding: 3px 0; }

  /* The caption's rule fills whatever the name and the tally leave, so a long
     stage name shortens the line instead of wrapping it. */
  .stage {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 12px 2px;
  }
  .stage-name {
    font-size: 12px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #8a8a85;
  }
  .stage-rule { height: 1px; flex: 1; background: #ededed; }
  .stage-tally { font-size: 12px; color: #a6a6a6; }

  .phase { display: flex; gap: 9px; padding: 3px 12px; }
  .phase:hover { background: #f6f6f6; }

  /* The rail is what makes the list read as a pipeline: it takes whatever height
     the row's text leaves, so a row with a detail under it grows its own link
     down to the next box. */
  .gutter {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 15px;
  }
  .box {
    box-sizing: border-box;
    width: 15px;
    height: 15px;
    margin-top: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #b4b4b4;
    border-radius: 3px;
    background: #fff;
    cursor: pointer;
  }
  .phase.done .box { background: #3f7a3f; border-color: #3f7a3f; }
  .phase.open .box { background: #fff8e6; border-color: #d99b00; }

  .rail {
    flex: 1;
    width: 2px;
    margin-top: 3px;
    border-radius: 1px;
    background: #ededed;
  }
  .phase.done .rail,
  .phase.skip .rail { background: #cfe0cf; }
  .phase.open .rail { background: #f0dfae; }

  .main { flex: 1; min-width: 0; padding-bottom: 3px; }
  .row { display: flex; align-items: baseline; gap: 7px; }

  .name { flex: 1; }
  .phase.pending .name { color: #888; }
  .phase.skip .name { text-decoration: line-through; color: #999; }

  .badge {
    flex: none;
    font-size: 12px;
    padding: 0 5px;
    border-radius: 3px;
    background: #eee;
    color: #666;
  }
  .badge.open { background: #fff3cd; color: #7a5c00; }

  /* Where the row goes when it is followed, which is never the panel: a chip is
     a real link or a real button, and the box beside it is what writes. */
  .chip {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 1px 6px;
    font: inherit;
    font-size: 12px;
    border-radius: 4px;
    text-decoration: none;
    cursor: pointer;
  }
  .chip.link {
    border: 1px solid #d8d8d8;
    color: #4a4a4a;
    background: #f7f7f7;
  }
  .chip.link:hover { background: #ececec; border-color: #b8b8b8; }
  .chip.qa {
    border: 1px solid #c4d8c4;
    color: #2b6b2b;
    background: #f2f8f2;
  }
  .chip.qa:hover { background: #e8f2e8; border-color: #a9c9a9; }

  /* Everything in the list a keyboard reaches: the box that writes, and the chips
     that lead out of the panel. One ring for all of them, because the user agent
     draws none inside this shadow root that survived testing. */
  .box:focus-visible,
  .chip:focus-visible {
    outline: 2px solid #3f7a3f;
    outline-offset: 2px;
  }

  /* The extent of the cascade the next click would run, shown on the rows it
     would reach. Set after the state rules, which it deliberately overrides at
     equal specificity. */
  .phase.fading .name { color: #b9b9b9; text-decoration: none; }
  .phase.fading .box { background: #fff; border-color: #d0d0d0; }
  .phase.fading .rail { background: #ededed; }
  /* Hidden by visibility rather than display: the panel is anchored to the
     bottom of the window, so a peek that removed a detail line would slide the
     whole list under the pointer and hand the hover to another row.
     .error is in the list on purpose — a dimmed row is announcing it is about
     to be cleared, and a failed click's message on it is already history. */
  .phase.fading .mark,
  .phase.fading .badge,
  .phase.fading .detail,
  .phase.fading .meta,
  .phase.fading .error { visibility: hidden; }

  .detail { color: #7a5c00; font-size: 12px; white-space: pre-wrap; }
  .meta { color: #888; font-size: 12px; }
  .error { color: #b00020; font-size: 12px; }

  /* One line under the list, carrying whichever of "what is next" and "what the
     click would clear" applies — and holding a line's worth of height even when
     it carries neither, because the panel grows upwards from the bottom of the
     window and a line that appeared with the peek would move the list under the
     pointer. */
  .hint {
    padding: 5px 12px 8px;
    min-height: 1.4em;
    color: #888;
    font-size: 12px;
  }

  /* Below every row rather than beside one, because what goes here belongs to
     the whole read: the panel above it is the last journal that arrived. */
  .foot {
    padding: 7px 12px;
    border-top: 1px solid #e6e6e6;
    color: #b00020;
    font-size: 12px;
  }

  /* ---- the drilled-in screen: the QA session's checklist ----
     Values from design/Testing.dc.html, the note field's from Notes.dc.html.
     Nothing here shares a class name with the phase list except .badge, .row,
     .icon and .error, which carry the same values in both designs — every other
     rule is its own, because one stylesheet serves both screens. */

  /* The one reason to widen: a case's steps do not read at 360. */
  .panel.wide { width: 420px; }

  /* Its own flex column, so .qa-body scrolls inside the panel's max-height
     instead of the whole screen growing past it. */
  .qa { display: flex; flex-direction: column; min-height: 0; }

  .qa-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    border-bottom: 1px solid #e6e6e6;
    /* The drag handle for this screen — the phase header, which is the handle
       for the other one, is hidden while this is up. */
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .panel.dragging .qa-head { cursor: grabbing; }

  .back {
    flex: none;
    display: flex;
    align-items: center;
    margin: 0 0 0 -3px;
    padding: 3px;
    border: 0;
    border-radius: 4px;
    background: none;
    cursor: pointer;
  }
  .back:hover { background: #ececec; }

  .qa-phase { font-weight: 600; }
  .qa-key { color: #a0a0a0; font-size: 13px; }
  /* Pushed to the far edge by its own margin, so a long phase name takes the
     room rather than the tally moving. */
  .qa-tally { margin-left: auto; color: #777; }

  .qa-body { overflow-y: auto; padding: 5px 0; }

  .area {
    padding: 7px 12px 2px;
    color: #777;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .case { padding: 4px 12px; }

  /* Nudged down off the baseline the row aligns on, so the box sits with the
     first line of a title rather than under it. */
  .check {
    box-sizing: border-box;
    position: relative;
    top: 2px;
    flex: none;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #b4b4b4;
    border-radius: 3px;
    background: #fff;
    cursor: pointer;
  }
  .check:hover { border-color: #8a8a8a; }
  .case.passed .check { background: #3f7a3f; border-color: #3f7a3f; }

  .title {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  /* A case the session says no longer applies: struck through and dimmed, still
     there, because the checklist is the QA server's list and not this widget's
     to edit. */
  .case.outdated .title { color: #999; text-decoration: line-through; }

  .badge.new { background: #e3f2e3; color: #2b6b2b; }
  .badge.updated { background: #fff3cd; color: #7a5c00; }

  /* Indented past the box and ruled, the way the phase list indents secondary
     matter — the steps belong to the title above them. */
  .steps {
    margin: 5px 0 7px 26px;
    padding-left: 9px;
    border-left: 2px solid #eee;
    color: #444;
  }
  .step { display: flex; gap: 6px; }
  .step-n { flex: none; color: #a0a0a0; }
  .expected { margin-top: 3px; color: #222; }

  .note-box { margin: 5px 0 7px 26px; }

  /* The note reuses the left rule the panel already indents secondary matter
     with, in amber — a human's words read apart from the machine's metadata. It
     grows with what is typed: no fixed box, no resize grip. field-sizing is
     Chrome-only, which is the whole audience of an unpacked Chrome extension —
     so no input handler measuring scrollHeight either. */
  .quoted {
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: 1px 0 1px 9px;
    font: inherit;
    color: #4a3a10;
    background: none;
    border: 0;
    border-left: 2px solid #f0dfae;
    resize: none;
    outline: none;
    overflow: hidden;
    field-sizing: content;
    min-height: 1.4em;
  }
  .quoted:focus { border-left-color: #d99b00; background: #fffdf6; }
  .quoted::placeholder { color: #b0a68a; }

  /* What the folded case shows instead of the field: the fold hides what to do,
     never what was found. */
  .comment-text {
    margin: 5px 0 7px 26px;
    padding-left: 9px;
    border-left: 2px solid #f0dfae;
    color: #6a5a2a;
    font-size: 13px;
    white-space: pre-wrap;
  }

  /* Below the cases and tinted, because it is the session talking about the
     requirements rather than about a case. */
  .discrepancies {
    margin-top: 7px;
    padding: 7px 12px;
    border-top: 1px solid #e6e6e6;
    background: #fcfaf5;
  }
  .discrepancies-title {
    margin-bottom: 5px;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #7a5c00;
  }
  .discrepancy + .discrepancy { margin-top: 5px; }
  .discrepancy-summary { font-weight: 600; }
  .discrepancy-meta { color: #666; font-size: 13px; }

  .qa-foot {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 9px 12px;
    border-top: 1px solid #e6e6e6;
  }
  .finish {
    display: block;
    width: 100%;
    padding: 7px;
    border: 0;
    border-radius: 5px;
    font: inherit;
    text-align: center;
    color: #fff;
    background: #2b6b2b;
    cursor: pointer;
  }
  /* Still cases to go: the action stays available — finishing early is a real
     choice, and the confirmation is where it is questioned — but it stops
     looking like the end of a finished list. */
  .finish.remaining { background: #7d8a7d; }
  .finish-note { color: #888; font-size: 12px; }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 7px;
    padding: 14px 12px;
  }
  .empty-line { color: #555; }
  .empty-hint { color: #888; font-size: 12px; }
  .close-without {
    padding: 3px 8px;
    font: inherit;
    font-size: 13px;
    color: #333;
    background: #f4f4f4;
    border: 1px solid #d8d8d8;
    border-radius: 5px;
    cursor: pointer;
  }
  .close-without:hover { background: #ececec; }

  /* The same ring the phase list draws, for the same reason: the user agent
     draws none inside this shadow root that survived testing. The note field is
     not in the list — it says it has the focus with its own amber rule. */
  .back:focus-visible,
  .check:focus-visible,
  .title:focus-visible,
  .finish:focus-visible,
  .close-without:focus-visible {
    outline: 2px solid #3f7a3f;
    outline-offset: 2px;
  }
`;
