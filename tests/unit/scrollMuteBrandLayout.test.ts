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
  assert.match(scrollFeed, /data-testid="scroll-mute-control"/);
  assert.match(scrollFeed, /Unmute/);
  assert.match(scrollFeed, /Mute/);
  assert.match(scrollFeed, /ml-auto flex shrink-0 items-center gap-2/);
  // Create follows mute in the same right cluster
  const muteIdx = scrollFeed.indexOf('data-testid="scroll-mute-control"');
  const createIdx = scrollFeed.indexOf('Create', muteIdx);
  assert.ok(muteIdx > 0 && createIdx > muteIdx);
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
