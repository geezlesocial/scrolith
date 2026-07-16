/**
 * Wave 1B — Scrolitha frontend stabilization contracts.
 * No backend / layout surface changes required.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { classifyScrolithaClientError } from '../../src/utils/scrolithaErrors';
import {
  SCROLITHA_COACH_DRAFT_KEY,
  SCROLITHA_SUPPORT_DRAFT_KEY,
  clearCoachDraft,
  clearSupportDraft,
  readCoachDraft,
  readSupportDraft,
  writeCoachDraft,
  writeSupportDraft
} from '../../src/utils/scrolithaDrafts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

test('canonical chat surface: SupportWidget mounted; ScrolithaWidget re-exports only', () => {
  const app = read('src/App.tsx');
  const legacy = read('src/components/scrolitha/ScrolithaWidget.tsx');
  const support = read('src/components/SupportWidget.tsx');

  assert.match(app, /React\.lazy\(\(\) => import\('\.\/components\/SupportWidget'\)\)/);
  assert.match(app, /<SupportWidget\s*\/>/);
  assert.doesNotMatch(app, /ScrolithaWidget/);

  assert.match(legacy, /@deprecated/);
  assert.match(legacy, /export \{ default \} from '\.\.\/SupportWidget'/);
  assert.doesNotMatch(legacy, /const ScrolithaWidget/);

  // Single production widget guards
  assert.match(support, /inFlightSendRef/);
  assert.match(support, /classifyScrolithaClientError/);
  assert.match(support, /writeSupportDraft/);
  assert.match(support, /retry_last/);
  assert.match(support, /role="dialog"/);
  assert.match(support, /aria-label=\{isOpen \? `Close/);
  assert.match(support, /Escape/);
});

test('coach surface preserves drafts and retry path without Member Home shell edits', () => {
  const insights = read('src/components/insights/InsightsQuickPanel.tsx');
  const memberHome = read('src/components/sections/MemberHomeSection.tsx');

  assert.match(insights, /writeCoachDraft/);
  assert.match(insights, /switchCoachSurface/);
  assert.match(insights, /coachInFlightRef/);
  assert.match(insights, /classifyScrolithaClientError/);
  assert.match(insights, /scrolitha-coach-retry/);
  assert.match(insights, /data-testid="scrolitha-coach-panel"/);
  assert.match(insights, /role="region"/);
  assert.match(insights, /aria-label="Scrolitha coach"/);

  // Regression freezes: Member Home shell still lazy-loads Insights only
  assert.match(memberHome, /InsightsQuickPanel/);
  assert.match(memberHome, /desktop-scrolitha-coach/);
  assert.match(memberHome, /ctaLabel: 'Open coach'/);
});

test('error classifier covers timeout, rollout, network, provider unavailable', () => {
  assert.equal(classifyScrolithaClientError({ message: 'timeout of 95000ms exceeded' }).kind, 'timeout');
  assert.equal(classifyScrolithaClientError({ code: 'ERR_NETWORK' }).kind, 'network');
  assert.equal(
    classifyScrolithaClientError({
      response: { status: 403, data: { code: 'SCROLITHA_CAPABILITY_DISABLED', message: 'disabled by rollout' } }
    }).kind,
    'rollout_disabled'
  );
  assert.equal(classifyScrolithaClientError({ response: { status: 503 } }).kind, 'provider_unavailable');
  assert.equal(classifyScrolithaClientError({ response: { status: 429 } }).retryable, true);
  assert.equal(classifyScrolithaClientError({ response: { status: 403, data: { message: 'disabled by rollout' } } }).retryable, false);
});

test('draft helpers round-trip support and coach snapshots in sessionStorage', () => {
  // node:test may not have sessionStorage — polyfill minimal
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
    writeSupportDraft({ message: 'hello draft', conversationId: 'c1' });
    const support = readSupportDraft();
    assert.equal(support?.message, 'hello draft');
    assert.equal(support?.conversationId, 'c1');
    assert.ok(store.has(SCROLITHA_SUPPORT_DRAFT_KEY));

    writeCoachDraft({
      surface: 'gig',
      bySurface: {
        gig: { input: 'gig text long enough', output: 'improved', updatedAt: Date.now() }
      }
    });
    const coach = readCoachDraft();
    assert.equal(coach?.surface, 'gig');
    assert.equal(coach?.bySurface?.gig?.input, 'gig text long enough');
    assert.ok(store.has(SCROLITHA_COACH_DRAFT_KEY));

    clearSupportDraft();
    clearCoachDraft();
    assert.equal(readSupportDraft(), null);
    assert.equal(readCoachDraft(), null);
  } finally {
    if (originalWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = originalWindow;
  }
});

test('no second Scrolitha chat import path remains active outside re-export', () => {
  const legacy = read('src/components/scrolitha/ScrolithaWidget.tsx');
  assert.equal(legacy.split('\n').filter((l) => l.trim() && !l.trim().startsWith('*') && !l.trim().startsWith('/**') && !l.trim().startsWith('//')).length <= 3, true);
});
