export type TrustScoreWeightKey =
  | 'completionRate'
  | 'responseRate'
  | 'responseTime'
  | 'reviewRating'
  | 'reviewVolume'
  | 'disputeRate'
  | 'cancellationRate';

export type TrustScoreSettings = {
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
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
};

export const DEFAULT_TRUST_SCORE_SETTINGS: TrustScoreSettings = {
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

export const normalizeTrustScoreSettings = (value: any): TrustScoreSettings => {
  const source = value && typeof value === 'object' ? value : {};
  const weightSource = source.weights && typeof source.weights === 'object' ? source.weights : {};
  const thresholdSource = source.thresholds && typeof source.thresholds === 'object' ? source.thresholds : {};

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
        weightSource.completionRate ?? weightSource.completion_rate,
        DEFAULT_TRUST_SCORE_SETTINGS.weights.completionRate,
        0,
        1
      ),
      responseRate: toNumber(
        weightSource.responseRate ?? weightSource.response_rate,
        DEFAULT_TRUST_SCORE_SETTINGS.weights.responseRate,
        0,
        1
      ),
      responseTime: toNumber(
        weightSource.responseTime ?? weightSource.response_time,
        DEFAULT_TRUST_SCORE_SETTINGS.weights.responseTime,
        0,
        1
      ),
      reviewRating: toNumber(
        weightSource.reviewRating ?? weightSource.review_rating,
        DEFAULT_TRUST_SCORE_SETTINGS.weights.reviewRating,
        0,
        1
      ),
      reviewVolume: toNumber(
        weightSource.reviewVolume ?? weightSource.review_volume,
        DEFAULT_TRUST_SCORE_SETTINGS.weights.reviewVolume,
        0,
        1
      ),
      disputeRate: toNumber(
        weightSource.disputeRate ?? weightSource.dispute_rate,
        DEFAULT_TRUST_SCORE_SETTINGS.weights.disputeRate,
        0,
        1
      ),
      cancellationRate: toNumber(
        weightSource.cancellationRate ?? weightSource.cancellation_rate,
        DEFAULT_TRUST_SCORE_SETTINGS.weights.cancellationRate,
        0,
        1
      )
    },
    thresholds: {
      elite: toNumber(
        thresholdSource.elite,
        DEFAULT_TRUST_SCORE_SETTINGS.thresholds.elite,
        0,
        100
      ),
      established: toNumber(
        thresholdSource.established,
        DEFAULT_TRUST_SCORE_SETTINGS.thresholds.established,
        0,
        100
      )
    }
  };
};

export const sanitizePublicTrustScoreSettings = (value: any): TrustScoreSettings =>
  normalizeTrustScoreSettings(value);
