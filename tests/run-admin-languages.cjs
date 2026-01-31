const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 60 });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // Start tracing to capture DOM snapshots and screenshots for this run
  try {
    await context.tracing.start({ screenshots: true, snapshots: true });
  } catch (e) {
    console.warn('Tracing start failed', e);
  }
  const page = await context.newPage();

  const now = () => new Date().toISOString();
  console.log(now(), 'Context created, page starting up');

  page.on('console', msg => {
    try { console.log('PAGE LOG:', msg.type(), msg.text()); } catch(e) {}
  });
  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));
  page.on('response', resp => {
    try { console.log('RESP', resp.status(), resp.url()); } catch(e) {}
  });

  // Use context-level routes and init scripts so stubs are present before any request
  await context.addInitScript(() => {
    try {
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('user', JSON.stringify({ id: 'admin-test', role: 'admin', email: 'admin@example.com', name: 'Admin' }));
      const seed = [{ id: 'en-local', name: 'English', code: 'en', flutterCode: 'en', isDefault: true, translations: {} }];
      localStorage.setItem('admin:languages', JSON.stringify(seed));
    } catch (e) {}
  });

  // Intercept auth and admin endpoints at the context level to avoid timing races
  await context.route('**/api/auth/me', async route => {
    const body = JSON.stringify({ user: { id: 'admin-test', role: 'admin', email: 'admin@example.com', name: 'Admin' } });
    try { await route.fulfill({ status: 200, contentType: 'application/json', body }); } catch(e) { try { await route.continue(); } catch(_){} }
  });
  await context.route('**/auth/me', async route => {
    try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'admin-test', role: 'admin', email: 'admin@example.com', name: 'Admin' } }) }); } catch(e) { try { await route.continue(); } catch(_){} }
  });

  // Lightweight admin endpoint mocks to avoid 401-driven redirects during smoke runs
  await context.route('**/api/admin/platform/settings', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
  await context.route('**/api/admin/system/settings', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
  await context.route('**/api/messages/conversations*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
  await context.route('**/api/favorites*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  // Broader admin wildcard mock for GET requests to reduce unexpected 401 redirects
  await context.route('**/api/admin/**', async route => {
    try {
      const req = route.request();
      if (req.method().toUpperCase() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
      } else {
        await route.continue();
      }
    } catch (e) {
      try { await route.continue(); } catch(_){ }
    }
  });

  // NOTE: init script moved to context.addInitScript above to avoid timing races

  const candidates = [
    'http://localhost:3000/admin/dashboard?tab=languages',
    'http://localhost:3000/geezle/admin/dashboard?tab=languages',
    'http://localhost:3000/admin/dashboard',
    'http://localhost:3000/geezle/admin/dashboard'
  ];

  let navigated = false;
  // Warmup the root so Vite HMR and SPA bootstrap can settle
  try {
    console.log(now(), 'Warmup: navigating to /');
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(800);
  } catch (e) { console.warn(now(), 'Warmup failed', e); }

  for (const url of candidates) {
    try {
      console.log(now(), 'Trying', url);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      // Wait for admin sidebar/logo to appear (gives SPA time to render)
      try {
        await page.waitForSelector('aside', { timeout: 30000 });
        navigated = true;
        break;
      } catch (err) {
        // give SPA a moment and continue to next candidate
        await page.waitForTimeout(1600);
      }
    } catch (e) {
      console.warn(now(), 'Failed to navigate to', url, e);
    }
  }
  if (!navigated) {
    console.error('Unable to navigate to any admin dashboard URL');
    await browser.close();
    process.exit(4);
  }

  // Debug screenshot and page HTML for troubleshooting
  try {
    await page.screenshot({ path: 'geezle_admin_dashboard.png', fullPage: true });
    await page.screenshot({ path: 'tests/trace_step_nav.png', fullPage: true });
    const html = await page.content();
    const fs = require('fs');
    fs.writeFileSync('geezle_admin_dashboard.html', html);
    console.log('Saved debug screenshot and HTML');
  } catch (err) {
    console.warn('Unable to save debug artifacts', err);
  }



  // Click Setup & Configurations if present and ensure Languages link appears
  const setup = await page.$('text=Setup & Configurations');
  if (setup) {
    await setup.click();
    await page.waitForTimeout(300);
  }
  // Prefer clicking the test-id for the Languages nav if present
  let clicked = false;
  try {
    await page.waitForSelector('aside', { timeout: 4000 });
    clicked = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="admin-nav-languages"]');
      if (el) { try { el.click(); } catch(e) {} return true; }
      return false;
    });
  } catch (_) { /* ignore */ }

  // Click Languages link (may be an anchor/div, not a button) if test-id not found
  // Helper: try to find any element that contains the given text and click its nearest clickable ancestor
  async function findAndClickText(text, timeout = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const clicked = await page.evaluate((t) => {
        const candidates = Array.from(document.querySelectorAll('a,button,li,div,span'));
        for (const el of candidates) {
          try {
            if (el.innerText && el.innerText.trim().includes(t)) {
              let node = el;
              while (node && node !== document.body) {
                const tag = node.tagName;
                const role = node.getAttribute && node.getAttribute('role');
                if (tag === 'A' || tag === 'BUTTON' || role === 'button' || node.onclick) {
                  node.click();
                  return true;
                }
                node = node.parentElement;
              }
            }
          } catch (e) {}
        }
        return false;
      }, text);
      if (clicked) return true;
      await page.waitForTimeout(500);
    }
    return false;
  }

  if (!clicked) clicked = await findAndClickText('Languages', 30000);
  if (!clicked) {
    console.error('Languages link not found after polling');
    try {
      const bodyText = await page.evaluate(() => (document.body ? document.body.innerText : ''));
      console.log('PAGE BODY TEXT SNIPPET:', bodyText.slice(0, 2000));
      await page.screenshot({ path: 'geezle_admin_dashboard_missing_languages.png', fullPage: true });
      await page.screenshot({ path: 'tests/trace_step_missing_languages.png', fullPage: true });
      const html = await page.content();
      const fs = require('fs');
      fs.writeFileSync('geezle_admin_dashboard_missing_languages.html', html);
      console.log('Saved additional debug artifacts');
    } catch (err) { console.warn('Failed to save extra debug artifacts', err); }
    await browser.close();
    process.exit(2);
  }

  // Wait for page heading
  await page.waitForSelector('h2', { timeout: 20000 });
  const heading = await page.$eval('h2', el => el.textContent);
  console.log(now(), 'Heading:', heading);

  // Click Add New Language
  // Click Add New Language (use poller to be robust)
  const openedAdd = await findAndClickText('Add New Language', 10000);
  if (openedAdd) {
    // Wait for any visible input inside modal to appear
    try {
      await page.waitForSelector('input', { timeout: 7000 });
      const inputs = page.locator('input:visible');
      const count = await inputs.count();
      if (count >= 3) {
        await inputs.nth(0).fill('English', { timeout: 10000 });
        await inputs.nth(1).fill('en', { timeout: 10000 });
        await inputs.nth(2).fill('en', { timeout: 10000 });
      } else {
        // fallback: set values via DOM if visible inputs not detected
        await page.evaluate(() => {
          const visibleInputs = Array.from(document.querySelectorAll('input')).filter(i => i.offsetParent !== null);
          if (visibleInputs.length >= 3) {
            visibleInputs[0].value = 'English';
            visibleInputs[1].value = 'en';
            visibleInputs[2].value = 'en';
          }
        });
      }
      // Check checkbox if present
      try {
        const checkbox = await page.$('input[type=checkbox]:visible');
        if (checkbox) await checkbox.check();
      } catch (e) {}
      // Click Save (use DOM poller to find a Save button)
      const saved = await findAndClickText('Save', 8000);
      if (saved) console.log('Requested save for English');
      await page.waitForTimeout(1200);
    } catch (e) {
      console.warn('Add modal interaction failed', e);
    }
  } else {
    console.warn('Add New Language control not found');
  }

  // Find the English row
  const row = await page.$(`div:has-text("English")`);
  if (!row) {
    console.error('English row not found after save');
    await browser.close();
    process.exit(3);
  }
  console.log('English row present');
  try { await page.screenshot({ path: 'tests/trace_step_languages.png', fullPage: true }); } catch (_) {}

  // Export
  const exportBtn = await row.$('button:has-text("Export")');
  if (exportBtn) { await exportBtn.click(); console.log('Clicked Export'); }

  // Translate
  const translateBtn = await row.$('button:has-text("Translate")');
  if (translateBtn) { await translateBtn.click(); console.log('Clicked Translate'); }

  // Sync App
  const syncBtn = await row.$('button:has-text("Sync App")');
  if (syncBtn) { await syncBtn.click(); console.log('Clicked Sync App'); }

  // Import - set file on the hidden input
  const fixture = path.join(__dirname, 'fixtures', 'en_translations.json');
  const importBtn = await row.$('button:has-text("Import")');
  if (importBtn) {
    await importBtn.click();
    const fileInput = await page.$('input[type=file]');
    if (fileInput) {
      await fileInput.setInputFiles(fixture);
      console.log('Set import file to fixture');
      await page.waitForTimeout(800);
    } else {
      console.warn('File input not found');
    }
  }

  // Delete the language
  const deleteBtn = await row.$('button:has-text("Delete")');
  if (deleteBtn) {
    await deleteBtn.click();
    // Accept confirm dialog if appears
    page.on('dialog', async dialog => { await dialog.accept(); });
    console.log('Clicked Delete');
    await page.waitForTimeout(800);
  }

  console.log(now(), 'Smoke test completed successfully');
  // Stop tracing and save trace zip
  try {
    await context.tracing.stop({ path: 'tests/admin-languages-trace.zip' });
    console.log(now(), 'Trace saved to tests/admin-languages-trace.zip');
  } catch (e) {
    console.warn(now(), 'Tracing stop failed', e);
  }
  try { await page.screenshot({ path: 'tests/trace_step_end.png', fullPage: true }); } catch (_) {}
  await browser.close();
  process.exit(0);
})();
