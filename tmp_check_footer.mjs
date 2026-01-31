import { chromium } from 'playwright';

const BASE = process.env.TEST_FRONTEND_BASE || 'http://localhost:3000';

const fakeUser = {
  id: 'local-test-user',
  name: 'UI Test User',
  email: 'ui-test@example.com',
  role: 'freelancer',
  avatar: ''
};

async function check(url) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Ensure app sees authenticated user from the start
  await page.addInitScript((user) => {
    try { localStorage.setItem('user', user); } catch (e) { /* ignore */ }
  }, JSON.stringify(fakeUser));

  const full = `${BASE}${url}`;
  console.log('Visiting', full);
  const resp = await page.goto(full, { waitUntil: 'networkidle', timeout: 15000 }).catch(e => null);

  // Wait for either a footer or ProtectedRoute redirect/login
  try {
    const footer = await page.waitForSelector('footer', { timeout: 8000 });
    const text = (await footer.innerText())?.trim();
    console.log(`FOUND footer on ${url}:`, text ? text.slice(0, 120) : '(empty)');
    await browser.close();
    return { url, found: true, text };
  } catch (e) {
    // not found
    console.warn(`No footer found on ${url}`);
    await browser.close();
    return { url, found: false };
  }
}

(async () => {
  const results = [];
  results.push(await check('/freelancer/dashboard'));
  results.push(await check('/freelancer/dashboard?as=employer'));

  console.log('\nResults:', JSON.stringify(results, null, 2));

  const allGood = results.every(r => r.found);
  process.exit(allGood ? 0 : 2);
})();
