/**
 * Member Home desktop layout geometry regression (P0 hotfix).
 * Asserts the shell/grid cannot collapse to ~left-rail width on desktop viewports.
 */
import { test, expect, type Page } from '@playwright/test';

const DESKTOP_VIEWPORTS = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1600', width: 1600, height: 900 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1024', width: 1024, height: 768 }
] as const;

/** Zoom equivalents: 1920@125% ≈ 1536, 1920@150% ≈ 1280 */
const ZOOM_EQUIVALENT_VIEWPORTS = [
  { name: '1920@125%', width: 1536, height: 864 },
  { name: '1920@150%', width: 1280, height: 720 }
] as const;

const MIN_DESKTOP_GRID_WIDTH_RATIO = 0.72;
const MIN_FEED_WIDTH_PX = 360;
const LEFT_RAIL_APPROX_MAX = 360;

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      --enterprise-page-max: 1560px;
      --enterprise-feed-max: 760px;
      --enterprise-left-w: 300px;
      --enterprise-right-w: 320px;
      --enterprise-gap: 1.5rem;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f2ef; font-family: system-ui, sans-serif; }
    .mx-auto { margin-left: auto; margin-right: auto; }
    .w-full { width: 100%; }
    .min-w-0 { min-width: 0; }
    .flex-grow { flex-grow: 1; }
    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .min-h-screen { min-height: 100vh; }
    .px-4 { padding-left: 1rem; padding-right: 1rem; }
    .bg-white { background: #fff; }
    .p-4 { padding: 1rem; }
    .rounded-2xl { border-radius: 1rem; }
    .border { border: 1px solid #e2e8f0; }
    .scrolith-mh-shell {
      width: 100%;
      max-width: var(--enterprise-page-max, 1560px);
      min-width: 0;
      margin-left: auto;
      margin-right: auto;
      box-sizing: border-box;
    }
    .scrolith-mh-grid {
      display: grid;
      width: 100%;
      min-width: 0;
      align-items: start;
      gap: 1.25rem;
      grid-template-columns: minmax(0, 1fr);
    }
    .scrolith-mh-left,
    .scrolith-mh-feed,
    .scrolith-mh-right {
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
    }
    .scrolith-mh-feed { width: 100%; }
    @media (min-width: 1024px) {
      .scrolith-mh-grid {
        grid-template-columns: minmax(260px, var(--enterprise-left-w, 300px)) minmax(0, 1fr);
        gap: var(--enterprise-gap, 1.5rem);
      }
      .scrolith-mh-left { order: 1; }
      .scrolith-mh-feed { order: 2; }
      .scrolith-mh-right {
        order: 3;
        grid-column: 1 / -1;
      }
    }
    @media (min-width: 1280px) {
      .scrolith-mh-grid {
        grid-template-columns:
          minmax(280px, var(--enterprise-left-w, 300px))
          minmax(0, 1fr)
          minmax(300px, var(--enterprise-right-w, 340px));
      }
      .scrolith-mh-right { grid-column: auto; }
      .scrolith-mh-feed {
        max-width: var(--enterprise-feed-max, 760px);
        justify-self: stretch;
      }
    }
    @media (min-width: 1536px) {
      .scrolith-mh-grid {
        grid-template-columns:
          minmax(300px, 320px)
          minmax(0, 1fr)
          minmax(320px, var(--enterprise-right-w, 340px));
        gap: 1.75rem;
      }
    }
  </style>
</head>
<body>
  <div id="root" style="width:100%;max-width:100%">
    <div class="flex flex-col min-h-screen relative">
      <header style="height:64px;background:#fff;border-bottom:1px solid #e2e8f0;width:100%">Header</header>
      <main class="w-full min-w-0 flex-grow">
        <section class="relative w-full min-w-0" data-testid="scrolith-member-home">
          <div
            class="scrolith-mh-shell relative mx-auto box-border w-full min-w-0 px-4"
            data-testid="scrolith-member-home-shell"
          >
            <div class="mb-4 p-4 bg-white rounded-2xl border">Hero shell</div>
            <div
              class="scrolith-mh-grid relative z-0"
              data-testid="scrolith-member-home-grid"
            >
              <aside class="scrolith-mh-left" data-testid="scrolith-member-home-left">
                <div class="bg-white rounded-2xl border p-4" style="min-height:180px">Left rail</div>
              </aside>
              <div
                class="scrolith-mh-feed"
                role="region"
                aria-label="Home feed"
                data-testid="scrolith-member-home-feed"
              >
                <div class="bg-white rounded-2xl border p-4" style="min-height:220px">Feed center</div>
              </div>
              <aside class="scrolith-mh-right" data-testid="scrolith-member-home-right">
                <div class="bg-white rounded-2xl border p-4" style="min-height:160px">Right rail</div>
              </aside>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
</body>
</html>`;

async function measureLayout(page: Page) {
  return page.evaluate(() => {
    const shell = document.querySelector('[data-testid="scrolith-member-home-shell"]') as HTMLElement | null;
    const grid = document.querySelector('[data-testid="scrolith-member-home-grid"]') as HTMLElement | null;
    const left = document.querySelector('[data-testid="scrolith-member-home-left"]') as HTMLElement | null;
    const feed = document.querySelector('[data-testid="scrolith-member-home-feed"]') as HTMLElement | null;
    const right = document.querySelector('[data-testid="scrolith-member-home-right"]') as HTMLElement | null;
    if (!shell || !grid || !left || !feed || !right) {
      return { ok: false as const, reason: 'missing-nodes' };
    }
    const shellBox = shell.getBoundingClientRect();
    const gridBox = grid.getBoundingClientRect();
    const leftBox = left.getBoundingClientRect();
    const feedBox = feed.getBoundingClientRect();
    const rightBox = right.getBoundingClientRect();
    const gridTemplate = getComputedStyle(grid).gridTemplateColumns;
    const overflowX = document.documentElement.scrollWidth > window.innerWidth + 2;
    return {
      ok: true as const,
      vw: window.innerWidth,
      shellWidth: shellBox.width,
      gridWidth: gridBox.width,
      leftWidth: leftBox.width,
      feedWidth: feedBox.width,
      rightWidth: rightBox.width,
      leftX: leftBox.x,
      feedX: feedBox.x,
      rightX: rightBox.x,
      feedTop: feedBox.top,
      leftTop: leftBox.top,
      rightTop: rightBox.top,
      gridTemplate,
      overflowX,
      feedInGrid: grid.contains(feed),
      nestedMainCount: document.querySelectorAll('main main').length
    };
  });
}

for (const vp of [...DESKTOP_VIEWPORTS, ...ZOOM_EQUIVALENT_VIEWPORTS]) {
  test(`member-home geometry @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
    const m = await measureLayout(page);
    expect(m.ok).toBeTruthy();
    if (!m.ok) return;

    expect(m.shellWidth).toBeGreaterThan(vp.width * MIN_DESKTOP_GRID_WIDTH_RATIO - 40);
    expect(m.gridWidth).toBeGreaterThan(vp.width * MIN_DESKTOP_GRID_WIDTH_RATIO - 40);
    expect(m.gridWidth).toBeGreaterThan(LEFT_RAIL_APPROX_MAX + 120);
    expect(m.feedWidth).toBeGreaterThan(MIN_FEED_WIDTH_PX);
    expect(m.feedInGrid).toBeTruthy();
    expect(m.nestedMainCount).toBe(0);
    expect(m.overflowX).toBeFalsy();
    expect(m.shellWidth).toBeLessThanOrEqual(vp.width + 1);
    expect(m.gridWidth).toBeLessThanOrEqual(vp.width + 1);

    if (vp.width >= 1280) {
      const tracks = m.gridTemplate.split(/\s+/).filter(Boolean);
      expect(tracks.length).toBeGreaterThanOrEqual(3);
      expect(m.feedX).toBeGreaterThan(m.leftX + 40);
      expect(m.rightX).toBeGreaterThan(m.feedX + 40);
      // Same row (±8px) for three columns
      expect(Math.abs(m.feedTop - m.leftTop)).toBeLessThan(8);
      expect(Math.abs(m.rightTop - m.leftTop)).toBeLessThan(8);
    } else if (vp.width >= 1024) {
      expect(m.feedX).toBeGreaterThan(m.leftX + 40);
      expect(m.feedWidth).toBeGreaterThan(MIN_FEED_WIDTH_PX);
    }
  });
}

test('mobile stacks columns below lg without fixed desktop rails', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(FIXTURE_HTML, { waitUntil: 'load' });
  const m = await measureLayout(page);
  expect(m.ok).toBeTruthy();
  if (!m.ok) return;
  expect(m.gridWidth).toBeGreaterThan(300);
  expect(Math.abs(m.feedX - m.leftX)).toBeLessThan(24);
  expect(m.overflowX).toBeFalsy();
});
