import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

test('mobile home has a local recovery boundary around shell sheets', () => {
  const source = read('src/mobile/home/MobileHome.tsx');
  const boundary = read('src/mobile/home/components/MobileHomeErrorBoundary.tsx');
  assert.match(source, /<MobileHomeErrorBoundary name="home-sheet"/);
  assert.match(boundary, /data-testid="mobile-home-recovery"/);
});

test('mobile shell instruments route timing and long tasks', () => {
  const source = read('src/mobile/runtime/mobilePerformance.ts');
  assert.match(source, /performance\.mark/);
  assert.match(source, /type: 'longtask'/);
  assert.match(source, /mobile_runtime_error/);
  assert.match(source, /performance\.\$\{kind\}/);
});

test('mobile post composer persists only bounded, user-scoped drafts', () => {
  const source = read('src/mobile/home/screens/MobilePostScreen.tsx');
  const drafts = read('src/mobile/runtime/mobileDrafts.ts');
  assert.match(source, /loadMobilePostDraft/);
  assert.match(source, /saveMobilePostDraft/);
  assert.match(source, /clearMobilePostDraft/);
  assert.match(drafts, /STORAGE_PREFIX = 'scrolith:mobile-post-draft:v1:'/);
  assert.match(drafts, /MAX_TEXT_LENGTH = 12_000/);
  assert.doesNotMatch(drafts, /token|cookie|authorization/i);
});

test('activity center combines live notification and message unread counts', () => {
  const source = read('src/mobile/home/screens/MobileNotificationsScreen.tsx');
  assert.match(source, /Activity center/);
  assert.match(source, /messagesUnread/);
  assert.match(source, /totalUnread/);
});

test('mobile sheets expose a touch-friendly swipe-to-close handle', () => {
  const source = read('src/mobile/home/components/MobileHomeSheets.tsx');
  assert.match(source, /gestureStartY/);
  assert.match(source, /event\.clientY - startY > 72/);
});
