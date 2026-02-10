import { chromium } from 'playwright';
import axios from 'axios';

(async () => {
  const BASE = process.env.TEST_SERVER_BASE || 'http://localhost:5000';
  const FRONTEND = process.env.TEST_FRONTEND_BASE || 'http://localhost:3001';
  const adminEmail = process.env.TEST_ADMIN_EMAIL || 'admin@scrolith.com';
  const adminPassword = process.env.TEST_ADMIN_PASSWORD || 'admin12345';

  // Login via API to get token and set localStorage
  let token = null;
  try {
    const r = await axios.post(`${BASE}/api/auth/login`, { email: adminEmail, password: adminPassword });
    token = r.data && (r.data.token || r.data.data?.token) ? (r.data.token || r.data.data.token) : null;
    console.log('Got token:', Boolean(token));
  } catch (e) {
    console.error('Login failed', e.response ? e.response.data : e.message);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate and set token in localStorage before load if token exists
  if (token) {
    await page.addInitScript((t) => { localStorage.setItem('token', t); }, token);
  }

  await page.goto(`${FRONTEND}/admin/dashboard`, { waitUntil: 'networkidle' });

  // Fill form fields (selectors based on form in Profile.tsx)
  try {
    await page.fill('input[type="text"]', 'UI Test Admin');
    await page.fill('input[type="email"]', `ui-test+${Date.now()}@example.com`);
    await page.fill('input[type="password"]', 'UiTestPass123!');
    await page.fill('input[type="password"] >> nth=1', 'UiTestPass123!');

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
        // Check network response for the PUT request
        console.log('UI: No notification found - checking network requests (skipped)');
      }
    }
  } catch (e) {
    console.error('UI test error', e);
  }

  await browser.close();
})();