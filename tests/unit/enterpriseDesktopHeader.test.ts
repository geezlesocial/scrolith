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
const headerIndex = read('src/components/header/index.ts');

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
  assert.match(navbar, /CENTER: Primary navigation/);
  assert.match(navbar, /RIGHT: Utilities \+ account/);
  assert.match(navbar, /scrolith-header-search-shell/);
  assert.match(navbar, /size="header"/);
});

test('mobile/tablet bar remains a separate branch from desktop enterprise layout', () => {
  assert.match(navbar, /isDesktopNav \? \(/);
  assert.match(navbar, /Mobile \+ tablet bar \(structure preserved\)/);
  assert.match(navbar, /Search below bar: mobile\/tablet only/);
  assert.match(navbar, /min-width: 1024px/);
});

// ── Navigation ─────────────────────────────────────────────────────────────

test('desktop nav items use stable enterprise classes and aria-current', () => {
  assert.match(navbar, /scrolith-header-nav-item scrolith-desktop-nav-item/);
  assert.match(navbar, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(navbar, /scrolith-header-nav-item__marker/);
  assert.equal(navbar.includes('hover:-translate-y'), false);
  assert.equal(navbar.includes('hover:scale-'), false);
});

// ── Search ─────────────────────────────────────────────────────────────────

test('header search uses enterprise placeholder and debounced suggestions', () => {
  assert.match(navbar, /Search people, jobs, gigs, posts, pages, communities, or marketplace/);
  assert.match(searchInput, /DEFAULT_HEADER_PLACEHOLDER/);
  assert.match(searchInput, /setTimeout\(fetchSuggestions, 300\)/);
  assert.match(searchInput, /suggestionRequestSeqRef/);
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
  assert.match(navbar, /to="\/messages"/);
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
  assert.match(navbar, /url: "\/member-home"/);
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
  assert.match(navbar, /hidden xl:inline">Favorites/);
  assert.match(navbar, /hidden xl:inline">Cart/);
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
  assert.match(headerCss, /max-width: min\(280px, 28vw\)/);
  assert.match(headerCss, /@media \(min-width: 1280px\)/);
  assert.match(headerCss, /--scrolith-header-search-max-xl/);
});

// ── Accessibility ──────────────────────────────────────────────────────────

test('a11y: focus-visible rings, reduced motion, target-size tokens', () => {
  assert.match(headerCss, /:focus-visible/);
  assert.match(headerCss, /prefers-reduced-motion: reduce/);
  assert.match(headerCss, /--scrolith-header-item-h:\s*44px/);
  assert.match(navbar, /aria-expanded=\{/);
  assert.match(navbar, /aria-haspopup/);
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
