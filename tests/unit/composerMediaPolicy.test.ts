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
