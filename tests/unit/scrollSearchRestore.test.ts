import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('mobile post-video taps use the canonical Scroll route instead of embedded Scroll', () => {
  const mobileHome = read('src/mobile/home/MobileHome.tsx');
  const helper = read('src/utils/openVideoInScroll.ts');

  assert.match(mobileHome, /openVideoInScroll\(\{[\s\S]*sourceSurface: 'mobile-home'/);
  assert.match(helper, /buildPostVideoScrollViewerPath\(source\)/);
  assert.match(helper, /stashPendingPostVideoScrollViewerSource\(source\)/);
  assert.match(helper, /pendingViewerSource: source/);
});

test('Scroll search is restored on the canonical Scroll runtime', () => {
  const app = read('src/App.tsx');
  const feed = read('src/features/scroll/ScrollFeed.tsx');
  const overlay = read('src/features/scroll/ScrollSearchOverlay.tsx');
  const service = read('src/services/scroll.ts');

  assert.match(app, /path="\/scroll"[\s\S]*<ProtectedRoute>[\s\S]*<ScrollFeed \/>/);
  assert.doesNotMatch(app, /path="\/scroll"[\s\S]*renderResponsiveMobilePage\('Scroll'/);
  assert.match(feed, /<ScrollSearchOverlay/);
  assert.match(feed, /data-testid="scroll-search-trigger"/);
  assert.match(feed, /data-testid="scroll-search-trigger"[\s\S]*<\/button>/);
  assert.match(feed, /<span>Search<\/span>/);
  assert.match(feed, /navigate\(buildScrollVideoUrl\(selected\.id\)\)/);
  assert.match(overlay, /ScrollService\.search\(/);
  assert.match(overlay, /autoPlay muted playsInline preload="metadata"/);
  assert.match(service, /static async search\(/);
});

test('explicit post-video routes do not start the normal feed loader', () => {
  const feed = read('src/features/scroll/ScrollFeed.tsx');
  assert.match(feed, /const isPostVideoRoute = !embedded && isPostVideoWatchSearch\(location\.search\)/);
  assert.match(feed, /if \(!cursor && isPostVideoRoute\)/);
});
