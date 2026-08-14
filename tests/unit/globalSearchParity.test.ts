import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('member home and shared header search use the canonical controller', () => {
  const memberHome = read('src/components/sections/MemberHomeSection.tsx');
  const searchInput = read('src/components/SearchInput.tsx');
  const controller = read('src/hooks/useGlobalSearch.ts');

  assert.match(memberHome, /useGlobalSearch\(searchQuery/);
  assert.match(searchInput, /useGlobalSearch\(query/);
  assert.doesNotMatch(memberHome, /SearchService\.searchUnified\(/);
  assert.doesNotMatch(memberHome, /SearchService\.search\(/);
  assert.doesNotMatch(searchInput, /SearchService\.getSuggestions\(/);
  assert.match(controller, /searchGlobalWithMarketplace\(query/);
  assert.match(controller, /sharedRequests/);
  assert.match(controller, /requestSeqRef/);
});

test('canonical search preserves rich entity groups, media, and navigation URLs', () => {
  const service = read('src/services/globalSearch.ts');
  const memberHome = read('src/components/sections/MemberHomeSection.tsx');
  const searchInput = read('src/components/SearchInput.tsx');

  for (const group of ['people', 'pages', 'jobs', 'gigs', 'marketplace', 'posts', 'blogs', 'groups']) {
    assert.match(service, new RegExp(`['"]${group}['"]`));
  }
  assert.match(service, /avatarUrl: image/);
  assert.match(service, /resolveGlobalSearchItemUrl/);
  assert.match(memberHome, /OptimizedImage/);
  assert.match(searchInput, /resolveSuggestionImage/);
});

test('shared search debounces requests and ignores stale responses', () => {
  const controller = read('src/hooks/useGlobalSearch.ts');
  assert.match(controller, /window\.setTimeout/);
  assert.match(controller, /requestSeqRef\.current !== requestId/);
  assert.match(controller, /clearTimeout\(timer\)/);
});

test('CMS header and hero surfaces continue to feed the shared search input', () => {
  const navbar = read('src/components/Navbar.tsx');
  const hero = read('src/components/HomeSlider.tsx');
  assert.match(navbar, /getHeaderConfig/);
  assert.match(navbar, /<SearchInput/);
  assert.match(navbar, /getHeroSearchConfig/);
  assert.match(hero, /heroConfig/);
  assert.match(hero, /<SearchInput/);
});
