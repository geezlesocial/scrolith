import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

test('create-post composer allows only one video attachment', () => {
  const helpers = read('src/components/composer/composerAttachments.ts');
  const mobilePost = read('src/mobile/home/screens/MobilePostScreen.tsx');
  const memberHome = read('src/components/sections/MemberHomeSection.tsx');

  assert.match(helpers, /COMPOSER_MAX_VIDEO_ATTACHMENTS = 1/);
  assert.match(helpers, /Only one video can be attached to a post\./);
  assert.match(mobilePost, /mediaVideoCountRef/);
  assert.match(mobilePost, /currentVideoCount: mediaVideoCountRef\.current/);
  assert.match(memberHome, /postMediaVideoCountRef/);
  assert.match(memberHome, /currentVideoCount: postMediaVideoCountRef\.current/);
});

test('upload progress stays monotonic through retries', () => {
  const filesService = read('src/services/files.ts');

  assert.match(filesService, /let lastProgress = 0/);
  assert.match(filesService, /Math\.max\(lastProgress, Math\.min\(99/);
  assert.match(filesService, /if \(percent !== lastProgress\)/);
});

test('route composer keeps popup identity and map parity', () => {
  const mobilePost = read('src/mobile/home/screens/MobilePostScreen.tsx');

  assert.match(mobilePost, /CommunityService\.getMyBusinessPages\(\)/);
  assert.match(mobilePost, /<LocationPicker/);
  assert.match(mobilePost, /businessPageId: activeBusinessPageId/);
  assert.match(mobilePost, /uploaded\.id \|\| uploaded\.fileId/);
  assert.match(mobilePost, /att\?\.id \|\| att\?\.fileId \|\| att\?\.file_id/);
  assert.match(mobilePost, /Use map/);
  assert.match(mobilePost, /MediaPreviewModal/);
  assert.doesNotMatch(mobilePost, /handleAttachmentDownload/);
});

test('composer media previews resolve canonical and fallback media paths', () => {
  const grid = read('src/components/composer/ComposerMediaPreviewGrid.tsx');

  assert.match(grid, /resolvePostAttachmentMediaPair/);
  assert.match(grid, /fallbackSrc=\{fallbackSrc \|\| undefined\}/);
  assert.match(grid, /fallbackSrc=\{fallbackSrc \|\| src \|\| ''\}/);
});
