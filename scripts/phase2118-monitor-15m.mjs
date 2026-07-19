#!/usr/bin/env node
/**
 * Phase 21.1.8 — 15-minute post-promotion Cloud Run monitoring (FE + optional BE).
 * Polls every 60s for 15 minutes; writes evidence JSON.
 */
import { spawnSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'docs/evidence');
mkdirSync(outDir, { recursive: true });

const durationMs = Number(process.env.MONITOR_MS || 15 * 60 * 1000);
const intervalMs = Number(process.env.MONITOR_INTERVAL_MS || 60_000);
const revision = process.env.MONITOR_REVISION || 'scrolith-frontend-00203-yot';
const project = process.env.GCP_PROJECT || 'scrolith-500821';
const origin = process.env.CERT_BASE_URL || 'https://scrolith.com';

const started = Date.now();
const samples = [];

function gcloudJson(args) {
  const r = spawnSync('gcloud', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) {
    return { error: r.stderr || r.stdout || 'gcloud failed', status: r.status };
  }
  try {
    return JSON.parse(r.stdout || '[]');
  } catch {
    return { error: 'json_parse', raw: (r.stdout || '').slice(0, 500) };
  }
}

function fetchStatus(url) {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'Scrolith-Monitor/21.1.8' }, timeout: 15000 },
      (res) => {
        res.resume();
        resolve({ status: res.statusCode });
      }
    );
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, error: 'timeout' });
    });
  });
}

console.log(`[monitor] start ${new Date().toISOString()} duration=${durationMs}ms revision=${revision}`);

while (Date.now() - started < durationMs) {
  const t = Date.now() - started;
  const freshness = '5m';
  const filter5xx = `resource.type="cloud_run_revision" AND resource.labels.service_name="scrolith-frontend" AND resource.labels.revision_name="${revision}" AND httpRequest.status>=500`;
  const filterErr = `resource.type="cloud_run_revision" AND resource.labels.service_name="scrolith-frontend" AND resource.labels.revision_name="${revision}" AND severity>=ERROR`;
  const filterAuth = `resource.type="cloud_run_revision" AND resource.labels.service_name=~"scrolith-(frontend|backend)" AND (httpRequest.status=401 OR httpRequest.status=403 OR textPayload:"auth" OR jsonPayload.message:"auth") AND severity>=WARNING`;

  const five = gcloudJson([
    'logging',
    'read',
    filter5xx,
    `--project=${project}`,
    `--limit=20`,
    `--format=json`,
    `--freshness=${freshness}`
  ]);
  const errs = gcloudJson([
    'logging',
    'read',
    filterErr,
    `--project=${project}`,
    `--limit=20`,
    `--format=json`,
    `--freshness=${freshness}`
  ]);

  const home = await fetchStatus(origin + '/');
  const login = await fetchStatus(origin + '/auth/login');
  // Head assets
  const htmlProbe = await new Promise((resolve) => {
    https
      .get(origin + '/', { headers: { 'User-Agent': 'Scrolith-Monitor/21.1.8' }, timeout: 15000 }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      })
      .on('error', (e) => resolve({ status: 0, error: e.message }));
  });
  let asset404 = 0;
  if (htmlProbe.body) {
    const refs = [
      ...htmlProbe.body.matchAll(/src=["']([^"']+)["']/gi),
      ...htmlProbe.body.matchAll(/href=["']([^"']+\.css[^"']*)["']/gi)
    ].map((m) => m[1]);
    for (const ref of refs.slice(0, 8)) {
      const url = ref.startsWith('http') ? ref : origin + (ref.startsWith('/') ? ref : `/${ref}`);
      if (!url.includes('/assets/')) continue;
      const st = await fetchStatus(url);
      if (st.status === 404) asset404 += 1;
    }
  }

  const sample = {
    t,
    at: new Date().toISOString(),
    fiveXxCount: Array.isArray(five) ? five.length : -1,
    errorCount: Array.isArray(errs) ? errs.length : -1,
    homeStatus: home.status,
    loginStatus: login.status,
    asset404,
    fiveSample: Array.isArray(five)
      ? five.slice(0, 3).map((e) => ({
          ts: e.timestamp,
          status: e.httpRequest?.status,
          url: e.httpRequest?.requestUrl
        }))
      : five,
    errSample: Array.isArray(errs)
      ? errs.slice(0, 3).map((e) => ({
          ts: e.timestamp,
          sev: e.severity,
          msg: String(e.textPayload || e.jsonPayload?.message || '').slice(0, 160)
        }))
      : errs
  };
  samples.push(sample);
  console.log(
    `[monitor] t=${Math.round(t / 1000)}s home=${sample.homeStatus} login=${sample.loginStatus} 5xx=${sample.fiveXxCount} err=${sample.errorCount} asset404=${asset404}`
  );

  const remaining = durationMs - (Date.now() - started);
  if (remaining <= 0) break;
  await new Promise((r) => setTimeout(r, Math.min(intervalMs, remaining)));
}

const report = {
  phase: '21.1.8',
  revision,
  origin,
  startedAt: new Date(started).toISOString(),
  endedAt: new Date().toISOString(),
  durationMs: Date.now() - started,
  samples,
  summary: {
    sampleCount: samples.length,
    maxFiveXx: Math.max(0, ...samples.map((s) => (s.fiveXxCount >= 0 ? s.fiveXxCount : 0))),
    maxErrors: Math.max(0, ...samples.map((s) => (s.errorCount >= 0 ? s.errorCount : 0))),
    homeAllOk: samples.every((s) => s.homeStatus === 200),
    loginAllOk: samples.every((s) => s.loginStatus === 200),
    asset404Total: samples.reduce((a, s) => a + (s.asset404 || 0), 0),
    healthy: samples.every(
      (s) =>
        s.homeStatus === 200 &&
        s.loginStatus === 200 &&
        (s.fiveXxCount === 0 || s.fiveXxCount === -1) &&
        s.asset404 === 0
    )
  }
};

const outPath = join(outDir, 'phase21_1_8_monitor_15m.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log('[monitor] done', JSON.stringify(report.summary));
console.log('[monitor] wrote', outPath);
process.exit(report.summary.healthy ? 0 : 1);
