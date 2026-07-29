import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('member-home post videos open in the Scroll viewer', () => {
  const src = read('src/components/sections/MemberHomeSection.tsx');

  assert.match(src, /openVideoPostInScroll/);
  assert.match(src, /buildPostVideoScrollViewerPath/);
  assert.match(src, /onPostVideoTouchEnd/);
  assert.match(src, /onTouchEnd=\{\(event\) => onPostVideoTouchEnd\(event, post, media, mediaKey\)\}/);
  assert.match(src, /Open in Scroll/);
});

test('community post videos open in the Scroll viewer', () => {
  const src = read('src/community/CommunityHome.tsx');

  assert.match(src, /openVideoPostInScroll/);
  assert.match(src, /buildPostVideoScrollViewerPath/);
  assert.match(src, /onPostVideoTouchEnd/);
  assert.match(src, /onTouchEnd=\{\(event\) => onPostVideoTouchEnd\(event, post, media, mediaKey\)\}/);
  assert.match(src, /Open in Scroll/);
});
