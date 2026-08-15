/**
 * Phase 6.0 — World-class enterprise desktop header contracts.
 * Source-level guards for structure, badges, search, popovers, and a11y.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatMessagingBadgeCount } from '../../src/services/messagingSurfaces.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const navbar = read('src/components/Navbar.tsx');
const searchInput = read('src/components/SearchInput.tsx');
const headerCss = read('src/components/header/enterpriseHeader.css');
const badgeSrc = read('src/components/header/HeaderUnreadBadge.tsx');
const navItemSrc = read('src/components/header/HeaderPrimaryNavItem.tsx');
const headerIndex = read('src/components/header/index.ts');
const headerMessagesPopover = read('src/components/messaging/HeaderMessagesPopover.tsx');

// ── Structure ──────────────────────────────────────────────────────────────

test('enterprise header tokens and shell classes exist', () => {
  assert.match(headerCss, /--scrolith-header-height:\s*68px/);
  assert.match(headerCss, /--scrolith-header-height-lg:\s*72px/);
  assert.match(headerCss, /\.scrolith-enterprise-header\b/);
  assert.match(headerCss, /\.scrolith-header-nav-item\b/);
  assert.match(headerCss, /\.scrolith-header-badge\b/);
  assert.match(headerCss, /\.scrolith-header-utility\b/);
  assert.match(headerCss, /\.scrolith-header-profile\b/);
  assert.match(headerCss, /\.scrolith-header-search-shell\b/);
});

test('header module exports HeaderUnreadBadge', () => {
  assert.match(headerIndex, /HeaderUnreadBadge/);
  assert.match(badgeSrc, /scrolith-header-badge/);
  assert.match(badgeSrc, /is-empty/);
});

test('Navbar mounts one enterprise desktop header shell with brand + primary landmark', () => {
  assert.match(navbar, /data-testid="scrolith-enterprise-header"/);
  assert.match(navbar, /import "\.\/header\/enterpriseHeader\.css"/);
  assert.match(navbar, /aria-label="Primary"/);
  assert.match(navbar, /aria-label=\{brandName \? `\$\{brandName\} home` : "Scrolith home"\}/);
  assert.match(navbar, /aria-label="Main sections"/);
});

test('desktop three-zone layout: brand+search, primary nav, utilities', () => {
  assert.match(navbar, /LEFT: Brand \+ Search/);
  assert.match(navbar, /CENTER: CMS navigation/);
  assert.match(navbar, /RIGHT: Fixed utilities \+ account/);
  assert.match(navbar, /scrolith-header-search-shell/);
  assert.match(navbar, /size="header"/);
  assert.match(navbar, /data-header-layout="three-zone-grid"/);
});

test('mobile/tablet bar remains a separate branch from desktop enterprise layout', () => {
  assert.match(navbar, /isDesktopNav \? \(/);
  assert.match(navbar, /Mobile \+ tablet bar \(structure preserved\)/);
  assert.match(navbar, /Search below bar: mobile\/tablet only/);
  assert.match(navbar, /min-width: 1024px/);
});

// ── Navigation ─────────────────────────────────────────────────────────────

test('desktop nav items use stable enterprise classes and aria-current', () => {
  assert.match(navbar, /HeaderPrimaryNavItem/);
  assert.match(navItemSrc, /scrolith-header-nav-item/);
  assert.match(navItemSrc, /scrolith-desktop-nav-item/);
  assert.match(navItemSrc, /scrolith-header-nav-item__marker/);
  assert.match(navbar, /ariaCurrent=\{active \? "page" : undefined\}/);
  assert.equal(navbar.includes('hover:-translate-y'), false);
  assert.equal(navbar.includes('hover:scale-'), false);
  assert.equal(navItemSrc.includes('hover:-translate-y'), false);
});

// ── Search ─────────────────────────────────────────────────────────────────

test('header search uses enterprise placeholder and debounced suggestions', () => {
  assert.match(navbar, /Search people, jobs, gigs, posts, pages, communities, or marketplace/);
  assert.match(searchInput, /DEFAULT_HEADER_PLACEHOLDER/);
  assert.match(searchInput, /useGlobalSearch\(query/);
  assert.match(searchInput, /maxResults: 8/);
  assert.match(read('src/hooks/useGlobalSearch.ts'), /DEFAULT_DEBOUNCE_MS = 300/);
  assert.match(read('src/hooks/useGlobalSearch.ts'), /requestSeqRef/);
  assert.match(searchInput, /role="combobox"/);
  assert.match(searchInput, /role="listbox"/);
  assert.match(searchInput, /Escape/);
  assert.match(searchInput, /ArrowDown/);
  assert.match(searchInput, /ArrowUp/);
  assert.match(searchInput, /aria-activedescendant/);
  assert.match(searchInput, /size\?: 'normal' \| 'large' \| 'xl' \| 'header'/);
});

// ── Badges / realtime stability ────────────────────────────────────────────

test('unread badge always reserves layout space and caps at 99+', () => {
  assert.equal(formatMessagingBadgeCount(0), '');
  assert.equal(formatMessagingBadgeCount(13), '13');
  assert.equal(formatMessagingBadgeCount(99), '99');
  assert.equal(formatMessagingBadgeCount(120), '99+');
  assert.match(badgeSrc, /hasCount \? '' : 'is-empty'/);
  assert.match(badgeSrc, /\{label \|\| '0'\}/);
  assert.match(headerCss, /\.scrolith-header-badge\.is-empty/);
  assert.match(headerCss, /opacity:\s*0/);
  assert.match(navbar, /renderCountBadge/);
  assert.match(navbar, /HeaderUnreadBadge/);
  assert.match(navbar, /messagesUnreadCount/);
  assert.match(navbar, /unreadNotificationCounts/);
});

// ── Messages ───────────────────────────────────────────────────────────────

test('messages control preserves HeaderMessagesPopover + dock integration path', () => {
  assert.match(navbar, /HeaderMessagesPopover/);
  assert.match(navbar, /useMessages/);
  assert.match(navbar, /messagesPopoverId/);
  assert.match(navbar, /aria-controls=\{/);
  // The full-page route is owned by the popover footer, not duplicated in the
  // header controller. Keep the integration and route contract together.
  assert.match(headerMessagesPopover, /to="\/messages"/);
});

// ── Notifications ──────────────────────────────────────────────────────────

test('notifications control keeps popup + mark-read wiring', () => {
  assert.match(navbar, /showNotifications/);
  assert.match(navbar, /markAsRead/);
  assert.match(navbar, /renderNotificationsDropdown/);
  assert.match(navbar, /actionType === "notifications"/);
});

// ── Create ─────────────────────────────────────────────────────────────────

test('create menu only exposes existing platform routes with role filters', () => {
  assert.match(navbar, /renderCreateControl/);
  assert.match(navbar, /showCreateMenu/);
  assert.match(navbar, /url: "\/post\/create"/);
  assert.match(navbar, /url: "\/create-job"/);
  assert.match(navbar, /url: "\/create-gig"/);
  assert.match(navbar, /url: "\/marketplace\/create"/);
  assert.equal(navbar.includes('/jobs/create'), false);
  assert.equal(navbar.includes('/gigs/create'), false);
  assert.match(navbar, /roles: \["employer", "admin"\]/);
  assert.match(navbar, /roles: \["freelancer", "admin"\]/);
});

// ── Favorites / cart ───────────────────────────────────────────────────────

test('favorites and cart preserve routes with stable badges and compact labels', () => {
  assert.match(navbar, /to="\/favorites"/);
  assert.match(navbar, /to="\/cart"/);
  assert.match(navbar, /renderFavoritesControl/);
  assert.match(navbar, /renderCartControl/);
  assert.match(navbar, /hidden 2xl:inline">Favorites/);
  assert.match(navbar, /hidden 2xl:inline">Cart/);
});

// ── Profile ────────────────────────────────────────────────────────────────

test('profile menu is grouped, keyboard-accessible, and restores sign-out path', () => {
  assert.match(navbar, /scrolith-header-profile/);
  assert.match(navbar, /aria-label="Open account menu"/);
  assert.match(navbar, /aria-haspopup="menu"/);
  assert.match(navbar, /aria-label="Account menu"/);
  assert.match(navbar, /groupedProfileItems/);
  assert.match(navbar, /handleLogout/);
  assert.match(navbar, /max-w-\[7\.5rem\] truncate/);
});

// ── Popover system ─────────────────────────────────────────────────────────

test('header popovers close one-at-a-time via closeAll + Escape priority + outside click', () => {
  assert.match(navbar, /closeAllHeaderPopovers/);
  assert.match(navbar, /setShowCreateMenu\(false\)/);
  assert.match(navbar, /Escape closes the topmost open header popover first/);
  assert.match(navbar, /if \(showCreateMenu\)/);
  assert.match(navbar, /if \(showProfileDropdown\)/);
  assert.match(navbar, /if \(showMessagesDropdown\)/);
  assert.match(navbar, /if \(showNotifications\)/);
  assert.match(navbar, /createRef\.current && !createRef\.current\.contains/);
  assert.match(navbar, /One intentional top-level header surface at a time/);
});

// ── Sticky / surface ───────────────────────────────────────────────────────

test('sticky desktop header with scroll elevation and no oversized height', () => {
  assert.match(navbar, /isHome \? "relative" : "sticky top-0"/);
  assert.match(navbar, /is-scrolled/);
  assert.match(navbar, /window\.scrollY > 2/);
  assert.match(headerCss, /\.scrolith-enterprise-header\.is-scrolled/);
  const height = Number(headerCss.match(/--scrolith-header-height:\s*(\d+)px/)?.[1] || 0);
  const heightLg = Number(headerCss.match(/--scrolith-header-height-lg:\s*(\d+)px/)?.[1] || 0);
  assert.ok(height >= 64 && height <= 72, `expected height 64–72, got ${height}`);
  assert.ok(heightLg >= height && heightLg <= 72, `expected height-lg ≤72, got ${heightLg}`);
});

// ── Responsive ─────────────────────────────────────────────────────────────

test('compact desktop search and nav tokens defined for 1024–1279', () => {
  assert.match(headerCss, /@media \(min-width: 1024px\) and \(max-width: 1279px\)/);
  assert.match(headerCss, /max-width: min\(200px, 20vw\)/);
  assert.match(headerCss, /@media \(min-width: 1280px\)/);
  assert.match(headerCss, /--scrolith-header-search-max-xl/);
});

// ── Accessibility ──────────────────────────────────────────────────────────

test('a11y: focus-visible rings, reduced motion, target-size tokens', () => {
  assert.match(headerCss, /:focus-visible/);
  assert.match(headerCss, /prefers-reduced-motion: reduce/);
  const itemH = Number(headerCss.match(/--scrolith-header-item-h:\s*(\d+)px/)?.[1] || 0);
  assert.ok(itemH >= 44 && itemH <= 56, `expected item height 44–56, got ${itemH}`);
  assert.match(navbar, /ariaExpanded=\{/);
  assert.match(navbar, /ariaHaspopup|aria-haspopup/);
});

// ── Theme ──────────────────────────────────────────────────────────────────

test('dark theme tokens override header surface colors', () => {
  assert.match(headerCss, /\[data-theme="dark"\]/);
  assert.match(headerCss, /--scrolith-header-bg:\s*#131517/);
});

// ── Performance / deps ─────────────────────────────────────────────────────

test('header redesign adds no new package imports beyond existing shell icons and header module', () => {
  assert.match(navbar, /from "\.\/icons\/ShellIcons"/);
  assert.match(navbar, /from "\.\/header"/);
  assert.equal(navbar.includes('from "framer-motion"'), false);
  assert.equal(navbar.includes('@radix-ui'), false);
  assert.equal(navbar.includes('headlessui'), false);
});

// ── Phase 6.1 — CMS ownership + collision prevention ───────────────────────

test('header module exports HeaderPrimaryNavItem generic shell', () => {
  assert.match(headerIndex, /HeaderPrimaryNavItem/);
  assert.match(navItemSrc, /Generic enterprise shell for admin\/CMS-provided header navigation items/);
  assert.match(navItemSrc, /label: string/);
  assert.match(navItemSrc, /icon: React\.ReactNode/);
  assert.match(navItemSrc, /href\?: string/);
  assert.match(navItemSrc, /badgeCount\?: number/);
  assert.match(navItemSrc, /as\?: 'link' \| 'button'/);
});

test('CMS navigation remains dynamic — no hardcoded six-item primary array', () => {
  assert.match(navbar, /filteredNavigation\.map/);
  assert.match(navbar, /headerConfig as any\)\?\.navigation/);
  assert.match(navbar, /desktopCenterActivityIcons\.map/);
  assert.match(navbar, /visibleActivityIcons/);
  // Must not hardcode the six marketing labels as a static primary nav array.
  assert.equal(/const\s+PRIMARY_NAV\s*=\s*\[/.test(navbar), false);
  assert.equal(navbar.includes("['Home', 'Browse Talent', 'Find Jobs', 'Community', 'Messages', 'Notifications']"), false);
  assert.equal(navbar.includes('"Home", "Browse Talent", "Find Jobs"'), false);
});

test('CMS labels icons routes and visibility are preserved for dynamic items', () => {
  assert.match(navbar, /item\.label/);
  assert.match(navbar, /item\.icon/);
  assert.match(navbar, /resolveUrl\(item\)/);
  assert.match(navbar, /isVisibleToRole\(item\)/);
  assert.match(navbar, /icon\.label/);
  assert.match(navbar, /icon\.displayType \|\| icon\.type \|\| icon\.actionType/);
  assert.match(navbar, /\(a\.sortOrder \|\| 0\) - \(b\.sortOrder \|\| 0\)/);
});

test('Messages and Notifications use shared HeaderPrimaryNavItem shell on desktop', () => {
  assert.match(navbar, /desktopStyle: true/);
  assert.match(navbar, /HeaderPrimaryNavItem/);
  assert.match(navbar, /data-header-activity=\{actionType\}/);
  assert.match(navbar, /showBadge=\{Boolean\(acShowBadges\)\}/);
  assert.match(navbar, /badgeCount=\{badgeCount\}/);
  assert.match(navbar, /HeaderMessagesPopover/);
  assert.match(navbar, /renderNotificationsDropdown/);
});

test('three-zone grid prevents Favorites from overlapping Notifications', () => {
  // Left absorbs shrink; center + right are content-sized; right never crushed.
  assert.match(headerCss, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+auto/);
  assert.match(headerCss, /\.scrolith-header-zone--center/);
  assert.match(headerCss, /\.scrolith-header-zone--right/);
  assert.match(headerCss, /min-width:\s*max-content/);
  assert.match(headerCss, /z-index:\s*2/);
  assert.match(navbar, /data-header-layout="three-zone-grid"/);
  assert.match(navbar, /data-header-zone="center"/);
  assert.match(navbar, /data-header-zone="right"/);
  assert.match(navbar, /data-testid="scrolith-header-utility-cluster"/);
  assert.match(navbar, /scrolith-header-utility-cluster/);
  // Center is content-sized (auto column), not a competing flex-grow sibling.
  assert.equal(navbar.includes('flex-[1.15]'), false);
  assert.equal(navbar.includes('flex-[1.2]'), false);
});

test('premium nav item dimensions and icon shell are enterprise-grade', () => {
  const itemH = Number(headerCss.match(/--scrolith-header-item-h:\s*(\d+)px/)?.[1] || 0);
  assert.ok(itemH >= 48 && itemH <= 56, `expected ~48–52px item height, got ${itemH}`);
  assert.match(headerCss, /\.scrolith-header-nav-item__icon/);
  assert.match(headerCss, /\.scrolith-header-nav-item__label/);
  assert.match(headerCss, /font-size:\s*0\.75rem/);
  assert.match(headerCss, /flex:\s*0\s+0\s+var\(--scrolith-header-nav-item-w\)/);
  assert.equal(headerCss.includes('hover:translate'), false);
  assert.equal(headerCss.includes('transform: translate'), false);
});

test('search compresses before navigation collision at compact desktop', () => {
  assert.match(headerCss, /--scrolith-header-search-max:\s*260px/);
  assert.match(headerCss, /@media \(min-width: 1024px\) and \(max-width: 1279px\)/);
  assert.match(headerCss, /max-width: min\(200px, 20vw\)/);
  // Utility labels only at 2xl+ (profile/fav/cart text collapse before nav hide).
  assert.match(navbar, /hidden 2xl:inline">Favorites/);
  assert.match(navbar, /hidden max-w-\[7\.5rem\] truncate text-sm font-semibold text-slate-800 2xl:block/);
});

test('nav items do not use unsafe negative margins that cause overlap', () => {
  assert.equal(/margin-left:\s*-/.test(headerCss), false);
  assert.equal(/margin-right:\s*-/.test(headerCss), false);
  assert.equal(navbar.includes('-ml-'), false);
  assert.equal(navbar.includes('-mr-'), false);
});

test('badge formatter covers 1/9/10/25/99/999 without parent width dependency', () => {
  const cases: Array<[number, string]> = [
    [1, '1'],
    [9, '9'],
    [10, '10'],
    [25, '25'],
    [99, '99'],
    [999, '99+'],
    [0, ''],
    [-3, '']
  ];
  for (const [n, expected] of cases) {
    assert.equal(formatMessagingBadgeCount(n), expected, `count ${n}`);
  }
  // Fixed badge footprint tokens
  assert.match(headerCss, /--scrolith-header-badge-w:\s*1\.35rem/);
  assert.match(headerCss, /width:\s*var\(--scrolith-header-badge-w\)/);
  assert.match(headerCss, /min-width:\s*var\(--scrolith-header-badge-w\)/);
  assert.match(headerCss, /max-width:\s*var\(--scrolith-header-badge-w\)/);
});

test('long CMS/i18n labels truncate inside fixed-width nav items', () => {
  assert.match(headerCss, /--scrolith-header-nav-item-w:\s*4\.95rem/);
  assert.match(headerCss, /width:\s*var\(--scrolith-header-nav-item-w\)/);
  assert.match(headerCss, /flex:\s*0\s+0\s+var\(--scrolith-header-nav-item-w\)/);
  assert.match(headerCss, /\.scrolith-header-nav-item__label/);
  assert.match(headerCss, /text-overflow:\s*ellipsis/);
  assert.match(headerCss, /white-space:\s*nowrap/);
  // Full label remains available via title tooltip on shell
  assert.match(navItemSrc, /title: title \|\| label/);
});

test('compact desktop narrows fixed nav width before hiding CMS items', () => {
  assert.match(headerCss, /@media \(min-width: 1024px\) and \(max-width: 1279px\)/);
  assert.match(headerCss, /--scrolith-header-nav-item-w:\s*3\.85rem/);
  assert.match(headerCss, /max-width: min\(200px, 20vw\)/);
});
