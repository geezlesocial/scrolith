const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Seed localStorage before any script runs
  await page.addInitScript(() => {
    try {
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('user', JSON.stringify({ id: 'admin-test', role: 'admin', email: 'admin@example.com', name: 'Admin' }));
    } catch (e) {}
  });

  try {
    await page.goto('http://localhost:3000/admin/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.warn('Navigation to admin dashboard failed; storageState will still be saved.');
  }

  const out = path.join(__dirname, 'storageState.json');
  await context.storageState({ path: out });
  console.log('Saved storageState to', out);
  await browser.close();
})();
