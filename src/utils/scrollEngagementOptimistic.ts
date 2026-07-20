/**
 * Phase 23 — optimistic Scroll metric helpers with rollback snapshots.
 */

export type ScrollMetricsPatch = {
  impressions?: number;
  views3s?: number;
  views10s?: number;
  views25pct?: number;
  views50pct?: number;
  views95pct?: number;
  likes?: number;
  comments?: number;
  reposts?: number;
  shares?: number;
  sends?: number;
  dashGcoinTotal?: number;
};

export const cloneMetrics = (metrics: ScrollMetricsPatch | null | undefined): ScrollMetricsPatch => ({
  impressions: Number(metrics?.impressions || 0),
  views3s: Number(metrics?.views3s || 0),
  views10s: Number(metrics?.views10s || 0),
  views25pct: Number(metrics?.views25pct || 0),
  views50pct: Number(metrics?.views50pct || 0),
  views95pct: Number(metrics?.views95pct || 0),
  likes: Number(metrics?.likes || 0),
  comments: Number(metrics?.comments || 0),
  reposts: Number(metrics?.reposts || 0),
  shares: Number(metrics?.shares || 0),
  sends: Number(metrics?.sends || 0),
  dashGcoinTotal: Number(metrics?.dashGcoinTotal || 0)
});

export const applyOptimisticMetricDelta = (
  metrics: ScrollMetricsPatch | null | undefined,
  field: keyof ScrollMetricsPatch,
  delta = 1
): { next: ScrollMetricsPatch; snapshot: ScrollMetricsPatch } => {
  const snapshot = cloneMetrics(metrics);
  const next = { ...snapshot };
  const current = Number(next[field] || 0);
  next[field] = Math.max(0, current + delta);
  return { next, snapshot };
};

export const mapEngageTypeToMetricField = (
  type: string
): keyof ScrollMetricsPatch | null => {
  switch (String(type || '').toLowerCase()) {
    case 'impression':
      return 'impressions';
    case 'view_3s':
      return 'views3s';
    case 'view_10s':
      return 'views10s';
    case 'view_25':
      return 'views25pct';
    case 'view_50':
      return 'views50pct';
    case 'view_95':
    case 'learn_complete':
      return 'views95pct';
    case 'like':
      return 'likes';
    case 'comment':
      return 'comments';
    case 'repost':
      return 'reposts';
    case 'share':
      return 'shares';
    case 'send':
      return 'sends';
    default:
      return null;
  }
};
