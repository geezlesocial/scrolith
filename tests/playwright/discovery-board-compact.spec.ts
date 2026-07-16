/**
 * Geometry + structure contracts for the compact Discovery Board.
 * Runs against a static fixture so browser projects do not need a live app server.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const boardSource = readFileSync(
  join(here, '../../src/components/member-home/MemberHomeHighlightsBoard.tsx'),
  'utf8'
);

const fixtureHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-100 p-4">
  <div class="mx-auto max-w-[720px]">
    <section
      class="overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5"
      data-testid="scrolith-member-home-discovery-board"
      aria-labelledby="disc-h"
    >
      <header
        class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
        data-testid="scrolith-discovery-header"
      >
        <div>
          <p class="text-[13px] font-semibold uppercase tracking-[0.14em] text-slate-500">Discover</p>
          <h2 id="disc-h" class="mt-1 text-lg font-semibold text-slate-900 sm:text-xl">Member Home Discovery Board</h2>
          <p class="mt-1 max-w-2xl text-sm text-slate-600">Coach, live sessions, opportunities, network, and campaigns.</p>
        </div>
        <div class="flex flex-wrap gap-1.5" data-testid="scrolith-discovery-metrics" aria-label="Discovery metrics">
          <div class="rounded-full border bg-slate-50 px-2.5 py-1 text-[11px] font-semibold">Posts · 12</div>
          <div class="rounded-full border bg-slate-50 px-2.5 py-1 text-[11px] font-semibold">Series · 3</div>
          <div class="rounded-full border bg-slate-50 px-2.5 py-1 text-[11px] font-semibold">Network · 8</div>
        </div>
      </header>
      <div
        class="mt-4 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50/80 via-white to-white p-3.5 sm:p-4"
        data-testid="scrolith-discovery-coach-card"
      >
        <button type="button" class="flex w-full flex-col items-stretch gap-3 text-left sm:flex-row sm:items-center sm:gap-4" aria-label="Open coach">
          <div class="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
            <div
              class="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-violet-200 bg-white sm:h-14 sm:w-14"
              data-testid="scrolith-discovery-coach-mark"
            >
              <img src="/logo.png" alt="Scrolitha" width="36" height="36" class="h-8 w-8 object-contain sm:h-9 sm:w-9" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-[10px] font-semibold uppercase tracking-wide text-violet-600">Scrolitha coach · AI</p>
              <h3 class="mt-1 text-base font-semibold text-slate-900">Improve posts, gigs, and briefs faster</h3>
              <p class="mt-0.5 text-sm text-slate-600">Polish drafts before you publish, package, or match.</p>
              <div class="mt-2 flex flex-wrap gap-1.5" aria-label="Coach capabilities">
                <span class="rounded-full border px-2 py-0.5 text-[11px]">Posts</span>
                <span class="rounded-full border px-2 py-0.5 text-[11px]">Gigs</span>
                <span class="rounded-full border px-2 py-0.5 text-[11px]">Briefs</span>
              </div>
            </div>
          </div>
          <span class="inline-flex w-full shrink-0 items-center justify-center rounded-full bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white sm:w-auto">Open coach</span>
        </button>
      </div>
      <div
        class="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3"
        data-testid="scrolith-discovery-module-grid"
      >
        <div class="rounded-2xl border p-3" data-testid="scrolith-discovery-module-card">
          <button type="button" class="w-full text-left" aria-label="Browse jobs">
            <h3 class="text-sm font-semibold">Featured job</h3>
            <p class="text-xs text-slate-600">Employer · Category</p>
            <span class="mt-2 inline-block text-xs font-semibold">Browse jobs</span>
          </button>
        </div>
        <div class="rounded-2xl border p-3" data-testid="scrolith-discovery-module-card">
          <button type="button" class="w-full text-left" aria-label="Browse gigs">
            <h3 class="text-sm font-semibold">Featured gig</h3>
            <p class="text-xs text-slate-600">Freelancer · Service</p>
            <span class="mt-2 inline-block text-xs font-semibold">Browse gigs</span>
          </button>
        </div>
        <div class="rounded-2xl border p-3" data-testid="scrolith-discovery-module-card">
          <button type="button" class="w-full text-left" aria-label="View profile">
            <h3 class="text-sm font-semibold">Grow network</h3>
            <p class="text-xs text-slate-600">People · pages</p>
            <span class="mt-2 inline-block text-xs font-semibold">View profile</span>
          </button>
        </div>
      </div>
    </section>
  </div>
</body>
</html>`;

const viewports = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1600', width: 1600, height: 900 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1366', width: 1366, height: 768 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1024', width: 1024, height: 768 },
  { name: '125pct', width: 1536, height: 864 },
  { name: '150pct', width: 1280, height: 720 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'mobile', width: 390, height: 844 }
] as const;

async function mountFixture(page: Page) {
  await page.setContent(fixtureHtml, { waitUntil: 'domcontentloaded' });
}

test.describe('source contracts (browser-agnostic)', () => {
  test('no oversized hero remains in board source', () => {
    expect(boardSource.includes('min-h-[13rem]')).toBe(false);
    expect(boardSource.includes('2xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]')).toBe(false);
    expect(boardSource).toMatch(/scrolith-discovery-coach-mark/);
    expect(boardSource).toMatch(/sm:h-14 sm:w-14/);
  });
});

for (const vp of viewports) {
  test(`compact discovery geometry @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await mountFixture(page);

    const board = page.getByTestId('scrolith-member-home-discovery-board');
    const coach = page.getByTestId('scrolith-discovery-coach-card');
    const mark = page.getByTestId('scrolith-discovery-coach-mark');
    const metrics = page.getByTestId('scrolith-discovery-metrics');
    const grid = page.getByTestId('scrolith-discovery-module-grid');
    const cta = page.getByRole('button', { name: 'Open coach' });

    await expect(board).toBeVisible();
    await expect(page.getByTestId('scrolith-discovery-header')).toBeVisible();
    await expect(metrics).toBeVisible();
    await expect(coach).toBeVisible();
    await expect(mark).toBeVisible();
    await expect(cta).toBeVisible();
    await expect(grid).toBeVisible();
    await expect(page.getByTestId('scrolith-discovery-module-card')).toHaveCount(3);

    const markBox = await mark.boundingBox();
    expect(markBox).toBeTruthy();
    // Approved compact mark: base 48px, sm+ 56px — allow 2px raster slack
    expect(markBox!.width).toBeLessThanOrEqual(58);
    expect(markBox!.height).toBeLessThanOrEqual(58);
    expect(markBox!.width).toBeGreaterThanOrEqual(40);

    const coachBox = await coach.boundingBox();
    expect(coachBox).toBeTruthy();
    // Mobile stacks CTA under content (~240–280px); desktop stays tighter.
    const coachHeightCap = vp.width < 640 ? 300 : 220;
    expect(coachBox!.height).toBeLessThanOrEqual(coachHeightCap);

    const boardBox = await board.boundingBox();
    expect(boardBox).toBeTruthy();
    // Compact board should stay well under legacy ~791px fixture height
    const boardHeightCap = vp.width < 640 ? 720 : 560;
    expect(boardBox!.height).toBeLessThanOrEqual(boardHeightCap);

    const overflowX = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="scrolith-member-home-discovery-board"]') as HTMLElement | null;
      if (!el) return true;
      return el.scrollWidth > el.clientWidth + 1 || document.documentElement.scrollWidth > window.innerWidth + 2;
    });
    expect(overflowX).toBe(false);

    // Keyboard: Open coach is focusable
    await cta.focus();
    await expect(cta).toBeFocused();
  });
}
