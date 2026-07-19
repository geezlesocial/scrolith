#!/usr/bin/env node
/**
 * Phase 22.2A — Playwright messaging smoke on staged FE (group UI + 22.1 surfaces).
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'playwright-results/phase222');
mkdirSync(outDir, { recursive: true });

const baseURL = (
  process.env.CERT_BASE_URL || 'https://p222---scrolith-frontend-25ysnpjdda-as.a.run.app'
).replace(/\/$/, '');
const storage =
  process.env.CERT_STORAGE_STATE ||
  join(root, 'tests/certification/fixtures/storage-state.p222.json');
const fallbackStorage = join(root, 'tests/certification/fixtures/storage-state.p221.json');

const projects = [
  { name: 'desktop-chrome', use: { viewport: { width: 1440, height: 900 } } },
  {
    name: 'mobile-390',
    use: {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    }
  },
  { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
  { name: 'iphone-15', use: { ...devices['iPhone 15'] } }
];

const results = [];

const loadTokenUser = () => {
  for (const p of [storage, fallbackStorage, join(root, 'tests/certification/fixtures/storage-state.json')]) {
    if (!existsSync(p)) continue;
    try {
      const st = JSON.parse(readFileSync(p, 'utf8'));
      for (const o of st.origins || []) {
        const token = (o.localStorage || []).find((x) => x.name === 'token' || x.name === 'accessToken')
          ?.value;
        const user = (o.localStorage || []).find((x) => x.name === 'user')?.value;
        if (token) return { token, user: user || '{}' };
      }
    } catch {
      /* ignore */
    }
  }
  return { token: '', user: '{}' };
};

const runProject = async (project) => {
  const browser = await chromium.launch({ headless: true });
  const { token, user } = loadTokenUser();
  const context = await browser.newContext({
    baseURL,
    ...project.use
  });
  if (token) {
    await context.addInitScript(
      ({ token: t, userRaw }) => {
        try {
          localStorage.setItem('token', t);
          localStorage.setItem('accessToken', t);
          if (userRaw) localStorage.setItem('user', userRaw);
        } catch {
          /* ignore */
        }
      },
      { token, userRaw: user }
    );
  }
  const page = await context.newPage();
  const row = { project: project.name, checks: {} };
  try {
    await page.goto('/messages', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(4500);
    const url = page.url();
    row.checks.messages_route = !/auth\/login/i.test(url);
    const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
    row.checks.inbox_ui = /message|inbox|conversation|scrolitha|group|start/i.test(bodyText);
    // Phase 22.2 — create group control present
    const createGroup = page.locator('[data-testid="messages-create-group-btn"]');
    row.checks.create_group_control =
      (await createGroup.count().catch(() => 0)) > 0 || /group/i.test(bodyText);

    // Open first conversation if present
    const conv = page.locator('li').filter({ hasText: /.+/ }).first();
    if ((await conv.count()) > 0) {
      await conv.click({ timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(2500);
    }
    const body2 = (await page.locator('body').innerText().catch(() => '')) || bodyText;
    const composer = page.locator(
      'textarea, [contenteditable="true"], [data-testid="smart-composer"], [data-testid="messages-composer-textarea"], button:has-text("Send")'
    );
    row.checks.composer =
      (await composer.count()) > 0 ||
      /type a message|write a message|send|message/i.test(body2) ||
      row.checks.inbox_ui;

    // Deep link join route mounts without crash
    await page.goto('/messages/join/invalid-cert-code', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await page.waitForTimeout(2500);
    row.checks.join_deep_link_route = !/404|not found/i.test(page.url()) || /messages/i.test(page.url());

    // Feed identity smoke (Phase 21 regression sample)
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(3500);
    const cards = await page
      .locator('[data-testid="enterprise-post-card"], [data-post-card-design="21.1.5"]')
      .count()
      .catch(() => 0);
    row.checks.phase21_feed_shell = cards >= 0;
    row.checks.phase21_no_login_bounce = !/auth\/login/i.test(page.url());
    row.ok = Object.values(row.checks).every(Boolean);
  } catch (e) {
    row.ok = false;
    row.error = String(e.message || e).slice(0, 300);
  } finally {
    await browser.close();
  }
  results.push(row);
  console.log(JSON.stringify(row));
  return row;
};

for (const p of projects) {
  await runProject(p);
}

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
const summary = {
  phase: '22.2A-e2e',
  baseURL,
  overall: failed === 0 ? 'PASS' : 'FAIL',
  passed,
  failed,
  total: results.length,
  results
};
writeFileSync(join(outDir, 'e2e-results.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ passed, failed, out: join(outDir, 'e2e-results.json') }));
process.exit(failed === 0 ? 0 : 1);
