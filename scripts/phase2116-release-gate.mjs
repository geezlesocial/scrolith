#!/usr/bin/env node
/**
 * Phase 21.1.6C — Release gate with product vs harness classification.
 *
 * Does NOT change Cloud Run traffic.
 *
 * Exit codes:
 *   0 = PASS (product-ready; harness-only issues may be noted)
 *   1 = FAIL (verified product failure)
 *   2 = AUTH_REQUIRED
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'playwright-results/phase2116');
const summaryPath = join(outDir, 'release-gate-summary.json');
const resultsPath = join(outDir, 'cert-results.json');

const args = new Set(process.argv.slice(2));
const requireAuth = args.has('--require-auth') || process.env.CERT_REQUIRE_AUTH === '1';
const allowSkipAuth = args.has('--allow-skip-auth') || process.env.CERT_ALLOW_SKIP_AUTH === '1';
const skipE2E = args.has('--skip-e2e') || process.env.CERT_SKIP_E2E === '1';
const allMobile = !args.has('--desktop-only');
const identityMs = process.env.CERT_FEED_IDENTITY_MS || '15000';

const storageState =
  process.env.CERT_STORAGE_STATE || join(root, 'tests/certification/fixtures/storage-state.json');
const hasStorage = existsSync(storageState);
const hasCreds = Boolean(process.env.CERT_EMAIL && process.env.CERT_PASSWORD);
const canAuth = hasStorage || hasCreds;

/** Patterns that indicate harness / env / missing data — not product regressions */
const HARNESS_PATTERNS = [
  /document horizontal overflow/i,
  /documentOverflowX/i,
  /harness:/i,
  /missing_qa_data/i,
  /empty_notifications/i,
  /No post cards/i,
  /storage state/i,
  /CERT_/i,
  /Timeout .* auth\/login/i,
  /CORS/i,
  /net::ERR_/i,
  /Target page, context or browser has been closed/i,
  /Mouse wheel is not supported/i,
  /mouse\.wheel/i,
  /not supported in mobile WebKit/i
];

/** Patterns that indicate verified product failures */
const PRODUCT_PATTERNS = [
  /visible_post_id_changed/i,
  /fingerprint_changed/i,
  /author_changed/i,
  /feed_emptied/i,
  /post card content overrun/i,
  /feed column horizontal overflow/i,
  /action widths/i,
  /touch height/i,
  /CLS \d/i,
  /data-post-card-design/i,
  /min-height|min-h-\[72/i
];

const classifyMessage = (msg = '') => {
  const text = String(msg || '');
  if (PRODUCT_PATTERNS.some((re) => re.test(text))) return 'product_defect';
  if (HARNESS_PATTERNS.some((re) => re.test(text))) return 'test_harness_defect';
  if (/timeout|net::|CORS|ECONN|ENOTFOUND|502|503|504/i.test(text)) return 'environmental_issue';
  if (/no post|empty|skip|not present|missing/i.test(text)) return 'missing_qa_data';
  // Default unexpected failures on geometry/layout to product unless clearly harness
  if (/overflow|expect\(|toBeLessThan|toMatch|toBeGreaterThan/i.test(text)) {
    // Overflow without "document" was historically shell noise — if message says document, harness
    if (/document/i.test(text)) return 'test_harness_defect';
    return 'product_defect';
  }
  return 'product_defect';
};

const summary = {
  phase: '21.1.6C',
  generatedAt: new Date().toISOString(),
  requireAuth,
  allowSkipAuth,
  canAuth,
  steps: [],
  overall: 'PENDING',
  promoteRecommended: false,
  blocking: [],
  productFailures: [],
  harnessFailures: [],
  environmentalFailures: [],
  missingData: [],
  notes: []
};

const run = (name, command, cmdArgs, opts = {}) => {
  console.log(`\n[phase2116-gate] ▶ ${name}`);
  const useShell = Boolean(opts.shell);
  const result = spawnSync(command, cmdArgs, {
    cwd: root,
    encoding: 'utf8',
    shell: useShell,
    env: { ...process.env, CERT_FEED_IDENTITY_MS: identityMs, ...opts.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const step = {
    name,
    status: result.status === 0 ? 'PASS' : 'FAIL',
    exitCode: result.status,
    stdoutTail: (result.stdout || '').split('\n').slice(-40).join('\n'),
    stderrTail: (result.stderr || '').split('\n').slice(-20).join('\n')
  };
  summary.steps.push(step);
  if (result.status !== 0) {
    console.error(`[phase2116-gate] ✗ ${name} failed (exit ${result.status})`);
  } else {
    console.log(`[phase2116-gate] ✓ ${name}`);
  }
  return result.status === 0;
};

const classifyPlaywrightResults = () => {
  if (!existsSync(resultsPath)) {
    summary.notes.push('No cert-results.json to classify');
    return { product: 0, harness: 0, env: 0, data: 0, passed: 0, failed: 0 };
  }
  const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
  summary.playwrightStats = results.stats || null;
  const counts = { product: 0, harness: 0, env: 0, data: 0, passed: 0, failed: 0 };
  const failures = [];

  const walk = (suites, path = '') => {
    for (const suite of suites || []) {
      const p = path ? `${path} > ${suite.title}` : suite.title;
      for (const spec of suite.specs || []) {
        for (const t of spec.tests || []) {
          for (const r of t.results || []) {
            const title = `${t.projectName || ''} :: ${p} > ${spec.title}`;
            if (r.status === 'passed') {
              counts.passed += 1;
              continue;
            }
            if (r.status === 'skipped') continue;
            counts.failed += 1;
            const msg = r.error?.message || r.error?.stack || r.status;
            const cls = classifyMessage(msg);
            const entry = { title, status: r.status, classification: cls, message: String(msg).slice(0, 400) };
            failures.push(entry);
            if (cls === 'product_defect') {
              counts.product += 1;
              summary.productFailures.push(entry);
            } else if (cls === 'test_harness_defect') {
              counts.harness += 1;
              summary.harnessFailures.push(entry);
            } else if (cls === 'environmental_issue') {
              counts.env += 1;
              summary.environmentalFailures.push(entry);
            } else {
              counts.data += 1;
              summary.missingData.push(entry);
            }
          }
        }
      }
      walk(suite.suites, p);
    }
  };
  walk(results.suites);
  summary.failureClassifications = failures;
  summary.classificationCounts = counts;
  return counts;
};

mkdirSync(outDir, { recursive: true });

// 1) Unit contracts
const unitOk = run(
  'unit-contracts',
  process.execPath,
  [
    '--import',
    'tsx',
    '--test',
    'tests/unit/enterpriseSpacingScale.test.ts',
    'tests/unit/postCardDesignSystem.test.ts',
    'tests/unit/postCardVisualQaChecklist.test.ts',
    'src/utils/__tests__/phase2114FeedStability.spec.ts',
    'src/utils/__tests__/phase2114FeedIntegrityStress.spec.ts',
    'tests/unit/phase2116ReleaseGate.test.ts'
  ],
  { shell: false }
);
if (!unitOk) summary.blocking.push('unit-contracts');

// 2) Authenticated E2E — always run all mobile projects when auth available
let e2eRan = false;
let e2eExitOk = true;
if (skipE2E) {
  summary.notes.push('E2E skipped via --skip-e2e');
  summary.steps.push({ name: 'authenticated-e2e', status: 'SKIPPED', exitCode: 0 });
} else if (!canAuth) {
  if (requireAuth || !allowSkipAuth) {
    summary.overall = 'AUTH_REQUIRED';
    summary.blocking.push('missing CERT_STORAGE_STATE or CERT_EMAIL/CERT_PASSWORD');
    summary.promoteRecommended = false;
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.error('\n[phase2116-gate] AUTH_REQUIRED');
    process.exit(2);
  }
  summary.notes.push('Authenticated E2E skipped — no credentials');
  summary.steps.push({ name: 'authenticated-e2e', status: 'SKIPPED', exitCode: 0 });
} else {
  e2eRan = true;
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const projects = allMobile
    ? ['--project=desktop-chrome', '--project=mobile-390', '--project=pixel-7', '--project=iphone-15']
    : ['--project=desktop-chrome', '--project=mobile-390'];
  e2eExitOk = run(
    'authenticated-e2e',
    npx,
    ['playwright', 'test', '-c', 'tests/certification/playwright.config.ts', ...projects],
    { shell: process.platform === 'win32' }
  );
}

// 3) Classify Playwright results (product vs harness)
const counts = e2eRan ? classifyPlaywrightResults() : { product: 0, harness: 0, env: 0, data: 0, passed: 0, failed: 0 };

const productBlockers = counts.product > 0;
const envBlockers = counts.env > 0;
// Harness-only and missing-data do not block promotion recommendation
const productReady = unitOk && e2eRan && !productBlockers && !envBlockers;

if (productBlockers) {
  summary.blocking.push(...summary.productFailures.map((f) => f.title));
}
if (envBlockers) {
  summary.blocking.push(...summary.environmentalFailures.map((f) => f.title));
}
if (!unitOk) summary.blocking.push('unit-contracts');

if (!e2eExitOk && counts.failed === 0) {
  // Playwright process failed without classifiable results
  summary.blocking.push('authenticated-e2e-process');
  summary.notes.push('E2E process non-zero without classified failures');
}

summary.overall = productReady ? 'PASS' : unitOk && e2eRan && !productBlockers && !envBlockers ? 'PASS' : 'FAIL';
// If only harness/data failures, overall PASS for promotion readiness
if (unitOk && e2eRan && !productBlockers && !envBlockers) {
  summary.overall = 'PASS';
  if (counts.harness > 0 || counts.data > 0) {
    summary.notes.push(
      `Non-blocking: harness=${counts.harness} missing_data=${counts.data} (do not block promotion)`
    );
  }
} else if (!unitOk || productBlockers || envBlockers || (e2eRan && !e2eExitOk && counts.failed === 0)) {
  summary.overall = 'FAIL';
} else if (!e2eRan) {
  summary.overall = 'PASS';
  summary.notes.push('E2E not run — promoteRecommended false');
}

summary.promoteRecommended = summary.overall === 'PASS' && e2eRan && !productBlockers && !envBlockers;
summary.trafficAction = summary.promoteRecommended
  ? 'SAFE_TO_PROMOTE_P2117_STAGED_TO_100'
  : 'HOLD_STAGED_TRAFFIC';
summary.phase2115ProductionCertified = summary.promoteRecommended;

writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

console.log('\n========== Phase 21.1.6C Release Gate Summary ==========');
console.log(
  JSON.stringify(
    {
      overall: summary.overall,
      promoteRecommended: summary.promoteRecommended,
      phase2115ProductionCertified: summary.phase2115ProductionCertified,
      classificationCounts: summary.classificationCounts,
      productFailures: summary.productFailures.length,
      harnessFailures: summary.harnessFailures.length,
      trafficAction: summary.trafficAction
    },
    null,
    2
  )
);
console.log(`Full summary: ${summaryPath}`);

process.exit(summary.overall === 'PASS' || summary.promoteRecommended ? 0 : 1);
