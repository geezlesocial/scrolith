/**
 * Phase 33.0 — Scrolitha AI Platform Foundation public surface.
 * Feature modules should import from here — never from provider SDKs.
 */
export { ScrolithaAI } from './execute';
export { default as ScrolithaAIDefault } from './execute';
export {
  FOUNDATION_CAPABILITIES,
  ALL_AI_CAPABILITIES,
  DEFAULT_AI_CONSENT,
  DEFAULT_AI_FEATURE_FLAGS,
  CONSENT_VERSION,
  SAFETY_POLICY_VERSION,
  AI_PLATFORM_SCHEMA_VERSION
} from './types';
export type {
  AIProviderId,
  AICapabilityId,
  PrivacyLevel,
  AIConsentState,
  AIFeatureFlags,
  ScrolithaAIExecuteInput,
  ScrolithaAIExecuteResult,
  ModelRouteDecision,
  SafetyDecision,
  AIProvider,
  ComposerMode,
  RewriteMode,
  DraftKind,
  SearchDomain,
  RecoEntityType,
  RecoFeedbackAction,
  LearningSignalType,
  DashboardSectionId
} from './types';
export { ScrolithaAssistant } from './assistant';
export {
  listConversations,
  createConversation,
  deleteConversation,
  exportConversations
} from './conversations';
export { listPromptLibrary, promptLibraryCategories } from './promptLibrary';
export { submitFeedback, feedbackSummary } from './feedback';
export {
  getAIMemory,
  updateAIMemory,
  deleteAIMemory,
  exportAIMemory,
  applyLearningSignal
} from './memory';
export { scoreFeedCandidates, computeHeuristicScore } from './feedScoring';
export {
  getRecommendations,
  getDashboardRecommendations,
  submitRecoFeedback
} from './recommendations';
export { assistSearchQuery } from './semanticSearch';
export { recordLearningSignal } from './learning';
export { getDiscoveryAnalytics } from './discoveryAnalytics';
export { classifyPrivacy, redactText, minimizeContext } from './privacy';
export { evaluateSafetyPre, evaluateSafetyPost, wrapUntrustedContent } from './safety';
export { routeModel } from './router';
export { AIPromptRegistry } from './promptRegistry';
export {
  getAIConsent,
  updateAIConsent,
  resetAIConsent,
  assertConsentForRequest
} from './consent';
export {
  loadAIFeatureFlags,
  setAIFeatureFlags,
  loadProviderConfig,
  setProviderConfig
} from './config';
export { getUsageSummary, checkQuota } from './usage';
export { getAIMetricsSnapshot } from './observability';
export { healthAllProviders, getProvider } from './providers';
export {
  suggestNotificationDigestSummary,
  suggestNotificationPriorities,
  prepareNotificationSearchQuery
} from './notificationHooks';
export { listAIAudit, listUserHistory, deleteUserHistory } from './audit';
export { getCircuitSnapshot } from './reliability';
