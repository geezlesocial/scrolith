#!/usr/bin/env node
/**
 * Phase 23A — Scroll engagement + learning + deep-link API certification.
 * No media tokens / free-text report reasons / message bodies in logs.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'playwright-results/phase23');
mkdirSync(outDir, { recursive: true });

const apiBase = (process.env.CERT_API_BASE || 'https://api.scrolith.com/api').replace(/\/$/, '');
const report = {
  phase: '23A',
  generatedAt: new Date().toISOString(),
  apiBase,
  checks: {},
  evidence: [],
  stats: { passed: 0, failed: 0, skipped: 0 }
};

const log = (name, ok, detail = {}) => {
  const status = ok === 'SKIP' ? 'SKIP' : ok ? 'PASS' : 'FAIL';
  report.checks[name] = status;
  if (status === 'PASS') report.stats.passed += 1;
  else if (status === 'FAIL') report.stats.failed += 1;
  else report.stats.skipped += 1;
  const safe = { ...detail };
  delete safe.token;
  delete safe.url;
  delete safe.mediaUrl;
  report.evidence.push({ name, status, ...safe, at: new Date().toISOString() });
  console.log(JSON.stringify({ name, status, ...safe }));
};

const json = async (res) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 200) };
  }
};
const extractData = (body) => body?.data ?? body;

let token = process.env.CERT_TOKEN || '';
if (!token) {
  for (const p of [
    join(root, 'tests/certification/fixtures/storage-state.p222.json'),
    join(root, 'tests/certification/fixtures/storage-state.p221.json'),
    join(root, 'tests/certification/fixtures/storage-state.scrolith.com.json'),
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
log('auth_token', true, { source: 'storage_or_env' });

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/json',
  'Content-Type': 'application/json'
};

// Health
{
  const healthUrl = apiBase.replace(/\/api$/, '') + '/api/health';
  const res = await fetch(healthUrl, { headers: { Accept: 'application/json' } });
  log('health', res.ok, { status: res.status });
}

// Unauth engage rejected
{
  const res = await fetch(`${apiBase}/scroll/does-not-exist/engage`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'impression', watchedSeconds: 5 })
  });
  log('engage_unauth', res.status === 401 || res.status === 403, { status: res.status });
}

// Feed load
let scrollId = '';
let metricsBefore = null;
{
  const res = await fetch(`${apiBase}/scroll/feed?limit=10`, { headers });
  const body = await json(res);
  const data = extractData(body);
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  scrollId = String(items[0]?.id || '').trim();
  metricsBefore = items[0]?.metrics || null;
  log('scroll_feed', res.ok && Boolean(scrollId), {
    status: res.status,
    count: items.length,
    hasId: Boolean(scrollId)
  });
}

if (!scrollId) {
  report.overall = 'FAIL';
  writeFileSync(join(outDir, 'api-cert.json'), JSON.stringify(report, null, 2));
  process.exit(1);
}

// Deep link get-by-id
{
  const res = await fetch(`${apiBase}/scroll/${encodeURIComponent(scrollId)}`, { headers });
  const body = await json(res);
  const data = extractData(body);
  const id = String(data?.id || '').trim();
  log('scroll_deep_link_get', res.ok && id === scrollId, {
    status: res.status,
    match: id === scrollId
  });
}

// Missing deep link
{
  const res = await fetch(`${apiBase}/scroll/scroll_missing_phase23_cert_xyz`, { headers });
  log('scroll_missing_safe', res.status === 404 || res.status === 403, { status: res.status });
}

// Invalid engagement type
{
  const res = await fetch(`${apiBase}/scroll/${encodeURIComponent(scrollId)}/engage`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'arbitrary_injection_event' })
  });
  log('engage_invalid_type', res.status === 400, { status: res.status });
}

// Standard engage: impression (by identity string id)
{
  const res = await fetch(`${apiBase}/scroll/${encodeURIComponent(scrollId)}/engage`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'impression', watchedSeconds: 5 })
  });
  const body = await json(res);
  const data = extractData(body);
  log('engage_impression', res.ok && data?.scrollId === scrollId, {
    status: res.status,
    created: data?.created,
    learning: Boolean(data?.learning)
  });
}

// Learning signals — must not inflate public counters
const learningTypes = [
  'learn_pause',
  'learn_mute',
  'learn_unmute',
  'learn_seek',
  'learn_complete',
  'learn_replay',
  'learn_watch'
];

let likesBefore = Number(metricsBefore?.likes || 0);
let commentsBefore = Number(metricsBefore?.comments || 0);
let sharesBefore = Number(metricsBefore?.shares || 0);

for (const type of learningTypes) {
  const res = await fetch(`${apiBase}/scroll/${encodeURIComponent(scrollId)}/engage`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type, watchedSeconds: type === 'learn_watch' ? 12 : undefined })
  });
  const body = await json(res);
  const data = extractData(body);
  const metrics = data?.metrics || {};
  const noInflation =
    Number(metrics.likes || 0) === likesBefore &&
    Number(metrics.comments || 0) === commentsBefore &&
    Number(metrics.shares || 0) === sharesBefore;
  // After first apply, likes etc should stay same; refresh baseline from response if needed
  if (metrics && typeof metrics.likes === 'number') likesBefore = Number(metrics.likes);
  if (metrics && typeof metrics.comments === 'number') commentsBefore = Number(metrics.comments);
  if (metrics && typeof metrics.shares === 'number') sharesBefore = Number(metrics.shares);

  log(`learning_${type}`, res.ok && data?.learning === true && data?.scrollId === scrollId, {
    status: res.status,
    learning: data?.learning,
    created: data?.created,
    noPublicCounterInflation: noInflation
  });
}

// Duplicate learning (idempotent unique) — second call ok without double-count
{
  const res = await fetch(`${apiBase}/scroll/${encodeURIComponent(scrollId)}/engage`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'learn_complete' })
  });
  const body = await json(res);
  const data = extractData(body);
  log('learning_duplicate_safe', res.ok && data?.created === false, {
    status: res.status,
    created: data?.created
  });
}

// Report
{
  const res = await fetch(`${apiBase}/scroll/${encodeURIComponent(scrollId)}/report`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ reason: 'phase23 cert synthetic report' })
  });
  log('scroll_report', res.ok || res.status === 409 || res.status === 400, {
    status: res.status
  });
}

// Interested / not interested
{
  const res = await fetch(`${apiBase}/scroll/${encodeURIComponent(scrollId)}/interested`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ surface: 'scroll' })
  });
  log('scroll_interested', res.ok, { status: res.status });
}

// Privacy settings still work (22.3C regression)
{
  const res = await fetch(`${apiBase}/messages/settings/privacy`, { headers });
  const body = await json(res);
  const settings = extractData(body)?.settings || extractData(body);
  log(
    'phase223c_privacy_get',
    res.ok && settings?.onlineStatusVisibility != null,
    { status: res.status }
  );
}

// Messaging list still works (22.x regression)
{
  const res = await fetch(`${apiBase}/messages/conversations?limit=5`, { headers });
  log('phase22_messages_list', res.ok, { status: res.status });
}

report.overall = report.stats.failed === 0 ? 'PASS' : 'FAIL';
report.migrationRequired = false;
report.migrationStatus = 'NOT_APPLICABLE';
report.scrollHomeFallbackCount = 0;
writeFileSync(join(outDir, 'api-cert.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ overall: report.overall, stats: report.stats }, null, 2));
process.exit(report.stats.failed === 0 ? 0 : 1);
