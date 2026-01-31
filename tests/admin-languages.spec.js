const { test, expect } = require('@playwright/test');
const path = require('path');

// Use generated storageState when available
test.use({ storageState: path.join(__dirname, 'storageState.json') });

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

  // Navigate to admin dashboard
  await page.goto('/admin/dashboard', { waitUntil: 'networkidle' });

  // Open Setup & Configurations (if present)
  await findAndClickText(page, 'Setup & Configurations', 8000).catch(() => {});

  // Open Languages
  const opened = await findAndClickText(page, 'Languages', 15000);
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
  // Click Import then set file if input present
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
