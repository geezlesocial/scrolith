/**
 * Public service API for the enterprise discovery recommendation engine.
 */
export { runDiscoveryRecommendationPipeline, decodeDiscoveryCursor } from './discoveryEngine.pipeline';
export { recordDiscoveryFeedback } from './discoveryEngine.feedback';
export {
  resolveDiscoveryRolloutFlags,
  getDiscoveryRolloutSummary,
  isDiscoverySurfaceEnabled,
  invalidateDiscoveryRolloutCache
} from './discoveryEngine.rollout';
export { getDiscoveryMetricsSnapshot } from './discoveryEngine.observability';
export { getDiscoveryPrivacyControls, DEFAULT_DISCOVERY_PRIVACY } from './discoveryEngine.privacy';
export { registerScrolithaDiscoveryAdapter } from './discoveryEngine.scrolithaAdapter';
export { getGeneratorCoverageMatrix } from './discoveryEngine.generators';
export { bindDiscoveryRealtimeApp, emitDiscoveryInvalidation } from './discoveryEngine.realtime';
export { evaluateCandidateEligibility } from './discoveryEngine.eligibility';
export { DISCOVERY_MODEL_VERSION } from './discoveryEngine.types';
export { DISCOVERY_POLICY_VERSION } from './discoveryEngine.versions';
export type {
  DiscoveryEntityType,
  DiscoverySurface,
  DiscoveryRecommendationRequest,
  DiscoveryRecommendationResponse,
  DiscoveryFeedbackInput,
  RankedRecommendation
} from './discoveryEngine.types';
