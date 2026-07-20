/**
 * Phase 24 — Community Scrolitha learning signals (surface: community).
 * Does not inflate public counters; does not touch Phase 21 feed session.
 */

export type CommunityLearningSignal =
  | 'community_impression'
  | 'community_opened'
  | 'community_joined'
  | 'community_left'
  | 'community_search'
  | 'community_filter_selected'
  | 'community_post_viewed'
  | 'community_post_dwell'
  | 'community_post_reacted'
  | 'community_post_commented'
  | 'community_post_shared'
  | 'community_hidden'
  | 'community_reported'
  | 'community_not_interested'
  | 'community_topic_followed';

export type CommunityLearningEvent = {
  surface: 'community';
  signal: CommunityLearningSignal;
  entityId?: string;
  entityType?: 'COMMUNITY' | 'COMMUNITY_POST' | 'COMMUNITY_TOPIC' | 'QUERY';
  weight?: number;
  meta?: Record<string, string | number | boolean | null>;
  at: number;
};

export const COMMUNITY_LEARNING_WEIGHTS: Record<CommunityLearningSignal, number> = {
  community_impression: 0.15,
  community_opened: 0.8,
  community_joined: 2.6,
  community_left: -1.2,
  community_search: 0.35,
  community_filter_selected: 0.25,
  community_post_viewed: 0.55,
  community_post_dwell: 0.9,
  community_post_reacted: 1.4,
  community_post_commented: 1.8,
  community_post_shared: 1.5,
  community_hidden: -3.2,
  community_reported: -4.2,
  community_not_interested: -3.0,
  community_topic_followed: 1.6
};

export const createCommunityLearningEvent = (
  signal: CommunityLearningSignal,
  input?: Omit<CommunityLearningEvent, 'surface' | 'signal' | 'at' | 'weight'> & { weight?: number }
): CommunityLearningEvent => ({
  surface: 'community',
  signal,
  entityId: input?.entityId,
  entityType: input?.entityType,
  weight: input?.weight ?? COMMUNITY_LEARNING_WEIGHTS[signal],
  meta: input?.meta,
  at: Date.now()
});

export const scoreCommunityLearningEvents = (events: CommunityLearningEvent[]) =>
  events.reduce((total, event) => total + Number(event.weight || 0), 0);

/** Privacy-safe console / analytics emit (no report text, no member lists). */
export const emitCommunityLearningEvent = (event: CommunityLearningEvent) => {
  try {
    window.dispatchEvent(new CustomEvent('community:learning', { detail: event }));
  } catch {
    /* ignore */
  }
  try {
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      console.debug(
        '[community-learning]',
        JSON.stringify({
          surface: event.surface,
          signal: event.signal,
          entityType: event.entityType || null,
          entityId: event.entityId || null,
          weight: event.weight ?? null,
          at: event.at
        })
      );
    }
  } catch {
    /* ignore */
  }
};

export const trackCommunitySignal = (
  signal: CommunityLearningSignal,
  input?: Parameters<typeof createCommunityLearningEvent>[1]
) => {
  const event = createCommunityLearningEvent(signal, input);
  emitCommunityLearningEvent(event);
  return event;
};
