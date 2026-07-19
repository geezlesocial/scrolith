#!/usr/bin/env node
/**
 * Phase 21.1.8 — re-bind existing cert token to https://scrolith.com origin.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const srcPath =
  process.env.CERT_STORAGE_STATE || join(root, 'tests/certification/fixtures/storage-state.json');
const outPath = join(root, 'tests/certification/fixtures/storage-state.scrolith.com.json');
const origin = (process.env.CERT_BASE_URL || 'https://scrolith.com').replace(/\/$/, '');
const apiBase = (process.env.CERT_API_BASE || 'https://api.scrolith.com/api').replace(/\/$/, '');

if (!existsSync(srcPath)) {
  console.error('missing storage state', srcPath);
  process.exit(1);
}

const existing = JSON.parse(readFileSync(srcPath, 'utf8'));
const src = (existing.origins || []).find((o) =>
  (o.localStorage || []).some((x) => x.name === 'token' || x.name === 'accessToken')
);
if (!src) {
  console.error('no token in storage state');
  process.exit(1);
}
const token =
  src.localStorage.find((x) => x.name === 'token')?.value ||
  src.localStorage.find((x) => x.name === 'accessToken')?.value;
const userRaw = src.localStorage.find((x) => x.name === 'user')?.value || '{}';
let user = {};
try {
  user = JSON.parse(userRaw);
} catch {
  user = {};
}

const me = await fetch(`${apiBase}/auth/me`, {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
});
const meText = await me.text();
console.log(JSON.stringify({ authMeStatus: me.status, body: meText.slice(0, 240), email: user.email }, null, 2));
if (!me.ok) {
  console.error('token invalid against production API — cannot auth on scrolith.com without credentials');
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
const page = await context.newPage();
await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForTimeout(5000);
const url = page.url();
const signIn = await page.getByRole('link', { name: /sign in/i }).count();
const cards = await page
  .locator('[data-testid="enterprise-post-card"], [data-post-card-design="21.1.5"]')
  .count();
const account = await page.getByRole('button', { name: /account|profile|menu/i }).count();
console.log(JSON.stringify({ url, signInLinks: signIn, postCards: cards, accountish: account }, null, 2));

await context.storageState({ path: outPath });
// Ensure dual localStorage entries for scrolith.com
const state = JSON.parse(readFileSync(outPath, 'utf8'));
const ls = [
  { name: 'token', value: token },
  { name: 'accessToken', value: token },
  { name: 'user', value: userRaw }
];
const idx = (state.origins || []).findIndex((o) => o.origin === origin);
if (idx >= 0) state.origins[idx].localStorage = ls;
else {
  state.origins = state.origins || [];
  state.origins.push({ origin, localStorage: ls });
}
writeFileSync(outPath, JSON.stringify(state, null, 2));
await browser.close();
console.log('wrote', outPath);
process.exit(cards > 0 || signIn === 0 ? 0 : 3);
