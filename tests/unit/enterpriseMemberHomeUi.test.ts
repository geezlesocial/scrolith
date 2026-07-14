/**
 * Phase 4 — enterprise member-home layout / post-card class contracts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

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

test('page shell centers with enterprise max width', () => {
  assert.match(enterprisePageShell, /max-w-\[1560px\]/);
  assert.match(enterprisePageShell, /mx-auto/);
});

test('desktop grid expands to three columns at xl+', () => {
  assert.match(enterpriseMemberHomeGrid, /lg:grid-cols-\[/);
  assert.match(enterpriseMemberHomeGrid, /xl:grid-cols-\[/);
  assert.match(enterpriseMemberHomeGrid, /minmax\(280px,300px\)/);
  assert.match(enterpriseMemberHomeGrid, /minmax\(300px,340px\)/);
});

test('side rails use CSS sticky with header offset', () => {
  assert.match(enterpriseStickyRail, /lg:sticky/);
  assert.match(enterpriseStickyRail, /lg:top-24/);
  assert.match(enterpriseStickyRailRight, /xl:sticky/);
  assert.match(enterpriseStickyRailRight, /xl:top-24/);
  assert.match(enterpriseLeftColumn, /lg:order-1/);
  assert.match(enterpriseRightColumn, /xl:col-span-1/);
});

test('feed column remains the visual priority with bounded width', () => {
  assert.match(enterpriseFeedColumn, /xl:max-w-\[760px\]/);
  assert.match(enterpriseFeedColumn, /xl:justify-self-center/);
  assert.match(enterpriseFeedColumn, /min-w-0/);
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
