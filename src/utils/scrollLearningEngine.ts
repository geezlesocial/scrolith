/**
 * Phase 23 — Scrolitha Learning Engine (client signals + ranking weights).
 * Does not alter community feed ranking; Scroll surface only.
 */

export type ScrollLearningSignalType =
  | 'watch_started'
  | 'watch_duration'
  | 'completion'
  | 'replay'
  | 'pause'
  | 'resume_play'
  | 'mute'
  | 'unmute'
  | 'seek'
  | 'like'
  | 'comment'
  | 'repost'
  | 'share'
  | 'send'
  | 'follow_creator'
  | 'hide'
  | 'report'
  | 'interested'
  | 'not_interested'
  | 'hashtag'
  | 'topic';

export type ScrollLearningEvent = {
  scrollId: string;
  type: ScrollLearningSignalType;
  value?: number;
  meta?: Record<string, string | number | boolean | null>;
  at: number;
};

/** Server-compatible engagement types used for learning via /scroll/:id/engage */
export type ScrollLearningEngageType =
  | 'impression'
  | 'view_3s'
  | 'view_10s'
  | 'view_25'
  | 'view_50'
  | 'view_95'
  | 'learn_pause'
  | 'learn_replay'
  | 'learn_mute'
  | 'learn_unmute'
  | 'learn_seek'
  | 'learn_complete'
  | 'learn_watch';

export const SCROLL_LEARNING_WEIGHTS: Record<ScrollLearningSignalType, number> = {
  watch_started: 0.2,
  watch_duration: 0.15,
  completion: 2.8,
  replay: 2.2,
  pause: -0.15,
  resume_play: 0.1,
  mute: -0.05,
  unmute: 0.12,
  seek: 0.08,
  like: 1.4,
  comment: 1.8,
  repost: 1.6,
  share: 1.5,
  send: 1.3,
  follow_creator: 2.4,
  hide: -3.5,
  report: -4.5,
  interested: 2.6,
  not_interested: -3.2,
  hashtag: 0.9,
  topic: 0.9
};

export const mapLearningToEngageType = (
  type: ScrollLearningSignalType
): ScrollLearningEngageType | null => {
  switch (type) {
    case 'completion':
      return 'learn_complete';
    case 'replay':
      return 'learn_replay';
    case 'pause':
      return 'learn_pause';
    case 'mute':
      return 'learn_mute';
    case 'unmute':
      return 'learn_unmute';
    case 'seek':
      return 'learn_seek';
    case 'watch_duration':
      return 'learn_watch';
    default:
      return null;
  }
};

export const scoreLearningEvents = (events: ScrollLearningEvent[]): number => {
  return events.reduce((total, event) => {
    const base = SCROLL_LEARNING_WEIGHTS[event.type] ?? 0;
    const magnitude = Number.isFinite(Number(event.value)) ? Math.min(5, Math.abs(Number(event.value))) : 1;
    return total + base * (event.type === 'watch_duration' ? magnitude / 10 : 1);
  }, 0);
};

/** Completion rate proxy: watched / duration clamped. */
export const computeCompletionRate = (watchedSeconds: number, durationSeconds: number) => {
  const w = Math.max(0, Number(watchedSeconds) || 0);
  const d = Math.max(0, Number(durationSeconds) || 0);
  if (d <= 0) return 0;
  return Math.max(0, Math.min(1, w / d));
};

export const shouldEmitOnceKey = (marks: Record<string, boolean>, key: string) => {
  if (marks[key]) return false;
  marks[key] = true;
  return true;
};

/**
 * Offline-safe learning queue (sessionStorage).
 */
const QUEUE_KEY = 'scroll:learning:queue:v1';

export const enqueueScrollLearningEvent = (event: ScrollLearningEvent) => {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const raw = JSON.parse(sessionStorage.getItem(QUEUE_KEY) || '[]');
    const list = Array.isArray(raw) ? raw : [];
    list.push(event);
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-80)));
  } catch {
    /* ignore */
  }
};

export const drainScrollLearningQueue = (): ScrollLearningEvent[] => {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const raw = JSON.parse(sessionStorage.getItem(QUEUE_KEY) || '[]');
    sessionStorage.removeItem(QUEUE_KEY);
    return Array.isArray(raw) ? (raw as ScrollLearningEvent[]) : [];
  } catch {
    return [];
  }
};

export const createLearningEvent = (
  scrollId: string,
  type: ScrollLearningSignalType,
  value?: number,
  meta?: ScrollLearningEvent['meta']
): ScrollLearningEvent => ({
  scrollId: String(scrollId || '').trim(),
  type,
  value,
  meta,
  at: Date.now()
});
