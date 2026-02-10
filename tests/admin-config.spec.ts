import { test, expect } from '@playwright/test';
test.setTimeout(180000);
// axios removed: using Playwright `request` fixture for API login

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND = process.env.BACKEND_URL || 'http://localhost:5000';
const ADMIN = { email: 'admin@local.test', password: 'adminpass' };

test('admin config form updates propagate to another client', async ({ browser, request }) => {
  // login via Playwright request fixture (deterministic)
  const loginResp = await request.post(`${BACKEND}/api/auth/login`, { data: ADMIN });
  if (loginResp.status() !== 200) throw new Error('Login failed in test');
  const loginJson = await loginResp.json();
  const token = loginJson.token;
  if (!token) throw new Error('Login did not return token');

  // seed auth on each context: add cookie + localStorage before navigation
  const seedUser = { id: 'admin-local', email: 'admin@local.test', name: 'Local Admin', role: 'admin' };

  // Persist a seeded storageState so contexts start authenticated
  const seedStatePath = 'tests/.auth-storage.json';
  const seedCtx = await browser.newContext();
  await seedCtx.addCookies([{ name: 'Scrolith_token', value: token, url: FRONTEND }]);
  await seedCtx.addInitScript(({ token, user }) => {
    try {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    } catch (e) {}
  }, { token, user: seedUser });
  // Open a page so the init script runs and localStorage is actually populated
  const seedPage = await seedCtx.newPage();
  await seedPage.goto(FRONTEND, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await seedPage.close();
  await seedCtx.storageState({ path: seedStatePath });
  await seedCtx.close();

  const viewerContext = await browser.newContext({ storageState: seedStatePath });
  const adminContext = await browser.newContext({ storageState: seedStatePath });
  const viewerPage = await viewerContext.newPage();
  const adminPage = await adminContext.newPage();

  // Attach console listeners to capture browser logs for debugging
  adminPage.on('console', msg => console.log('[ADMIN PAGE]', msg.type(), msg.text()));
  adminPage.on('pageerror', err => console.log('[ADMIN PAGE][ERROR]', err.message));
  viewerPage.on('console', msg => console.log('[VIEWER PAGE]', msg.type(), msg.text()));
  viewerPage.on('pageerror', err => console.log('[VIEWER PAGE][ERROR]', err.message));

  // Navigate both pages and wait for network idle (SPA-friendly) with higher timeout
  await Promise.all([
    viewerPage.goto(`${FRONTEND}/Scrolith/admin/dashboard?tab=settings`, { waitUntil: 'networkidle', timeout: 120000 }),
    adminPage.goto(`${FRONTEND}/Scrolith/admin/dashboard?tab=settings`,  { waitUntil: 'networkidle', timeout: 120000 }),
  ]);

  // Wait for auth check to complete (helps detect 401 early)
  await Promise.all([
    // Wait for any response to /api/auth/me and accept any status so we can log 401 vs 200
    viewerPage.waitForResponse(r => r.url().includes('/api/auth/me'), { timeout: 60000 }),
    adminPage.waitForResponse(r => r.url().includes('/api/auth/me'), { timeout: 60000 }),
  ]);

  // ensure both pages load the Edit Config button
  await expect(adminPage.locator('button:has-text("Edit Config")')).toBeVisible({ timeout: 30000 });
  await expect(viewerPage.locator('button:has-text("Edit Config")')).toBeVisible({ timeout: 30000 });

  // admin opens editor, changes numeric value, saves
  await adminPage.click('button:has-text("Edit Config")');
  const maxImagesInput = adminPage.locator('[data-testid="cfg-max-images"]');
  await maxImagesInput.fill('3');
  await adminPage.click('button:has-text("Save")');

  // viewer should observe update via socket -> UI will update; wait for changed numeric input value
  const viewerMax = viewerPage.locator('[data-testid="cfg-max-images"]');
  await expect(viewerMax).toHaveValue('3', { timeout: 8000 });
});

