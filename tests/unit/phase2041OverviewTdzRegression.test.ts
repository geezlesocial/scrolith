/**
 * Phase 20.4.1 — regression tests for Overview TDZ crash
 * (ReferenceError: Cannot access 'X' before initialization)
 *
 * Source-order contracts: unreadNotifications must be declared before any
 * useCallback/useMemo that lists it in a dependency array.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const src = (...parts: string[]) => join(root, 'src', ...parts);

const assertUnreadBeforeLoadOverview = (source: string, label: string) => {
  const unreadIdx = source.indexOf('const unreadNotifications = React.useMemo');
  const loadIdx = source.indexOf('const loadOverview = React.useCallback');
  assert.ok(unreadIdx >= 0, `${label}: unreadNotifications declaration missing`);
  assert.ok(loadIdx >= 0, `${label}: loadOverview declaration missing`);
  assert.ok(
    unreadIdx < loadIdx,
    `${label}: unreadNotifications must be declared before loadOverview (TDZ). unread@${unreadIdx} load@${loadIdx}`
  );

  // Ensure we do not re-declare unreadNotifications later (would shadow / confuse ordering).
  const second = source.indexOf('const unreadNotifications = React.useMemo', unreadIdx + 1);
  assert.equal(second, -1, `${label}: unreadNotifications declared more than once`);

  // loadOverview deps must include unreadNotifications only after declaration above.
  const depsMatch = source.match(
    /const loadOverview = React\.useCallback\([\s\S]*?\}, \[([^\]]*)\]\)/
  );
  assert.ok(depsMatch, `${label}: loadOverview dependency array not found`);
  assert.match(depsMatch![1], /unreadNotifications/, `${label}: loadOverview should depend on unreadNotifications`);
};

test('freelancer Overview declares unreadNotifications before loadOverview', () => {
  const source = readFileSync(src('dashboard/freelancer/Overview.tsx'), 'utf8');
  assertUnreadBeforeLoadOverview(source, 'freelancer');
});

test('employer Overview declares unreadNotifications before loadOverview', () => {
  const source = readFileSync(src('dashboard/employer/Overview.tsx'), 'utf8');
  assertUnreadBeforeLoadOverview(source, 'employer');
});

test('both overviews still mount Phase 20.4 workspace surfaces', () => {
  const fe = readFileSync(src('dashboard/freelancer/Overview.tsx'), 'utf8');
  const em = readFileSync(src('dashboard/employer/Overview.tsx'), 'utf8');
  for (const [label, source] of [
    ['freelancer', fe],
    ['employer', em]
  ] as const) {
    assert.match(source, /WorkspaceFocusPanel/, `${label} missing WorkspaceFocusPanel`);
    assert.match(source, /WorkspaceStatusStrip/, `${label} missing WorkspaceStatusStrip`);
    assert.match(source, /GrowthPulseCard/, `${label} missing GrowthPulseCard`);
  }
});

test('workspace layout hook tolerates missing localStorage', () => {
  const hook = readFileSync(src('components/workspace/useWorkspaceLayout.ts'), 'utf8');
  assert.match(hook, /catch/);
  assert.match(hook, /DEFAULT_PREFS|default/i);
});
