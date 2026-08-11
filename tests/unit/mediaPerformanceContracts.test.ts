import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8');

test('member-home feed videos do not eager-load full media files', () => {
  const src = read('src/components/sections/MemberHomeSection.tsx');
  assert.doesNotMatch(src, /eagerLoad=\{isSingleAttachment\}/);
  assert.doesNotMatch(src, /preload=\{isSingleAttachment\s*\?\s*['"]auto['"]/);
  assert.match(src, /<InlineAutoplayVideo[\s\S]*?preload="metadata"/);
});

test('inline autoplay video keeps active feed playback metadata-first', () => {
  const src = read('src/components/media/InlineAutoplayVideo.tsx');
  assert.match(src, /const OFFSCREEN_RELEASE_DELAY_MS = 12000/);
  assert.doesNotMatch(src, /autoplayEnabled\s*\?\s*['"]auto['"]\s*:\s*preload/);
  assert.match(src, /shouldLoadSource && active && isInView \? preload/);
});

test('scroll prefetch warms posters only and never marks links as video', () => {
  const src = read('src/utils/scrollPlayerEngine.ts');
  assert.match(src, /Never prefetch full videos from scroll/);
  assert.match(src, /link\.as = 'image'/);
  assert.doesNotMatch(src, /link\.as = 'video'/);
});

test('optimized image lazy requests use low fetch priority by default', () => {
  const src = read('src/components/media/OptimizedImage.tsx');
  assert.match(src, /loading === 'eager' \? 'auto' : 'low'/);
  assert.match(src, /normalizedWidth \* 2/);
});
