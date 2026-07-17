import type { MemberFeedSurface, UnifiedFeedItem } from './memberFeed';

/**
 * Phase 19.2B — Frontend Intelligence Feedback Collector
 *
 * Telemetry-only. Fire-and-forget page impressions for authenticated
 * member-feed orchestrator responses. Does not affect ranking, ordering,
 * UI rendering, or navigation.
 *
 * Impression definition (this release):
 * - Emitted for items present in a successfully fetched authenticated
 *   member-feed / community orchestrator page response.
 * - Not viewport IntersectionObserver-based in this phase.
 * - Bounded to first 25 items per page (backend batch max).
 * - Idempotent via stable eventId (surface/mode/action/type/id).
 */

export const FEEDBACK_FABRIC_VERSION = '19.2.0';
export const FEEDBACK_ENDPOINT = '/intelligence/feedback/events';
export const MAX_BATCH_SIZE = 25;

export type FeedbackEntityType =
  | 'post'
  | 'job'
  | 'marketplace_listing'
  | 'community'
  | 'person'
  | 'page'
  | 'event'
  | 'learning_resource';

export type FeedbackAction =
  | 'view_duration'
  | 'expand'
  | 'read_more'
  | 'open_detail'
  | 'save'
  | 'bookmark'
  | 'like'
  | 'love'
  | 'helpful'
  | 'apply'
  | 'contact_seller'
  | 'join_community'
  | 'follow'
  | 'share'
  | 'message'
  | 'profile_visit'
  | 'purchase_intent'
  | 'scroll_past'
  | 'partial_read'
  | 'impression'
  | 'hover'
  | 'carousel_navigation'
  | 'hide'
  | 'not_interested'
  | 'report'
  | 'block'
  | 'mute'
  | 'dismiss_recommendation';

export type IntelligenceFeedbackEvent = {
  eventId?: string;
  entityType: FeedbackEntityType;
  entityId: string;
  action: FeedbackAction;
  sourceSurface?: string;
  sessionId?: string;
  deviceType?: string;
  feedMode?: string;
  intelligenceVersion?: string;
  reasonCodes?: string[];
  timestamp?: string;
  latencyMs?: number;
  feedPosition?: number;
  viewDurationMs?: number;
};

export type SubmitFeedbackOptions = {
  endpoint?: string;
};

const SESSION_KEY = 'scrolith.intelligence.feedback.session';
const RECENT_EVENT_LIMIT = 400;
const recentEventIds = new Set<string>();
const recentEventOrder: string[] = [];
let submissionsEnabled = true;
let authListenerBound = false;

const clean = (value: unknown, max = 128) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.:-]/g, '')
    .slice(0, max);

const normalizeType = (value: unknown) =>
  clean(value, 64)
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

export const resolveFeedbackEntityType = (value: unknown): FeedbackEntityType | null => {
  const type = normalizeType(value);
  switch (type) {
    case 'post':
    case 'community_post':
      return 'post';
    case 'job':
      return 'job';
    case 'marketplace':
    case 'marketplace_listing':
      return 'marketplace_listing';
    case 'community':
    case 'community_recommendation':
    case 'group':
    case 'club':
      return 'community';
    case 'person':
    case 'person_recommendation':
    case 'profile':
    case 'user':
      return 'person';
    case 'page':
    case 'page_recommendation':
    case 'business_page':
    case 'company':
      return 'page';
    case 'event':
      return 'event';
    case 'learning':
    case 'learning_resource':
    case 'course':
      return 'learning_resource';
    default:
      return null;
  }
};

export const resolveFeedbackAction = (value: unknown): FeedbackAction | null => {
  const action = normalizeType(value);
  const allowed: FeedbackAction[] = [
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
  ];
  return (allowed as string[]).includes(action) ? (action as FeedbackAction) : null;
};

const rememberEventId = (eventId: string) => {
  if (!eventId || recentEventIds.has(eventId)) return false;
  recentEventIds.add(eventId);
  recentEventOrder.push(eventId);
  while (recentEventOrder.length > RECENT_EVENT_LIMIT) {
    const oldest = recentEventOrder.shift();
    if (oldest) recentEventIds.delete(oldest);
  }
  return true;
};

export const clearFeedbackSessionState = () => {
  recentEventIds.clear();
  recentEventOrder.length = 0;
  submissionsEnabled = false;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage?.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  }
};

export const enableFeedbackSubmissions = () => {
  submissionsEnabled = true;
};

const bindAuthLifecycle = () => {
  if (authListenerBound || typeof window === 'undefined') return;
  authListenerBound = true;
  const disable = () => {
    clearFeedbackSessionState();
  };
  window.addEventListener('scrolith:auth-invalid', disable);
  window.addEventListener('scrolith:logout', disable);
  // Re-enable when a token may be available again (best-effort).
  window.addEventListener('scrolith:auth-ready', () => {
    submissionsEnabled = true;
  });
};

export const getFeedbackSessionId = () => {
  if (typeof window === 'undefined') return 'server';
  try {
    const existing = window.sessionStorage?.getItem(SESSION_KEY);
    if (existing && /^[a-zA-Z0-9_.:-]+$/.test(existing) && existing.length <= 96) {
      return existing;
    }
    const generated =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `session_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    window.sessionStorage?.setItem(SESSION_KEY, generated);
    return generated;
  } catch {
    return 'session_unavailable';
  }
};

const getDeviceType = () => {
  if (typeof window === 'undefined') return 'server';
  const width = Number(window.innerWidth || 0);
  if (width > 0 && width < 768) return 'mobile';
  if (width >= 768 && width < 1180) return 'tablet';
  return 'desktop';
};

const extractReasonCodes = (item: UnifiedFeedItem): string[] | undefined => {
  const source = (item as any)?.intelligence || item?.payload?.intelligence || {};
  const raw = Array.isArray(source.reasonCodes) ? source.reasonCodes : [];
  const cleaned: string[] = [];
  for (const entry of raw) {
    const code = clean(entry, 64).toUpperCase();
    if (code) cleaned.push(code);
  }
  const codes = Array.from(new Set(cleaned));
  return codes.length ? codes.slice(0, 12) : undefined;
};

const extractIntelligenceVersion = (item: UnifiedFeedItem): string | undefined => {
  const source = (item as any)?.intelligence || item?.payload?.intelligence || {};
  const value = clean(source.intelligenceVersion || source.version, 48);
  return value || undefined;
};

/** Whitelist-only serializer: never includes content, scores, tokens, or PII. */
export const sanitizeFeedbackEvent = (input: IntelligenceFeedbackEvent): IntelligenceFeedbackEvent | null => {
  if (!input || typeof input !== 'object') return null;
  const entityType = resolveFeedbackEntityType(input.entityType);
  const action = resolveFeedbackAction(input.action);
  const entityId = clean(input.entityId, 128);
  if (!entityType || !action || !entityId) return null;

  const eventId = clean(input.eventId, 160) || undefined;
  const sourceSurface = clean(input.sourceSurface, 64) || undefined;
  const sessionId = clean(input.sessionId, 96) || undefined;
  const deviceType = clean(input.deviceType, 32) || undefined;
  const feedMode = clean(input.feedMode, 32) || undefined;
  const intelligenceVersion = clean(input.intelligenceVersion, 48) || undefined;
  const reasonCodes = Array.isArray(input.reasonCodes)
    ? Array.from(
        new Set(
          input.reasonCodes
            .map((entry) => clean(entry, 64).toUpperCase())
            .filter((entry): entry is string => Boolean(entry))
        )
      ).slice(0, 12)
    : undefined;
  const feedPosition =
    Number.isFinite(Number(input.feedPosition))
      ? Math.max(0, Math.min(10000, Math.floor(Number(input.feedPosition))))
      : undefined;
  const latencyMs =
    Number.isFinite(Number(input.latencyMs))
      ? Math.max(0, Math.min(60000, Math.floor(Number(input.latencyMs))))
      : undefined;
  const viewDurationMs =
    Number.isFinite(Number(input.viewDurationMs))
      ? Math.max(0, Math.min(24 * 60 * 60 * 1000, Math.floor(Number(input.viewDurationMs))))
      : undefined;
  const timestampRaw = input.timestamp ? new Date(String(input.timestamp)) : new Date();
  const timestamp = Number.isNaN(timestampRaw.getTime())
    ? new Date().toISOString()
    : timestampRaw.toISOString();

  return {
    ...(eventId ? { eventId } : {}),
    entityType,
    entityId,
    action,
    ...(sourceSurface ? { sourceSurface } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(deviceType ? { deviceType } : {}),
    ...(feedMode ? { feedMode } : {}),
    ...(intelligenceVersion ? { intelligenceVersion } : {}),
    ...(reasonCodes && reasonCodes.length ? { reasonCodes } : {}),
    ...(feedPosition !== undefined ? { feedPosition } : {}),
    ...(latencyMs !== undefined ? { latencyMs } : {}),
    ...(viewDurationMs !== undefined ? { viewDurationMs } : {}),
    timestamp
  };
};

export const buildMemberFeedFeedbackEvents = (params: {
  items: UnifiedFeedItem[];
  surface: MemberFeedSurface | string;
  mode?: string;
  action?: FeedbackAction;
}): IntelligenceFeedbackEvent[] => {
  const sessionId = getFeedbackSessionId();
  const deviceType = getDeviceType();
  const surface = clean(params.surface, 64) || 'member_home';
  const mode = clean(params.mode, 32) || undefined;
  const action = resolveFeedbackAction(params.action || 'impression') || 'impression';

  return (Array.isArray(params.items) ? params.items : [])
    .slice(0, MAX_BATCH_SIZE)
    .map((item, index) => {
      const entityType = resolveFeedbackEntityType(item?.type);
      const entityId = clean(item?.sourceId || item?.id || item?.payload?.id, 128);
      if (!entityType || !entityId) return null;
      // Stable logical identity without user id / email / fingerprint.
      const eventId = `member_feed:${surface}:${mode || 'default'}:${action}:${entityType}:${entityId}`;
      const event = sanitizeFeedbackEvent({
        eventId,
        entityType,
        entityId,
        action,
        sourceSurface: surface,
        sessionId,
        deviceType,
        feedMode: mode,
        intelligenceVersion: extractIntelligenceVersion(item),
        reasonCodes: extractReasonCodes(item),
        feedPosition: index,
        timestamp: new Date().toISOString()
      });
      return event;
    })
    .filter(Boolean) as IntelligenceFeedbackEvent[];
};

const hasAuthToken = async (): Promise<boolean> => {
  try {
    const { tokenStore } = await import('./tokenStore');
    const token = await tokenStore.get();
    return Boolean(token && String(token).trim());
  } catch {
    return false;
  }
};

export const submitIntelligenceFeedbackEvents = async (
  events: IntelligenceFeedbackEvent[],
  options: SubmitFeedbackOptions = {}
) => {
  bindAuthLifecycle();
  if (!submissionsEnabled) return null;

  const batch = (Array.isArray(events) ? events : [])
    .map((event) => sanitizeFeedbackEvent(event))
    .filter(Boolean)
    .filter((event) => {
      const id = String(event?.eventId || '');
      if (!id) return true;
      return rememberEventId(id);
    })
    .slice(0, MAX_BATCH_SIZE) as IntelligenceFeedbackEvent[];

  if (!batch.length) return null;

  // Guests / logged-out sessions: skip without calling the API (avoids 401 noise).
  const authenticated = await hasAuthToken();
  if (!authenticated) return null;

  try {
    const { default: api } = await import('./api');
    const response = await api.post(
      options.endpoint || FEEDBACK_ENDPOINT,
      { events: batch },
      {
        // Never retry feedback POSTs (no 400/401/403/5xx retry storms).
        __skipRetry: true,
        // Background telemetry must not participate in global auth invalidation.
        __authValidation: false,
        timeout: 12000
      } as any
    );
    return response?.data?.data ?? response?.data ?? null;
  } catch (error: any) {
    const status = Number(error?.response?.status || 0);
    // 401 after token was present: stop further submissions until re-auth.
    if (status === 401 || status === 403) {
      submissionsEnabled = false;
    }
    if (import.meta.env.DEV) {
      console.warn('[intelligence-feedback] submit skipped', {
        status: status || 'network',
        code: error?.code || null
      });
    }
    return null;
  }
};

export const recordMemberFeedPageFeedback = async (params: {
  items: UnifiedFeedItem[];
  surface: MemberFeedSurface | string;
  mode?: string;
}) => {
  bindAuthLifecycle();
  try {
    const events = buildMemberFeedFeedbackEvents(params);
    if (!events.length) return null;
    return await submitIntelligenceFeedbackEvents(events);
  } catch {
    // Never throw into feed rendering / navigation.
    return null;
  }
};

export const FeedbackCollector = {
  buildMemberFeedFeedbackEvents,
  recordMemberFeedPageFeedback,
  submit: submitIntelligenceFeedbackEvents,
  sanitize: sanitizeFeedbackEvent,
  clearSession: clearFeedbackSessionState,
  enable: enableFeedbackSubmissions,
  getSessionId: getFeedbackSessionId,
  maxBatchSize: MAX_BATCH_SIZE,
  version: FEEDBACK_FABRIC_VERSION
};

export default FeedbackCollector;
