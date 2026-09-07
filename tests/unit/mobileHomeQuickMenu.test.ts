import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/mobile/home/components/MobileHomeSheets.tsx'),
  'utf8'
);

test('Quick Menu destructures and wires Match and Scroll actions', () => {
  assert.match(source, /onBrowseGigs,\s*onMatch,\s*onScroll,\s*onCommunity/);
  assert.match(source, /id: 'quick-match'[\s\S]*onClick: onMatch/);
  assert.match(source, /id: 'quick-scroll'[\s\S]*onClick: onScroll/);
});
