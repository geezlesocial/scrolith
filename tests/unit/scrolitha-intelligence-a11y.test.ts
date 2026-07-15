import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const panelPath = join(__dirname, '../../src/components/post/AskScrolithaPanel.tsx');

describe('AskScrolithaPanel accessibility contracts', () => {
  const source = readFileSync(panelPath, 'utf8');

  it('exposes ARIA region, tabs, and live status', () => {
    assert.match(source, /role="region"/);
    assert.match(source, /role="tablist"/);
    assert.match(source, /role="tab"/);
    assert.match(source, /aria-live="polite"/);
    assert.match(source, /aria-label=/);
    assert.match(source, /sr-only/);
  });

  it('supports keyboard focus styles and reduced motion', () => {
    assert.match(source, /focus-visible:outline/);
    assert.match(source, /prefers-reduced-motion/);
  });

  it('offers thread and instant intelligence modes', () => {
    assert.match(source, /intelligenceAsk/);
    assert.match(source, /contextualAsk/);
    assert.match(source, /Reply in thread/);
    assert.match(source, /Instant assist/);
  });
});
