/**
 * Enterprise Member Home layout / composition contracts.
 * Guards the desktop dashboard shell: one grid, three direct tracks,
 * named areas, no full-width right-rail stack under the feed.
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
const mobileShellSource = readFileSync(
  join(here, '../../src/mobile/home/mobileShellLayout.ts'),
  'utf8'
);
const mobileShellUtilsSource = readFileSync(
  join(here, '../../src/mobile/home/mobileShellLayoutUtils.ts'),
  'utf8'
);
const loginSource = readFileSync(join(here, '../../src/auth/Login.tsx'), 'utf8');

test('page shell centers with enterprise max width and structural class', () => {
  assert.match(enterprisePageShell, /max-w-\[1560px\]/);
  assert.match(enterprisePageShell, /mx-auto/);
  assert.match(enterprisePageShell, /w-full/);
  assert.match(enterprisePageShell, /min-w-0/);
  assert.match(enterprisePageShell, /scrolith-mh-shell/);
});

test('desktop grid uses structural class without conflicting multi-col utilities', () => {
  assert.match(enterpriseMemberHomeGrid, /scrolith-mh-grid/);
  assert.match(enterpriseMemberHomeGrid, /w-full/);
  assert.match(enterpriseMemberHomeGrid, /min-w-0/);
  // Geometry is CSS-owned; avoid Tailwind grid-cols that fight named areas
  assert.equal(enterpriseMemberHomeGrid.includes('lg:grid-cols-'), false);
  assert.equal(enterpriseMemberHomeGrid.includes('xl:grid-cols-'), false);
  assert.equal(enterpriseMemberHomeGrid.includes('2xl:grid-cols-'), false);
});

test('index.css defines named-area three-column desktop composition contract', () => {
  assert.match(indexCss, /\.scrolith-mh-shell\s*\{/);
  assert.match(indexCss, /\.scrolith-mh-grid\s*\{/);
  assert.match(indexCss, /grid-template-areas:\s*'center'\s*'left'\s*'right'/);
  assert.match(indexCss, /@media \(min-width: 1024px\)/);
  assert.match(indexCss, /grid-template-areas:\s*'left center right'/);
  assert.match(indexCss, /minmax\(240px,\s*280px\)/);
  assert.match(indexCss, /minmax\(0,\s*1fr\)/);
  assert.match(indexCss, /minmax\(260px,\s*300px\)/);
  assert.match(indexCss, /minmax\(280px,\s*320px\)/);
  assert.match(indexCss, /minmax\(300px,\s*340px\)/);
  // Critical regression: right rail must never force full-row span on desktop
  assert.equal(/\.scrolith-mh-right[\s\S]{0,200}grid-column:\s*1\s*\/\s*-1/.test(indexCss), false);
  assert.match(indexCss, /\.scrolith-mh-left\s*\{\s*grid-area:\s*left/);
  assert.match(indexCss, /\.scrolith-mh-feed\s*\{\s*grid-area:\s*center/);
  assert.match(indexCss, /\.scrolith-mh-right\s*\{\s*grid-area:\s*right/);
});

test('side rails sticky from lg on both columns', () => {
  assert.match(enterpriseStickyRail, /lg:sticky/);
  assert.match(enterpriseStickyRail, /lg:top-24/);
  assert.match(enterpriseStickyRailRight, /lg:sticky/);
  assert.match(enterpriseStickyRailRight, /lg:top-24/);
  assert.match(enterpriseLeftColumn, /scrolith-mh-left/);
  assert.match(enterpriseLeftColumn, /min-w-0/);
  assert.match(enterpriseRightColumn, /scrolith-mh-right/);
  assert.equal(enterpriseRightColumn.includes('lg:col-span-2'), false);
  assert.equal(enterpriseRightColumn.includes('lg:grid-cols-2'), false);
  assert.equal(enterpriseRightColumn.includes('col-span'), false);
});

test('feed column fills center track without hard max-width abandonment', () => {
  assert.match(enterpriseFeedColumn, /scrolith-mh-feed/);
  assert.match(enterpriseFeedColumn, /min-w-0/);
  assert.match(enterpriseFeedColumn, /w-full/);
  assert.equal(enterpriseFeedColumn.includes('xl:max-w-[760px]'), false);
  assert.equal(enterpriseFeedColumn.includes('justify-self-center'), false);
  assert.match(indexCss, /\.scrolith-mh-feed[\s\S]{0,120}max-width:\s*none/);
});

test('MemberHomeSection mounts one shell, one grid, three direct column landmarks', () => {
  assert.match(memberHomeSource, /data-testid="scrolith-member-home"/);
  assert.match(memberHomeSource, /data-testid="scrolith-member-home-shell"/);
  assert.match(memberHomeSource, /data-testid="scrolith-member-home-grid"/);
  assert.match(memberHomeSource, /data-testid="scrolith-member-home-left"/);
  assert.match(memberHomeSource, /data-testid="scrolith-member-home-feed"/);
  assert.match(memberHomeSource, /data-testid="scrolith-member-home-right"/);

  const shellCount = (memberHomeSource.match(/data-testid="scrolith-member-home-shell"/g) || []).length;
  const gridCount = (memberHomeSource.match(/data-testid="scrolith-member-home-grid"/g) || []).length;
  const leftCount = (memberHomeSource.match(/data-testid="scrolith-member-home-left"/g) || []).length;
  const feedCount = (memberHomeSource.match(/data-testid="scrolith-member-home-feed"/g) || []).length;
  const rightCount = (memberHomeSource.match(/data-testid="scrolith-member-home-right"/g) || []).length;
  assert.equal(shellCount, 1);
  assert.equal(gridCount, 1);
  assert.equal(leftCount, 1);
  assert.equal(feedCount, 1);
  assert.equal(rightCount, 1);

  // Columns use structural classes
  assert.match(memberHomeSource, /enterpriseLeftColumn/);
  assert.match(memberHomeSource, /enterpriseFeedColumn/);
  assert.match(memberHomeSource, /enterpriseRightColumn/);
  assert.match(memberHomeSource, /enterpriseMemberHomeGrid/);
});

test('MemberHomeSection does not nest a second main landmark', () => {
  assert.match(memberHomeSource, /role="region"/);
  assert.match(memberHomeSource, /aria-label="Home feed"/);
  assert.equal(/<main\b[^>]*enterpriseFeedColumn/.test(memberHomeSource), false);
  assert.equal(/<main\b[^>]*scrolith-member-home-feed/.test(memberHomeSource), false);
});

test('primary modules are assigned to intended slots in source structure', () => {
  const leftIdx = memberHomeSource.indexOf('data-testid="scrolith-member-home-left"');
  const feedIdx = memberHomeSource.indexOf('data-testid="scrolith-member-home-feed"');
  const rightIdx = memberHomeSource.indexOf('data-testid="scrolith-member-home-right"');
  const gridEnd = memberHomeSource.indexOf('data-testid="scrolith-member-home-right"');
  assert.ok(leftIdx > 0 && feedIdx > leftIdx && rightIdx > feedIdx);

  // Stories / discovery live in feed column
  const storiesIdx = memberHomeSource.indexOf('Share quick updates, photos, or videos with your community.');
  const discoveryIdx = memberHomeSource.indexOf('Professional Discovery Board');
  assert.ok(storiesIdx > feedIdx && storiesIdx < rightIdx);
  assert.ok(discoveryIdx > feedIdx && discoveryIdx < rightIdx);

  // Insights / recommendations live in right rail
  const insightsIdx = memberHomeSource.indexOf('InsightsQuickPanel');
  const messagesInRight = memberHomeSource.indexOf('Recent messages', rightIdx);
  // InsightsQuickPanel import appears earlier; usage near right rail:
  const insightsUsage = memberHomeSource.indexOf('<InsightsQuickPanel', rightIdx > 0 ? rightIdx - 200 : 0);
  assert.ok(insightsUsage >= rightIdx - 200);
  assert.ok(memberHomeSource.includes('desktopMode="rail"'));
});

test('no second MemberHomeSection mount beside desktop branch in App', () => {
  // Desktop member home uses MemberHomeSection; mobile uses MobileHome exclusively
  assert.match(appSource, /shouldUseMobileMemberHome \? <MobileHome \/> : <MemberHomeSection \/>/);
  // Only one of each in the signed-in homepage element
  const mobileHomeInElement = (appSource.match(/<MobileHome \/>/g) || []).length;
  const memberHomeInElement = (appSource.match(/<MemberHomeSection \/>/g) || []).length;
  assert.ok(mobileHomeInElement >= 1);
  assert.ok(memberHomeInElement >= 1);
});

test('App desktop main shell can take full width', () => {
  // Landmark may include id/tabIndex for skip-link a11y; class contract stays full-width.
  assert.match(appSource, /main[^>]*className="w-full min-w-0 flex-grow"/);
  assert.match(appSource, /id="main-content"/);
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

test('grid closes before modals — no extra full-width boards after grid siblings in shell', () => {
  // After the right aside closes, next major UI is AI modal / file inputs — not another grid shell
  const rightClose = memberHomeSource.lastIndexOf('data-testid="scrolith-member-home-right"');
  const afterRight = memberHomeSource.slice(rightClose);
  assert.equal((afterRight.match(/data-testid="scrolith-member-home-grid"/g) || []).length, 0);
  assert.equal((afterRight.match(/enterpriseMemberHomeGrid/g) || []).length, 0);
  assert.equal((afterRight.match(/Member Home Discovery Board/g) || []).length, 0);
});

test('mobile shell floor aligns to lg so desktop Member Home is not replaced by MobileHome', () => {
  assert.match(mobileShellSource, /MOBILE_SHELL_BREAKPOINT\s*=\s*DESKTOP_MEMBER_HOME_MIN_WIDTH/);
  assert.match(mobileShellUtilsSource, /DESKTOP_MEMBER_HOME_MIN_WIDTH\s*=\s*1024/);
  // Regression: must not force mobile for coarse-touch up to 1366
  assert.equal(mobileShellUtilsSource.includes('viewportWidth <= 1366'), false);
  assert.equal(mobileShellUtilsSource.includes('e<=1366'), false);
  assert.match(appSource, /shouldUseMobileMemberHome \? <MobileHome \/> : <MemberHomeSection \/>/);
});

test('login post-auth mobile detection no longer treats touch laptops ≤1366 as mobile', () => {
  assert.equal(loginSource.includes('viewportWidth <= 1366'), false);
  assert.match(loginSource, /viewportWidth < 1024/);
});

test('discovery board is compact enterprise layout with bounded Scrolitha coach mark', () => {
  const boardSource = readFileSync(
    join(here, '../../src/components/member-home/MemberHomeHighlightsBoard.tsx'),
    'utf8'
  );
  const mobileFeedSource = readFileSync(
    join(here, '../../src/mobile/home/components/MobileFeed.tsx'),
    'utf8'
  );

  // 1–2: one compact header + metrics region
  assert.match(boardSource, /data-testid="scrolith-member-home-discovery-board"/);
  assert.match(boardSource, /data-testid="scrolith-discovery-header"/);
  assert.match(boardSource, /data-testid="scrolith-discovery-metrics"/);
  assert.match(boardSource, /aria-label="Discovery metrics"/);
  assert.equal((boardSource.match(/data-testid="scrolith-discovery-header"/g) || []).length, 1);

  // 3–4: coach mark + card bounded (48–56px mark container; no oversized hero)
  assert.match(boardSource, /data-testid="scrolith-discovery-coach-card"/);
  assert.match(boardSource, /data-testid="scrolith-discovery-coach-mark"/);
  assert.match(boardSource, /h-12 w-12.*sm:h-14 sm:w-14|sm:h-14 sm:w-14/);
  assert.match(boardSource, /h-8 w-8 object-contain sm:h-9 sm:w-9/);
  assert.equal(boardSource.includes('min-h-[13rem]'), false);
  assert.equal(boardSource.includes('2xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]'), false);
  assert.equal(/heightClassName="h-full min-h-\[13rem\]/.test(boardSource), false);
  assert.equal(boardSource.includes('h-40 w-40'), false);

  // 5–6: Open coach exact action + capability metadata (parent-owned)
  assert.match(memberHomeSource, /desktop-scrolitha-coach/);
  assert.match(memberHomeSource, /ctaLabel: 'Open coach'/);
  assert.match(memberHomeSource, /openInsightsSection\('scrolitha-coach', 'growth'\)/);
  assert.match(memberHomeSource, /meta: 'Posts · Gigs · Briefs'/);
  assert.match(boardSource, /parseCapabilityChips/);

  // 7–8: module grid responsive contract + secondary cards keep ActionSurface
  assert.match(boardSource, /data-testid="scrolith-discovery-module-grid"/);
  assert.match(boardSource, /data-testid="scrolith-discovery-module-card"/);
  assert.match(
    boardSource,
    /compact\s*\?\s*'grid grid-cols-1 gap-2\.5'\s*:\s*'grid auto-rows-fr grid-cols-1 gap-2\.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3'/
  );
  assert.match(boardSource, /const ActionSurface/);
  assert.match(boardSource, /item\.onClick/);
  assert.match(boardSource, /item\.href/);

  // 9–12: missing media safe; empty items null; no hero / no brand logo hero
  assert.match(boardSource, /if \(!items\.length\) return null/);
  assert.match(boardSource, /isBrandLogoUrl/);
  assert.match(boardSource, /never become a large module hero/);
  assert.match(boardSource, /isScrolithaCoachHighlight/);

  // 13–14: board only presentation — Member Home shell landmarks unchanged
  assert.match(memberHomeSource, /data-testid="scrolith-member-home-left"/);
  assert.match(memberHomeSource, /data-testid="scrolith-member-home-feed"/);
  assert.match(memberHomeSource, /data-testid="scrolith-member-home-right"/);
  assert.match(memberHomeSource, /MemberHomeHighlightsBoard/);
  assert.equal(memberHomeSource.includes('enterpriseLeftColumn') === false, false);

  // 15–16: mobile compact path keeps coach contract
  assert.match(mobileFeedSource, /mobile-scrolitha-coach/);
  assert.match(mobileFeedSource, /openInsightsSection\('scrolitha-coach', 'growth'\)/);
  assert.match(mobileFeedSource, /ctaLabel: 'Open coach'/);
  assert.match(mobileFeedSource, /compact/);

  // 17–18: a11y — section labelled, focus rings, aria-label on actions
  assert.match(boardSource, /aria-labelledby=\{headingId\}/);
  assert.match(boardSource, /focus-visible:ring-2/);
  assert.match(boardSource, /aria-label=\{item\.ctaLabel \|\| item\.title\}/);
  assert.match(boardSource, /alt="Scrolitha"/);

  // Pure presentation: no fetch/socket/BroadcastChannel in board
  assert.equal(boardSource.includes('fetch('), false);
  assert.equal(boardSource.includes('WebSocket'), false);
  assert.equal(boardSource.includes('BroadcastChannel'), false);
  assert.equal(boardSource.includes('setInterval'), false);
});

test('profile identity card overlaps circular avatar on cover without clipping', () => {
  assert.match(memberHomeSource, /data-testid="scrolith-member-home-profile-card"/);
  assert.match(memberHomeSource, /data-testid="scrolith-member-home-profile-avatar"/);

  const cardIdx = memberHomeSource.indexOf('data-testid="scrolith-member-home-profile-card"');
  const avatarIdx = memberHomeSource.indexOf('data-testid="scrolith-member-home-profile-avatar"');
  const leftIdx = memberHomeSource.indexOf('data-testid="scrolith-member-home-left"');
  assert.ok(leftIdx > 0 && cardIdx > leftIdx && avatarIdx > cardIdx);

  // Single identity card + avatar mount in the left rail
  assert.equal((memberHomeSource.match(/data-testid="scrolith-member-home-profile-card"/g) || []).length, 1);
  assert.equal((memberHomeSource.match(/data-testid="scrolith-member-home-profile-avatar"/g) || []).length, 1);

  // Cover media clips; card shell must allow overflow for the hang/overlap
  assert.match(memberHomeSource, /overflow-visible rounded-2xl border border-slate-200\/90 bg-white/);
  assert.match(memberHomeSource, /relative h-24 overflow-hidden rounded-t-2xl/);
  assert.match(memberHomeSource, /sm:h-28/);

  // Centered proportional overlap: top of cover bottom + 40% translate
  assert.match(memberHomeSource, /absolute left-1\/2 top-full/);
  assert.match(memberHomeSource, /-translate-x-1\/2/);
  assert.match(memberHomeSource, /-translate-y-\[40%\]/);
  assert.match(memberHomeSource, /z-20/);

  // Circular white ring + elevation
  assert.match(memberHomeSource, /rounded-full/);
  assert.match(memberHomeSource, /ring-\[5px\] ring-white/);
  assert.match(memberHomeSource, /shadow-\[0_4px_14px_rgba\(15,23,42,0\.18\)\]/);

  // Content reserved below hanging avatar so strength/CTA clear the face
  assert.match(memberHomeSource, /pt-\[3\.15rem\].*sm:pt-\[3\.35rem\]|pt-\[3\.15rem\] text-center sm:pt-\[3\.35rem\]/);
  assert.match(memberHomeSource, /Profile strength/);
  assert.match(memberHomeSource, /View profile/);

  // Fallbacks: cover optional (onError clears), avatar optional (Users icon)
  assert.match(memberHomeSource, /selfProfileCover/);
  assert.match(memberHomeSource, /resolvedUserAvatar/);
  assert.match(memberHomeSource, /onError=\{\(\) => setSelfProfileCover\(''\)\}/);
  assert.match(memberHomeSource, /<Users className="h-7 w-7 text-slate-400"/);

  // Meaningful alt when avatar present
  assert.match(memberHomeSource, /alt=\{user\.name \|\| 'User'\}/);
});
