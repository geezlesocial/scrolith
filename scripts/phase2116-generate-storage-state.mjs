#!/usr/bin/env node
/**
 * Generate Playwright storage state for Phase 21.1.6 certification.
 *
 * Prefers API login (no browser CORS), then injects token into the CERT_BASE_URL origin.
 *
 * Usage:
 *   set CERT_EMAIL=...
 *   set CERT_PASSWORD=...
 *   set CERT_BASE_URL=https://p2115---scrolith-frontend-25ysnpjdda-as.a.run.app
 *   node scripts/phase2116-generate-storage-state.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const baseURL = (
  process.env.CERT_BASE_URL ||
  process.env.P2115_BASE_URL ||
  'https://p2115---scrolith-frontend-25ysnpjdda-as.a.run.app'
).replace(/\/$/, '');
const apiBase = (process.env.CERT_API_BASE || process.env.VITE_API_URL || 'https://api.scrolith.com/api').replace(
  /\/$/,
  ''
);
const email = process.env.CERT_EMAIL || process.env.SCROLITH_CERT_EMAIL || '';
const password = process.env.CERT_PASSWORD || process.env.SCROLITH_CERT_PASSWORD || '';
const out =
  process.env.CERT_STORAGE_STATE || join(root, 'tests/certification/fixtures/storage-state.json');
const outLegacy = join(root, 'tests/storageState.json');

if (!email || !password) {
  console.error('CERT_EMAIL and CERT_PASSWORD are required');
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
mkdirSync(dirname(outLegacy), { recursive: true });

const loginViaApi = async () => {
  const res = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const text = await res.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`API login failed HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const token = body.token || body.accessToken || body?.data?.token || body?.data?.accessToken;
  if (!token) throw new Error(`API login ok but no token in response: ${text.slice(0, 300)}`);
  return { token, user: body.user || body.data?.user || { email }, forcePasswordReset: body.forcePasswordReset };
};

const { token, user, forcePasswordReset } = await loginViaApi();
console.log(`API login OK as ${user?.email || email} forcePasswordReset=${Boolean(forcePasswordReset)}`);

const browser = await chromium.launch({ headless: process.env.CERT_HEADED === '1' ? false : true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  // Seed token before any app script runs
  await context.addInitScript(
    ({ token: t, user: u }) => {
      try {
        localStorage.setItem('token', t);
        localStorage.setItem('accessToken', t);
        localStorage.setItem('user', JSON.stringify(u || {}));
      } catch {
        /* ignore */
      }
    },
    { token, user }
  );

  await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2500);

  // Re-assert storage after navigation
  await page.evaluate(
    ({ token: t, user: u }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('accessToken', t);
      localStorage.setItem('user', JSON.stringify(u || {}));
    },
    { token, user }
  );

  // Probe authenticated API call via page (subject to CORS)
  const probe = await page.evaluate(async (api) => {
    try {
      const t = localStorage.getItem('token');
      const res = await fetch(`${api}/auth/me`, {
        headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' }
      });
      return { status: res.status, ok: res.ok, corsOk: true };
    } catch (e) {
      return { status: 0, ok: false, corsOk: false, error: String(e?.message || e) };
    }
  }, apiBase);

  console.log('Browser API probe /auth/me:', JSON.stringify(probe));

  const url = page.url();
  const bodySnippet = await page.locator('body').innerText().catch(() => '');
  console.log('Landed URL:', url);
  console.log('Body snippet:', bodySnippet.slice(0, 200).replace(/\s+/g, ' '));

  await context.storageState({ path: out });
  await context.storageState({ path: outLegacy });
  console.log(`Saved storage state → ${out}`);
  console.log(`Also saved → ${outLegacy}`);

  if (!probe.corsOk || !probe.ok) {
    console.warn(
      'WARNING: Authenticated browser API calls failed (likely CORS on CERT_BASE_URL). E2E against this origin will fail until CORS allows the origin or CERT_BASE_URL is scrolith.com with matching revision traffic.'
    );
    writeFileSync(
      join(root, 'playwright-results/phase2116/storage-state-probe.json'),
      JSON.stringify({ baseURL, apiBase, probe, forcePasswordReset, at: new Date().toISOString() }, null, 2)
    );
    // Still exit 0 if storage was written — gate will fail E2E honestly
  }
} catch (error) {
  console.error('Failed to generate storage state:', error?.message || error);
  process.exit(1);
} finally {
  await browser.close();
}
