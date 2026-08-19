import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PANEL_CSS } from '../extension/phases/styles.js';
import { PANEL_CSS as QA_WIDGET_CSS } from '../extension/qa/styles.js';

// The phase list and the drilled-in checklist live in one shadow root and share
// one stylesheet, so every class name belongs to one of two vocabularies. A bare
// single-class rule written for one screen silently restyles the other's element
// the moment those vocabularies overlap: `.qa`, added for the checklist's mount
// host, also matched the phase list's `chip qa` and stacked the chip's label
// above its arrow at roughly double height.
//
// The two lists are written out by hand on purpose. Adding a class to either
// screen has to be a deliberate edit in one place — that is what makes this test
// notice an overlap, instead of a browser noticing it for someone later.
//
// Which is also the limit of what any of this proves: the lists are trusted, not
// derived. Nothing here reads the two modules to check that they really do set
// every name listed, so the check is worth exactly as much as the discipline of
// editing a list in the same commit as the class it describes. The direction it
// does prove is the stylesheet's: a rule naming a class no list declares fails,
// whether it was never set or has stopped being.

// Set by extension/phases/panel.js on the phase list.
const PHASE_CLASSES = [
  'panel',
  'collapsed',
  'dragging',
  'wide',
  'head',
  'fold',
  'task',
  'key',
  'round',
  'count',
  'chevron',
  'body',
  'foot',
  'hint',
  'stage',
  'stage-name',
  'stage-rule',
  'stage-tally',
  'phase',
  'pending',
  'done',
  'skip',
  'open',
  'gutter',
  'box',
  'mark',
  'rail',
  'main',
  'name',
  'skipped',
  'chip',
  'link',
  'qa',
  'detail',
  'meta',
];

// Set by extension/phases/qa-view.js on the drilled-in checklist, plus the mount
// host panel.js creates for it.
const QA_CLASSES = [
  'qa-screen',
  'qa-head',
  'back',
  'qa-phase',
  'qa-key',
  'qa-tally',
  'qa-body',
  'area',
  'case',
  'passed',
  'new',
  'updated',
  'unchanged',
  'outdated',
  'check',
  'title',
  'steps',
  'step',
  'step-n',
  'expected',
  'note-box',
  'quoted',
  'comment-text',
  'discrepancies',
  'discrepancies-title',
  'discrepancy',
  'discrepancy-summary',
  'discrepancy-meta',
  'qa-foot',
  'finish',
  'remaining',
  'finish-note',
  'empty',
  'empty-line',
  'empty-hint',
  'close-without',
];

// Set by both screens, deliberately: the two designs carry the same values for
// each of them, so one rule serves both. A name belongs here only because the
// reuse was chosen, never to quiet the check above.
const SHARED_CLASSES = ['row', 'badge', 'icon', 'error'];

// Every class the stylesheet names anywhere, compounds included. A single-class
// compound is the one that can cross screens — it matches on the strength of that
// one name alone, wherever in the shadow root it sits — but a compound's second
// name is just as capable of outliving the element it was written for
// (`.phase.fading` survived `fading` being delisted), and a rule for a class no
// screen sets is dead either way.
const classesNamed = (css) => {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const found = new Set();

  for (const [, prelude] of withoutComments.matchAll(/([^{}]+)\{/g)) {
    for (const selector of prelude.split(',')) {
      for (const compound of selector.trim().split(/[\s>+~]+/)) {
        const bare = compound.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, '');
        for (const [, name] of bare.matchAll(/\.([a-zA-Z0-9_-]+)/g)) found.add(name);
      }
    }
  }

  return [...found];
};

test('the two screens share no class name that is not declared shared', () => {
  const qa = new Set(QA_CLASSES);
  const both = PHASE_CLASSES.filter((name) => qa.has(name));
  assert.deepEqual(both, [], 'a name in both vocabularies has to be a declared reuse, not a collision');

  const shared = new Set(SHARED_CLASSES);
  for (const name of [...PHASE_CLASSES, ...QA_CLASSES]) {
    assert.ok(!shared.has(name), `${name} is declared shared, so it must not also be listed under one screen`);
  }
});

test('every class the stylesheet names is one the screens set', () => {
  const known = new Set([...PHASE_CLASSES, ...QA_CLASSES, ...SHARED_CLASSES]);
  const unknown = classesNamed(PANEL_CSS).filter((name) => !known.has(name));
  assert.deepEqual(unknown, [], 'a rule for a class no screen sets is either dead or a name nobody declared');
});

// The standalone QA widget's stylesheet, checked the same way for the same
// reason. Only the second check transfers: that widget's shadow root holds one
// screen, so there are no two vocabularies to collide — but a rule outliving the
// element it was written for is just as invisible there. The note field was
// restyled from a `.note` box to a `.quoted` line, and nothing but this would
// have said whether the old rule went and the new one arrived.
//
// Hand-written for the reason the lists above are: adding a class has to be a
// deliberate edit in one place.

// Set by extension/qa/panel.js.
const QA_WIDGET_CLASSES = [
  'panel',
  'collapsed',
  'dragging',
  'head',
  'task',
  'count',
  'chevron',
  'body',
  'foot',
  'area',
  'case',
  'new',
  'updated',
  'unchanged',
  'outdated',
  'row',
  'title',
  'badge',
  'details',
  'expected',
  'quoted',
  'comment-text',
  'discrepancies',
  'discrepancy',
  'summary',
  'meta',
  'error',
  'finish-error',
  'done',
  'ended',
];

test('every class the QA widget’s stylesheet names is one its panel sets', () => {
  const known = new Set(QA_WIDGET_CLASSES);
  const unknown = classesNamed(QA_WIDGET_CSS).filter((name) => !known.has(name));
  assert.deepEqual(unknown, [], 'a rule for a class the panel never sets is either dead or a name nobody declared');
});
