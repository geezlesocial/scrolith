import { test, expect } from '@playwright/test';

// Requires PLAYWRIGHT_ADMIN_TOKEN to be set to a valid admin JWT
const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
let ADMIN_TOKEN = process.env.PLAYWRIGHT_ADMIN_TOKEN || process.env.ADMIN_TOKEN || '';
const UNIQUE_TITLE = `E2E Trending ${Date.now()}`;

test.describe('Trending propagation', () => {
  test.beforeEach(async ({ request }, testInfo) => {
    if (ADMIN_TOKEN) return;
    const email = process.env.PLAYWRIGHT_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
    const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
    if (!email || !password) {
      testInfo.skip('PLAYWRIGHT_ADMIN_TOKEN not set and no ADMIN_EMAIL/PASSWORD provided — skipping');
      return;
    }
    try {
      const loginUrl = `${BASE.replace(/\/$/, '')}/api/auth/login`;
      const res = await request.post(loginUrl, {
        data: { email, password },
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok()) {
        testInfo.skip('Failed to login to obtain admin token — skipping');
        return;
      }
      const body = await res.json().catch(() => ({}));
      ADMIN_TOKEN = body?.token || body?.data?.token || body?.accessToken || body?.data?.accessToken || body?.jwt || '';
      if (!ADMIN_TOKEN) {
        testInfo.skip('Login response did not contain token — skipping');
      }
    } catch (e) {
      testInfo.skip('Error obtaining admin token — skipping');
    }
  });

  test('admin saves trending config and public site shows the strip', async ({ browser, request }) => {
    test.skip(!ADMIN_TOKEN, 'Admin token required');

    const apiUrl = `${BASE.replace(/\/$/, '')}/api/cms/trending-config`;

    // 1) Save trending config as admin
    const payload = {
      enabled: true,
      title: UNIQUE_TITLE,
      category_ids: [],
      visibility: ['guest'],
      show_icons: false,
      auto_slide_interval: 0,
      scroll_behavior: 'manual'
    };

    const postRes = await request.post(apiUrl, {
      data: payload,
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    expect(postRes.ok()).toBeTruthy();

    // 2) Confirm server returns the saved config
    const getRes = await request.get(apiUrl);
    expect(getRes.ok()).toBeTruthy();
    const body = await getRes.json().catch(() => ({}));
    const cfg = (body?.data && body.data) || body || {};
    const serverTitle = cfg?.title || cfg?.data?.title || cfg?.trending?.title || '';
    expect(String(serverTitle)).toContain('E2E Trending');

    // 3) Visit public site and assert the strip title appears
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    // Wait up to 7s for the trending strip to render and show the unique title
    await page.waitForFunction((t) => {
      return !![...document.querySelectorAll('div,span')].find(el => (el.textContent || '').includes(t));
    }, UNIQUE_TITLE, { timeout: 7000 });

    const found = await page.evaluate((t) => {
      return !![...document.querySelectorAll('div,span')].find(el => (el.textContent || '').includes(t));
    }, UNIQUE_TITLE);

    expect(found).toBeTruthy();

    await context.close();
  });
});
