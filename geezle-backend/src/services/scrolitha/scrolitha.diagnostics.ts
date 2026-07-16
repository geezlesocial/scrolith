/**
 * Enterprise diagnostics — admin only aggregation.
 */
import { enterpriseCache, getCacheAdapterStatus } from './scrolitha.enterpriseCache';
import { getSessionStoreStatus } from './scrolitha.sessionStore';
import { getSearchProviderStatus } from './scrolitha.searchProvider';
import { getStreamProviderStatus } from './scrolitha.streaming';
import { discoverProviderCapabilities, getProviderHealth } from './scrolitha.providerOrchestration';
import { getAnalyticsSnapshot } from './scrolitha.analytics';
import { getGovernanceSummary, listRecentGovernance } from './scrolitha.governance';
import { getEventContractStatus } from './scrolitha.eventContracts';
import { listSkills } from './scrolitha.skills';
import { getIntelligenceMetricsSnapshot } from './scrolitha.observability';
import { getScrolithaHealthModel, FAILURE_MODE_MATRIX } from './scrolitha.health';
import { getOpsMetricsSnapshot } from './scrolitha.opsMetrics';
import { getRolloutSummary } from './scrolitha.rollout';
import { getScrolithaRuntimeHealth, resolveScrolithaLlmRuntime } from './scrolitha.ollama';

export const getEnterpriseDiagnostics = async (scope: 'user' | 'admin' = 'user') => {
  const runtime = await resolveScrolithaLlmRuntime(scope);
  const [providerHealth, capabilities, operationalHealth, rollout, liveConnectivity] =
    await Promise.all([
      getProviderHealth(scope),
      discoverProviderCapabilities(scope),
      getScrolithaHealthModel(),
      getRolloutSummary(),
      // Admin diagnostics: deep probe (tags + READY) when core is configured
      getScrolithaRuntimeHealth(scope, { runtime, deep: true })
    ]);

  const primaryProvider = providerHealth.find((p) => p.provider !== 'backup') || providerHealth[0];
  const connectivity = (liveConnectivity as any)?.connectivity || null;

  return {
    generatedAt: new Date().toISOString(),
    healthSummary: {
      overall: operationalHealth.overall,
      components: operationalHealth.components
    },
    providerSummary: {
      health: providerHealth,
      discovery: capabilities
    },
    /** Wave 1A: live backend → Scrolitha Core connectivity (safe fields only). */
    connectivitySummary: {
      status: (liveConnectivity as any)?.status || null,
      availability: (liveConnectivity as any)?.availability || null,
      enabled: Boolean((liveConnectivity as any)?.enabled ?? runtime.enabled),
      runtime: runtime.provider,
      runtimeConfigured: runtime.runtimeConfigured,
      modelConfigured: Boolean(runtime.model),
      timeoutMs: runtime.timeoutMs,
      allowGeminiFallback: runtime.allowGeminiFallback,
      productionSafe: Boolean(connectivity?.productionSafe),
      connectivityClass: connectivity?.class || null,
      usable: connectivity?.usable ?? null,
      message: connectivity?.message || (liveConnectivity as any)?.warning || (liveConnectivity as any)?.error || null,
      lastCheckedAt: (liveConnectivity as any)?.lastCheckedAt || null,
      liveProbeLatencyMs: primaryProvider?.latencyMs ?? null,
      // endpoint class only — never expose secrets or raw credentials
      endpointClass: runtime.host
        ? /localhost|127\.0\.0\.1|0\.0\.0\.0|::1/i.test(runtime.host)
          ? 'local'
          : 'remote'
        : 'missing',
      envHints: {
        coreEndpointEnvSet: Boolean(
          String(process.env.SCROLITHA_CORE_ENDPOINT || process.env.SCROLITHA_OLLAMA_HOST || '').trim()
        ),
        masterRollout: Boolean(rollout?.flags?.master),
        cloudRun: Boolean(String(process.env.K_SERVICE || '').trim())
      }
    },
    workflowSummary: {
      skillsRegistered: listSkills().length,
      metrics: getIntelligenceMetricsSnapshot()
    },
    cacheSummary: {
      ...enterpriseCache.stats(),
      adapter: getCacheAdapterStatus()
    },
    sessionSummary: getSessionStoreStatus(),
    searchSummary: getSearchProviderStatus(),
    streamingSummary: getStreamProviderStatus(),
    // legacy nested shape preserved for older clients
    session: getSessionStoreStatus(),
    cache: {
      ...enterpriseCache.stats(),
      adapter: getCacheAdapterStatus()
    },
    search: getSearchProviderStatus(),
    streaming: getStreamProviderStatus(),
    providers: {
      health: providerHealth,
      discovery: capabilities
    },
    workflows: {
      skillsRegistered: listSkills().length,
      metrics: getIntelligenceMetricsSnapshot()
    },
    events: getEventContractStatus(),
    analytics: getAnalyticsSnapshot(),
    opsMetrics: getOpsMetricsSnapshot(),
    rollout,
    failureModes: FAILURE_MODE_MATRIX,
    governance: {
      summary: getGovernanceSummary(),
      recent: listRecentGovernance(20)
    },
    readiness: {
      distributedSessions: getSessionStoreStatus().capabilities.supportsCrossInstance,
      distributedCache: getCacheAdapterStatus().distributed,
      semanticSearch: getSearchProviderStatus().semanticReady,
      tokenStreaming: getStreamProviderStatus().supportsTokenStreaming,
      coreConnectivityProductionSafe: Boolean(connectivity?.productionSafe),
      notes: [
        'Default adapters are in-process and production-safe for single-instance or sticky routing.',
        'Enable distributed session/cache via configuration when Redis/Memorystore is approved.',
        'Semantic/vector search provider can be registered without changing call sites.',
        'Token streaming can be enabled via stream provider registration; chunk fallback remains default.',
        'Use metadata.rollout or SCROLITHA_ROLLOUT_* env vars to disable capabilities without redeploying core platform features.',
        'Production Cloud Run requires SCROLITHA_CORE_ENDPOINT (or equivalent DB llm.coreEndpoint) pointing at scrolitha-core; local loopback is fail-closed.',
        'Global API rate limiting uses in-process MemoryStore; distributed rate-limit state is not required until multi-instance fairness becomes an SLO issue.'
      ]
    }
  };
};
