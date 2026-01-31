import { chromium } from 'playwright';
import axios from 'axios';

(async () => {
  const BASE = process.env.TEST_SERVER_BASE || 'http://localhost:5000';
  const FRONTEND = process.env.TEST_FRONTEND_BASE || 'http://localhost:3001';
  const adminEmail = process.env.TEST_ADMIN_EMAIL || 'admin@geezle.com';
  const adminPassword = process.env.TEST_ADMIN_PASSWORD || 'admin12345';

  // Login via API to get token and set localStorage
  let token = null;
  let userData = null;
  try {
    const r = await axios.post(`${BASE}/api/auth/login`, { email: adminEmail, password: adminPassword });
    token = r.data && (r.data.token || r.data.data?.token) ? (r.data.token || r.data.data.token) : null;
    userData = r.data && (r.data.user || r.data.data?.user) ? (r.data.user || r.data.data.user) : null;
    console.log('Got token:', Boolean(token));
  } catch (e) {
    console.error('Login failed', e.response ? e.response.data : e.message);
  }

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture browser console and page errors for diagnostics
  page.on('console', msg => {
    try { console.log(`[page console] ${msg.type()}: ${msg.text()}`); } catch (e) {}
  });
  page.on('pageerror', err => {
    try { console.error('[page error]', err); } catch (e) {}
  });
  page.on('requestfailed', req => {
    try { console.warn('[request failed]', req.url(), req.failure()?.errorText); } catch (e) {}
  });
  page.on('response', async resp => {
    try {
      const url = resp.url();
      const status = resp.status();
      if (url.includes('/api/admin/profile') || url.includes('/api/auth') || status >= 400) {
        let text = '';
        try { text = await resp.text(); } catch (e) { text = '<no body>'; }
        console.log(`[response] ${status} ${url} - ${text}`);
      }
    } catch (e) {}
  });

  // Navigate and set token in localStorage before load if token exists
  if (token) {
    await page.addInitScript((t) => { localStorage.setItem('token', t); }, token);
  }
  if (userData) {
    await page.addInitScript((u) => { localStorage.setItem('user', u); }, JSON.stringify(userData));
  }

  await page.goto(`${FRONTEND}/admin/dashboard?tab=profile`, { waitUntil: 'networkidle' });

  // Wait for profile to render and fill form fields
  await page.waitForSelector('text=Admin Profile', { timeout: 30000 });
  // Fill form fields (selectors based on form in Profile.tsx)
  try {
    await page.waitForSelector('input[type="text"]', { timeout: 20000 });
    await page.fill('input[type="text"]', 'UI Test Admin');
    await page.waitForSelector('input[type="email"]', { timeout: 20000 });
    const testEmail = `ui-test+${Date.now()}@example.com`;
    await page.fill('input[type="email"]', testEmail);
    // Fill password fields if present
    const pwdInputs = await page.$$('input[type="password"]');
    if (pwdInputs.length >= 1) await pwdInputs[0].fill('UiTestPass123!');
    if (pwdInputs.length >= 2) await pwdInputs[1].fill('UiTestPass123!');

    await page.waitForSelector('button:has-text("Save Changes")', { timeout: 30000 });
    await page.click('button:has-text("Save Changes")');

    // Wait for notification - look for success notification text
    const success = await page.waitForSelector('text=Profile Updated', { timeout: 7000 }).catch(() => null);
    if (success) {
      console.log('UI: Save reported success');
    } else {
      const alert = await page.$('text=Save Failed') || await page.$('text=Unable to save admin profile');
      if (alert) {
        console.error('UI: Save failed notification present');
      } else {
        console.log('UI: No notification found');
      }
    }
  } catch (e) {
    console.error('UI test error', e);
  }

  await browser.close();
})();