import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

test('FeedMixedCard routes video-backed featured and recommended cards through Scroll', () => {
  const src = read('src/components/feed/FeedMixedCard.tsx');

  assert.match(src, /resolveVideoRecommendationScrollSource\(entry\)/);
  assert.match(src, /buildPostVideoScrollViewerPath\(postVideoSource\)/);
  assert.match(src, /openVideoInScroll\(\{/);
  assert.match(src, /postVideoSource \? 'Open in Scroll' : 'Open'/);
  assert.doesNotMatch(src, /kind === 'featured' \|\| kind === 'trending' \? '\/member-home'/);
});
