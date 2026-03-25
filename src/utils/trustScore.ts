export type TrustScoreWeightKey =
  | 'completionRate'
  | 'responseRate'
  | 'responseTime'
  | 'reviewRating'
  | 'reviewVolume'
  | 'disputeRate'
  | 'cancellationRate';

export type TrustScorePolicySettings = {
  enabled: boolean;
  showOnProfiles: boolean;
  showOnListings: boolean;
  showRiskIndicators: boolean;
  weights: Record<TrustScoreWeightKey, number>;
  thresholds: {
    elite: number;
    established: number;
  };
};

const toBoolean = (value: unknown, fallback: boolean) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
};

const toNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

export const DEFAULT_TRUST_SCORE_SETTINGS: TrustScorePolicySettings = {
  enabled: true,
  showOnProfiles: true,
  showOnListings: true,
  showRiskIndicators: true,
  weights: {
    completionRate: 0.22,
    responseRate: 0.16,
    responseTime: 0.12,
    reviewRating: 0.18,
    reviewVolume: 0.1,
    disputeRate: 0.12,
    cancellationRate: 0.1
  },
  thresholds: {
    elite: 85,
    established: 65
  }
};

export const normalizeTrustScoreSettings = (value: any): TrustScorePolicySettings => {
  const source = value && typeof value === 'object' ? value : {};
  const weights = source.weights && typeof source.weights === 'object' ? source.weights : {};
  const thresholds = source.thresholds && typeof source.thresholds === 'object' ? source.thresholds : {};

  return {
    enabled: toBoolean(source.enabled, DEFAULT_TRUST_SCORE_SETTINGS.enabled),
    showOnProfiles: toBoolean(
      source.showOnProfiles ?? source.show_on_profiles,
      DEFAULT_TRUST_SCORE_SETTINGS.showOnProfiles
    ),
    showOnListings: toBoolean(
      source.showOnListings ?? source.show_on_listings,
      DEFAULT_TRUST_SCORE_SETTINGS.showOnListings
    ),
    showRiskIndicators: toBoolean(
      source.showRiskIndicators ?? source.show_risk_indicators,
      DEFAULT_TRUST_SCORE_SETTINGS.showRiskIndicators
    ),
    weights: {
      completionRate: toNumber(
        weights.completionRate ?? weights.completion_rate,
        DEFAULT_TRUST_SCORE_SETTINGS.weights.completionRate,
        0,
        1
      ),
      responseRate: toNumber(
        weights.responseRate ?? weights.response_rate,
        DEFAULT_TRUST_SCORE_SETTINGS.weights.responseRate,
        0,
        1
      ),
      responseTime: toNumber(
        weights.responseTime ?? weights.response_time,
        DEFAULT_TRUST_SCORE_SETTINGS.weights.responseTime,
        0,
        1
      ),
      reviewRating: toNumber(
        weights.reviewRating ?? weights.review_rating,
        DEFAULT_TRUST_SCORE_SETTINGS.weights.reviewRating,
        0,
        1
      ),
      reviewVolume: toNumber(
        weights.reviewVolume ?? weights.review_volume,
        DEFAULT_TRUST_SCORE_SETTINGS.weights.reviewVolume,
        0,
        1
      ),
      disputeRate: toNumber(
        weights.disputeRate ?? weights.dispute_rate,
        DEFAULT_TRUST_SCORE_SETTINGS.weights.disputeRate,
        0,
        1
      ),
      cancellationRate: toNumber(
        weights.cancellationRate ?? weights.cancellation_rate,
        DEFAULT_TRUST_SCORE_SETTINGS.weights.cancellationRate,
        0,
        1
      )
    },
    thresholds: {
      elite: toNumber(thresholds.elite, DEFAULT_TRUST_SCORE_SETTINGS.thresholds.elite, 0, 100),
      established: toNumber(
        thresholds.established,
        DEFAULT_TRUST_SCORE_SETTINGS.thresholds.established,
        0,
        100
      )
    }
  };
};
