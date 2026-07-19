import { test, expect } from '@playwright/test';
import { requireAuthOrSkip } from '../helpers/env';
import { CERT_ROUTES, isValidAuthDestination } from '../helpers/routes';
import { assertLayoutNoProductOverflow, postCards, waitForFeed } from '../helpers/postCard';

test.describe('Profile — authenticated cert', () => {
  test.beforeEach(() => {
    requireAuthOrSkip(test);
  });

  test('profile surface loads and remains stable', async ({ page }, testInfo) => {
    await page.goto(CERT_ROUTES.profile, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const url = page.url();
    testInfo.annotations.push({ type: 'landedUrl', description: url });

    // Accept member-home / m/home / profile / u/* — fail only on login/error
    expect(
      isValidAuthDestination(url, 'profile'),
      `unexpected profile destination: ${url}`
    ).toBe(true);

    await assertLayoutNoProductOverflow(page);
    await waitForFeed(page).catch(() => undefined);

    const count = await postCards(page).count();
    testInfo.annotations.push({ type: 'profilePostCards', description: String(count) });
  });
});
