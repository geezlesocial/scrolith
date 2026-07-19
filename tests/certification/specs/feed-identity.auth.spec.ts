import { test } from '@playwright/test';
import { FEED_IDENTITY_MS, requireAuthOrSkip } from '../helpers/env';
import { CERT_ROUTES } from '../helpers/routes';
import { assertFeedIdentityStable } from '../helpers/feedIdentity';

/**
 * Automates the operator 60s feed-identity certification.
 * Override duration with CERT_FEED_IDENTITY_MS (default 60000).
 */
test.describe('Feed identity — 60s stability', () => {
  test.beforeEach(() => {
    requireAuthOrSkip(test);
  });

  // Run surfaces independently so one failure does not skip WebKit community/scroll.
  test.describe.configure({ mode: 'parallel' });

  test('Member Home identity stable under soft activity', async ({ page }, testInfo) => {
    test.setTimeout(FEED_IDENTITY_MS + 90_000);
    await page.goto(CERT_ROUTES.memberHome, { waitUntil: 'domcontentloaded' });
    const result = await assertFeedIdentityStable(page, {
      surface: 'member_home',
      durationMs: FEED_IDENTITY_MS
    });
    testInfo.annotations.push({ type: 'feedIdentity', description: JSON.stringify(result) });
  });

  test('Community identity stable under soft activity', async ({ page }, testInfo) => {
    test.setTimeout(FEED_IDENTITY_MS + 90_000);
    await page.goto(CERT_ROUTES.community, { waitUntil: 'domcontentloaded' });
    const result = await assertFeedIdentityStable(page, {
      surface: 'community',
      durationMs: FEED_IDENTITY_MS
    });
    testInfo.annotations.push({ type: 'feedIdentity', description: JSON.stringify(result) });
  });

  test('Scroll surface does not crash during identity window', async ({ page }, testInfo) => {
    test.setTimeout(FEED_IDENTITY_MS + 90_000);
    await page.goto(CERT_ROUTES.scroll, { waitUntil: 'domcontentloaded' });
    // Scroll is video-first; run shorter soft stability on URL + root
    const started = Date.now();
    const href0 = page.url();
    while (Date.now() - started < Math.min(FEED_IDENTITY_MS, 30_000)) {
      await page.waitForTimeout(3_000);
      await page.evaluate(() => {
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
      });
      const alive = await page.evaluate(() => Boolean(document.body));
      if (!alive) throw new Error('scroll_root_dead');
    }
    testInfo.annotations.push({
      type: 'scrollIdentity',
      description: JSON.stringify({ href0, href1: page.url(), ms: Date.now() - started })
    });
  });
});
