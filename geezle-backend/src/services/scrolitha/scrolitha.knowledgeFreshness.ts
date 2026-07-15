/**
 * Knowledge freshness tracking — prefer recent verified information when appropriate.
 */
export type FreshnessBand = 'fresh' | 'recent' | 'aging' | 'stale' | 'unknown';

export type FreshnessReport = {
  band: FreshnessBand;
  label: string;
  ageMs: number | null;
  isStale: boolean;
  preferRefresh: boolean;
  updatedAt: string | null;
  /** Suggested re-check interval in ms */
  suggestedRefreshMs: number;
};

export type FreshnessTrackedItem = {
  id: string;
  kind: string;
  label: string;
  updatedAt: string | null;
  freshness: FreshnessReport;
};

const FRESH_MS = 24 * 60 * 60_000;
const RECENT_MS = 7 * 24 * 60 * 60_000;
const AGING_MS = 30 * 24 * 60 * 60_000;
const STALE_MS = 90 * 24 * 60 * 60_000;

export const evaluateKnowledgeFreshness = (
  updatedAt: string | Date | null | undefined,
  now = Date.now()
): FreshnessReport => {
  if (!updatedAt) {
    return {
      band: 'unknown',
      label: 'Unknown freshness',
      ageMs: null,
      isStale: false,
      preferRefresh: true,
      updatedAt: null,
      suggestedRefreshMs: RECENT_MS
    };
  }
  const ts =
    updatedAt instanceof Date ? updatedAt.getTime() : Date.parse(String(updatedAt));
  if (!Number.isFinite(ts)) {
    return {
      band: 'unknown',
      label: 'Unknown freshness',
      ageMs: null,
      isStale: false,
      preferRefresh: true,
      updatedAt: null,
      suggestedRefreshMs: RECENT_MS
    };
  }
  const ageMs = Math.max(0, now - ts);
  const iso = new Date(ts).toISOString();

  if (ageMs <= FRESH_MS) {
    return {
      band: 'fresh',
      label: 'Fresh (updated within 24h)',
      ageMs,
      isStale: false,
      preferRefresh: false,
      updatedAt: iso,
      suggestedRefreshMs: FRESH_MS
    };
  }
  if (ageMs <= RECENT_MS) {
    return {
      band: 'recent',
      label: 'Recent (within 7 days)',
      ageMs,
      isStale: false,
      preferRefresh: false,
      updatedAt: iso,
      suggestedRefreshMs: RECENT_MS
    };
  }
  if (ageMs <= AGING_MS) {
    return {
      band: 'aging',
      label: 'Aging (within 30 days)',
      ageMs,
      isStale: false,
      preferRefresh: true,
      updatedAt: iso,
      suggestedRefreshMs: AGING_MS
    };
  }
  if (ageMs <= STALE_MS) {
    return {
      band: 'stale',
      label: 'Stale (over 30 days)',
      ageMs,
      isStale: true,
      preferRefresh: true,
      updatedAt: iso,
      suggestedRefreshMs: STALE_MS
    };
  }
  return {
    band: 'stale',
    label: 'Very stale (over 90 days)',
    ageMs,
    isStale: true,
    preferRefresh: true,
    updatedAt: iso,
    suggestedRefreshMs: STALE_MS
  };
};

/** Prefer fresher items when ranking recommendations / knowledge */
export const freshnessBoost = (updatedAt: string | Date | null | undefined): number => {
  const f = evaluateKnowledgeFreshness(updatedAt);
  switch (f.band) {
    case 'fresh':
      return 0.12;
    case 'recent':
      return 0.08;
    case 'aging':
      return 0.02;
    case 'stale':
      return -0.08;
    default:
      return 0;
  }
};

export const annotateItemsWithFreshness = <T extends { id: string; label: string; updatedAt?: string | null }>(
  items: T[],
  kind = 'item'
): FreshnessTrackedItem[] =>
  items.map((item) => ({
    id: item.id,
    kind,
    label: item.label,
    updatedAt: item.updatedAt || null,
    freshness: evaluateKnowledgeFreshness(item.updatedAt)
  }));

export const FRESHNESS_POLICY = {
  freshMs: FRESH_MS,
  recentMs: RECENT_MS,
  agingMs: AGING_MS,
  staleMs: STALE_MS,
  preferRecentVerified: true,
  note: 'Scrolitha prefers recent verified platform records when answering time-sensitive questions.'
} as const;
