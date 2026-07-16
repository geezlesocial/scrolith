/**
 * Wave 2 — Scrolitha frontend consolidation contracts.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { extractScrolithaRewrittenText, extractScrolithaWarning } from '../../src/utils/scrolithaText';
import {
  SCROLITHA_PENDING_PROJECT_PROMPT_KEY,
  clearPendingProjectPrompt,
  readPendingProjectPrompt,
  writePendingProjectPrompt
} from '../../src/utils/scrolithaDrafts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

test('extractScrolithaRewrittenText normalizes payload shapes', () => {
  assert.equal(extractScrolithaRewrittenText({ rewrittenText: ' A ' }), 'A');
  assert.equal(extractScrolithaRewrittenText({ improved: 'B' }), 'B');
  assert.equal(extractScrolithaRewrittenText({ text: 'C', reply: 'D' }), 'C');
  assert.equal(extractScrolithaRewrittenText({ reply: 'E' }), 'E');
  assert.equal(extractScrolithaRewrittenText('plain'), 'plain');
  assert.equal(extractScrolithaWarning({ warning: ' caution ' }), 'caution');
});

test('pending project prompt helpers use canonical key', () => {
  const store = new Map<string, string>();
  const mockSession = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    }
  } as Storage;
  const originalWindow = (globalThis as any).window;
  (globalThis as any).window = { sessionStorage: mockSession };
  try {
    writePendingProjectPrompt('  build a logo  ');
    assert.equal(store.get(SCROLITHA_PENDING_PROJECT_PROMPT_KEY), 'build a logo');
    assert.equal(readPendingProjectPrompt(), 'build a logo');
    clearPendingProjectPrompt();
    assert.equal(readPendingProjectPrompt(), '');
  } finally {
    if (originalWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = originalWindow;
  }
});

test('rewrite call sites use shared runner and coach keeps gigImprove path', () => {
  const comment = read('src/components/post/CommentAiAssist.tsx');
  const scroll = read('src/features/scroll/ScrollCreateModal.tsx');
  const insights = read('src/components/insights/InsightsQuickPanel.tsx');
  const widget = read('src/components/scrolitha/ScrolithaWidget.tsx');
  const barrel = read('src/components/scrolitha/index.ts');
  const app = read('src/App.tsx');

  assert.match(comment, /runScrolithaRewrite/);
  assert.match(comment, /inFlightRef/);
  assert.doesNotMatch(comment, /ScrolithaService\.rewrite/);

  assert.match(scroll, /runScrolithaRewrite/);
  assert.doesNotMatch(scroll, /ScrolithaService\.rewrite/);

  assert.match(insights, /runScrolithaRewrite/);
  assert.match(insights, /extractScrolithaRewrittenText/);
  assert.match(insights, /gigImprove/);

  assert.match(widget, /export \{ default \} from '\.\.\/SupportWidget'/);
  assert.match(barrel, /ScrolithaResponseCard/);
  assert.match(barrel, /ScrolithaWidget/);
  assert.match(app, /import\('\.\/components\/SupportWidget'\)/);
  assert.doesNotMatch(app, /ScrolithaWidget/);
});

test('pending prompt writers use shared draft helper', () => {
  const brief = read('src/components/sections/AIProjectBriefGenerator.tsx');
  const memberHome = read('src/components/sections/MemberHomeSection.tsx');
  assert.match(brief, /writePendingProjectPrompt/);
  assert.match(memberHome, /writePendingProjectPrompt/);
  assert.doesNotMatch(brief, /sessionStorage\.setItem\(\s*['\"]scrolitha_pending_project_prompt['\"]/);
  assert.doesNotMatch(memberHome, /sessionStorage\.setItem\(\s*['\"]scrolitha_pending_project_prompt['\"]/);
});

test('marketing pages import ScrolithaResponseCard from barrel', () => {
  for (const rel of ['src/pages/HirePage.tsx', 'src/pages/FreelancerPage.tsx', 'src/pages/AnswersPage.tsx']) {
    const src = read(rel);
    assert.match(src, /from ['\"]\.\.\/components\/scrolitha['\"]/);
  }
});
