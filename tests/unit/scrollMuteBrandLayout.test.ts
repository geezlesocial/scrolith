/**
 * Scroll feed — Mute/Unmute without overlapping author + Scroll under Follow.
 * Run: node --import tsx --test tests/unit/scrollMuteBrandLayout.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scrollCard = readFileSync(join(here, '../../src/features/scroll/ScrollCard.tsx'), 'utf8');
const scrollFeed = readFileSync(join(here, '../../src/features/scroll/ScrollFeed.tsx'), 'utf8');

test('Mute control is in feed header next to Create (not centered over author)', () => {
  assert.equal(scrollFeed.includes('scroll-mute-control'), true);
  assert.equal(scrollFeed.includes('gap-1 sm:gap-2'), true);
  // Create follows mute in the same right cluster
  const muteIdx = scrollFeed.indexOf('data-testid="scroll-mute-control"');
  const createIdx = scrollFeed.indexOf('<span className="hidden sm:inline">Create</span>');
  assert.ok(muteIdx > 0 && createIdx > muteIdx);
});

test('mobile Scroll header uses icon-only controls while desktop labels remain available', () => {
  assert.match(scrollFeed, /data-testid="scroll-search-trigger"/);
  assert.match(scrollFeed, /\[&>span\]:hidden sm:h-11 sm:w-auto sm:px-3 sm:\[&>span\]:inline/);
  assert.match(scrollFeed, /<span>Search<\/span>/);
  assert.match(scrollFeed, /hidden whitespace-nowrap sm:inline/);
  assert.match(scrollFeed, /<span className="hidden sm:inline">Create<\/span>/);
});

test('touch Scroll keeps the engagement rail visible after overlay controls recede', () => {
  assert.match(scrollCard, /const actionRailVisible = overlayControlsVisible \|\| touchOverlayMode/);
  assert.match(scrollCard, /actionRailVisible \? 'translate-x-0 opacity-100'/);
});

test('touch Scroll keeps Follow and Remix/Duet controls visible after chrome recedes', () => {
  assert.match(scrollCard, /const persistentTouchControlsVisible = overlayControlsVisible \|\| touchOverlayMode/);
  assert.match(scrollCard, /persistentTouchControlsVisible\n\s+\? 'max-h-10 opacity-100'/);
  assert.match(scrollCard, /!persistentTouchControlsVisible\n\s+\? 'translate-y-4 opacity-0 pointer-events-none'/);
  assert.match(scrollCard, /void onRemix\(scroll, 'remix'\)/);
  assert.match(scrollCard, /void onRemix\(scroll, 'duet'\)/);
});

test('ScrollCard does not place absolute centered mute over the name', () => {
  assert.doesNotMatch(scrollCard, /absolute left-1\/2 top-3 z-40 -translate-x-1\/2/);
  assert.doesNotMatch(scrollCard, /data-testid="scroll-mute-control"/);
  // Author chrome starts below the feed header band
  assert.match(scrollCard, /top-14/);
  assert.match(scrollCard, /truncate text-sm font-semibold/);
});

test('Scroll brand label sits under FollowButton', () => {
  assert.match(scrollCard, /data-testid="scroll-brand-label"/);
  const followIdx = scrollCard.indexOf('<FollowButton');
  const brandIdx = scrollCard.indexOf('data-testid="scroll-brand-label"');
  assert.ok(followIdx > 0 && brandIdx > followIdx, 'Scroll brand must appear after FollowButton in source');
});
