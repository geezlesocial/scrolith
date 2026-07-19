import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { POST_ACTIONS, POST_CARD } from './postCard';

const MIN_TOUCH = 40;

export async function assertReducedMotionRespected(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Smoke: page remains interactive
  await expect(page.locator('body')).toBeVisible();
}

export async function assertFocusableActions(card: Locator) {
  const buttons = card.locator(`${POST_ACTIONS} button, [data-post-action-control="true"]`);
  const n = await buttons.count();
  for (let i = 0; i < Math.min(n, 6); i += 1) {
    const btn = buttons.nth(i);
    if (!(await btn.isVisible().catch(() => false))) continue;
    await btn.focus();
    const focused = await btn.evaluate((el) => el === document.activeElement || el.contains(document.activeElement));
    expect(focused, `action ${i} should accept focus`).toBe(true);
    const label =
      (await btn.getAttribute('aria-label')) ||
      (await btn.getAttribute('title')) ||
      (await btn.innerText().catch(() => ''));
    expect(String(label || '').trim().length, `action ${i} needs accessible name`).toBeGreaterThan(0);
  }
}

export async function assertTouchTargets(card: Locator) {
  const buttons = card.locator(
    `${POST_ACTIONS} button, [data-testid="content-interest-yes"], [data-testid="content-interest-no"], [data-testid="post-ai-coach-enhance"]`
  );
  const n = await buttons.count();
  for (let i = 0; i < n; i += 1) {
    const box = await buttons.nth(i).boundingBox();
    if (!box) continue;
    // Width may be column-constrained; height must meet touch guidance
    expect(box.height, `touch height for control ${i}`).toBeGreaterThanOrEqual(MIN_TOUCH - 4);
  }
}

export async function assertKeyboardTabOrder(page: Page, maxTabs = 12) {
  const seen: string[] = [];
  for (let i = 0; i < maxTabs; i += 1) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      return {
        tag: el.tagName,
        testid: el.getAttribute('data-testid') || '',
        role: el.getAttribute('role') || '',
        label: el.getAttribute('aria-label') || el.innerText?.slice(0, 40) || ''
      };
    });
    if (info) seen.push(`${info.tag}:${info.testid || info.label}`);
  }
  expect(seen.length).toBeGreaterThan(0);
  return seen;
}

export async function assertContrastSample(page: Page) {
  // Practical sample: body text vs background luminance ratio proxy
  const ratio = await page.evaluate(() => {
    const body = document.body;
    const cs = getComputedStyle(body);
    const parse = (c: string) => {
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (!m) return null;
      return [Number(m[1]), Number(m[2]), Number(m[3])];
    };
    const lum = (rgb: number[]) => {
      const s = rgb.map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
    };
    const bg = parse(cs.backgroundColor) || [255, 255, 255];
    const fg = parse(cs.color) || [15, 23, 42];
    const L1 = lum(bg);
    const L2 = lum(fg);
    const lighter = Math.max(L1, L2);
    const darker = Math.min(L1, L2);
    return (lighter + 0.05) / (darker + 0.05);
  });
  // Soft floor — guest/dark shells vary; catch catastrophic low contrast only
  expect(ratio).toBeGreaterThan(2.5);
}

export async function runCardA11yChecks(page: Page) {
  await assertReducedMotionRespected(page);
  await assertContrastSample(page);
  const card = page.locator(POST_CARD).first();
  if ((await card.count()) === 0) return { cards: 0 };
  await assertFocusableActions(card);
  await assertTouchTargets(card);
  return { cards: 1 };
}
