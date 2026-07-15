import {
  resolveScrolithaRolloutFlags,
  isCapabilityEnabled,
  getRolloutSummary,
  invalidateRolloutCache
} from '../scrolitha.rollout';
import {
  recordRequestOutcome,
  recordActionCardUse,
  recordDuplicateSuppressed,
  getOpsMetricsSnapshot
} from '../scrolitha.opsMetrics';
import { FAILURE_MODE_MATRIX, getScrolithaHealthModel } from '../scrolitha.health';
import { userFacingDegradationMessage, safeAsync } from '../scrolitha.failureModes';

describe('scrolitha operations readiness', () => {
  const prevEnv: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    invalidateRolloutCache();
  });

  const setEnv = (key: string, value?: string) => {
    prevEnv[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    invalidateRolloutCache();
  };

  test('rollout flags default OFF for user-facing capabilities', async () => {
    setEnv('SCROLITHA_ROLLOUT_MASTER', undefined);
    setEnv('SCROLITHA_ROLLOUT_OS_SURFACE', undefined);
    setEnv('SCROLITHA_ROLLOUT_AI_REPLIES', undefined);
    setEnv('SCROLITHA_ROLLOUT_CONTEXTUAL', undefined);
    setEnv('SCROLITHA_ROLLOUT_DIAGNOSTICS', undefined);
    const flags = await resolveScrolithaRolloutFlags();
    expect(flags.master).toBe(false);
    expect(flags.osSurface).toBe(false);
    expect(flags.aiReplies).toBe(false);
    expect(flags.contextualIntelligence).toBe(false);
    expect(flags.proactiveSuggestions).toBe(false);
    expect(flags.actionCards).toBe(false);
    expect(flags.deepSearch).toBe(false);
    expect(flags.recommendationEngine).toBe(false);
    expect(flags.intelligenceAsk).toBe(false);
    expect(flags.persistentMemory).toBe(false);
    expect(flags.personalization).toBe(false);
    expect(flags.trustVerification).toBe(false);
    expect(flags.learningLoop).toBe(false);
    // Admin-only operational surface remains available by default
    expect(flags.diagnostics).toBe(true);
    expect(await isCapabilityEnabled('diagnostics')).toBe(true);
    expect(await isCapabilityEnabled('osSurface')).toBe(false);
  });

  test('master kill switch disables user capabilities but can keep diagnostics policy separate', async () => {
    setEnv('SCROLITHA_ROLLOUT_MASTER', 'false');
    setEnv('SCROLITHA_ROLLOUT_DIAGNOSTICS', 'true');
    setEnv('SCROLITHA_ROLLOUT_OS_SURFACE', 'true'); // would-be enable ignored under master off
    const flags = await resolveScrolithaRolloutFlags();
    expect(flags.master).toBe(false);
    expect(flags.osSurface).toBe(false);
    expect(flags.aiReplies).toBe(false);
    expect(flags.deepSearch).toBe(false);
    // diagnostics intentionally retained when explicitly true under master-off handling
    expect(await isCapabilityEnabled('diagnostics')).toBe(true);
  });

  test('individual capability env overrides work when master is explicitly enabled', async () => {
    setEnv('SCROLITHA_ROLLOUT_MASTER', 'true');
    setEnv('SCROLITHA_ROLLOUT_AI_REPLIES', 'true');
    setEnv('SCROLITHA_ROLLOUT_DEEP_SEARCH', 'false');
    setEnv('SCROLITHA_ROLLOUT_OS_SURFACE', 'false');
    expect(await isCapabilityEnabled('master')).toBe(true);
    expect(await isCapabilityEnabled('deepSearch')).toBe(false);
    expect(await isCapabilityEnabled('osSurface')).toBe(false);
    expect(await isCapabilityEnabled('aiReplies')).toBe(true);
  });

  test('explicit env can enable a user-facing capability after master on', async () => {
    setEnv('SCROLITHA_ROLLOUT_MASTER', 'true');
    setEnv('SCROLITHA_ROLLOUT_OS_SURFACE', 'true');
    setEnv('SCROLITHA_ROLLOUT_CONTEXTUAL', 'true');
    expect(await isCapabilityEnabled('osSurface')).toBe(true);
    expect(await isCapabilityEnabled('contextualIntelligence')).toBe(true);
    // Not explicitly enabled remains off
    expect(await isCapabilityEnabled('deepSearch')).toBe(false);
  });

  test('rollout summary includes rollback instructions', async () => {
    const summary = await getRolloutSummary();
    expect(summary.rollback.disableAll).toMatch(/MASTER|master/i);
    expect(summary.rollback.note.toLowerCase()).toContain('messaging');
  });

  test('ops metrics capture latency percentiles and rates', () => {
    recordRequestOutcome({ ok: true, latencyMs: 100, cacheHit: true });
    recordRequestOutcome({ ok: true, latencyMs: 200, cacheHit: false });
    recordRequestOutcome({ ok: false, latencyMs: 500, timedOut: true });
    recordActionCardUse();
    recordDuplicateSuppressed();
    const snap = getOpsMetricsSnapshot();
    expect(snap.counters.requests).toBeGreaterThanOrEqual(3);
    expect(snap.latencyMs.sampleSize).toBeGreaterThanOrEqual(3);
    expect(snap.privacy.toLowerCase()).toContain('no prompts');
    expect(snap.rates.successRate).not.toBeNull();
  });

  test('health model returns components and failure matrix', async () => {
    const health = await getScrolithaHealthModel();
    expect(health.components.length).toBeGreaterThanOrEqual(6);
    expect(health.overall).toBeTruthy();
    expect(FAILURE_MODE_MATRIX.some((f) => f.failure.includes('provider'))).toBe(true);
  });

  test('failure mode helpers degrade safely', async () => {
    const failed = await safeAsync(async () => {
      throw new Error('timeout from provider');
    }, 'timeout');
    expect(failed.degraded).toBe(true);
    expect(userFacingDegradationMessage('timeout')).toMatch(/try again/i);
    expect(userFacingDegradationMessage('disabled by rollout')).toMatch(/unavailable/i);
  });
});
