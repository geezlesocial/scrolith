export const FEEDBACK_FABRIC_VERSION = '19.2.0';

export const feedbackEntityTypes = [
  'post',
  'job',
  'marketplace_listing',
  'community',
  'person',
  'page',
  'event',
  'learning_resource'
] as const;

export const feedbackActions = [
  'view_duration',
  'expand',
  'read_more',
  'open_detail',
  'save',
  'bookmark',
  'like',
  'love',
  'helpful',
  'apply',
  'contact_seller',
  'join_community',
  'follow',
  'share',
  'message',
  'profile_visit',
  'purchase_intent',
  'scroll_past',
  'partial_read',
  'impression',
  'hover',
  'carousel_navigation',
  'hide',
  'not_interested',
  'report',
  'block',
  'mute',
  'dismiss_recommendation'
] as const;

export type FeedbackEntityType = typeof feedbackEntityTypes[number];
export type FeedbackAction = typeof feedbackActions[number];
export type FeedbackCategory = 'positive' | 'neutral' | 'negative';

export type FeedbackEventInput = {
  eventId?: unknown;
  entityType?: unknown;
  entityId?: unknown;
  action?: unknown;
  sourceSurface?: unknown;
  sessionId?: unknown;
  deviceType?: unknown;
  feedMode?: unknown;
  intelligenceVersion?: unknown;
  reasonCodes?: unknown;
  timestamp?: unknown;
  latencyMs?: unknown;
  feedPosition?: unknown;
  viewDurationMs?: unknown;
  metadata?: unknown;
};

export type NormalizedFeedbackEvent = {
  eventId: string | null;
  idempotencyKey: string | null;
  viewerId: string;
  entityType: FeedbackEntityType;
  entityId: string;
  action: FeedbackAction;
  storageAction: string;
  category: FeedbackCategory;
  surface: string;
  occurredAt: string;
  metadata: {
    feedbackFabricVersion: string;
    category: FeedbackCategory;
    originalAction: FeedbackAction;
    sourceSurface: string;
    sessionId?: string;
    deviceType?: string;
    feedMode?: string;
    intelligenceVersion?: string;
    reasonCodes?: string[];
    feedPosition?: number;
    latencyMs?: number;
    viewDurationMs?: number;
  };
};

export type FeedbackValidationIssue = {
  field: string;
  code: string;
  message: string;
};

export type FeedbackValidationResult =
  | { ok: true; event: NormalizedFeedbackEvent }
  | { ok: false; issues: FeedbackValidationIssue[] };

export type FeedbackBatchResult = {
  success: boolean;
  received: number;
  accepted: number;
  rejected: number;
  deduped: number;
  errors: Array<{ index: number; issues: FeedbackValidationIssue[] }>;
  storedIds: string[];
};

export type FeedbackMetricsSnapshot = {
  counters: Record<string, number>;
  latency: {
    count: number;
    avgMs: number;
    maxMs: number;
  };
};
