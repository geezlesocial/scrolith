const { test, expect } = require('@playwright/test');
const path = require('path');

// Note: storageState handled via `page.addInitScript` below for portability

// Helper DOM poller (same robust approach used previously)
async function findAndClickText(page, text, timeout = 20000) {
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

test('Admin Languages smoke', async ({ page }) => {
  // Lightweight mocks so test is stable in dev without a backend
  await page.route('**/api/admin/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }).catch(() => route.continue()));
  await page.route('**/api/messages/conversations*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }).catch(() => route.continue()));
  await page.route('**/api/favorites*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }).catch(() => route.continue()));

  // Ensure localStorage seeds so admin UI renders in dev without backend auth
  await page.addInitScript(() => {
    try {
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('user', JSON.stringify({ id: 'admin-test', role: 'admin', email: 'admin@example.com', name: 'Admin' }));
      const seed = [{ id: 'en-local', name: 'English', code: 'en', flutterCode: 'en', isDefault: true, translations: {} }];
      localStorage.setItem('admin:languages', JSON.stringify(seed));
    } catch (e) {}
  });

  // Try candidate admin URLs (some dev setups serve under /geezle/ base path)
  const candidates = ['/admin/dashboard', '/geezle/admin/dashboard', '/admin/dashboard?tab=languages', '/geezle/admin/dashboard?tab=languages'];
  let opened = false;
  for (const url of candidates) {
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      // Wait a short moment for SPA to render
      await page.waitForTimeout(500);
      // Try opening Setup & Configurations first (if present)
      await findAndClickText(page, 'Setup & Configurations', 3000).catch(() => {});
      // Prefer a test-id based selector for stability
      try {
        await page.click('[data-testid="admin-nav-languages"]', { timeout: 8000 });
        opened = true;
      } catch (err) {
        // Fallback to sidebar-scoped selector or global poller
        try {
          const sidebar = page.locator('aside');
          await sidebar.waitFor({ state: 'visible', timeout: 8000 });
          const langBtn = sidebar.locator('button:has-text("Languages")').first();
          if (await langBtn.count() > 0) {
            await langBtn.click();
            opened = true;
          } else {
            opened = await findAndClickText(page, 'Languages', 8000);
          }
        } catch (err2) {
          opened = await findAndClickText(page, 'Languages', 8000);
        }
      }
      if (opened) break;
    } catch (e) {
      // ignore and try next candidate
    }
  }

  if (!opened) {
    // Save debug artifacts for inspection
    try {
      await page.screenshot({ path: 'tests/geezle_admin_dashboard_debug.png', fullPage: true });
      const html = await page.content();
      const fs = require('fs');
      fs.writeFileSync('tests/geezle_admin_dashboard_debug.html', html);
      // also capture sidebar innerText for easier debugging
      try {
        const sidebarText = await page.evaluate(() => {
          const a = document.querySelector('aside');
          return a ? a.innerText : '';
        });
        fs.writeFileSync('tests/geezle_admin_sidebar_text.txt', sidebarText);
      } catch (__) {}
    } catch (err) {}
  }
  expect(opened).toBeTruthy();

  // Ensure heading exists
  await expect(page.locator('h2')).toHaveText(/Languages/i, { timeout: 5000 });

  // If Add New Language control exists, try to open modal and fill (best-effort)
  const openedAdd = await findAndClickText(page, 'Add New Language', 8000);
  if (openedAdd) {
    // try to fill visible inputs
    try {
      await page.waitForSelector('input', { timeout: 7000 });
      const inputs = page.locator('input:visible');
      const count = await inputs.count();
      if (count >= 3) {
        await inputs.nth(0).fill('English');
        await inputs.nth(1).fill('en');
        await inputs.nth(2).fill('en');
      } else {
        await page.evaluate(() => {
          const visibleInputs = Array.from(document.querySelectorAll('input')).filter(i => i.offsetParent !== null);
          if (visibleInputs.length >= 3) {
            visibleInputs[0].value = 'English';
            visibleInputs[1].value = 'en';
            visibleInputs[2].value = 'en';
          }
        });
      }
      await findAndClickText(page, 'Save', 8000);
    } catch (e) {
      console.warn('Add modal interaction failed', e);
    }
  }

  // Ensure English row appears (seeded or created)
  const row = page.locator('text=English');
  await expect(row).toBeVisible({ timeout: 5000 });

  // Click Export/Translate/Sync/Import/Delete where available (best-effort)
  await findAndClickText(page, 'Export', 3000).catch(() => {});
  await findAndClickText(page, 'Translate', 3000).catch(() => {});
  await findAndClickText(page, 'Sync App', 3000).catch(() => {});

  // Try Import (set fixture) if file input present
  const fixture = path.join(__dirname, 'fixtures', 'en_translations.json');
  const didImport = await findAndClickText(page, 'Import', 3000);
  if (didImport) {
    const fileInput = await page.$('input[type=file]');
    if (fileInput) {
      await fileInput.setInputFiles(fixture);
    }
  }

  // Delete language (best-effort)
  await findAndClickText(page, 'Delete', 3000).catch(() => {});
});
