import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('post-card video deep link keeps post + file identity', () => {
  const src = read('src/utils/postVideoScrollBridge.ts');
  assert.match(src, /params\.set\('watch', 'post-video'\)/);
  assert.match(src, /params\.set\('post', postId\)/);
  assert.match(src, /params\.set\('file', fileId\)/);
  assert.match(src, /export const isPostVideoWatchSearch/);
  assert.match(src, /params\.get\('watch'\) === 'post-video'/);
});

test('ScrollFeed does not restore lastIndex for a clicked or deep-linked video', () => {
  const src = read('src/features/scroll/ScrollFeed.tsx');
  assert.match(src, /hasExplicitClickedVideoTarget/);
  assert.match(src, /readInitialActiveIndex/);
  assert.match(src, /targetLockIdRef/);
  assert.match(src, /isPostVideoWatchSearch/);
  assert.match(src, /hasExplicitScrollVideoQuery/);
  assert.match(src, /never reuse lastIndex for a clicked\/deep-linked video/);
  assert.match(src, /if \(targetLockIdRef\.current\) return;/);
});

test('member-home and community pass the clicked post video into Scroll', () => {
  const home = read('src/components/sections/MemberHomeSection.tsx');
  const community = read('src/community/CommunityHome.tsx');
  for (const src of [home, community]) {
    assert.match(src, /openVideoPostInScroll/);
    assert.match(src, /buildPostVideoScrollViewerPath\(sourcePayload\)/);
    assert.match(src, /pendingViewerSource: sourcePayload/);
    assert.match(src, /stashPendingPostVideoScrollViewerSource\(sourcePayload\)/);
  }
});
