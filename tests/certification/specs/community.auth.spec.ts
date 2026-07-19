import { test, expect } from '@playwright/test';
import { requireAuthOrSkip } from '../helpers/env';
import { CERT_ROUTES } from '../helpers/routes';
import {
  assertActionRowEqualColumns,
  assertDesignTokenOnPage,
  assertLayoutNoProductOverflow,
  assertPostCardGeometry,
  collectFeedInventory,
  postCards,
  waitForFeed,
  AI_COACH
} from '../helpers/postCard';

test.describe('Community — authenticated post card cert', () => {
  test.beforeEach(() => {
    requireAuthOrSkip(test);
  });

  test('community feed post cards share enterprise design markers', async ({ page }, testInfo) => {
    await page.goto(CERT_ROUTES.community, { waitUntil: 'domcontentloaded' });
    await waitForFeed(page);
    await assertDesignTokenOnPage(page);

    const cards = postCards(page);
    const count = await cards.count();
    testInfo.annotations.push({ type: 'postCards', description: String(count) });
    if (count === 0) {
      test.skip(true, 'No community post cards visible');
      return;
    }

    const first = cards.first();
    await assertPostCardGeometry(first);
    await assertActionRowEqualColumns(first);
    await assertLayoutNoProductOverflow(page, first);

    const design = await first.getAttribute('data-post-card-design');
    if (design) expect(design).toBe('21.1.5');

    if ((await first.locator(AI_COACH).count()) > 0) {
      await expect(first.locator(AI_COACH)).toBeVisible();
      await expect(first.locator('[data-testid="post-ai-coach-enhance"]')).toBeVisible();
    }

    const inventory = await collectFeedInventory(page);
    expect(inventory.count).toBeGreaterThan(0);
  });
});
