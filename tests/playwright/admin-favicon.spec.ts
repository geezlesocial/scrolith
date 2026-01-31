import { test, expect } from '@playwright/test';

// This test requires a valid admin JWT to be provided via PLAYWRIGHT_ADMIN_TOKEN
// Example (PowerShell): $env:PLAYWRIGHT_ADMIN_TOKEN="<JWT>"; npx playwright test tests/playwright/admin-favicon.spec.ts

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
let ADMIN_TOKEN = process.env.PLAYWRIGHT_ADMIN_TOKEN || process.env.ADMIN_TOKEN || '';
const TEST_FAVICON = 'https://via.placeholder.com/32.png';

test.describe('Admin favicon propagation', () => {
  test.beforeEach(async ({ request }, testInfo) => {
    if (ADMIN_TOKEN) return;
    // Try to obtain token via login if email/password env vars are provided
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

  test('save favicon via admin API and verify admin + public clients update', async ({ browser, request }) => {
    test.skip(!ADMIN_TOKEN, 'Admin token required');

    // 1) Save header config via API (admin-auth)
    const payload = { favicon_url: TEST_FAVICON };
    const apiUrl = `${BASE.replace(/\/$/, '')}/api/cms/header`;
    const res = await request.post(apiUrl, {
      data: payload,
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    expect(res.ok()).toBeTruthy();

    // Confirm server returns new favicon when GET /api/cms/header
    const getRes = await request.get(apiUrl);
    expect(getRes.ok()).toBeTruthy();
    const body = await getRes.json();
    // body shape may be wrapped; inspect common shapes
    const headerData = (body?.data && body.data) || body;
    const serverFavicon = headerData?.favicon_url || headerData?.faviconUrl || '';
    expect(serverFavicon).toBeTruthy();
    expect(serverFavicon).toContain('placeholder.com');

    // 2) Open admin client page and verify link[rel~="icon"] contains the new favicon (cache-bust allowed)
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`${BASE}/admin/dashboard`, { waitUntil: 'networkidle' });

    // Wait until the admin page applies the favicon (the app may apply a cache-busted href)
    await adminPage.waitForFunction((expected) => {
      const links = [...document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]')];
      return links.some(l => !!l.href && l.href.indexOf(expected) !== -1);
    }, TEST_FAVICON, { timeout: 5000 });

    const adminFaviconHref = await adminPage.evaluate(() => {
      const el = document.querySelector('link[rel~="icon"]') || document.querySelector('link[rel="shortcut icon"]');
      return el ? (el as HTMLLinkElement).href : '';
    });
    expect(adminFaviconHref).toContain('placeholder.com');

    // 3) Open a second (public) client and verify it reads the header config and picks up the favicon
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    // The public client should request /api/cms/header on load — wait for link update
    await publicPage.waitForFunction((expected) => {
      const links = [...document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]')];
      return links.some(l => !!l.href && l.href.indexOf(expected) !== -1);
    }, TEST_FAVICON, { timeout: 5000 });

    const publicFaviconHref = await publicPage.evaluate(() => {
      const el = document.querySelector('link[rel~="icon"]') || document.querySelector('link[rel="shortcut icon"]');
      return el ? (el as HTMLLinkElement).href : '';
    });

    expect(publicFaviconHref).toContain('placeholder.com');

    await adminContext.close();
    await publicContext.close();
  });
});
