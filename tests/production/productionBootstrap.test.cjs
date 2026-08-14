const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { test } = require('node:test');

const repositoryRoot = path.resolve(__dirname, '../..');
const outputDirectory = path.join(os.tmpdir(), `scrolith-production-boot-${process.pid}`);
const chromePath = process.env.SCROLITH_CHROME_PATH ||
  (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);

const runBuild = () => {
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
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.ok(fs.existsSync(path.join(outputDirectory, 'index.html')));
};

const getFreePort = async () => {
  const net = require('node:net');
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
};

const startPreview = async () => {
  const port = await getFreePort();
  const preview = spawn(process.execPath, [
    path.join(repositoryRoot, 'node_modules/vite/bin/vite.js'),
    'preview',
    '--host', '127.0.0.1',
    '--port', String(port),
    '--outDir', outputDirectory
  ], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      VITE_BACKEND_URL: 'https://api.scrolith.com'
    },
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
    if (preview.exitCode !== null) {
      throw new Error(`Preview exited before startup.\n${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  preview.kill('SIGTERM');
  throw new Error(`Timed out waiting for preview server.\n${output}`);
};

const collectPageErrors = async (browser, url, authenticated = false) => {
  const context = await browser.newContext();
  if (authenticated) {
    await context.addInitScript(() => {
      localStorage.setItem('token', 'production-boot-fixture-token');
      localStorage.setItem('user', JSON.stringify({
        id: 'production-boot-fixture-user',
        email: 'boot-fixture@example.com',
        name: 'Boot Fixture',
        username: 'boot-fixture',
        role: 'freelancer'
      }));
    });
    await context.route('**/socket.io/**', (route) => route.abort());
    await context.route('**/api/**', async (route) => {
      if (route.request().url().includes('/auth/me')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'production-boot-fixture-user',
            email: 'boot-fixture@example.com',
            name: 'Boot Fixture',
            username: 'boot-fixture',
            role: 'freelancer'
          })
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] })
      });
    });
  }

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(authenticated ? 2_000 : 750);
  assert.ok(await page.locator('#root').evaluate((root) => root.childElementCount > 0), `${url} rendered no root application content`);
  await context.close();
  return errors;
};

test('production bundle boots without uncaught initialization errors', async (t) => {
  runBuild();
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

  for (const route of ['/', '/auth/login', '/messages', '/m/home']) {
    const errors = await collectPageErrors(browser, `${baseUrl}${route}`);
    assert.deepEqual(errors, [], `${route} page errors: ${errors.join('; ')}`);
  }

  const authenticatedErrors = await collectPageErrors(browser, `${baseUrl}/messages`, true);
  assert.deepEqual(authenticatedErrors, [], `authenticated page errors: ${authenticatedErrors.join('; ')}`);
});
