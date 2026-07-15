/**
 * Phase 6.2.1 — adaptive dock placement geometry (no intersection with modal).
 */
import { test, expect } from '@playwright/test';
import {
  MESSAGING_DOCK_COLLAPSED_HEIGHT_PX,
  MESSAGING_DOCK_COLLAPSED_MAX_WIDTH_PX,
  MESSAGING_DOCK_COMPACT_WIDTH_PX,
  MESSAGING_DOCK_EDGE_OFFSET_PX,
  MESSAGING_DOCK_ICON_SIZE_PX,
  resolveMessagingDockPlacement,
  type MessagingDockRect
} from '../../src/services/messagingSurfaces.ts';

const VIEWPORTS = [
  { w: 1920, h: 1080 },
  { w: 1600, h: 900 },
  { w: 1440, h: 900 },
  { w: 1366, h: 768 },
  { w: 1280, h: 800 },
  { w: 1180, h: 820 },
  { w: 1024, h: 768 }
] as const;

function placementToStyle(p: ReturnType<typeof resolveMessagingDockPlacement>) {
  if (p.mode === 'hidden') return '';
  const isIcon = p.mode === 'icon-only';
  return `
    <div data-testid="scrolith-desktop-messaging-dock" data-dock-mode="${p.mode}"
      style="pointer-events:none;position:fixed;bottom:${p.bottom}px;right:${p.right}px;z-index:35;">
      <button type="button" data-testid="scrolith-messaging-dock-collapsed"
        style="pointer-events:auto;display:flex;width:${p.width}px;height:${p.height}px;min-height:${p.height}px;align-items:center;${
          isIcon ? 'justify-content:center;' : 'gap:8px;padding:0 10px;'
        }border-radius:8px 8px 0 0;border:1px solid #e2e8f0;background:#0f172a;color:#fff;">
        <span style="width:28px;height:28px;border-radius:999px;background:#334155;position:relative;">
          <span data-testid="scrolith-messaging-dock-badge" style="position:absolute;top:-4px;right:-6px;display:inline-flex;height:16px;min-width:1.1rem;align-items:center;justify-content:center;border-radius:999px;background:#3b82f6;font-size:9px;font-weight:700;padding:0 4px;">3</span>
        </span>
        ${isIcon ? '' : '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;">Messaging</span>'}
      </button>
    </div>`;
}

function fixtureHtml(opts: {
  w: number;
  h: number;
  modal?: MessagingDockRect | null;
  forcePlacement?: ReturnType<typeof resolveMessagingDockPlacement>;
}) {
  const placement =
    opts.forcePlacement ||
    resolveMessagingDockPlacement({
      viewportWidth: opts.w,
      viewportHeight: opts.h,
      modal: opts.modal ?? null
    });

  const modalHtml = opts.modal
    ? `
    <div class="modal-backdrop" style="position:fixed;inset:0;z-index:85;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.45);">
      <div role="dialog" aria-modal="true" aria-label="Create a post"
        data-testid="composer-dialog"
        style="position:fixed;top:${opts.modal.top}px;left:${opts.modal.left}px;width:${opts.modal.width}px;height:${opts.modal.height}px;background:#fff;border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.25);display:flex;flex-direction:column;">
        <div style="flex:1;padding:16px;color:#94a3b8;">What do you want to talk about?</div>
        <div data-testid="composer-footer" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-top:1px solid #e2e8f0;gap:12px;">
          <div style="display:flex;gap:8px;">
            <button type="button" data-testid="composer-media">Media</button>
            <button type="button" data-testid="composer-camera">Camera</button>
          </div>
          <div style="display:flex;gap:8px;">
            <button type="button" data-testid="composer-cancel">Cancel</button>
            <button type="button" data-testid="composer-publish" style="background:#0f172a;color:#fff;border-radius:999px;padding:8px 16px;">Publish</button>
          </div>
        </div>
      </div>
    </div>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<style>html,body{margin:0;height:100%;font-family:system-ui,sans-serif;background:#f8fafc;}</style>
</head><body>
  <main style="min-height:100vh;padding:24px;">Member home fixture</main>
  ${modalHtml}
  ${placementToStyle(placement)}
</body></html>`;
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  gap = 0
) {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

function centeredModal(vw: number, vh: number, mw = 720, mh = 640): MessagingDockRect {
  const left = Math.round((vw - mw) / 2);
  const top = Math.round((vh - mh) / 2);
  return { top, left, right: left + mw, bottom: top + mh, width: mw, height: mh };
}

for (const vp of VIEWPORTS) {
  test(`normal dock compact footprint at ${vp.w}x${vp.h}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.setContent(fixtureHtml({ w: vp.w, h: vp.h }), { waitUntil: 'domcontentloaded' });
    const bar = page.getByTestId('scrolith-messaging-dock-collapsed');
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(box).toBeTruthy();
    if (!box) return;
    expect(box.width).toBeLessThanOrEqual(MESSAGING_DOCK_COLLAPSED_MAX_WIDTH_PX + 2);
    expect(Math.round(box.height)).toBeLessThanOrEqual(MESSAGING_DOCK_COLLAPSED_HEIGHT_PX + 2);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.w + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.h + 1);
  });
}

for (const vp of VIEWPORTS) {
  test(`dock does not intersect centered modal at ${vp.w}x${vp.h}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    const modal = centeredModal(vp.w, vp.h, Math.min(720, vp.w - 80), Math.min(640, vp.h - 80));
    await page.setContent(fixtureHtml({ w: vp.w, h: vp.h, modal }), { waitUntil: 'domcontentloaded' });
    const placement = resolveMessagingDockPlacement({
      viewportWidth: vp.w,
      viewportHeight: vp.h,
      modal
    });
    if (placement.mode === 'hidden') {
      await expect(page.getByTestId('scrolith-messaging-dock-collapsed')).toHaveCount(0);
      // Footer still clickable
      await expect(page.getByTestId('composer-publish')).toBeVisible();
      return;
    }
    const dock = await page.getByTestId('scrolith-messaging-dock-collapsed').boundingBox();
    const dialog = await page.getByTestId('composer-dialog').boundingBox();
    const footer = await page.getByTestId('composer-footer').boundingBox();
    expect(dock && dialog && footer).toBeTruthy();
    if (!dock || !dialog || !footer) return;
    expect(rectsOverlap(dock, dialog, 8)).toBe(false);
    expect(rectsOverlap(dock, footer, 8)).toBe(false);
    for (const id of ['composer-publish', 'composer-cancel', 'composer-media', 'composer-camera']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
  });
}

test('icon-only dimensions when forced', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const force = {
    mode: 'icon-only' as const,
    bottom: MESSAGING_DOCK_EDGE_OFFSET_PX,
    right: MESSAGING_DOCK_EDGE_OFFSET_PX,
    width: MESSAGING_DOCK_ICON_SIZE_PX,
    height: MESSAGING_DOCK_ICON_SIZE_PX
  };
  await page.setContent(fixtureHtml({ w: 1280, h: 800, forcePlacement: force }), {
    waitUntil: 'domcontentloaded'
  });
  const box = await page.getByTestId('scrolith-messaging-dock-collapsed').boundingBox();
  expect(box).toBeTruthy();
  expect(Math.round(box!.width)).toBe(MESSAGING_DOCK_ICON_SIZE_PX);
  expect(Math.round(box!.height)).toBe(MESSAGING_DOCK_ICON_SIZE_PX);
});

test('compact width token is used for compact mode', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const force = {
    mode: 'compact' as const,
    bottom: 16,
    right: 16,
    width: MESSAGING_DOCK_COMPACT_WIDTH_PX,
    height: 46
  };
  await page.setContent(fixtureHtml({ w: 1280, h: 800, forcePlacement: force }), {
    waitUntil: 'domcontentloaded'
  });
  const box = await page.getByTestId('scrolith-messaging-dock-collapsed').boundingBox();
  expect(box!.width).toBeLessThanOrEqual(MESSAGING_DOCK_COMPACT_WIDTH_PX + 1);
  expect(box!.width).toBeGreaterThanOrEqual(210);
});

test('125% and 150% zoom equivalents keep dock free of modal', async ({ page }) => {
  for (const w of [1536, 1280]) {
    await page.setViewportSize({ width: w, height: 800 });
    const modal = centeredModal(w, 800, 700, 620);
    await page.setContent(fixtureHtml({ w, h: 800, modal }), { waitUntil: 'domcontentloaded' });
    const placement = resolveMessagingDockPlacement({
      viewportWidth: w,
      viewportHeight: 800,
      modal
    });
    if (placement.mode === 'hidden') {
      await expect(page.getByTestId('composer-publish')).toBeVisible();
      continue;
    }
    const dock = await page.getByTestId('scrolith-messaging-dock-collapsed').boundingBox();
    const dialog = await page.getByTestId('composer-dialog').boundingBox();
    expect(dock && dialog).toBeTruthy();
    expect(rectsOverlap(dock!, dialog!, 8)).toBe(false);
  }
});
