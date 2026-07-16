/**
 * Composition regression for authenticated Member Home desktop dashboard.
 * Validates structure after layout CSS loads (fixture HTML + production CSS contract).
 *
 * Full authenticated E2E against Cloud Run is covered operationally; these tests
 * lock the CSS + DOM contract so right-rail full-row stacking cannot regress.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const indexCss = readFileSync(join(here, '../../src/index.css'), 'utf8');

/** Extract the Member Home layout CSS block for fixture pages. */
function memberHomeLayoutCss(): string {
  const start = indexCss.indexOf('.scrolith-mh-shell');
  const end = indexCss.indexOf('/* BASE STYLES */');
  if (start < 0 || end < 0) {
    throw new Error('Could not locate member-home layout CSS block in index.css');
  }
  return indexCss.slice(start, end);
}

function fixtureHtml(): string {
  const css = memberHomeLayoutCss();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; background: #f3f2ef; }
    :root {
      --enterprise-page-max: 1560px;
      --enterprise-left-w: 300px;
      --enterprise-right-w: 340px;
      --enterprise-gap: 1.5rem;
      --enterprise-sticky-top: 6rem;
    }
    ${css}
    .panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 1rem; padding: 1rem; margin-bottom: 0.75rem; }
  </style>
</head>
<body>
  <section data-testid="scrolith-member-home" class="scrolith-member-home">
    <div class="scrolith-mh-shell" data-testid="scrolith-member-home-shell">
      <header class="panel" data-testid="mh-hero">Hero / search</header>
      <div class="scrolith-mh-grid" data-testid="scrolith-member-home-grid">
        <aside class="scrolith-mh-left" data-testid="scrolith-member-home-left" aria-label="Profile and shortcuts">
          <div class="panel" style="height: 420px">Left profile + quick actions</div>
        </aside>
        <div class="scrolith-mh-feed" data-testid="scrolith-member-home-feed" role="region" aria-label="Home feed">
          <div class="panel" data-testid="mh-stories">Stories / composer</div>
          <div class="panel" data-testid="mh-discovery" style="height: 360px">Member Home Discovery Board</div>
          <div class="panel" data-testid="mh-feed-stream" style="height: 900px">Primary feed stream</div>
        </div>
        <aside class="scrolith-mh-right" data-testid="scrolith-member-home-right" aria-label="Recommendations and insights">
          <div class="panel" data-testid="mh-insights" style="height: 520px">Professional Opportunity Hub</div>
          <div class="panel" data-testid="mh-messages">Recent messages</div>
          <div class="panel" data-testid="mh-reco">Pages to follow</div>
        </aside>
      </div>
    </div>
  </section>
  <div data-testid="messaging-dock" style="position:fixed;right:16px;bottom:16px;background:#0f172a;color:#fff;padding:8px 12px;border-radius:8px">Messaging</div>
</body>
</html>`;
}

async function openFixture(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.setContent(fixtureHtml(), { waitUntil: 'load' });
}

async function measureComposition(page: Page) {
  return page.evaluate(() => {
    const grid = document.querySelector('[data-testid="scrolith-member-home-grid"]') as HTMLElement | null;
    const left = document.querySelector('[data-testid="scrolith-member-home-left"]') as HTMLElement | null;
    const feed = document.querySelector('[data-testid="scrolith-member-home-feed"]') as HTMLElement | null;
    const right = document.querySelector('[data-testid="scrolith-member-home-right"]') as HTMLElement | null;
    const shells = document.querySelectorAll('[data-testid="scrolith-member-home-shell"]');
    const grids = document.querySelectorAll('[data-testid="scrolith-member-home-grid"]');
    if (!grid || !left || !feed || !right) {
      return { ok: false as const, reason: 'missing columns' };
    }
    const gcs = getComputedStyle(grid);
    const children = Array.from(grid.children).map((el) => (el as HTMLElement).dataset.testid);
    const rect = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
    };
    const leftR = rect(left);
    const feedR = rect(feed);
    const rightR = rect(right);
    const sameRow = Math.abs(leftR.top - feedR.top) < 40 && Math.abs(feedR.top - rightR.top) < 40;
    const leftThenFeed = leftR.left < feedR.left;
    const feedThenRight = feedR.left < rightR.left;
    const rightBesideFeed = rightR.left >= feedR.left + feedR.width - 8;
    const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const pageHeight = document.documentElement.scrollHeight;
    return {
      ok: true as const,
      shellCount: shells.length,
      gridCount: grids.length,
      directChildren: children,
      gridTemplateColumns: gcs.gridTemplateColumns,
      gridTemplateAreas: gcs.gridTemplateAreas,
      left: leftR,
      feed: feedR,
      right: rightR,
      sameRow,
      leftThenFeed,
      feedThenRight,
      rightBesideFeed,
      overflowX,
      pageHeight,
      viewport: { w: window.innerWidth, h: window.innerHeight }
    };
  });
}

const DESKTOP_VIEWPORTS = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1600', width: 1600, height: 900 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1280', width: 1280, height: 800 },
  { name: '125pct', width: 1536, height: 864 },
  { name: '150pct', width: 1280, height: 720 },
  { name: 'owner-laptop', width: 1366, height: 768 },
  { name: 'lg-min', width: 1024, height: 768 }
];

for (const vp of DESKTOP_VIEWPORTS) {
  test(`desktop composition ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
    await openFixture(page, vp.width, vp.height);
    const m = await measureComposition(page);
    expect(m.ok).toBeTruthy();
    if (!m.ok) return;

    expect(m.shellCount).toBe(1);
    expect(m.gridCount).toBe(1);
    expect(m.directChildren).toEqual([
      'scrolith-member-home-left',
      'scrolith-member-home-feed',
      'scrolith-member-home-right'
    ]);
    expect(m.gridTemplateAreas.replace(/\s+/g, ' ').trim()).toContain('left center right');
    expect(m.sameRow).toBeTruthy();
    expect(m.leftThenFeed).toBeTruthy();
    expect(m.feedThenRight).toBeTruthy();
    expect(m.rightBesideFeed || m.right.left > m.feed.left).toBeTruthy();
    // Right rail must start near the top of the page (not after a multi-thousand-px feed)
    expect(m.right.top).toBeLessThan(200);
    expect(m.left.top).toBeLessThan(200);
    expect(m.feed.top).toBeLessThan(200);
    expect(m.overflowX).toBeFalsy();
    // Page height must not explode to feed+right stacked heights
    // Feed ~900+360+stories, rails sticky; stacked failure would exceed ~2500 easily with both
    expect(m.pageHeight).toBeLessThan(2200);
    // Three tracks present in computed columns
    const tracks = m.gridTemplateColumns.split(' ').filter(Boolean);
    expect(tracks.length).toBeGreaterThanOrEqual(3);

    await page.screenshot({
      path: join(here, `../../playwright-results/mh-composition-${vp.name}.png`),
      fullPage: true
    });
  });
}

test('mobile stack does not force three columns under 1024', async ({ page }) => {
  await openFixture(page, 390, 844);
  const m = await measureComposition(page);
  expect(m.ok).toBeTruthy();
  if (!m.ok) return;
  // Single column areas — right is not beside feed
  expect(m.sameRow).toBeFalsy();
  expect(m.gridTemplateAreas).toMatch(/center/);
});
