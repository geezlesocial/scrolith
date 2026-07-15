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

export const getEnterpriseDiagnostics = async (scope: 'user' | 'admin' = 'user') => {
  const [providerHealth, capabilities, operationalHealth, rollout] = await Promise.all([
    getProviderHealth(scope),
    discoverProviderCapabilities(scope),
    getScrolithaHealthModel(),
    getRolloutSummary()
  ]);

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
      notes: [
        'Default adapters are in-process and production-safe for single-instance or sticky routing.',
        'Enable distributed session/cache via configuration when Redis/Memorystore is approved.',
        'Semantic/vector search provider can be registered without changing call sites.',
        'Token streaming can be enabled via stream provider registration; chunk fallback remains default.',
        'Use metadata.rollout or SCROLITHA_ROLLOUT_* env vars to disable capabilities without redeploying core platform features.'
      ]
    }
  };
};
