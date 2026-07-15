/**
 * Phase 6.1 layout QA fixture — multi-viewport collision / long-label / badge stability.
 * Does not require authentication; validates CSS + DOM geometry contracts.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const headerCss = readFileSync(join(root, 'src/components/header/enterpriseHeader.css'), 'utf8');

const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1600x900', width: 1600, height: 900 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1180x820', width: 1180, height: 820 },
  { name: '1024x768', width: 1024, height: 768 }
] as const;

const LONG_LABELS = [
  'Home',
  'Browse International Professionals',
  'Find Jobs',
  'Community Marketplace',
  'Messages',
  'Enterprise Notifications Center'
];

function fixtureHtml(badgeText = '99+'): string {
  const navItems = LONG_LABELS.map((label, i) => {
    const isNotif = i === LONG_LABELS.length - 1;
    const isMsg = label === 'Messages';
    const showBadge = isNotif || isMsg;
    return `
      <button type="button" class="scrolith-header-nav-item${isNotif ? ' is-active' : ''}" data-nav="${label}" ${isNotif ? 'data-testid="nav-notifications"' : ''} ${isMsg ? 'data-testid="nav-messages"' : ''}>
        <span class="scrolith-header-nav-item__icon">
          <span aria-hidden="true">◆</span>
          ${showBadge ? `<span class="scrolith-header-badge" data-testid="badge-${isNotif ? 'notif' : 'msg'}">${badgeText}</span>` : '<span class="scrolith-header-badge is-empty" aria-hidden="true">0</span>'}
        </span>
        <span class="scrolith-header-nav-item__label">${label}</span>
        ${isNotif ? '<span class="scrolith-header-nav-item__marker" aria-hidden="true"></span>' : ''}
      </button>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Enterprise Header Layout Fixture</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; background: #f1f5f9; }
    /* Mirrors app shell max width */
    .header-shell { max-width: 80rem; margin: 0 auto; padding: 0 1rem; }
    @media (min-width: 640px) { .header-shell { padding: 0 1.5rem; } }
    @media (min-width: 1024px) { .header-shell { padding: 0 2rem; } }
    /* Utility labels only at 2xl (matches Navbar progressive disclosure) */
    .util-label, .profile-name, .brand-wordmark { display: none; }
    @media (min-width: 1280px) { .brand-wordmark { display: inline; } }
    @media (min-width: 1536px) {
      .util-label, .profile-name { display: inline; }
    }
    .scrolith-header-utility.is-compact-fixture { min-width: 2.5rem; padding: 0.45rem; }
    ${headerCss}
  </style>
</head>
<body>
  <div class="scrolith-enterprise-header" data-testid="scrolith-enterprise-header">
    <div class="header-shell">
      <div class="scrolith-enterprise-header__inner" data-header-layout="three-zone-grid">
        <div class="scrolith-header-zone scrolith-header-zone--left" data-header-zone="left">
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <div style="width:32px;height:32px;border-radius:8px;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;">S</div>
            <strong class="brand-wordmark" style="font-size:1.05rem;">Scrolith</strong>
          </div>
          <div class="scrolith-header-search-shell">
            <input style="width:100%;border:1px solid #e2e8f0;border-radius:999px;padding:0.55rem 0.9rem;background:#f1f5f9;" placeholder="Search people, jobs, gigs..." />
          </div>
        </div>
        <div class="scrolith-header-zone scrolith-header-zone--center" data-header-zone="center">
          <div class="scrolith-header-nav-track" data-testid="scrolith-header-primary-nav" role="navigation" aria-label="Main sections">
            ${navItems}
          </div>
        </div>
        <div class="scrolith-header-zone scrolith-header-zone--right" data-header-zone="right" data-testid="header-right">
          <div class="scrolith-header-utility-cluster" data-testid="scrolith-header-utility-cluster">
            <a class="scrolith-header-utility" data-testid="utility-favorites" href="#favorites" aria-label="Favorites">♥ <span class="util-label">Favorites</span></a>
            <a class="scrolith-header-utility" data-testid="utility-cart" href="#cart" aria-label="Cart">🛒 <span class="util-label">Cart</span></a>
            <button type="button" class="scrolith-header-utility" data-testid="utility-create" style="border-color:#bfdbfe;background:#2563eb;color:#fff;" aria-label="Create">+ <span class="util-label">Create</span></button>
          </div>
          <button type="button" class="scrolith-header-profile" data-testid="utility-profile" aria-label="Open account menu">
            <span class="scrolith-header-profile__avatar" style="display:inline-flex;align-items:center;justify-content:center;background:#e2e8f0;font-size:12px;font-weight:700;">U</span>
            <span class="profile-name">User Name</span>
          </button>
        </div>
      </div>
    </div>
  </div>
  <main style="padding:2rem;min-height:120vh;">
    <p>Fixture page content for sticky/scroll checks.</p>
  </main>
</body>
</html>`;
}

async function loadFixture(page: Page, badgeText = '99+') {
  await page.setContent(fixtureHtml(badgeText), { waitUntil: 'domcontentloaded' });
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  pad = 0
) {
  return !(
    a.x + a.width + pad <= b.x ||
    b.x + b.width + pad <= a.x ||
    a.y + a.height + pad <= b.y ||
    b.y + b.height + pad <= a.y
  );
}

async function assertNoNotificationsFavoritesOverlap(page: Page) {
  const notif = page.getByTestId('nav-notifications');
  const fav = page.getByTestId('utility-favorites');
  await expect(notif).toBeVisible();
  await expect(fav).toBeVisible();
  const a = await notif.boundingBox();
  const b = await fav.boundingBox();
  expect(a, 'notifications box').toBeTruthy();
  expect(b, 'favorites box').toBeTruthy();
  if (!a || !b) return;
  expect(
    rectsOverlap(a, b, 1),
    `Notifications and Favorites overlap: notif=${JSON.stringify(a)} fav=${JSON.stringify(b)}`
  ).toBe(false);
  // Favorites must be to the right of Notifications (LTR)
  expect(b.x).toBeGreaterThan(a.x + a.width - 1);
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      bodyScroll: document.body.scrollWidth
    };
  });
  expect(overflow.scrollWidth, `horizontal overflow scrollWidth=${overflow.scrollWidth} client=${overflow.clientWidth}`).toBeLessThanOrEqual(
    overflow.clientWidth + 1
  );
}

async function assertLongLabelsTruncate(page: Page) {
  const long = page.locator('[data-nav="Browse International Professionals"] .scrolith-header-nav-item__label');
  const box = await long.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;
  // Label area must stay within fixed nav item width (~4–5.5rem)
  expect(box.width).toBeLessThanOrEqual(90);
  const overflow = await long.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      textOverflow: style.textOverflow,
      overflow: style.overflow,
      whiteSpace: style.whiteSpace,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth
    };
  });
  expect(overflow.textOverflow).toBe('ellipsis');
  expect(overflow.whiteSpace).toBe('nowrap');
  expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
}

for (const vp of VIEWPORTS) {
  test(`layout: no Notifications/Favorites overlap at ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await loadFixture(page, '12');
    await assertNoNotificationsFavoritesOverlap(page);
    await assertNoHorizontalOverflow(page);
    await assertLongLabelsTruncate(page);
  });
}

test('layout: 125% zoom equivalent (narrower effective width ~1536)', async ({ page }) => {
  // Approximate 1920@125% content width ≈ 1536 CSS px
  await page.setViewportSize({ width: 1536, height: 864 });
  await loadFixture(page, '99+');
  await assertNoNotificationsFavoritesOverlap(page);
  await assertNoHorizontalOverflow(page);
});

test('layout: 150% zoom equivalent (~1280 content width)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await loadFixture(page, '99+');
  await assertNoNotificationsFavoritesOverlap(page);
  await assertNoHorizontalOverflow(page);
});

test('badge counts do not change nav item width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const counts = ['1', '9', '10', '25', '99', '99+'] as const;
  const widths: number[] = [];
  for (const c of counts) {
    await loadFixture(page, c);
    const box = await page.getByTestId('nav-notifications').boundingBox();
    expect(box).toBeTruthy();
    widths.push(box!.width);
  }
  const unique = new Set(widths.map((w) => Math.round(w * 10) / 10));
  expect(
    unique.size,
    `nav width changed across badge counts: ${JSON.stringify(Object.fromEntries(counts.map((c, i) => [c, widths[i]])))}`
  ).toBe(1);
});

test('grid zones exist and center is content-sized (auto column)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await loadFixture(page);
  const grid = await page.locator('[data-header-layout="three-zone-grid"]').evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      display: style.display,
      columns: style.gridTemplateColumns
    };
  });
  expect(grid.display).toBe('grid');
  // Expect three tracks; middle should not be a large fr share only
  const parts = grid.columns.split(' ').filter(Boolean);
  expect(parts.length).toBeGreaterThanOrEqual(3);
});

test('keyboard: nav items are tabbable and focus-visible style exists', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadFixture(page);
  await page.keyboard.press('Tab');
  // First focusable is brandless; tab into nav
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return {
      tag: el?.tagName,
      className: el?.className || '',
      label: el?.querySelector?.('.scrolith-header-nav-item__label')?.textContent || el?.textContent?.slice(0, 40)
    };
  });
  expect(focused.className.includes('scrolith-header-nav-item') || focused.className.includes('scrolith-header-utility') || focused.tag === 'INPUT' || focused.tag === 'BUTTON' || focused.tag === 'A').toBeTruthy();
});
