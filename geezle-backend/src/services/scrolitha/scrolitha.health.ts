/**
 * Operational health model for Scrolitha production readiness.
 * Exposes only safe operational information.
 */
import { resolveScrolithaRolloutFlags } from './scrolitha.rollout';
import { getSessionStoreStatus } from './scrolitha.sessionStore';
import { enterpriseCache, getCacheAdapterStatus } from './scrolitha.enterpriseCache';
import { getSearchProviderStatus } from './scrolitha.searchProvider';
import { getStreamProviderStatus } from './scrolitha.streaming';
import { getProviderHealth } from './scrolitha.providerOrchestration';
import { getEventContractStatus } from './scrolitha.eventContracts';
import { listSkills } from './scrolitha.skills';
import { getOpsMetricsSnapshot } from './scrolitha.opsMetrics';
import { ensureScrolithaConfig } from './scrolitha.policy';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'disabled';

export type ComponentHealth = {
  component: string;
  status: HealthStatus;
  message: string;
  details?: Record<string, unknown>;
};

export type ScrolithaHealthModel = {
  overall: HealthStatus;
  generatedAt: string;
  components: ComponentHealth[];
  rollout: Awaited<ReturnType<typeof resolveScrolithaRolloutFlags>>;
  metrics: ReturnType<typeof getOpsMetricsSnapshot>;
};

const worst = (statuses: HealthStatus[]): HealthStatus => {
  if (statuses.includes('unhealthy')) return 'unhealthy';
  if (statuses.includes('degraded')) return 'degraded';
  if (statuses.includes('disabled')) return 'disabled';
  return 'healthy';
};

export const getScrolithaHealthModel = async (): Promise<ScrolithaHealthModel> => {
  const [rollout, providers] = await Promise.all([
    resolveScrolithaRolloutFlags(),
    getProviderHealth('user')
  ]);

  let configEnabled = true;
  try {
    const config = await ensureScrolithaConfig('user');
    configEnabled = config?.enabled !== false;
  } catch {
    configEnabled = true;
  }

  const session = getSessionStoreStatus();
  const cache = getCacheAdapterStatus();
  const search = getSearchProviderStatus();
  const streaming = getStreamProviderStatus();
  const events = getEventContractStatus();
  const cacheStats = enterpriseCache.stats();

  const primary = providers.find((p) => p.provider !== 'backup') || providers[0];
  const backup = providers.find((p) => p.provider === 'backup');
  const connectivity = primary?.connectivity;

  const components: ComponentHealth[] = [
    {
      component: 'master_rollout',
      status: !rollout.master || !configEnabled ? 'disabled' : 'healthy',
      message:
        !rollout.master || !configEnabled
          ? 'Scrolitha master switch is off — AI capabilities disabled; core platform unaffected.'
          : 'Scrolitha master switch enabled.'
    },
    {
      component: 'provider',
      status:
        primary?.status === 'operational'
          ? 'healthy'
          : primary?.status === 'degraded'
            ? 'degraded'
            : primary?.status === 'disabled'
              ? 'disabled'
              : 'unhealthy',
      message: primary?.message || `Provider ${primary?.provider || 'unknown'}: ${primary?.status}`,
      details: {
        primary: primary?.provider,
        backup: backup?.status,
        latencyMs: primary?.latencyMs ?? null,
        liveProbe: connectivity?.liveProbe ?? null,
        connectivityClass: connectivity?.class ?? null,
        productionSafe: connectivity?.productionSafe ?? null,
        availability: connectivity?.availability ?? null
      }
    },
    {
      component: 'cache',
      status: 'healthy',
      message: cache.distributed
        ? `Distributed cache adapter: ${cache.adapterName}`
        : `In-process cache adapter: ${cache.adapterName}`,
      details: {
        hitRate: cacheStats.hitRate,
        hits: cacheStats.hits,
        misses: cacheStats.misses
      }
    },
    {
      component: 'session_adapter',
      status: session.capabilities?.supportsCrossInstance ? 'healthy' : 'degraded',
      message: session.note,
      details: {
        adapter: session.adapterName,
        mode: session.mode,
        crossInstance: session.capabilities?.supportsCrossInstance
      }
    },
    {
      component: 'search_provider',
      status: search.capabilities.ready ? 'healthy' : 'degraded',
      message: search.note,
      details: {
        active: search.active,
        semanticReady: search.semanticReady
      }
    },
    {
      component: 'streaming_provider',
      status: 'healthy',
      message: streaming.note,
      details: {
        mode: streaming.mode,
        supportsTokenStreaming: streaming.supportsTokenStreaming
      }
    },
    {
      component: 'workflow',
      status: listSkills().length > 0 ? 'healthy' : 'degraded',
      message: `${listSkills().length} skills registered`,
      details: {
        skills: listSkills().length,
        osSurface: rollout.osSurface,
        intelligenceAsk: rollout.intelligenceAsk
      }
    },
    {
      component: 'event_processing',
      status: rollout.eventIntelligence ? 'healthy' : 'disabled',
      message: rollout.eventIntelligence
        ? 'Event intelligence enabled with idempotency/dedupe contracts'
        : 'Event intelligence disabled by rollout',
      details: events
    }
  ];

  // If master disabled, overall disabled but platform OK
  let overall = worst(components.map((c) => c.status));
  if (!rollout.master || !configEnabled) overall = 'disabled';

  return {
    overall,
    generatedAt: new Date().toISOString(),
    components,
    rollout,
    metrics: getOpsMetricsSnapshot()
  };
};

/**
 * Failure-mode degradation matrix (operational reference + runtime helpers).
 */
export const FAILURE_MODE_MATRIX = [
  {
    failure: 'AI provider outage',
    behavior: 'Skill/deterministic answers or graceful 503/degraded response; no platform crash',
    userImpact: 'Reduced answer quality or temporary AI unavailability',
    platformImpact: 'None — posts/comments/messaging continue'
  },
  {
    failure: 'Provider timeout',
    behavior: 'Orchestration retries then fallback provider or deterministic path',
    userImpact: 'Slower response or simplified answer',
    platformImpact: 'None'
  },
  {
    failure: 'Cache failure / miss storm',
    behavior: 'Recompute context; elevated latency; no data loss',
    userImpact: 'Slower AI features',
    platformImpact: 'None'
  },
  {
    failure: 'Session adapter failure',
    behavior: 'New empty session; no cross-turn memory until recovery',
    userImpact: 'Lost short-term conversation continuity',
    platformImpact: 'None'
  },
  {
    failure: 'Search failure',
    behavior: 'Empty search hits; local graph/page context still used',
    userImpact: 'Fewer recommendations/discovery results',
    platformImpact: 'None'
  },
  {
    failure: 'Partial workflow failure',
    behavior: 'Successful skills still contribute; failed skills reported softly',
    userImpact: 'Partial answer coverage',
    platformImpact: 'None'
  },
  {
    failure: 'Cancelled request',
    behavior: 'AbortSignal honored; no notification spam',
    userImpact: 'No answer (expected)',
    platformImpact: 'None'
  },
  {
    failure: 'Duplicate event',
    behavior: 'Idempotency key suppresses re-processing; DB de-dupe for AI replies',
    userImpact: 'No duplicate AI comments',
    platformImpact: 'None'
  },
  {
    failure: 'Reconnect storm',
    behavior: 'Event dedupe TTL + client abort of stale asks',
    userImpact: 'Brief load increase possible',
    platformImpact: 'Core sockets unaffected for non-AI traffic'
  }
] as const;
