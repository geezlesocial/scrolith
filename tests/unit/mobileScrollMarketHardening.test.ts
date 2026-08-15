import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (relativePath: string) => readFileSync(join(here, '../../', relativePath), 'utf8');
const scrollFeed = read('src/features/scroll/ScrollFeed.tsx');
const scrollCard = read('src/features/scroll/ScrollCard.tsx');
const scrollSearch = read('src/features/scroll/ScrollSearchOverlay.tsx');
const marketplace = read('src/pages/marketplace/MarketplacePage.tsx');

test('Scroll uses dynamic viewport sizing through the feed/card stack', () => {
  assert.match(scrollFeed, /h-\[100dvh\] min-h-\[100svh\] max-h-\[100lvh\]/);
  assert.match(scrollFeed, /overflow-x-hidden overflow-y-auto/);
  assert.match(scrollCard, /h-\[100dvh\] min-h-\[100svh\] max-h-\[100lvh\]/);
  assert.match(scrollCard, /pb-\[env\(safe-area-inset-bottom\)\]/);
});

test('Scroll mobile controls retain existing handlers and meet touch target sizing', () => {
  assert.match(scrollFeed, /data-testid="scroll-mute-control"/);
  assert.match(scrollFeed, /className="inline-flex h-11 shrink-0/);
  assert.match(scrollCard, /className="inline-flex min-h-11 min-w-11/);
  assert.match(scrollCard, /className="ml-auto min-h-11/);
  assert.match(scrollSearch, /aria-label="Close Scroll search" className="inline-flex h-11 w-11/);
});

test('Marketplace keeps media performance and adds a mobile filter surface', () => {
  assert.match(marketplace, /OptimizedImage/);
  assert.match(marketplace, /loading="lazy"/);
  assert.match(marketplace, /aspect-\[4\/3\]/);
  assert.match(marketplace, /aria-label="Open marketplace filters"/);
  assert.match(marketplace, /title="Filter marketplace"/);
  assert.match(marketplace, /min-h-11 min-w-11/);
  assert.match(marketplace, /grid min-w-0 gap-4 md:grid-cols-2/);
});

test('Marketplace filter actions preserve query semantics and do not replace the API surface', () => {
  assert.match(marketplace, /setQuery\(\(previous\) => \(\{ \.\.\.previous, categoryId:/);
  assert.match(marketplace, /setQuery\(\(previous\) => \(\{ \.\.\.previous, sort:/);
  assert.match(marketplace, /listMarketplaceListings\(payload\)/);
  assert.doesNotMatch(marketplace, /fetch\(['"]\/api\/marketplace/);
});
