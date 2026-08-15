import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('native and post-video routes share the canonical Scroll runtime', () => {
  const scrollFeed = read('src/features/scroll/ScrollFeed.tsx');
  const app = read('src/App.tsx');

  assert.match(app, /path="\/scroll"/);
  assert.match(app, /<ScrollFeed \/>/);
  assert.match(scrollFeed, /<ScrollCard/);
  assert.match(scrollFeed, /params\.get\('watch'\) !== 'post-video'/);
  assert.match(scrollFeed, /isPostVideoRoute/);
});

test('every routed post-video entry point uses the shared open helper', () => {
  for (const relativePath of [
    'src/components/sections/MemberHomeSection.tsx',
    'src/community/CommunityHome.tsx',
    'src/mobile/home/components/MobileFeed.tsx',
    'src/components/feed/FeedMixedCard.tsx'
  ]) {
    const source = read(relativePath);
    assert.match(source, /openVideoInScroll/);
  }
});

test('explicit post-video file links do not silently select another attachment', () => {
  const scrollFeed = read('src/features/scroll/ScrollFeed.tsx');
  assert.match(scrollFeed, /return exact \|\| null/);
  assert.match(scrollFeed, /preferredFileId/);
});

test('shared open helper preserves source context and uses the canonical route', () => {
  const helper = read('src/utils/openVideoInScroll.ts');
  assert.match(helper, /buildPostVideoScrollViewerPath\(source\)/);
  assert.match(helper, /pendingViewerSource: source/);
  assert.match(helper, /scrollSourceSurface/);
  assert.match(helper, /scrollReturnTo/);
  assert.match(helper, /onOpenOverlay/);
});
