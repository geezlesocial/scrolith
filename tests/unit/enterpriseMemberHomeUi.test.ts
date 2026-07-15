/**
 * Phase 4 — enterprise member-home layout / post-card class contracts.
 * Hotfix: structural scrolith-mh-* classes + no nested main + full-width shell.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  enterpriseFeedColumn,
  enterpriseLeftColumn,
  enterpriseMemberHomeGrid,
  enterprisePageShell,
  enterprisePanel,
  enterprisePostCard,
  enterpriseRightColumn,
  enterpriseSponsoredLabel,
  enterpriseStickyRail,
  enterpriseStickyRailRight
} from '../../src/components/enterprise/enterpriseClasses.ts';

const here = dirname(fileURLToPath(import.meta.url));
const indexCss = readFileSync(join(here, '../../src/index.css'), 'utf8');
const memberHomeSource = readFileSync(
  join(here, '../../src/components/sections/MemberHomeSection.tsx'),
  'utf8'
);
const appSource = readFileSync(join(here, '../../src/App.tsx'), 'utf8');

test('page shell centers with enterprise max width and structural class', () => {
  assert.match(enterprisePageShell, /max-w-\[1560px\]/);
  assert.match(enterprisePageShell, /mx-auto/);
  assert.match(enterprisePageShell, /w-full/);
  assert.match(enterprisePageShell, /min-w-0/);
  assert.match(enterprisePageShell, /scrolith-mh-shell/);
});

test('desktop grid expands with authoritative scrolith-mh-grid contract', () => {
  assert.match(enterpriseMemberHomeGrid, /scrolith-mh-grid/);
  assert.match(enterpriseMemberHomeGrid, /w-full/);
  assert.match(enterpriseMemberHomeGrid, /min-w-0/);
  assert.match(enterpriseMemberHomeGrid, /lg:grid-cols-\[/);
  assert.match(enterpriseMemberHomeGrid, /xl:grid-cols-\[/);
  assert.match(enterpriseMemberHomeGrid, /minmax\(280px,300px\)/);
  assert.match(enterpriseMemberHomeGrid, /minmax\(300px,340px\)/);
  assert.match(enterpriseMemberHomeGrid, /minmax\(0,1fr\)/);
});

test('index.css defines full-width multi-column contract for member home', () => {
  assert.match(indexCss, /\.scrolith-mh-shell\s*\{/);
  assert.match(indexCss, /\.scrolith-mh-grid\s*\{/);
  assert.match(indexCss, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(indexCss, /@media \(min-width: 1024px\)/);
  assert.match(indexCss, /@media \(min-width: 1280px\)/);
  assert.match(indexCss, /minmax\(260px,\s*var\(--enterprise-left-w/);
  assert.match(indexCss, /minmax\(0,\s*1fr\)/);
  assert.match(indexCss, /minmax\(300px,\s*var\(--enterprise-right-w/);
  // Right rail must not force a crushed single track
  assert.match(indexCss, /\.scrolith-mh-left,\s*\n\s*\.scrolith-mh-feed,\s*\n\s*\.scrolith-mh-right/);
  assert.match(indexCss, /min-width:\s*0/);
});

test('side rails use CSS sticky with header offset and structural classes', () => {
  assert.match(enterpriseStickyRail, /lg:sticky/);
  assert.match(enterpriseStickyRail, /lg:top-24/);
  assert.match(enterpriseStickyRailRight, /xl:sticky/);
  assert.match(enterpriseStickyRailRight, /xl:top-24/);
  assert.match(enterpriseLeftColumn, /scrolith-mh-left/);
  assert.match(enterpriseLeftColumn, /lg:order-1/);
  assert.match(enterpriseLeftColumn, /min-w-0/);
  assert.match(enterpriseRightColumn, /scrolith-mh-right/);
  // Hotfix: never span 2 cols at lg (that collapsed the visual layout)
  assert.equal(enterpriseRightColumn.includes('lg:col-span-2'), false);
  assert.equal(enterpriseRightColumn.includes('lg:grid-cols-2'), false);
});

test('feed column grows with minmax(0,1fr) track and soft max width', () => {
  assert.match(enterpriseFeedColumn, /scrolith-mh-feed/);
  assert.match(enterpriseFeedColumn, /xl:max-w-\[760px\]/);
  assert.match(enterpriseFeedColumn, /min-w-0/);
  assert.match(enterpriseFeedColumn, /w-full/);
  // Prefer stretch over center so the track is not abandoned as empty right space
  assert.match(enterpriseFeedColumn, /xl:justify-self-stretch|justify-self-stretch/);
  assert.equal(enterpriseFeedColumn.includes('justify-self-center'), false);
});

test('MemberHomeSection does not nest a second main landmark', () => {
  assert.match(memberHomeSource, /data-testid="scrolith-member-home-feed"/);
  assert.match(memberHomeSource, /role="region"/);
  assert.match(memberHomeSource, /aria-label="Home feed"/);
  // Feed column must not be a nested <main>
  assert.equal(/<main\b[^>]*enterpriseFeedColumn/.test(memberHomeSource), false);
  assert.equal(/<main\b[^>]*scrolith-member-home-feed/.test(memberHomeSource), false);
  assert.match(memberHomeSource, /data-testid="scrolith-member-home-grid"/);
  assert.match(memberHomeSource, /data-testid="scrolith-member-home-shell"/);
});

test('App desktop main shell can take full width', () => {
  assert.match(appSource, /main className="w-full min-w-0 flex-grow"/);
});

test('post card avoids hover lift (layout shake prevention)', () => {
  assert.match(enterprisePostCard, /rounded-2xl/);
  assert.match(enterprisePostCard, /bg-white/);
  assert.equal(enterprisePostCard.includes('-translate-y'), false);
  assert.match(enterprisePostCard, /transition-shadow/);
});

test('panels and sponsored labels are readable enterprise surfaces', () => {
  assert.match(enterprisePanel, /border/);
  assert.match(enterprisePanel, /rounded-2xl/);
  assert.match(enterpriseSponsoredLabel, /amber/);
  assert.match(enterpriseSponsoredLabel, /uppercase/);
});
