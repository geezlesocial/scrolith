const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { test } = require('node:test');

const repositoryRoot = path.resolve(__dirname, '../..');
const outputDirectory = path.join(os.tmpdir(), `scrolith-scroll-gesture-${process.pid}`);
const chromePath = process.env.SCROLITH_CHROME_PATH ||
  (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);

const buildProductionOutput = () => {
  fs.rmSync(outputDirectory, { recursive: true, force: true });
  const vite = path.join(repositoryRoot, 'node_modules/vite/bin/vite.js');
  const result = spawnSync(process.execPath, [vite, 'build', '--outDir', outputDirectory], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      VITE_API_URL: 'https://api.scrolith.com/api',
      VITE_BACKEND_URL: 'https://api.scrolith.com',
      VITE_PUBLIC_APP_DOMAIN: 'scrolith.com',
      VITE_MESSAGES_TRACE_DEBUG: 'false'
    },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
};

const startPreview = async () => {
  const port = 4191;
  const preview = spawn(process.execPath, [
    path.join(repositoryRoot, 'node_modules/vite/bin/vite.js'),
    'preview',
    '--host', '127.0.0.1',
    '--port', String(port),
    '--outDir', outputDirectory
  ], {
    cwd: repositoryRoot,
    env: { ...process.env, VITE_BACKEND_URL: 'https://api.scrolith.com' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  preview.stdout.on('data', (chunk) => { output += chunk.toString(); });
  preview.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const baseUrl = `http://127.0.0.1:${port}`;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) return { preview, baseUrl };
    } catch {}
    if (preview.exitCode !== null) throw new Error(`Preview exited before startup.\n${output}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  preview.kill();
  throw new Error(`Timed out waiting for preview server.\n${output}`);
};

const exerciseRoute = async (browser, baseUrl, route, useWheel) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    localStorage.setItem('token', 'scroll-gesture-fixture-token');
    localStorage.setItem('user', JSON.stringify({
      id: 'scroll-gesture-fixture-user',
      email: 'scroll-gesture-fixture@example.com',
      name: 'Scroll Gesture Fixture',
      username: 'scroll-gesture-fixture',
      role: 'freelancer'
    }));
  });
  await context.route('**/socket.io/**', (request) => request.abort());
  await context.route('**/api/**', async (request) => {
    if (request.request().url().includes('/auth/me')) {
      await request.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'scroll-gesture-fixture-user',
          email: 'scroll-gesture-fixture@example.com',
          name: 'Scroll Gesture Fixture',
          username: 'scroll-gesture-fixture',
          role: 'freelancer'
        })
      });
      return;
    }
    await request.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] })
    });
  });

  const page = await context.newPage();
  const passiveWarnings = [];
  const consoleWarnings = [];
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') consoleWarnings.push(message.text());
    if (message.type() === 'error') consoleErrors.push(message.text());
    if (message.text().includes('Unable to preventDefault inside passive event listener invocation')) {
      passiveWarnings.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(`${error.name}: ${error.message}`));
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(1_500);

  if (useWheel) {
    const feed = page.locator('[data-testid="scroll-feed"]');
    if (await feed.count()) {
      await feed.hover();
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(300);
      await feed.dispatchEvent('touchstart', { bubbles: true });
      await feed.dispatchEvent('touchend', { bubbles: true });
      await page.waitForTimeout(300);
    }
  }

  const result = { route, passiveWarnings, consoleWarnings, consoleErrors, pageErrors };
  await context.close();
  return result;
};

test('built Scroll gesture runtime has no passive preventDefault warning', async (t) => {
  buildProductionOutput();
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    ...(chromePath ? { executablePath: chromePath } : {}),
    args: ['--no-sandbox']
  });
  const { preview, baseUrl } = await startPreview();
  t.after(async () => {
    await browser.close();
    preview.kill();
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  });

  const results = [
    await exerciseRoute(browser, baseUrl, '/member-home', false),
    await exerciseRoute(browser, baseUrl, '/scroll', true),
    await exerciseRoute(browser, baseUrl, '/community/scroll', true)
  ];
  const passiveWarnings = results.flatMap((result) => result.passiveWarnings);
  const pageErrors = results.flatMap((result) => result.pageErrors);
  assert.deepEqual(passiveWarnings, [], `passive listener warnings: ${passiveWarnings.join('; ')}`);
  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join('; ')}`);
});
