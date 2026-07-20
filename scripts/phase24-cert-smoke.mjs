#!/usr/bin/env node
/**
 * Phase 24A — Community FE smoke against production API + tagged FE origin.
 * No tokens logged. Backend unchanged (00160-xez).
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'playwright-results/phase24');
mkdirSync(outDir, { recursive: true });

const apiBase = (process.env.CERT_API_BASE || 'https://api.scrolith.com/api').replace(/\/$/, '');
const feBase = (process.env.CERT_FE_BASE || 'https://scrolith.com').replace(/\/$/, '');
const report = {
  phase: '24A',
  generatedAt: new Date().toISOString(),
  apiBase,
  feBase,
  checks: {},
  stats: { passed: 0, failed: 0, skipped: 0 }
};

const log = (name, ok, detail = {}) => {
  const status = ok === 'SKIP' ? 'SKIP' : ok ? 'PASS' : 'FAIL';
  report.checks[name] = status;
  if (status === 'PASS') report.stats.passed += 1;
  else if (status === 'FAIL') report.stats.failed += 1;
  else report.stats.skipped += 1;
  console.log(JSON.stringify({ name, status, ...detail }));
};

const json = async (res) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 160) };
  }
};

let token = process.env.CERT_TOKEN || '';
if (!token) {
  for (const p of [
    join(root, 'tests/certification/fixtures/storage-state.p222.json'),
    join(root, 'tests/certification/fixtures/storage-state.p221.json'),
    join(root, 'tests/certification/fixtures/storage-state.json')
  ]) {
    if (!existsSync(p)) continue;
    try {
      const st = JSON.parse(readFileSync(p, 'utf8'));
      for (const o of st.origins || []) {
        const t = (o.localStorage || []).find((x) => x.name === 'token' || x.name === 'accessToken');
        if (t?.value) {
          token = t.value;
          break;
        }
      }
    } catch {
      /* ignore */
    }
    if (token) break;
  }
}

if (!token) {
  log('auth_token', false, { reason: 'missing' });
  writeFileSync(join(outDir, 'api-cert.json'), JSON.stringify(report, null, 2));
  process.exit(2);
}
log('auth_token', true);

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/json',
  'Content-Type': 'application/json'
};

// FE shells
for (const path of ['/', '/community', '/community/clubs', '/scroll', '/messages']) {
  try {
    const res = await fetch(`${feBase}${path}`, { redirect: 'follow' });
    log(`fe_${path.replace(/\//g, '_') || 'root'}`, res.ok || res.status === 401 || res.status === 403, {
      status: res.status
    });
  } catch (e) {
    log(`fe_${path.replace(/\//g, '_') || 'root'}`, false, { error: String(e?.message || e) });
  }
}

// Bundle markers for Phase 24 (lazy chunks may include community strings)
{
  try {
    const html = await (await fetch(feBase)).text();
    const jsMatch = html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/);
    const cssMatch = html.match(/assets\/(index-[A-Za-z0-9_-]+\.css)/);
    log('fe_entry_js', Boolean(jsMatch), { entry: jsMatch?.[1] || null });
    log('fe_entry_css', Boolean(cssMatch), { entry: cssMatch?.[1] || null });
    if (jsMatch) {
      const js = await (await fetch(`${feBase}/assets/${jsMatch[1]}`)).text();
      // Community is lazy; search index for Clubs/CommunityLayout chunk refs
      const hasCommunity = js.includes('CommunityLayout') || js.includes('community') || js.includes('Clubs');
      log('fe_bundle_community_ref', hasCommunity, { indexBytes: js.length });
    }
  } catch (e) {
    log('fe_entry_assets', false, { error: String(e?.message || e) });
  }
}

// Community clubs API (directory)
{
  const res = await fetch(`${apiBase}/community/clubs?limit=20`, { headers });
  const body = await json(res);
  const data = body?.data ?? body;
  const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  log('community_clubs_list', res.ok, { status: res.status, count: list.length });
}

// Search q
{
  const res = await fetch(`${apiBase}/community/clubs?q=a&limit=10`, { headers });
  log('community_clubs_search', res.ok, { status: res.status });
}

// Joined filter
{
  const res = await fetch(`${apiBase}/community/clubs?joinedOnly=true&limit=10`, { headers });
  log('community_clubs_joined', res.ok, { status: res.status });
}

// Privacy still works
{
  const res = await fetch(`${apiBase}/messages/settings/privacy`, { headers });
  log('phase223c_privacy', res.ok, { status: res.status });
}

// Scroll feed still works
{
  const res = await fetch(`${apiBase}/scroll/feed?limit=3`, { headers });
  log('phase23_scroll_feed', res.ok, { status: res.status });
}

// Messages list
{
  const res = await fetch(`${apiBase}/messages/conversations?limit=3`, { headers });
  log('phase22_messages', res.ok, { status: res.status });
}

// Health
{
  const res = await fetch(apiBase.replace(/\/api$/, '') + '/api/health');
  log('api_health', res.ok, { status: res.status });
}

report.overall = report.stats.failed === 0 ? 'PASS' : 'FAIL';
report.migrationRequired = false;
report.migrationStatus = 'NOT_APPLICABLE';
report.backendUnchanged = true;
writeFileSync(join(outDir, 'api-cert.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ overall: report.overall, stats: report.stats }, null, 2));
process.exit(report.stats.failed === 0 ? 0 : 1);
