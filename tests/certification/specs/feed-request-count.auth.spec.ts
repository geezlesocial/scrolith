import { test, expect } from '@playwright/test';
import { requireAuthOrSkip } from '../helpers/env';
import { CERT_ROUTES } from '../helpers/routes';

const WINDOW_MS = Math.max(10_000, Number(process.env.CERT_FEED_REQUEST_COUNT_MS || 30_000) || 30_000);
const MAX_FEED_REQUESTS = Math.max(4, Number(process.env.CERT_MAX_FEED_REQUESTS || 12) || 12);

test.describe('Feed request lifecycle', () => {
  test.beforeEach(() => {
    requireAuthOrSkip(test);
  });

  test('member home does not generate a request storm', async ({ page }, testInfo) => {
    const requests: Array<{ method: string; path: string }> = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.endsWith('/api/discovery/v2/member-feed') || path.endsWith('/api/community/feed')) {
        requests.push({ method: request.method(), path });
      }
    });

    await page.goto(CERT_ROUTES.memberHome, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(WINDOW_MS);

    testInfo.annotations.push({
      type: 'feedRequestCount',
      description: JSON.stringify({ windowMs: WINDOW_MS, total: requests.length, requests })
    });
    expect(requests.length).toBeLessThanOrEqual(MAX_FEED_REQUESTS);
  });
});
