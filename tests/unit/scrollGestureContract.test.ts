import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

test('Scroll uses native vertical scrolling instead of passive-event cancellation', () => {
  const source = read('src/features/scroll/ScrollFeed.tsx');
  const containerStart = source.indexOf('ref={containerRef}');
  assert.notEqual(containerStart, -1, 'Scroll container should remain identifiable');
  const containerEnd = source.indexOf('>', containerStart);
  assert.notEqual(containerEnd, -1, 'Scroll container opening tag should remain well formed');
  const containerMarkup = source.slice(containerStart, containerEnd);

  assert.match(containerMarkup, /snap-y snap-mandatory/);
  assert.match(containerMarkup, /touchAction:\s*'pan-y'/);
  assert.doesNotMatch(containerMarkup, /onWheelCapture|onTouchStartCapture|onTouchEndCapture/);
  assert.doesNotMatch(containerMarkup, /preventDefault\s*\(/);
  assert.doesNotMatch(source, /wheelNavigationLockRef|touchSwipeStartRef/);
});

test('Scroll has no global wheel/touch cancellation or non-passive listener', () => {
  const source = read('src/features/scroll/ScrollFeed.tsx');

  assert.doesNotMatch(source, /window\.addEventListener\(\s*['"](?:wheel|touchstart|touchmove|pointermove)/);
  assert.doesNotMatch(source, /document\.addEventListener\(\s*['"](?:wheel|touchstart|touchmove|pointermove)/);
  assert.doesNotMatch(source, /passive\s*:\s*false/);
  assert.match(source, /onKeyDown/);
});

test('Scroll-only gesture surface is conditionally mounted by the home shell', () => {
  const mobileHome = read('src/mobile/home/MobileHome.tsx');
  const scrollMount = mobileHome.indexOf('<ScrollFeed');
  assert.notEqual(scrollMount, -1);
  assert.ok(mobileHome.lastIndexOf('scrollOverlay ? (', scrollMount) < scrollMount);
});
