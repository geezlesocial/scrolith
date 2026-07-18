import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const src = (...parts: string[]) => join(root, 'src', ...parts);

test('workspace framework modules exist', () => {
  assert.equal(existsSync(src('components/workspace/WorkspaceWidget.tsx')), true);
  assert.equal(existsSync(src('components/workspace/WorkspaceFocusPanel.tsx')), true);
  assert.equal(existsSync(src('components/workspace/WorkspaceStatusStrip.tsx')), true);
  assert.equal(existsSync(src('components/workspace/QuickPreviewDrawer.tsx')), true);
  assert.equal(existsSync(src('components/workspace/useWorkspaceLayout.ts')), true);
  assert.equal(existsSync(src('components/workspace/index.ts')), true);
});

test('WorkspaceWidget supports pin and collapse a11y', () => {
  const widget = readFileSync(src('components/workspace/WorkspaceWidget.tsx'), 'utf8');
  assert.match(widget, /aria-expanded/);
  assert.match(widget, /onTogglePin/);
  assert.match(widget, /focus-visible:outline/);
});

test('QuickPreviewDrawer is keyboard dismissible and responsive', () => {
  const drawer = readFileSync(src('components/workspace/QuickPreviewDrawer.tsx'), 'utf8');
  assert.match(drawer, /Escape/);
  assert.match(drawer, /role=\"dialog\"/);
  assert.match(drawer, /sm:max-w-md/);
});

test('Freelancer overview embeds focus, growth, and status strip', () => {
  const overview = readFileSync(src('dashboard/freelancer/Overview.tsx'), 'utf8');
  assert.match(overview, /WorkspaceFocusPanel/);
  assert.match(overview, /WorkspaceStatusStrip/);
  assert.match(overview, /GrowthPulseCard/);
  assert.match(overview, /getMyOrderSummary/);
  assert.match(overview, /buildScrolithaCareerPath/);
});

test('Employer overview embeds hiring priorities and growth pulse', () => {
  const overview = readFileSync(src('dashboard/employer/Overview.tsx'), 'utf8');
  assert.match(overview, /WorkspaceFocusPanel/);
  assert.match(overview, /Hiring priorities/);
  assert.match(overview, /GrowthPulseCard/);
  assert.match(overview, /proposalStats/);
  assert.match(overview, /WalletService/);
});

test('Dashboard layout Account section includes Profile and Settings', () => {
  const layout = readFileSync(src('dashboard/shared/DashboardLayout.tsx'), 'utf8');
  assert.match(layout, /tab: 'profile'/);
  assert.match(layout, /tab: 'settings'/);
  assert.match(layout, /Settings/);
});

test('layout preferences persist density and pins', () => {
  const hook = readFileSync(src('components/workspace/useWorkspaceLayout.ts'), 'utf8');
  assert.match(hook, /localStorage/);
  assert.match(hook, /density/);
  assert.match(hook, /togglePin/);
  assert.match(hook, /reset/);
});
