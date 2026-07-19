#!/usr/bin/env node
/**
 * Phase 21.1.8 — post-promotion asset + surface verification for scrolith.com
 */
import https from 'https';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const origin = process.env.CERT_BASE_URL || 'https://scrolith.com';
const outDir = join(root, 'docs/evidence');
mkdirSync(outDir, { recursive: true });

function fetchUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: opts.method || 'GET',
        headers: {
          'User-Agent': 'Scrolith-Promote-Verify/21.1.8',
          ...(opts.headers || {})
        },
        timeout: 30000
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: buf.toString('utf8'),
            buf
          });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end();
  });
}

function abs(url) {
  if (url.startsWith('http')) return url;
  return origin + (url.startsWith('/') ? url : `/${url}`);
}

const report = {
  phase: '21.1.8',
  generatedAt: new Date().toISOString(),
  productionRevision: 'scrolith-frontend-00203-yot',
  rollbackRevision: 'scrolith-frontend-00131-4jr',
  origin,
  html: {},
  assets: [],
  asset404: [],
  assetOk: [],
  surfaces: {},
  errors: []
};

const htmlRes = await fetchUrl(`${origin}/`);
report.html.status = htmlRes.status;
report.html.cacheControl = htmlRes.headers['cache-control'] || null;
const html = htmlRes.body;
const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
const styles = [...html.matchAll(/<link[^>]+href=["']([^"']+\.css[^"']*)["']/gi)].map((m) => m[1]);
const modulePreloads = [
  ...html.matchAll(/<link[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+)["']/gi)
].map((m) => m[1]);
const assets = [...new Set([...scripts, ...styles, ...modulePreloads])].map(abs);
report.html.scriptCount = scripts.length;
report.html.styleCount = styles.length;
report.html.modulePreloadCount = modulePreloads.length;
report.html.assetRefs = assets;
report.html.hasRoot = /id=["']root["']/.test(html);
report.html.title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || null;

for (const url of assets) {
  try {
    const r = await fetchUrl(url);
    const row = {
      url,
      status: r.status,
      contentType: r.headers['content-type'] || null,
      bytes: r.buf.length
    };
    report.assets.push(row);
    if (r.status === 404) report.asset404.push(row);
    else if (r.status >= 200 && r.status < 400) report.assetOk.push(row);
    else report.errors.push({ type: 'asset_status', ...row });
  } catch (e) {
    report.errors.push({ type: 'asset_fetch', url, message: String(e.message || e) });
  }
}

const paths = {
  home: '/',
  community: '/community',
  scroll: '/scroll',
  profile: '/profile',
  notifications: '/notifications',
  admin: '/dashboard',
  login: '/auth/login'
};

for (const [name, path] of Object.entries(paths)) {
  try {
    const r = await fetchUrl(origin + path);
    const body = r.body;
    const pageScripts = [...body.matchAll(/src=["']([^"']*\/assets\/[^"']+)["']/gi)].map((m) => m[1]);
    const pageStyles = [...body.matchAll(/href=["']([^"']*\/assets\/[^"']+\.css[^"']*)["']/gi)].map(
      (m) => m[1]
    );
    report.surfaces[name] = {
      path,
      status: r.status,
      hasRoot: /id=["']root["']/.test(body),
      isSpaShell: pageScripts.length > 0 || /type=["']module["']/.test(body),
      assetRefs: [...new Set([...pageScripts, ...pageStyles])].slice(0, 30),
      title: (body.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || null
    };
  } catch (e) {
    report.surfaces[name] = { path, error: String(e.message || e) };
    report.errors.push({ type: 'surface', name, message: String(e.message || e) });
  }
}

const allRefs = new Set();
for (const s of Object.values(report.surfaces)) {
  for (const a of s.assetRefs || []) allRefs.add(abs(a));
}
for (const url of allRefs) {
  if (report.assets.some((a) => a.url === url)) continue;
  try {
    const r = await fetchUrl(url);
    const row = {
      url,
      status: r.status,
      contentType: r.headers['content-type'] || null,
      bytes: r.buf.length
    };
    report.assets.push(row);
    if (r.status === 404) report.asset404.push(row);
    else if (r.status >= 200 && r.status < 400) report.assetOk.push(row);
  } catch (e) {
    report.errors.push({ type: 'surface_asset', url, message: String(e.message || e) });
  }
}

// Compare HTML assets on public origin vs staged p2117 tag (same revision image)
try {
  const staged = await fetchUrl('https://p2117---scrolith-frontend-25ysnpjdda-as.a.run.app/');
  const stagedScripts = [...staged.body.matchAll(/src=["']([^"']+)["']/gi)].map((m) => m[1]);
  const prodScripts = scripts;
  report.revisionMatch = {
    prodScriptTail: prodScripts.map((s) => s.split('/').pop()),
    stagedScriptTail: stagedScripts.map((s) => s.split('/').pop()),
    sameEntry:
      prodScripts.map((s) => s.split('/').pop()).join('|') ===
      stagedScripts.map((s) => s.split('/').pop()).join('|')
  };
} catch (e) {
  report.revisionMatch = { error: String(e.message || e) };
}

report.summary = {
  htmlOk: report.html.status === 200 && report.html.hasRoot,
  zeroAsset404: report.asset404.length === 0,
  assetOkCount: report.assetOk.length,
  asset404Count: report.asset404.length,
  surfacesOk: Object.values(report.surfaces).every((s) => s.status && s.status < 500),
  revisionAssetMatch: report.revisionMatch?.sameEntry === true,
  critical: report.asset404.length > 0 || report.html.status !== 200
};

const outPath = join(outDir, 'phase21_1_8_post_deploy_verify.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ summary: report.summary, surfaces: report.surfaces, asset404: report.asset404, revisionMatch: report.revisionMatch, outPath }, null, 2));
process.exit(report.summary.critical ? 1 : 0);
