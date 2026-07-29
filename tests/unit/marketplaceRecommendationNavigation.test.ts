import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

test('marketplace recommendation cards deep-link to listing detail routes', () => {
  const src = read('src/components/feed/FeedMixedCard.tsx');
  const marketplaceCaseStart = src.indexOf("case 'marketplace'");
  const marketplaceCaseEnd = src.indexOf("case 'person'", marketplaceCaseStart);
  const marketplaceCase = src.slice(marketplaceCaseStart, marketplaceCaseEnd);

  assert.match(src, /case 'marketplace'/);
  assert.match(marketplaceCase, /data\.listingSlug/);
  assert.match(marketplaceCase, /data\.listingId/);
  assert.match(marketplaceCase, /`\/marketplace\/listing\/\$\{encodeURIComponent\(slugOrId\)\}`/);
  assert.doesNotMatch(marketplaceCase, /`\/marketplace\/\$\{encodeURIComponent\(String\(data\.id\)\)\}`/);
  assert.doesNotMatch(marketplaceCase, /'\/member-home'/);
});
