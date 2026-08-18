import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoots = [
  join(process.cwd(), 'src/features/scroll'),
  join(dirname(fileURLToPath(import.meta.url)), '../../src/features/scroll')
];

const readScrollFeedSource = () => {
  const match = sourceRoots
    .map((root) => join(root, 'ScrollFeed.tsx'))
    .find((candidate) => {
      try {
        return readFileSync(candidate, 'utf8').includes('wheelNavigationLockRef');
      } catch {
        return false;
      }
    });
  assert.ok(match, 'unable to locate current ScrollFeed source');
  return readFileSync(match, 'utf8');
};

const scrollFeed = readScrollFeedSource();

test('ScrollFeed does not cancel wheel events from React passive handlers', () => {
  assert.equal(scrollFeed.includes('onWheelCapture='), false);
  assert.equal(scrollFeed.includes('onWheel='), false);
});

test('ScrollFeed uses a scoped non-passive native wheel listener for one-item navigation', () => {
  assert.match(scrollFeed, /addEventListener\('wheel',\s*onWheel,\s*\{\s*capture:\s*true,\s*passive:\s*false\s*\}\)/);
  assert.match(scrollFeed, /removeEventListener\('wheel',\s*onWheel,\s*true\)/);
  assert.match(scrollFeed, /wheelNavigationLockRef\.current < 420/);
  assert.match(scrollFeed, /void navigateRelative\(event\.deltaY > 0 \? 1 : -1\)/);
  assert.match(scrollFeed, /event\.preventDefault\(\)/);
});
