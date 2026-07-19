import { test, expect } from '@playwright/test';
import { CERT_BASE_URL, requireAuthOrSkip } from '../helpers/env';
import { CERT_ROUTES } from '../helpers/routes';
import { collectWebVitals, compareCls, writeBaseline, readLatestBaseline } from '../helpers/perf';
import { waitForFeed } from '../helpers/postCard';

test.describe('Performance baseline capture', () => {
  test.beforeEach(() => {
    requireAuthOrSkip(test);
  });

  test('Member Home web vitals baseline', async ({ page }, testInfo) => {
    await page.goto(CERT_ROUTES.memberHome, { waitUntil: 'domcontentloaded' });
    await waitForFeed(page);
    const vp = page.viewportSize();
    const viewport = vp ? `${vp.width}x${vp.height}` : 'unknown';
    const baseline = await collectWebVitals(page, {
      surface: 'member_home',
      viewport,
      baseURL: CERT_BASE_URL
    });
    const path = writeBaseline(baseline);
    testInfo.annotations.push({ type: 'baselinePath', description: path });
    testInfo.annotations.push({ type: 'vitals', description: JSON.stringify(baseline) });

    const previous = readLatestBaseline('member_home', viewport);
    const cmp = compareCls(baseline, previous && previous.collectedAt !== baseline.collectedAt ? previous : null);
    expect(cmp.ok, cmp.reason).toBe(true);
    // Soft budgets
    if (baseline.fcp != null) expect(baseline.fcp).toBeLessThan(15_000);
  });

  test('Community web vitals baseline', async ({ page }, testInfo) => {
    await page.goto(CERT_ROUTES.community, { waitUntil: 'domcontentloaded' });
    await waitForFeed(page);
    const vp = page.viewportSize();
    const viewport = vp ? `${vp.width}x${vp.height}` : 'unknown';
    const baseline = await collectWebVitals(page, {
      surface: 'community',
      viewport,
      baseURL: CERT_BASE_URL
    });
    const path = writeBaseline(baseline);
    testInfo.annotations.push({ type: 'baselinePath', description: path });
    const cmp = compareCls(baseline, null);
    expect(cmp.ok, cmp.reason).toBe(true);
  });
});
