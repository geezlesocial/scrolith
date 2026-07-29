import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

test('story recommendation cards deep-link to the Stories tab', () => {
  const src = read('src/components/feed/FeedMixedCard.tsx');
  const storyCaseStart = src.indexOf("case 'story'");
  const storyCaseEnd = src.indexOf('default:', storyCaseStart);
  const storyCase = src.slice(storyCaseStart, storyCaseEnd);

  assert.match(src, /case 'story'/);
  assert.match(src, /new URLSearchParams\(\{ tab: 'stories' \}\)/);
  assert.match(src, /href: `\$\{baseHref\}\?\$\{search\.toString\(\)\}#stories`/);
  assert.doesNotMatch(storyCase, /safeHref/);
});

test('member-home and community consume story tab deep-links', () => {
  const memberHome = read('src/components/sections/MemberHomeSection.tsx');
  const community = read('src/community/CommunityHome.tsx');

  for (const src of [memberHome, community]) {
    assert.match(src, /id="stories"/);
    assert.match(src, /setStoryRailTab\('stories'\)/);
    assert.match(src, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
    assert.match(src, /tab === 'stories'/);
    assert.match(src, /hash === '#stories'/);
  }
});
