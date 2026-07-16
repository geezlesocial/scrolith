/**
 * Wave 1A — backend stabilization contracts:
 * connectivity classification, live provider health, timeout/retry orchestration,
 * rollout fail-closed, diagnostics connectivity summary.
 */
import type { ScrolithaLlmRuntime } from '../scrolitha.ollama';
import {
  executeWithProviderOrchestration,
  getProviderHealth,
  routeProvider
} from '../scrolitha.providerOrchestration';
import {
  resolveScrolithaRolloutFlags,
  isCapabilityEnabled,
  invalidateRolloutCache
} from '../scrolitha.rollout';
import { enterpriseCache } from '../scrolitha.enterpriseCache';

jest.mock('../scrolitha.ollama', () => {
  const actual = jest.requireActual('../scrolitha.ollama');
  return {
    ...actual,
    getScrolithaRuntimeHealth: jest.fn(),
    resolveScrolithaLlmRuntime: jest.fn()
  };
});

const ollamaMod = require('../scrolitha.ollama') as typeof import('../scrolitha.ollama') & {
  getScrolithaRuntimeHealth: jest.Mock;
  resolveScrolithaLlmRuntime: jest.Mock;
};

const { classifyScrolithaConnectivity } = jest.requireActual(
  '../scrolitha.ollama'
) as typeof import('../scrolitha.ollama');

const baseRuntime = (overrides: Partial<ScrolithaLlmRuntime> = {}): ScrolithaLlmRuntime => ({
  provider: 'core',
  enabled: true,
  runtimeConfigured: true,
  sidecarMode: false,
  acceleratorActive: false,
  status: 'operational',
  host: 'https://scrolitha-core.example.run.app',
  model: 'qwen3:14b',
  maxTokens: 1024,
  temperature: 0.35,
  topP: 0.9,
  timeoutMs: 25_000,
  enableStreaming: false,
  allowGeminiFallback: false,
  ...overrides
});

describe('scrolitha Wave 1A stabilization', () => {
  const prevEnv: Record<string, string | undefined> = {};

  const setEnv = (key: string, value?: string) => {
    if (!(key in prevEnv)) prevEnv[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    invalidateRolloutCache();
  };

  beforeEach(() => {
    jest.clearAllMocks();
    try {
      enterpriseCache.delete('governance', 'health:live:user');
      enterpriseCache.delete('governance', 'health:live:admin');
    } catch {
      // ignore
    }
    ollamaMod.resolveScrolithaLlmRuntime.mockResolvedValue(baseRuntime());
    ollamaMod.getScrolithaRuntimeHealth.mockResolvedValue({
      ok: true,
      provider: 'scrolitha',
      runtime: 'core',
      enabled: true,
      status: 'operational',
      availability: 'online',
      host: 'https://scrolitha-core.example.run.app',
      model: 'scrolitha-core',
      lastCheckedAt: new Date().toISOString(),
      connectivity: {
        class: 'remote_configured',
        usable: true,
        productionSafe: true,
        message: 'Remote Scrolitha Core endpoint is configured.'
      }
    });
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    Object.keys(prevEnv).forEach((k) => delete prevEnv[k]);
    invalidateRolloutCache();
  });

  describe('connectivity classification (fail-closed on Cloud Run local)', () => {
    test('remote endpoint is production-safe', () => {
      const result = classifyScrolithaConnectivity(
        baseRuntime({
          host: 'https://scrolitha-core-25ysnpjdda-as.a.run.app',
          runtimeConfigured: true
        })
      );
      expect(result.class).toBe('remote_configured');
      expect(result.productionSafe).toBe(true);
      expect(result.usable).toBe(true);
    });

    test('missing endpoint is not production-safe', () => {
      const result = classifyScrolithaConnectivity(
        baseRuntime({
          host: '',
          runtimeConfigured: false
        })
      );
      expect(result.class).toBe('missing_endpoint');
      expect(result.usable).toBe(false);
      expect(result.productionSafe).toBe(false);
    });

    test('Cloud Run + production + local host is blocked', () => {
      setEnv('NODE_ENV', 'production');
      setEnv('K_SERVICE', 'scrolith-backend');
      setEnv('SCROLITHA_CORE_ALLOW_LOCAL_SIDECAR', undefined);
      const result = classifyScrolithaConnectivity(
        baseRuntime({
          host: 'http://127.0.0.1:11434',
          sidecarMode: true,
          runtimeConfigured: true
        })
      );
      expect(result.class).toBe('local_blocked_cloud_run');
      expect(result.usable).toBe(false);
      expect(result.productionSafe).toBe(false);
      expect(result.message).toMatch(/SCROLITHA_CORE_ENDPOINT/i);
    });

    test('Cloud Run local can be explicitly allowed', () => {
      setEnv('NODE_ENV', 'production');
      setEnv('K_SERVICE', 'scrolith-backend');
      setEnv('SCROLITHA_CORE_ALLOW_LOCAL_SIDECAR', 'true');
      const result = classifyScrolithaConnectivity(
        baseRuntime({
          host: 'http://127.0.0.1:11434',
          sidecarMode: true,
          runtimeConfigured: true
        })
      );
      expect(result.class).toBe('local_production_sidecar');
      expect(result.usable).toBe(true);
    });
  });

  describe('provider health uses live probe', () => {
    test('maps operational live health', async () => {
      const health = await getProviderHealth('user');
      const primary = health.find((p) => p.provider === 'core');
      expect(primary?.status).toBe('operational');
      expect(primary?.connectivity?.liveProbe).toBe(true);
      expect(primary?.connectivity?.productionSafe).toBe(true);
      expect(primary?.capabilities.completion).toBe(true);
      expect(ollamaMod.getScrolithaRuntimeHealth).toHaveBeenCalled();
      const call = ollamaMod.getScrolithaRuntimeHealth.mock.calls[0];
      expect(call[1]?.deep).toBe(false);
    });

    test('maps degraded live health and disables completion capability', async () => {
      ollamaMod.resolveScrolithaLlmRuntime.mockResolvedValue(
        baseRuntime({
          host: 'http://127.0.0.1:11434',
          runtimeConfigured: false,
          status: 'degraded'
        })
      );
      ollamaMod.getScrolithaRuntimeHealth.mockResolvedValue({
        ok: true,
        status: 'degraded',
        availability: 'misconfigured',
        enabled: true,
        warning: 'Scrolitha Core endpoint is not configured for production.',
        connectivity: {
          class: 'local_blocked_cloud_run',
          usable: false,
          productionSafe: false,
          message: 'Local Scrolitha Core endpoint is not reachable from Cloud Run.'
        }
      });
      const health = await getProviderHealth('user');
      const primary = health.find((p) => p.provider !== 'backup');
      expect(primary?.status).toBe('degraded');
      expect(primary?.capabilities.completion).toBe(false);
      expect(primary?.message).toMatch(/not configured|not reachable|Cloud Run/i);
      const backup = health.find((p) => p.provider === 'backup');
      expect(backup?.status).toBe('disabled');
    });

    test('backup remains policy-gated', async () => {
      ollamaMod.resolveScrolithaLlmRuntime.mockResolvedValue(baseRuntime({ allowGeminiFallback: true }));
      const health = await getProviderHealth('user');
      expect(health.find((p) => p.provider === 'backup')?.status).toBe('operational');
    });
  });

  describe('timeout / retry / fallback orchestration', () => {
    test('retries primary then succeeds', async () => {
      ollamaMod.resolveScrolithaLlmRuntime.mockResolvedValue(
        baseRuntime({ timeoutMs: 5_000, allowGeminiFallback: false })
      );
      let calls = 0;
      const { result, attempts } = await executeWithProviderOrchestration({
        attemptFn: async () => {
          calls += 1;
          if (calls === 1) throw new Error('transient');
          return 'ok';
        }
      });
      expect(result).toBe('ok');
      expect(attempts.some((a) => !a.ok)).toBe(true);
      expect(attempts.some((a) => a.ok)).toBe(true);
    });

    test('falls back to backup after primary exhaustion when policy allows', async () => {
      ollamaMod.resolveScrolithaLlmRuntime.mockResolvedValue(
        baseRuntime({ timeoutMs: 2_000, allowGeminiFallback: true })
      );
      const { result, attempts, decision } = await executeWithProviderOrchestration({
        attemptFn: async (provider) => {
          if (provider === 'core') throw new Error('core down');
          return `from-${provider}`;
        }
      });
      expect(decision.fallbacks).toContain('backup');
      expect(result).toBe('from-backup');
      expect(attempts.filter((a) => a.provider === 'core' && !a.ok).length).toBeGreaterThanOrEqual(2);
    });

    test('times out slow providers', async () => {
      ollamaMod.resolveScrolithaLlmRuntime.mockResolvedValue(
        baseRuntime({ timeoutMs: 40, allowGeminiFallback: false })
      );
      await expect(
        executeWithProviderOrchestration({
          attemptFn: async () => {
            await new Promise((r) => setTimeout(r, 200));
            return 'late';
          }
        })
      ).rejects.toThrow(/timed out|All providers failed/i);
    });

    test('routeProvider documents degraded primary', async () => {
      ollamaMod.resolveScrolithaLlmRuntime.mockResolvedValue(
        baseRuntime({ status: 'degraded', runtimeConfigured: false })
      );
      const decision = await routeProvider({});
      expect(decision.reason).toMatch(/degraded|misconfigured/i);
      expect(decision.maxRetries).toBe(2);
      expect(decision.timeoutMs).toBeGreaterThan(0);
    });
  });

  describe('rollout fail-closed (production baseline parity)', () => {
    test('master off keeps user capabilities disabled', async () => {
      setEnv('SCROLITHA_ROLLOUT_MASTER', 'false');
      setEnv('SCROLITHA_ROLLOUT_AI_REPLIES', 'true');
      setEnv('SCROLITHA_ROLLOUT_OS_SURFACE', 'true');
      setEnv('SCROLITHA_ROLLOUT_INTELLIGENCE', 'true');
      const flags = await resolveScrolithaRolloutFlags();
      expect(flags.master).toBe(false);
      expect(flags.aiReplies).toBe(false);
      expect(flags.osSurface).toBe(false);
      expect(flags.intelligenceAsk).toBe(false);
      expect(await isCapabilityEnabled('aiReplies')).toBe(false);
      expect(await isCapabilityEnabled('diagnostics')).toBe(true);
    });
  });
});

