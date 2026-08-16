/**
 * Scroll feed — Mute/Unmute without overlapping author + Scroll under Follow.
 * Run: node --import tsx --test tests/unit/scrollMuteBrandLayout.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoots = [
  join(process.cwd(), 'src/features/scroll'),
  join(dirname(fileURLToPath(import.meta.url)), '../../src/features/scroll')
];
const readSource = (fileName: string, marker: string) => {
  const match = sourceRoots
    .map((root) => join(root, fileName))
    .find((candidate) => {
      try {
        return readFileSync(candidate, 'utf8').includes(marker);
      } catch {
        return false;
      }
    });
  assert.ok(match, `unable to locate current ${fileName} source`);
  return readFileSync(match, 'utf8');
};

const scrollCard = readSource('ScrollCard.tsx', 'data-testid="scroll-brand-label"');
const scrollFeed = readSource('ScrollFeed.tsx', 'scroll-mute-control');
const scrollFeedContracts = {
  muteControl: scrollFeed.includes('scroll-mute-control'),
  headerCluster: scrollFeed.includes('ml-auto flex shrink-0 items-center gap-2'),
  createAfterMute: scrollFeed.lastIndexOf('Create') > scrollFeed.indexOf('scroll-mute-control')
};

test('Mute control is in feed header next to Create (not centered over author)', () => {
  assert.equal(scrollFeedContracts.muteControl, true);
  assert.equal(scrollFeedContracts.headerCluster, true);
  assert.equal(scrollFeedContracts.createAfterMute, true);
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
