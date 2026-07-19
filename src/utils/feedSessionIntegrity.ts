/**
 * Phase 21.1.4 — Feed Session Integrity Stress Monitor.
 * Tracks visible identity + session order hash. Pure core + optional browser probe.
 * Privacy-safe: IDs and hashes only — no post bodies, messages, or PII text.
 */

export const FEED_SESSION_INTEGRITY_VERSION = '21.1.4-stress';

/** Explicit user actions that may legitimately change visible identity. */
export type FeedIntegrityUserAction =
  | 'hard_refresh'
  | 'show_new_posts'
  | 'new_session'
  | 'tab_change'
  | 'account_change'
  | 'scroll_user';

export type FeedIntegrityEvent =
  | FeedIntegrityUserAction
  | 'pagination_append'
  | 'soft_refresh_pending'
  | 'socket_metadata'
  | 'network_offline'
  | 'network_online'
  | 'visibility_hidden'
  | 'visibility_visible'
  | 'reaction'
  | 'follow'
  | 'comment'
  | 'interest_survey'
  | 'background_fetch'
  | 'probe_tick';

export type FeedIntegritySnapshot = {
  sessionId: string;
  surface: string;
  orderedItemHash: string;
  orderedItemCount: number;
  visiblePostId: string | null;
  visibleAuthorId: string | null;
  visibleAnchorId: string | null;
  capturedAt: number;
};

export type FeedIntegrityRegression = {
  reason: string;
  event: FeedIntegrityEvent;
  before: FeedIntegritySnapshot;
  after: FeedIntegritySnapshot;
  at: number;
};

export type FeedIntegrityProbeState = {
  sessionId: string;
  surface: string;
  baseline: FeedIntegritySnapshot | null;
  last: FeedIntegritySnapshot | null;
  regressions: FeedIntegrityRegression[];
  allowedUntil: number;
  eventLog: Array<{ event: FeedIntegrityEvent; at: number }>;
};

const hashString = (value: string): string => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
};

/** Stable hash of ordered item IDs (session identity fingerprint). */
export const hashOrderedItemIds = (ids: Array<string | null | undefined>): string => {
  const parts = (ids || []).map((id) => String(id || '').trim()).filter(Boolean);
  return hashString(parts.join('|'));
};

export const createIntegritySessionId = (surface: string): string => {
  const s = String(surface || 'feed').trim() || 'feed';
  return `integrity:${s}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
};

export const buildIntegritySnapshot = (params: {
  sessionId: string;
  surface: string;
  orderedItemIds: Array<string | null | undefined>;
  visiblePostId?: string | null;
  visibleAuthorId?: string | null;
  visibleAnchorId?: string | null;
}): FeedIntegritySnapshot => {
  const ordered = (params.orderedItemIds || []).map((id) => String(id || '').trim()).filter(Boolean);
  return {
    sessionId: String(params.sessionId || '').trim(),
    surface: String(params.surface || 'feed').trim() || 'feed',
    orderedItemHash: hashOrderedItemIds(ordered),
    orderedItemCount: ordered.length,
    visiblePostId: String(params.visiblePostId || '').trim() || null,
    visibleAuthorId: String(params.visibleAuthorId || '').trim() || null,
    visibleAnchorId: String(params.visibleAnchorId || params.visiblePostId || '').trim() || null,
    capturedAt: Date.now()
  };
};

const USER_ACTIONS = new Set<FeedIntegrityEvent>([
  'hard_refresh',
  'show_new_posts',
  'new_session',
  'tab_change',
  'account_change',
  'scroll_user'
]);

/**
 * Compare two snapshots. Returns null if OK, or regression reason string.
 * Session order may grow (append) without changing relative prefix of prior IDs —
 * orderedItemHash is full-list hash, so append changes hash: that's allowed if
 * visiblePostId stays the same and hash change is append-only (caller can pass allowOrderGrowth).
 */
export const detectIntegrityRegression = (
  before: FeedIntegritySnapshot,
  after: FeedIntegritySnapshot,
  options?: {
    event?: FeedIntegrityEvent;
    /** When true, ordered hash may change only if visible IDs unchanged (append). */
    allowOrderGrowth?: boolean;
  }
): string | null => {
  const event = options?.event || 'probe_tick';
  if (USER_ACTIONS.has(event)) return null;

  if (before.sessionId && after.sessionId && before.sessionId !== after.sessionId) {
    // Session id should only change on new_session / hard_refresh / tab / account
    return 'session_id_changed_without_user_action';
  }

  if (before.visiblePostId && after.visiblePostId && before.visiblePostId !== after.visiblePostId) {
    return 'visible_post_id_changed_without_user_action';
  }

  if (before.visibleAuthorId && after.visibleAuthorId && before.visibleAuthorId !== after.visibleAuthorId) {
    return 'visible_author_id_changed_without_user_action';
  }

  if (before.visibleAnchorId && after.visibleAnchorId && before.visibleAnchorId !== after.visibleAnchorId) {
    return 'visible_anchor_id_changed_without_user_action';
  }

  // Order hash: if visible identity stable and count grew, append-only is OK.
  if (before.orderedItemHash !== after.orderedItemHash) {
    if (
      options?.allowOrderGrowth &&
      after.orderedItemCount >= before.orderedItemCount &&
      before.visiblePostId === after.visiblePostId
    ) {
      return null;
    }
    // Soft pending should not change ordered hash until show_new_posts
    if (event === 'soft_refresh_pending' || event === 'background_fetch') {
      return 'ordered_item_hash_changed_on_background_refresh';
    }
    // Pagination may append — allow when counts grow and visible stable
    if (
      event === 'pagination_append' &&
      after.orderedItemCount > before.orderedItemCount &&
      before.visiblePostId === after.visiblePostId
    ) {
      return null;
    }
    if (event === 'probe_tick' || event === 'visibility_visible' || event === 'network_online') {
      // During idle probes, order must not change unless explicit pagination just ran
      if (before.visiblePostId === after.visiblePostId && after.orderedItemCount === before.orderedItemCount) {
        // same count but different hash => reorder or replace
        return 'ordered_item_hash_changed_without_append';
      }
    }
  }

  return null;
};

export const createIntegrityProbe = (surface: string): FeedIntegrityProbeState => ({
  sessionId: createIntegritySessionId(surface),
  surface: String(surface || 'feed'),
  baseline: null,
  last: null,
  regressions: [],
  allowedUntil: 0,
  eventLog: []
});

export type IntegrityProbeController = {
  state: FeedIntegrityProbeState;
  /** Mark next ticks as user-authorized (e.g. after Show new posts). */
  allowUserAction: (action: FeedIntegrityUserAction, ttlMs?: number) => void;
  /** Record an event and optional snapshot; returns regression if any. */
  observe: (
    event: FeedIntegrityEvent,
    snapshot: Omit<FeedIntegritySnapshot, 'sessionId' | 'surface' | 'capturedAt'> & {
      orderedItemIds: Array<string | null | undefined>;
      visiblePostId?: string | null;
      visibleAuthorId?: string | null;
      visibleAnchorId?: string | null;
    }
  ) => FeedIntegrityRegression | null;
  getReport: () => {
    sessionId: string;
    surface: string;
    regressionCount: number;
    regressions: FeedIntegrityRegression[];
    last: FeedIntegritySnapshot | null;
    ok: boolean;
  };
};

export const createIntegrityProbeController = (surface: string): IntegrityProbeController => {
  const state = createIntegrityProbe(surface);

  const allowUserAction = (action: FeedIntegrityUserAction, ttlMs = 2500) => {
    state.allowedUntil = Date.now() + Math.max(0, ttlMs);
    state.eventLog.push({ event: action, at: Date.now() });
    if (action === 'hard_refresh' || action === 'new_session' || action === 'tab_change' || action === 'account_change') {
      state.sessionId = createIntegritySessionId(surface);
      state.baseline = null;
      state.last = null;
    }
  };

  const observe: IntegrityProbeController['observe'] = (event, partial) => {
    const now = Date.now();
    state.eventLog.push({ event, at: now });
    // Cap log
    if (state.eventLog.length > 200) state.eventLog.splice(0, state.eventLog.length - 200);

    const snapshot = buildIntegritySnapshot({
      sessionId: state.sessionId,
      surface: state.surface,
      orderedItemIds: partial.orderedItemIds,
      visiblePostId: partial.visiblePostId,
      visibleAuthorId: partial.visibleAuthorId,
      visibleAnchorId: partial.visibleAnchorId
    });

    if (!state.baseline) {
      state.baseline = snapshot;
      state.last = snapshot;
      return null;
    }

    const effectiveEvent: FeedIntegrityEvent =
      now < state.allowedUntil && !USER_ACTIONS.has(event) ? 'scroll_user' : event;

    // After show_new_posts / hard refresh window, re-baseline
    if (USER_ACTIONS.has(effectiveEvent) || now < state.allowedUntil) {
      if (effectiveEvent === 'show_new_posts' || effectiveEvent === 'hard_refresh' || effectiveEvent === 'new_session') {
        state.baseline = snapshot;
      }
      state.last = snapshot;
      return null;
    }

    const reason = detectIntegrityRegression(state.last || state.baseline, snapshot, {
      event: effectiveEvent,
      allowOrderGrowth: effectiveEvent === 'pagination_append'
    });

    state.last = snapshot;

    if (!reason) return null;

    const regression: FeedIntegrityRegression = {
      reason,
      event: effectiveEvent,
      before: state.baseline,
      after: snapshot,
      at: now
    };
    state.regressions.push(regression);
    if (state.regressions.length > 50) state.regressions.splice(0, state.regressions.length - 50);

    try {
      // Always log regressions — operator stress + DEV diagnostics
      // eslint-disable-next-line no-console
      console.error('[feed-session-integrity:REGRESSION]', {
        reason,
        event: effectiveEvent,
        surface: state.surface,
        sessionId: state.sessionId,
        beforeVisiblePostId: regression.before.visiblePostId,
        afterVisiblePostId: regression.after.visiblePostId,
        beforeHash: regression.before.orderedItemHash,
        afterHash: regression.after.orderedItemHash
      });
    } catch {
      // ignore
    }

    return regression;
  };

  return {
    state,
    allowUserAction,
    observe,
    getReport: () => ({
      sessionId: state.sessionId,
      surface: state.surface,
      regressionCount: state.regressions.length,
      regressions: [...state.regressions],
      last: state.last,
      ok: state.regressions.length === 0
    })
  };
};

/**
 * Stress simulator: run a continuous session through event sequence.
 * Pure — no timers. Used by automated stress tests.
 */
export const runFeedIntegrityStressScenario = (params: {
  surface?: string;
  initialIds: string[];
  visibleIndex?: number;
  steps: Array<{
    event: FeedIntegrityEvent;
    /** Full ordered IDs after the event */
    orderedItemIds?: string[];
    /** If set, overrides visible index */
    visibleIndex?: number;
    /** Soft-refresh pending only (order unchanged) */
    pendingOnly?: boolean;
  }>;
}): {
  ok: boolean;
  regressionCount: number;
  regressions: FeedIntegrityRegression[];
  finalHash: string;
  sessionId: string;
} => {
  const controller = createIntegrityProbeController(params.surface || 'member_home');
  let order = [...params.initialIds];
  let visibleIndex = Math.max(0, Math.min(order.length - 1, params.visibleIndex ?? 0));

  const snap = () => {
    const postId = order[visibleIndex] || null;
    return {
      orderedItemIds: order,
      visiblePostId: postId,
      visibleAuthorId: postId ? `author:${postId}` : null,
      visibleAnchorId: postId
    };
  };

  controller.observe('probe_tick', snap());

  for (const step of params.steps) {
    if (USER_ACTIONS.has(step.event as FeedIntegrityUserAction)) {
      controller.allowUserAction(step.event as FeedIntegrityUserAction);
    }

    if (step.event === 'pagination_append' && step.orderedItemIds) {
      order = [...step.orderedItemIds];
    } else if (step.event === 'show_new_posts' && step.orderedItemIds) {
      order = [...step.orderedItemIds];
      visibleIndex = 0;
    } else if (step.event === 'hard_refresh' || step.event === 'new_session') {
      order = step.orderedItemIds ? [...step.orderedItemIds] : order;
      visibleIndex = 0;
    } else if (step.event === 'scroll_user' && step.visibleIndex != null) {
      visibleIndex = Math.max(0, Math.min(order.length - 1, step.visibleIndex));
    } else if (step.orderedItemIds && !step.pendingOnly) {
      // Illicit reorder / replace unless user action already allowed
      order = [...step.orderedItemIds];
    }
    // pendingOnly / soft_refresh / metadata: keep order

    if (step.visibleIndex != null && step.event !== 'show_new_posts') {
      visibleIndex = Math.max(0, Math.min(order.length - 1, step.visibleIndex));
    }

    controller.observe(step.event, snap());
  }

  const report = controller.getReport();
  return {
    ok: report.ok,
    regressionCount: report.regressionCount,
    regressions: report.regressions,
    finalHash: report.last?.orderedItemHash || '',
    sessionId: report.sessionId
  };
};

/** Whether integrity probe should run in this environment. */
export const shouldEnableFeedIntegrityProbe = (): boolean => {
  try {
    if (typeof window !== 'undefined') {
      const flag = window.localStorage?.getItem('scrolith:feedIntegrityProbe');
      if (flag === '1' || flag === 'true') return true;
    }
  } catch {
    // ignore
  }
  try {
    const env = (import.meta as ImportMeta & { env?: { DEV?: boolean; MODE?: string } }).env;
    if (env?.DEV) return true;
  } catch {
    // ignore
  }
  return false;
};
