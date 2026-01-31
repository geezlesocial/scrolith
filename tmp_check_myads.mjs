import { chromium } from 'playwright';

const BASE = process.env.TEST_FRONTEND_BASE || 'http://localhost:3000';

const fakeUser = {
  id: 'local-test-user',
  name: 'UI Test User',
  email: 'ui-test@example.com',
  role: 'freelancer',
  avatar: ''
};

async function runCheck(asParam) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Inject a fake authenticated user before any script runs
  await page.addInitScript((user) => {
    try { localStorage.setItem('user', user); } catch (e) { /* ignore */ }
  }, JSON.stringify(fakeUser));

  const url = `${BASE}/freelancer/dashboard${asParam ? '?as=' + asParam : ''}`;
  console.log('Visiting', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });

  // Wait for sidebar to render and the label 'My Ads' to be present
  try {
    const sidebarBtn = page.getByRole('button', { name: /My Ads/i });
    await sidebarBtn.waitFor({ timeout: 8000 });
    console.log('Found sidebar item: My Ads');

    // Click it and wait for the My Ads page header
    await sidebarBtn.click();
    const header = page.getByRole('heading', { name: /My Ads/i });
    await header.waitFor({ timeout: 8000 });
    const headerText = await header.innerText();
    console.log(`My Ads page rendered: ${headerText}`);
    await browser.close();
    return { asParam, found: true, header: headerText };
  } catch (err) {
    console.warn('My Ads not found or did not render:', err?.message || err);
    await browser.close();
    return { asParam, found: false };
  }
}

(async () => {
  const results = [];
  results.push(await runCheck('freelancer'));
  results.push(await runCheck('employer'));

  console.log('\nResults:', JSON.stringify(results, null, 2));
  const allOk = results.every(r => r.found === true);
  process.exit(allOk ? 0 : 2);
})();
