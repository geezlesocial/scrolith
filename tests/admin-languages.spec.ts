import { test, expect } from '@playwright/test';
import path from 'path';

test('Admin Languages smoke test', async ({ page }) => {
  // Pre-set an admin user and token so the SPA initializes as admin
  await page.addInitScript(() => {
    try {
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('user', JSON.stringify({ id: 'admin-test', role: 'admin', email: 'admin@example.com', name: 'Admin' }));
    } catch (e) {
      // ignore
    }
  });

  const base = 'http://localhost:3000/Scrolith';

  await page.goto(`${base}/admin/dashboard`, { waitUntil: 'domcontentloaded' });

  // Open the Setup & Configurations -> Languages nav if present
  const setupGroup = page.locator('text=Setup & Configurations');
  if (await setupGroup.count() > 0) {
    await setupGroup.click();
  }

  await page.click('button:has-text("Languages")');

  await expect(page.locator('h2')).toHaveText('Languages');

  // Click Add New Language and fill the form
  await page.click('button:has-text("Add New Language")');
  const inputs = page.locator('div[role="dialog"] input, div[role="dialog"] textarea, div[role="dialog"] input[type="checkbox"]');
  // Fallback selectors: pick inputs in modal
  const modalInputs = page.locator('input').filter({ has: page.locator('..') });

  // Use positional fills (modal has 3 inputs and one checkbox)
  const modal = page.locator('div:has-text("Add Language")');
  await modal.locator('input').nth(0).fill('English');
  await modal.locator('input').nth(1).fill('en');
  await modal.locator('input').nth(2).fill('en');
  await modal.locator('input[type="checkbox"]').check();

  await modal.locator('button:has-text("Save")').click();

  // Ensure the new language appears in the list
  await expect(page.locator('div').filter({ hasText: 'English' })).toHaveCount(1);

  const row = page.locator('div').filter({ hasText: 'English' }).first();

  // Export (should download or at least trigger the handler)
  await row.locator('button:has-text("Export")').click();

  // Translate (calls translateByGoogle or fallback)
  await row.locator('button:has-text("Translate")').click();

  // Sync App
  await row.locator('button:has-text("Sync App")').click();

  // Import: set file input to fixture
  const fixture = path.join(__dirname, 'fixtures', 'en_translations.json');
  // Trigger the Import button which opens hidden file input
  await row.locator('button:has-text("Import")').click();
  // Find hidden file input and set files
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(fixture);

  // Finally, attempt delete to clean up
  await row.locator('button:has-text("Delete")').click();
  // Confirm dialog handling (if present)
  try {
    await page.waitForEvent('dialog', { timeout: 2000 }).then(dialog => dialog.accept()).catch(() => {});
  } catch {}
});

