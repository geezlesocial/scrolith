/**
 * Scroll feed — Mute/Unmute label + Scroll brand under Follow.
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

test('ScrollCard exposes labeled Mute/Unmute control (mobile + desktop)', () => {
  assert.match(scrollCard, /data-testid="scroll-mute-control"/);
  assert.match(scrollCard, /\{muted \? 'Unmute' : 'Mute'\}/);
  assert.match(scrollCard, /onToggleMute/);
  assert.match(scrollCard, /VolumeX/);
  assert.match(scrollCard, /Volume2/);
  // Must not hide mute behind lg-only class as the only control
  assert.doesNotMatch(
    scrollCard,
    /hidden h-10 w-10 items-center justify-center rounded-full bg-black\/45 text-white transition hover:bg-black\/65 lg:inline-flex[\s\S]{0,80}Unmute/
  );
});

test('Scroll brand label sits under FollowButton', () => {
  assert.match(scrollCard, /data-testid="scroll-brand-label"/);
  const followIdx = scrollCard.indexOf('<FollowButton');
  const brandIdx = scrollCard.indexOf('data-testid="scroll-brand-label"');
  assert.ok(followIdx > 0 && brandIdx > followIdx, 'Scroll brand must appear after FollowButton in source');
  // Brand is no longer the top-center absolute clapperboard-only pill
  assert.doesNotMatch(
    scrollCard,
    /data-testid="scroll-brand-label"[\s\S]{0,120}absolute left-1\/2 top-3/
  );
});

test('ScrollFeed header mute is visible on mobile with label', () => {
  assert.match(scrollFeed, /data-testid="scroll-feed-mute-control"/);
  assert.match(scrollFeed, /setMuted\(\(prev\) => !prev\)/);
  assert.doesNotMatch(
    scrollFeed,
    /hidden h-11 w-11 items-center justify-center rounded-full bg-black\/45[\s\S]{0,120}Mute all/
  );
});
