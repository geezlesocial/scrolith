import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const POLICY = Object.freeze({
  workers: 1,
  minIntervalMs: 1000,
  maxRequests: 300,
  timeoutMs: 10_000,
  maxRetries: 1,
  maxWindowMs: 30 * 60 * 1000,
});

export const ALLOWED_TARGETS = Object.freeze([
  Object.freeze({ method: 'GET', path: '/api/health' }),
  Object.freeze({ method: 'HEAD', path: '/api/health' }),
  Object.freeze({ method: 'GET', path: '/api/readyz' }),
  Object.freeze({ method: 'HEAD', path: '/api/readyz' }),
  Object.freeze({ method: 'GET', path: '/api/health/ready' }),
  Object.freeze({ method: 'HEAD', path: '/api/health/ready' }),
  Object.freeze({ method: 'GET', path: '/api/auth/health' }),
]);

const allowedPairs = new Set(ALLOWED_TARGETS.map(({ method, path }) => `${method} ${path}`));
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export function validateApiOrigin(value) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new Error('G1 API origin is missing or invalid.');
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('G1 API origin is invalid.');
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.origin !== value ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    !parsed.hostname.includes('--') ||
    !parsed.hostname.endsWith('.azurecontainerapps.io')
  ) {
    throw new Error('G1 API origin must be the exact HTTPS origin of a revision-specific staging candidate.');
  }

  return parsed.origin;
}

function parseUtcTimestamp(value, name) {
  if (typeof value !== 'string' || !UTC_TIMESTAMP.test(value)) {
    throw new Error(`${name} must be an RFC3339 UTC timestamp ending in Z.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value.replace(/Z$/, '.000Z')) {
    throw new Error(`${name} is invalid.`);
  }
  return timestamp;
}

export function loadConfig(env) {
  const origin = validateApiOrigin(env.G1_API_ORIGIN);
  const windowStart = parseUtcTimestamp(env.G1_WINDOW_START_UTC, 'G1_WINDOW_START_UTC');
  const windowEnd = parseUtcTimestamp(env.G1_WINDOW_END_UTC, 'G1_WINDOW_END_UTC');
  if (windowEnd <= windowStart || windowEnd - windowStart > POLICY.maxWindowMs) {
    throw new Error('Approved G1 window is invalid or exceeds the hard 30-minute limit.');
  }
  return Object.freeze({ origin, windowStart, windowEnd });
}

export function validateTarget(origin, method, path) {
  if (!allowedPairs.has(`${method} ${path}`)) {
    throw new Error('Request method/path is outside the fixed G1 allowlist.');
  }

  let target;
  try {
    target = new URL(path, origin);
  } catch {
    throw new Error('Request target is invalid.');
  }
  if (target.origin !== origin || target.pathname !== path || target.search || target.hash) {
    throw new Error('Request target is outside the exact approved origin and path.');
  }
  return target;
}

export function assertFixedPolicy(candidate = POLICY) {
  for (const key of Object.keys(POLICY)) {
    if (candidate[key] !== POLICY[key]) {
      throw new Error(`G1 control ${key} must remain at its fixed approved ceiling.`);
    }
  }
  return true;
}

export function assertRequestBudget(attemptCount) {
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 0 || attemptCount > POLICY.maxRequests) {
    throw new Error('G1 request cap exceeded.');
  }
  return true;
}

function assertWindowOpen(now, config) {
  if (now < config.windowStart) throw new Error('Current time is before the approved G1 window.');
  if (now >= config.windowEnd) throw new Error('Approved G1 window has ended.');
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/**
 * Executes only the fixed route/method plan. fetchImpl/clock/sleep/timeout are
 * injectable for unit tests; the CLI exposes no scope or policy overrides.
 */
export async function runVerification(config, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? delay;
  const timeoutMs = dependencies.timeoutMs ?? POLICY.timeoutMs;
  const plan = dependencies.plan ?? ALLOWED_TARGETS;
  if (timeoutMs !== POLICY.timeoutMs && !dependencies.testOnly) {
    throw new Error('Request timeout is fixed by G1 policy.');
  }
  if (!Array.isArray(plan) || plan.length > POLICY.maxRequests) {
    throw new Error('G1 request plan exceeds the hard request cap.');
  }
  for (const item of plan) validateTarget(config.origin, item.method, item.path);

  let attempts = 0;
  let lastStartedAt = null;
  const results = [];

  // Deliberately sequential: this is one worker and one process-wide request
  // lane, stricter than the per-account maximum. No account credentials exist.
  for (const item of plan) {
    let completed = false;
    let retryCount = 0;
    while (!completed) {
      assertWindowOpen(now(), config);
      if (lastStartedAt !== null) {
        const waitMs = Math.max(0, POLICY.minIntervalMs - (now() - lastStartedAt));
        if (waitMs > 0) {
          if (now() + waitMs >= config.windowEnd) throw new Error('Approved G1 window ended while rate-limiting.');
          await sleep(waitMs);
          assertWindowOpen(now(), config);
        }
      }

      assertRequestBudget(attempts + 1);
      const target = validateTarget(config.origin, item.method, item.path);
      const startedAt = now();
      const remainingWindowMs = config.windowEnd - startedAt;
      const boundedTimeoutMs = Math.min(timeoutMs, remainingWindowMs);
      if (boundedTimeoutMs <= 0) throw new Error('Approved G1 window has ended.');
      lastStartedAt = startedAt;
      attempts += 1;

      const controller = new AbortController();
      const abortReason = { value: '' };
      const timer = setTimeout(() => {
        abortReason.value = remainingWindowMs <= timeoutMs ? 'window' : 'timeout';
        controller.abort();
      }, boundedTimeoutMs);

      try {
        const response = await fetchImpl(target, {
          method: item.method,
          redirect: 'manual',
          credentials: 'omit',
          cache: 'no-store',
          signal: controller.signal,
        });
        assertWindowOpen(now(), config);
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers?.get?.('location');
          if (location) {
            let redirected;
            try { redirected = new URL(location, target); } catch { throw new Error('Invalid redirect rejected.'); }
            if (redirected.origin !== config.origin) {
              await response.body?.cancel().catch(() => undefined);
              throw new Error('Cross-origin redirect rejected.');
            }
          }
          await response.body?.cancel().catch(() => undefined);
          throw new Error('Redirect rejected; redirects are never followed.');
        }
        if (response.status >= 500 && retryCount < POLICY.maxRetries) {
          await response.body?.cancel().catch(() => undefined);
          retryCount += 1;
          continue;
        }
        results.push({ method: item.method, path: item.path, status: response.status, attempts: retryCount + 1, elapsedMs: Math.max(0, now() - startedAt) });
        completed = true;
      } catch (error) {
        if (error?.message === 'Cross-origin redirect rejected.' || error?.message === 'Redirect rejected; redirects are never followed.' || error?.message === 'Invalid redirect rejected.') throw error;
        if (error?.message === 'Approved G1 window has ended.') throw error;
        if (abortReason.value === 'window') throw new Error('Approved G1 window ended during a request.');
        if (retryCount < POLICY.maxRetries) {
          retryCount += 1;
          continue;
        }
        const outcome = abortReason.value === 'timeout' || error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'network-error';
        results.push({ method: item.method, path: item.path, outcome, attempts: retryCount + 1, elapsedMs: Math.max(0, now() - startedAt) });
        completed = true;
      } finally {
        clearTimeout(timer);
      }
    }
  }

  assertRequestBudget(attempts);
  return Object.freeze({ attempts, results: Object.freeze(results) });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config = loadConfig(process.env);
    assertWindowOpen(Date.now(), config);
    const report = await runVerification(config);
    process.stdout.write(`${JSON.stringify({ generatedAtUtc: new Date().toISOString(), ...report }, null, 2)}\n`);
    if (report.results.some((result) => result.status < 200 || result.status >= 300 || result.outcome)) process.exitCode = 1;
  } catch (error) {
    // Error text intentionally excludes configured origins and response data.
    process.stderr.write(`G1 API verification stopped: ${error.message}\n`);
    process.exitCode = 1;
  }
}
