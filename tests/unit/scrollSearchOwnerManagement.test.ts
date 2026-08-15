import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Scroll search uses the canonical feed runtime without mounting a second viewer', () => {
  const feed = read('src/features/scroll/ScrollFeed.tsx');
  const overlay = read('src/features/scroll/ScrollSearchOverlay.tsx');
  assert.match(feed, /<ScrollSearchOverlay/);
  assert.match(feed, /autoplayEnabled=\{INLINE_VIDEO_PREVIEW_AUTOPLAY && !searchOpen\}/);
  assert.match(feed, /navigate\(buildScrollVideoUrl\(selected\.id\)\)/);
  assert.match(overlay, /role="dialog"/);
  assert.match(overlay, /aria-modal="true"/);
  assert.match(overlay, /role="listbox"/);
  assert.doesNotMatch(overlay, /preventDefault\(\).*wheel|preventDefault\(\).*touch/i);
});

test('Scroll search debounces, aborts stale requests, and keeps previews muted and singular', () => {
  const overlay = read('src/features/scroll/ScrollSearchOverlay.tsx');
  assert.match(overlay, /setTimeout\(async/);
  assert.match(overlay, /abortRef\.current\?\.abort\(\)/);
  assert.match(overlay, /requestSequenceRef\.current/);
  assert.match(overlay, /setActivePreviewId\(null\)/);
  assert.match(overlay, /autoPlay muted playsInline/);
  assert.match(overlay, /preload="metadata"/);
  assert.match(overlay, /searchAssist\(normalizedQuery, 'scroll'\)/);
});

test('Scroll search trigger exposes accessible dialog semantics', () => {
  const feed = read('src/features/scroll/ScrollFeed.tsx');
  assert.match(feed, /aria-label="Search Scroll videos"/);
  assert.match(feed, /aria-haspopup="dialog"/);
  assert.match(feed, /aria-controls="scroll-search-dialog"/);
  assert.match(feed, /data-testid="scroll-search-trigger"/);
});
