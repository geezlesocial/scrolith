import { test, expect } from '@playwright/test';
import { requireAuthOrSkip } from '../helpers/env';
import { CERT_ROUTES } from '../helpers/routes';
import {
  assertActionRowEqualColumns,
  assertDesignTokenOnPage,
  assertLayoutNoProductOverflow,
  assertPostCardGeometry,
  assertPostCardNoOverflow,
  assertSurveyEqualButtons,
  assertTypographyScale,
  collectFeedInventory,
  expandFirstMoreIfPresent,
  measureDocumentOverflowX,
  postCards,
  waitForFeed,
  AI_COACH,
  SURVEY,
  TRANSLATABLE
} from '../helpers/postCard';

test.describe('Member Home — authenticated post card cert', () => {
  test.beforeEach(() => {
    requireAuthOrSkip(test);
  });

  test('renders enterprise post cards with design system geometry', async ({ page }, testInfo) => {
    await page.goto(CERT_ROUTES.memberHome, { waitUntil: 'domcontentloaded' });
    await waitForFeed(page);
    await assertDesignTokenOnPage(page);

    const cards = postCards(page);
    const count = await cards.count();
    testInfo.annotations.push({ type: 'postCards', description: String(count) });

    // Document overflow is informational (shell/dock) — does not fail product cert
    const docOverflow = await measureDocumentOverflowX(page);
    testInfo.annotations.push({
      type: 'documentOverflowX',
      description: String(docOverflow)
    });
    if (docOverflow > 12) {
      testInfo.annotations.push({
        type: 'classification',
        description: 'harness:document_overflow_ignored_use_component_scope'
      });
    }

    if (count === 0) {
      test.skip(true, 'No post cards visible — empty feed or auth gate');
      return;
    }

    const first = cards.first();
    await assertPostCardGeometry(first);
    await assertTypographyScale(first);
    await assertActionRowEqualColumns(first);
    await assertSurveyEqualButtons(first);
    await assertLayoutNoProductOverflow(page, first);

    if ((await first.locator(AI_COACH).count()) > 0) {
      const box = await first.locator(AI_COACH).boundingBox();
      expect(box?.height || 0).toBeGreaterThanOrEqual(68);
    }
    if ((await first.locator(SURVEY).count()) > 0) {
      await assertSurveyEqualButtons(first);
    }
    if ((await first.locator(TRANSLATABLE).count()) > 0) {
      await expandFirstMoreIfPresent(first);
      await assertPostCardNoOverflow(first);
    }

    const inventory = await collectFeedInventory(page);
    testInfo.annotations.push({
      type: 'inventory',
      description: JSON.stringify({
        count: inventory.count,
        withCoach: inventory.withCoach,
        withSurvey: inventory.withSurvey,
        withMedia: inventory.withMedia
      })
    });
  });

  test('long content does not overflow post card bounds', async ({ page }) => {
    await page.goto(CERT_ROUTES.memberHome, { waitUntil: 'domcontentloaded' });
    await waitForFeed(page);
    const cards = postCards(page);
    if ((await cards.count()) === 0) {
      test.skip(true, 'No post cards');
      return;
    }
    const card = cards.first();
    const body = card.locator(TRANSLATABLE).first();
    if ((await body.count()) > 0) {
      const cardBox = await card.boundingBox();
      const bodyBox = await body.boundingBox();
      if (cardBox && bodyBox) {
        expect(bodyBox.x + bodyBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 8);
      }
    }
    await assertPostCardNoOverflow(card);
    await assertLayoutNoProductOverflow(page, card);
  });
});
