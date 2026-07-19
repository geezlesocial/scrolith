import { test, expect } from '@playwright/test';
import { requireAuthOrSkip } from '../helpers/env';
import { CERT_ROUTES } from '../helpers/routes';
import {
  assertActionRowEqualColumns,
  assertLayoutNoProductOverflow,
  assertPostCardGeometry,
  assertPostCardNoOverflow,
  assertSurveyEqualButtons,
  assertTypographyScale,
  measureDocumentOverflowX,
  postCards,
  waitForFeed,
  AI_COACH
} from '../helpers/postCard';

/**
 * Runs under pixel-7, iphone-15, and mobile-390 projects from playwright.config.ts.
 */
test.describe('Mobile emulation — post card cert', () => {
  test.beforeEach(() => {
    requireAuthOrSkip(test);
  });

  test('mobile feed card spacing and controls', async ({ page }, testInfo) => {
    await page.goto(CERT_ROUTES.memberHome, { waitUntil: 'domcontentloaded' });
    await waitForFeed(page);

    const vp = page.viewportSize();
    testInfo.annotations.push({
      type: 'viewport',
      description: vp ? `${vp.width}x${vp.height}` : 'unknown'
    });

    const docOverflow = await measureDocumentOverflowX(page);
    testInfo.annotations.push({ type: 'documentOverflowX', description: String(docOverflow) });

    const cards = postCards(page);
    if ((await cards.count()) === 0) {
      test.skip(true, 'No post cards on mobile surface');
      return;
    }

    const card = cards.first();
    await assertPostCardGeometry(card);
    await assertTypographyScale(card);
    await assertActionRowEqualColumns(card);
    await assertSurveyEqualButtons(card);
    await assertPostCardNoOverflow(card);
    await assertLayoutNoProductOverflow(page, card);

    if ((await card.locator(AI_COACH).count()) > 0) {
      const coach = card.locator(AI_COACH);
      await expect(coach).toBeVisible();
      const box = await coach.boundingBox();
      expect(box?.height || 0).toBeGreaterThanOrEqual(64);
      const cta = card.locator('[data-testid="post-ai-coach-enhance"]');
      if ((await cta.count()) > 0) {
        const ctaBox = await cta.boundingBox();
        if (ctaBox && vp) {
          expect(ctaBox.x + ctaBox.width).toBeLessThanOrEqual(vp.width + 4);
        }
      }
    }

    const more = card.getByRole('button', { name: /more/i }).first();
    if ((await more.count()) > 0 && (await more.isVisible().catch(() => false))) {
      await more.click();
      await page.waitForTimeout(300);
      await assertPostCardNoOverflow(card);
      const less = card.getByRole('button', { name: /less/i }).first();
      if ((await less.count()) > 0) {
        await less.click();
      }
    }
  });
});
