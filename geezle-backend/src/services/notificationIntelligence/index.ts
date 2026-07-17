/**
 * Notification Intelligence public surface (Phase 10.2–10.6).
 */
export { notificationIntelligenceService, NotificationIntelligenceService } from './engine/notificationIntelligence.service';
export {
  resolveNotificationIntelRolloutFlags,
  invalidateNotificationIntelRolloutCache,
  getNotificationIntelRolloutSummary,
  isNotificationIntelMasterEnabled,
  DEFAULT_NOTIF_INTEL_FLAGS
} from './rollout/rollout';
export {
  getNotifIntelMetricsSnapshot,
  resetNotifIntelMetricsForTests,
  recordNotifIntelMetric
} from './observability/observability';
export { toApiNotification, parseNotificationLimit } from './compatibility/legacyNotificationRead.service';
export {
  notificationPreferenceService,
  NotificationPreferenceService,
  PreferenceValidationError
} from './preferences/preference.service';
export {
  ALL_PREFERENCE_CATEGORIES,
  ENGAGEMENT_TYPE_TO_CATEGORY
} from './preferences/preference.types';
export type {
  PreferenceCategoryKey,
  UserNotificationPreferences,
  PreferenceEvaluationResult,
  CategoryPreference
} from './preferences/preference.types';
export {
  notificationPriorityService,
  NotificationPriorityService
} from './priority/priority.service';
export {
  computePriorityEvaluation,
  scoreToBand,
  resolvePriorityCategory
} from './priority/priority.evaluation';
export {
  ALL_PRIORITY_BANDS,
  ALL_PRIORITY_FACTOR_KEYS
} from './priority/priority.types';
export type {
  PriorityBand,
  PriorityEvaluationInput,
  PriorityEvaluationResult,
  PriorityFactorContribution,
  PriorityEngineDiagnostics
} from './priority/priority.types';
export {
  notificationDeliveryService,
  NotificationDeliveryService
} from './delivery/delivery.service';
export {
  ALL_DELIVERY_CHANNELS
} from './delivery/delivery.types';
export {
  listChannelCapabilities,
  listPlaceholderChannels
} from './delivery/delivery.channels';
export type {
  DeliveryPlan,
  DeliveryChannelKey,
  DeliveryEvaluationInput,
  DeliveryChannelDecision,
  DeliveryEngineDiagnostics
} from './delivery/delivery.types';
export {
  notificationEventIntegrationService,
  NotificationEventIntegrationService,
  EventIntegrationValidationError,
  resetEventIntegrationIdempotencyForTests
} from './eventIntegration/event.service';
export {
  validateEventEnvelope
} from './eventIntegration/event.validation';
export {
  mapEnvelopeToNotificationHints
} from './eventIntegration/event.mapping';
export {
  listDomainEventAdapters
} from './eventIntegration/event.adapters';
export {
  ALL_EVENT_DOMAIN_SOURCES,
  PLACEHOLDER_EVENT_SOURCES
} from './eventIntegration/event.types';
export type {
  EventEnvelope,
  NotificationEvaluationRequest,
  EventDomainSource,
  EventIntegrationDiagnostics
} from './eventIntegration/event.types';
export type {
  NotificationContract,
  NotificationApiShape,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  NotificationPriorityBand,
  NotificationSource,
  NotificationReason,
  NotificationListContext
} from './contracts/types';
