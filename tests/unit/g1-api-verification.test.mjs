import test from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED_TARGETS, POLICY, assertFixedPolicy, assertRequestBudget, loadConfig, runVerification, validateApiOrigin, validateTarget } from '../../scripts/g1-api-verification.mjs';

const origin = 'https://candidate--revision.example.southeastasia.azurecontainerapps.io';
const start = Date.parse('2099-01-01T00:00:00Z');
const end = start + 5 * 60_000;
const config = Object.freeze({ origin, windowStart: start, windowEnd: end });
const success = () => new Response(null, { status: 200 });

test('fixed allowlist contains exactly the approved route/method pairs', () => {
  assert.deepEqual(ALLOWED_TARGETS, [
    { method: 'GET', path: '/api/health' }, { method: 'HEAD', path: '/api/health' },
    { method: 'GET', path: '/api/readyz' }, { method: 'HEAD', path: '/api/readyz' },
    { method: 'GET', path: '/api/health/ready' }, { method: 'HEAD', path: '/api/health/ready' },
    { method: 'GET', path: '/api/auth/health' },
  ]);
});

test('origin configuration must be the exact HTTPS revision-specific staging origin', () => {
  assert.equal(validateApiOrigin(origin), origin);
  for (const invalid of [undefined, '', 'https://example.invalid', 'https://app.example.azurecontainerapps.io', `${origin}/api`, `${origin}/?q=x`, `http://${origin.slice('https://'.length)}`]) {
    assert.throws(() => validateApiOrigin(invalid));
  }
  assert.throws(() => loadConfig({ G1_API_ORIGIN: origin, G1_WINDOW_START_UTC: '', G1_WINDOW_END_UTC: '' }));
});

test('rejects root, wrong host, unapproved path, and disallowed methods', () => {
  assert.throws(() => validateTarget(origin, 'GET', '/'));
  assert.throws(() => validateTarget(origin, 'GET', 'https://wrong--host.example.southeastasia.azurecontainerapps.io/api/health'));
  assert.throws(() => validateTarget(origin, 'GET', '/api/users'));
  assert.throws(() => validateTarget(origin, 'POST', '/api/health'));
});

test('redirects are rejected and never followed, including cross-host redirects', async () => {
  let calls = 0;
  await assert.rejects(runVerification(config, {
    plan: [{ method: 'GET', path: '/api/health' }],
    now: () => start + 100,
    fetchImpl: async () => { calls += 1; return new Response(null, { status: 302, headers: { location: 'https://other.example.invalid/' } }); },
  }), /Cross-origin redirect rejected/);
  assert.equal(calls, 1);
});

test('hard request cap accepts 300 and rejects 301 attempts before sending', () => {
  assert.equal(assertRequestBudget(300), true);
  assert.throws(() => assertRequestBudget(301), /request cap/);
});

test('a plan exceeding 300 requests is rejected before mocked HTTP is called', async () => {
  let calls = 0;
  const plan = Array.from({ length: 301 }, () => ({ method: 'GET', path: '/api/health' }));
  await assert.rejects(runVerification(config, { plan, fetchImpl: async () => { calls += 1; return success(); } }), /request plan exceeds/);
  assert.equal(calls, 0);
});

test('fixed controls reject excess workers and request rate', () => {
  assert.equal(assertFixedPolicy(), true);
  assert.throws(() => assertFixedPolicy({ ...POLICY, workers: 2 }), /workers/);
  assert.throws(() => assertFixedPolicy({ ...POLICY, minIntervalMs: 999 }), /minIntervalMs/);
});

test('requests run sequentially and at least one second apart', async () => {
  let clock = start + 100;
  let active = 0;
  let maxActive = 0;
  const starts = [];
  const report = await runVerification(config, {
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    fetchImpl: async (_url, options) => { assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'manual'); assert.equal(options.headers, undefined); active += 1; maxActive = Math.max(maxActive, active); starts.push(clock); await Promise.resolve(); active -= 1; return success(); },
  });
  assert.equal(maxActive, 1);
  assert.equal(report.results.length, 7);
  assert.ok(starts.slice(1).every((time, index) => time - starts[index] >= 1000));
  assert.doesNotMatch(JSON.stringify(report), /example\.southeastasia/);
  assert.equal(report.attempts, 7);
});

test('a single retry is bounded, rate-limited, and counted against the request cap', async () => {
  let clock = start + 200;
  let first = true;
  let calls = 0;
  const report = await runVerification(config, {
    plan: [{ method: 'GET', path: '/api/health' }],
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    fetchImpl: async () => { calls += 1; if (first) { first = false; return new Response(null, { status: 503 }); } return success(); },
  });
  assert.equal(calls, 2);
  assert.equal(report.attempts, 2);
  assert.equal(report.results[0].attempts, 2);
});

test('timeout aborts the request and permits no more than one retry', async () => {
  let calls = 0;
  const report = await runVerification(config, {
    plan: [{ method: 'GET', path: '/api/health' }],
    now: () => start + 300,
    timeoutMs: 5,
    testOnly: true,
    fetchImpl: async (_url, options) => {
      calls += 1;
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }));
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(report.results.map((item) => item.outcome), ['timeout']);
});

test('expired and not-yet-open windows fail closed before HTTP', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return success(); };
  await assert.rejects(runVerification({ ...config, windowEnd: start + 1000 }, { now: () => start + 1000, fetchImpl }), /window has ended/);
  await assert.rejects(runVerification(config, { now: () => start - 1, fetchImpl }), /before the approved/);
  assert.equal(calls, 0);
});

test('window end reached during a response stops the run without another request', async () => {
  let clock = start + 500;
  let calls = 0;
  await assert.rejects(runVerification(config, {
    plan: [{ method: 'GET', path: '/api/health' }, { method: 'HEAD', path: '/api/health' }],
    now: () => clock,
    fetchImpl: async () => { calls += 1; clock = end; return success(); },
  }), /window has ended/);
  assert.equal(calls, 1);
});

test('window duration cannot exceed the hard 30-minute ceiling', () => {
  assert.throws(() => loadConfig({
    G1_API_ORIGIN: origin,
    G1_WINDOW_START_UTC: '2099-01-01T00:00:00Z',
    G1_WINDOW_END_UTC: '2099-01-01T00:30:01Z',
  }), /30-minute/);
});
