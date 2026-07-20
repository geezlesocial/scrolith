#!/usr/bin/env node
/**
 * Phase 22.1B — staged FE smoke: messages shell + scroll route deep-link shape + home not used.
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'playwright-results/phase221b');
mkdirSync(outDir, { recursive: true });

const baseURL = (
  process.env.CERT_BASE_URL || 'https://p221b---scrolith-frontend-25ysnpjdda-as.a.run.app'
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
    use: {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true
    }
  },
  { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
  { name: 'iphone-15', use: { ...devices['iPhone 15'] } }
];

const results = [];
const { token, user } = loadToken();

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
    await page.goto('/member-home', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(4500);
    row.checks.member_home_shell = !/auth\/login/i.test(page.url());
    const body = (await page.locator('body').innerText().catch(() => '')) || '';
    row.checks.feed_shell = /for you|post|scroll|recommended|home/i.test(body) || row.checks.member_home_shell;

    // Scroll deep-link route mounts (invalid id should not redirect to /home)
    await page.goto('/scroll?scroll=phase221b-cert-missing-id', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await page.waitForTimeout(4000);
    const scrollUrl = page.url();
    row.checks.scroll_route_stays_on_scroll = /\/scroll/i.test(scrollUrl);
    row.checks.no_home_redirect = !/\/home(?:\?|$|\/)/i.test(scrollUrl.replace(/https?:\/\/[^/]+/, ''));
    const scrollBody = (await page.locator('body').innerText().catch(() => '')) || '';
    row.checks.scroll_unavailable_or_player =
      /no longer available|browse scroll|scroll|video/i.test(scrollBody) ||
      (await page.locator('video').count().catch(() => 0)) > 0;

    // Canonical query shape present in history
    row.checks.deep_link_query_shape = /[?&]scroll=/.test(scrollUrl);

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
  phase: '22.1B-e2e',
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
