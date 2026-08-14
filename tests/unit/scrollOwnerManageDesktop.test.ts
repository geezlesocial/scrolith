import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scrollCard = readFileSync(join(here, '../../src/features/scroll/ScrollCard.tsx'), 'utf8');
const scrollFeed = readFileSync(join(here, '../../src/features/scroll/ScrollFeed.tsx'), 'utf8');

test('Scroll owner management is available from the desktop overlay only for authorized actions', () => {
  assert.match(scrollCard, /data-testid="scroll-top-right-chrome"/);
  assert.match(scrollCard, /hasOwnerActions \?/);
  assert.match(scrollCard, /aria-label="Manage your Scroll"/);
  assert.match(scrollCard, /canEditScroll \?/);
  assert.match(scrollCard, /canDeleteScroll \?/);
  assert.match(scrollCard, /Edit \/ update scroll/);
  assert.match(scrollCard, /Replace video/);
  assert.match(scrollCard, /Delete scroll/);
  assert.match(scrollCard, /sm:hidden/);
});

test('Scroll deletion keeps the existing confirmation and service action path', () => {
  assert.match(scrollFeed, /window\.confirm\('Delete this Scroll video\? This cannot be undone\.'\)/);
  assert.match(scrollFeed, /await ScrollService\.remove\(scroll\.id\)/);
});
