import crypto from 'crypto';
import {
  FEEDBACK_FABRIC_VERSION,
  type FeedbackAction,
  type FeedbackCategory,
  type FeedbackEntityType,
  type FeedbackEventInput,
  feedbackActions,
  feedbackEntityTypes,
  type NormalizedFeedbackEvent
} from './types';

const MAX_TEXT = 96;
const MAX_ID = 128;
const MAX_REASON_CODES = 12;

const entityAliases: Record<string, FeedbackEntityType> = {
  posts: 'post',
  community_post: 'post',
  community_posts: 'post',
  listing: 'marketplace_listing',
  marketplace: 'marketplace_listing',
  marketplace_listing: 'marketplace_listing',
  business_page: 'page',
  company: 'page',
  company_page: 'page',
  user: 'person',
  profile: 'person',
  people: 'person',
  group: 'community',
  club: 'community',
  learning: 'learning_resource',
  course: 'learning_resource',
  resource: 'learning_resource'
};

const actionAliases: Record<string, FeedbackAction> = {
  click: 'open_detail',
  open: 'open_detail',
  detail_open: 'open_detail',
  readmore: 'read_more',
  notinterested: 'not_interested',
  dismiss: 'dismiss_recommendation',
  dismiss_reco: 'dismiss_recommendation',
  contact: 'contact_seller',
  join: 'join_community',
  visit_profile: 'profile_visit',
  purchase: 'purchase_intent',
  carousel: 'carousel_navigation'
};

const positiveActions = new Set<FeedbackAction>([
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
  'purchase_intent'
]);

const negativeActions = new Set<FeedbackAction>([
  'hide',
  'not_interested',
  'report',
  'block',
  'mute',
  'dismiss_recommendation'
]);

export const cleanFeedbackText = (value: unknown, max = MAX_TEXT) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.:-]/g, '')
    .slice(0, max);

const normalizeToken = (value: unknown) =>
  cleanFeedbackText(String(value || '').toLowerCase().replace(/[\s-]+/g, '_'), MAX_TEXT);

export const normalizeFeedbackEntityType = (value: unknown): FeedbackEntityType | null => {
  const token = normalizeToken(value);
  if (!token) return null;
  const aliased = entityAliases[token] || token;
  return (feedbackEntityTypes as readonly string[]).includes(aliased) ? (aliased as FeedbackEntityType) : null;
};

export const normalizeFeedbackAction = (value: unknown): FeedbackAction | null => {
  const token = normalizeToken(value);
  if (!token) return null;
  const aliased = actionAliases[token] || token;
  return (feedbackActions as readonly string[]).includes(aliased) ? (aliased as FeedbackAction) : null;
};

export const getFeedbackCategory = (action: FeedbackAction): FeedbackCategory => {
  if (negativeActions.has(action)) return 'negative';
  if (positiveActions.has(action)) return 'positive';
  return 'neutral';
};

const normalizeNumber = (value: unknown, min: number, max: number): number | undefined => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const normalizeReasonCodes = (value: unknown): string[] | undefined => {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const out = Array.from(
    new Set(
      values
        .map((entry) => cleanFeedbackText(entry, 64).toUpperCase())
        .filter(Boolean)
    )
  ).slice(0, MAX_REASON_CODES);
  return out.length ? out : undefined;
};

const metadataObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const pickField = (input: FeedbackEventInput, key: keyof FeedbackEventInput) => {
  const meta = metadataObject(input.metadata);
  return input[key] ?? meta[key];
};

const normalizeTimestamp = (value: unknown) => {
  const date = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
};

const buildIdempotencyKey = (viewerId: string, eventId: string) =>
  `iff_${crypto.createHash('sha256').update(`${viewerId}:${eventId}`).digest('hex').slice(0, 40)}`;

export const normalizeFeedbackEvent = (
  input: FeedbackEventInput,
  viewerId: string
): NormalizedFeedbackEvent | null => {
  const entityType = normalizeFeedbackEntityType(input.entityType);
  const action = normalizeFeedbackAction(input.action);
  const entityId = cleanFeedbackText(input.entityId, MAX_ID);
  const safeViewerId = cleanFeedbackText(viewerId, MAX_ID);
  if (!safeViewerId || !entityType || !entityId || !action) return null;

  const rawEventId = cleanFeedbackText(input.eventId, 160);
  const eventId = rawEventId || null;
  const category = getFeedbackCategory(action);
  const sourceSurface = cleanFeedbackText(pickField(input, 'sourceSurface'), 64) || 'member_home';
  const occurredAt = normalizeTimestamp(pickField(input, 'timestamp'));
  const sessionId = cleanFeedbackText(pickField(input, 'sessionId'), 96) || undefined;
  const deviceType = cleanFeedbackText(pickField(input, 'deviceType'), 32) || undefined;
  const feedMode = cleanFeedbackText(pickField(input, 'feedMode'), 32) || undefined;
  const intelligenceVersion = cleanFeedbackText(pickField(input, 'intelligenceVersion'), 48) || undefined;
  const reasonCodes = normalizeReasonCodes(pickField(input, 'reasonCodes'));
  const feedPosition = normalizeNumber(pickField(input, 'feedPosition'), 0, 10000);
  const latencyMs = normalizeNumber(pickField(input, 'latencyMs'), 0, 60000);
  const viewDurationMs = normalizeNumber(pickField(input, 'viewDurationMs'), 0, 24 * 60 * 60 * 1000);

  return {
    eventId,
    idempotencyKey: eventId ? buildIdempotencyKey(safeViewerId, eventId) : null,
    viewerId: safeViewerId,
    entityType,
    entityId,
    action,
    storageAction: `iff_${action}`,
    category,
    surface: sourceSurface,
    occurredAt,
    metadata: {
      feedbackFabricVersion: FEEDBACK_FABRIC_VERSION,
      category,
      originalAction: action,
      sourceSurface,
      ...(sessionId ? { sessionId } : {}),
      ...(deviceType ? { deviceType } : {}),
      ...(feedMode ? { feedMode } : {}),
      ...(intelligenceVersion ? { intelligenceVersion } : {}),
      ...(reasonCodes ? { reasonCodes } : {}),
      ...(feedPosition !== undefined ? { feedPosition } : {}),
      ...(latencyMs !== undefined ? { latencyMs } : {}),
      ...(viewDurationMs !== undefined ? { viewDurationMs } : {})
    }
  };
};
