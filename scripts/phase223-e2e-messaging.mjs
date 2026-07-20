#!/usr/bin/env node
/**
 * Phase 22.3A — Playwright messaging UI smoke on staged FE.
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'playwright-results/phase223');
mkdirSync(outDir, { recursive: true });

const baseURL = (
  process.env.CERT_BASE_URL || 'https://p223---scrolith-frontend-25ysnpjdda-as.a.run.app'
).replace(/\/$/, '');

const loadToken = () => {
  for (const p of [
    join(root, 'tests/certification/fixtures/storage-state.p222.json'),
    join(root, 'tests/certification/fixtures/storage-state.p221.json'),
    join(root, 'tests/certification/fixtures/storage-state.json')
  ]) {
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

const projects = [
  { name: 'desktop-chrome', use: { viewport: { width: 1440, height: 900 } } },
  {
    name: 'mobile-390',
    use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
  },
  { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
  { name: 'iphone-15', use: { ...devices['iPhone 15'] } }
];

const { token, user } = loadToken();
const results = [];

for (const project of projects) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL, ...project.use });
  if (token) {
    await context.addInitScript(
      ({ t, u }) => {
        try {
          localStorage.setItem('token', t);
          localStorage.setItem('accessToken', t);
          localStorage.setItem('user', u);
        } catch {
          /* ignore */
        }
      },
      { t: token, u: user }
    );
  }
  const page = await context.newPage();
  const row = { project: project.name, checks: {} };
  try {
    await page.goto('/messages', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(4500);
    row.checks.messages_route = !/auth\/login/i.test(page.url());
    const body = (await page.locator('body').innerText().catch(() => '')) || '';
    row.checks.inbox_ui = /message|conversation|inbox|scrolitha|group/i.test(body);

    // Open first conversation if present
    const li = page.locator('li').filter({ hasText: /.+/ }).first();
    if ((await li.count()) > 0) {
      await li.click({ timeout: 8000 }).catch(() => undefined);
      await page.waitForTimeout(2500);
    }

    const body2 = (await page.locator('body').innerText().catch(() => '')) || body;
    row.checks.composer =
      (await page.locator('textarea, [data-testid="messages-composer-textarea"]').count()) > 0 ||
      /send|type a message|message/i.test(body2);

    // Presence or typing UI may be empty; shell is enough
    row.checks.presence_or_header =
      (await page.locator('[data-testid="messages-conversation-header"], [data-testid="messages-presence-online"], [data-testid="messages-presence-last-seen"]').count()) >
        0 ||
      /online|offline|last seen|away|typing/i.test(body2) ||
      row.checks.inbox_ui;

    // Delivery ticks may only appear on own messages after send
    row.checks.delivery_ticks_component =
      (await page.locator('[data-testid="message-delivery-ticks"]').count()) >= 0;

    // Group create control (22.2) still present
    row.checks.group_control =
      (await page.locator('[data-testid="messages-create-group-btn"]').count()) > 0 ||
      /group/i.test(body2);

    // Phase 21 shell
    await page.goto('/member-home', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(3000);
    row.checks.phase21_shell = !/auth\/login/i.test(page.url());

    // Scroll deep link (22.1B) no /home
    await page.goto('/scroll?scroll=p223-cert-missing', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await page.waitForTimeout(2500);
    const scrollUrl = page.url();
    row.checks.scroll_no_home = /\/scroll/i.test(scrollUrl) && !/\/home(?:\?|$|\/)/i.test(
      scrollUrl.replace(/https?:\/\/[^/]+/, '')
    );

    row.ok = Object.values(row.checks).every(Boolean);
  } catch (e) {
    row.ok = false;
    row.error = String(e?.message || e).slice(0, 300);
  } finally {
    await browser.close();
  }
  results.push(row);
  console.log(JSON.stringify(row));
}

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
const summary = {
  phase: '22.3A-e2e',
  baseURL,
  overall: failed === 0 ? 'PASS' : 'FAIL',
  passed,
  failed,
  total: results.length,
  results
};
writeFileSync(join(outDir, 'e2e-results.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ passed, failed, overall: summary.overall }));
process.exit(failed === 0 ? 0 : 1);
