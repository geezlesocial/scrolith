export type RecoSurface = 'member_home' | 'who_to_follow' | 'search_suggest' | 'directory';
export type RecoEntityType = 'freelancer' | 'client' | 'page';
export type RecoMode = 'auto' | 'manual' | 'hybrid';
export type RecoManualAction = 'boost' | 'pin' | 'exclude' | 'shadow';
export type RecoFeedbackAction = 'click' | 'follow' | 'dismiss' | 'hide' | 'report';

export type RecoWeights = {
  relevance: number;
  quality: number;
  activity: number;
  social: number;
  performance: number;
  diversityBoost: number;
};

export type RecoGating = {
  activeOnly: boolean;
  excludeBlocked: boolean;
  minAccountAgeDays: number;
  minProfileCompleteness: number;
  requireKyc: boolean;
  requireVerified: boolean;
  violationLookbackDays: number;
  severeViolationSeverities: string[];
  severeViolationTypes: string[];
  maxFrequencyPerViewerPerDay: number;
  hideDismissLookbackDays: number;
};

export type RecoPenalties = {
  violationPenalty: number;
  reportRateThreshold: number;
  reportRatePenalty: number;
  spamPenalty: number;
  lowQualityPenalty: number;
  shadowLimitReportRate: number;
};

export type RecoDiversity = {
  maxCategoryShare: number;
  maxFromSameCluster: number;
  blendNewAndEstablished: boolean;
  blendLocalAndGlobal: boolean;
};

export type RecoColdStart = {
  enabled: boolean;
  regionBoost: number;
  popularCategoryBoost: number;
};

export const RECO_SURFACES: RecoSurface[] = ['member_home', 'who_to_follow', 'search_suggest', 'directory'];
export const RECO_ENTITY_TYPES: RecoEntityType[] = ['freelancer', 'client', 'page'];

export const DEFAULT_RECO_WEIGHTS: RecoWeights = {
  relevance: 0.35,
  quality: 0.2,
  activity: 0.15,
  social: 0.15,
  performance: 0.1,
  diversityBoost: 0.05
};

export const DEFAULT_RECO_GATING: RecoGating = {
  activeOnly: true,
  excludeBlocked: true,
  minAccountAgeDays: 7,
  minProfileCompleteness: 0.4,
  requireKyc: false,
  requireVerified: false,
  violationLookbackDays: 30,
  severeViolationSeverities: ['high', 'critical'],
  severeViolationTypes: ['fraud', 'scam', 'abuse', 'spam'],
  maxFrequencyPerViewerPerDay: 3,
  hideDismissLookbackDays: 30
};

export const DEFAULT_RECO_PENALTIES: RecoPenalties = {
  violationPenalty: 0.25,
  reportRateThreshold: 0.02,
  reportRatePenalty: 0.1,
  spamPenalty: 0.2,
  lowQualityPenalty: 0.1,
  shadowLimitReportRate: 0.02
};

export const DEFAULT_RECO_DIVERSITY: RecoDiversity = {
  maxCategoryShare: 0.3,
  maxFromSameCluster: 2,
  blendNewAndEstablished: true,
  blendLocalAndGlobal: true
};

export const DEFAULT_RECO_COLD_START: RecoColdStart = {
  enabled: true,
  regionBoost: 0.08,
  popularCategoryBoost: 0.06
};

const toNumber = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
};

const toArray = (value: unknown, fallback: string[]) => {
  if (!Array.isArray(value)) return fallback;
  const list = value
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : fallback;
};

export const normalizeRecoWeights = (weights?: Partial<RecoWeights> | null): RecoWeights => {
  const merged: RecoWeights = {
    relevance: toNumber(weights?.relevance, DEFAULT_RECO_WEIGHTS.relevance),
    quality: toNumber(weights?.quality, DEFAULT_RECO_WEIGHTS.quality),
    activity: toNumber(weights?.activity, DEFAULT_RECO_WEIGHTS.activity),
    social: toNumber(weights?.social, DEFAULT_RECO_WEIGHTS.social),
    performance: toNumber(weights?.performance, DEFAULT_RECO_WEIGHTS.performance),
    diversityBoost: toNumber(weights?.diversityBoost, DEFAULT_RECO_WEIGHTS.diversityBoost)
  };
  const sum = Object.values(merged).reduce((acc, value) => acc + Math.max(0, value), 0);
  if (!sum) return { ...DEFAULT_RECO_WEIGHTS };
  return {
    relevance: merged.relevance / sum,
    quality: merged.quality / sum,
    activity: merged.activity / sum,
    social: merged.social / sum,
    performance: merged.performance / sum,
    diversityBoost: merged.diversityBoost / sum
  };
};

export const normalizeRecoGating = (gating?: Partial<RecoGating> | null): RecoGating => ({
  activeOnly: toBoolean(gating?.activeOnly, DEFAULT_RECO_GATING.activeOnly),
  excludeBlocked: toBoolean(gating?.excludeBlocked, DEFAULT_RECO_GATING.excludeBlocked),
  minAccountAgeDays: Math.max(0, toNumber(gating?.minAccountAgeDays, DEFAULT_RECO_GATING.minAccountAgeDays)),
  minProfileCompleteness: Math.min(1, Math.max(0, toNumber(gating?.minProfileCompleteness, DEFAULT_RECO_GATING.minProfileCompleteness))),
  requireKyc: toBoolean(gating?.requireKyc, DEFAULT_RECO_GATING.requireKyc),
  requireVerified: toBoolean(gating?.requireVerified, DEFAULT_RECO_GATING.requireVerified),
  violationLookbackDays: Math.max(1, toNumber(gating?.violationLookbackDays, DEFAULT_RECO_GATING.violationLookbackDays)),
  severeViolationSeverities: toArray(gating?.severeViolationSeverities, DEFAULT_RECO_GATING.severeViolationSeverities),
  severeViolationTypes: toArray(gating?.severeViolationTypes, DEFAULT_RECO_GATING.severeViolationTypes),
  maxFrequencyPerViewerPerDay: Math.max(1, Math.floor(toNumber(gating?.maxFrequencyPerViewerPerDay, DEFAULT_RECO_GATING.maxFrequencyPerViewerPerDay))),
  hideDismissLookbackDays: Math.max(1, Math.floor(toNumber(gating?.hideDismissLookbackDays, DEFAULT_RECO_GATING.hideDismissLookbackDays)))
});

export const normalizeRecoPenalties = (penalties?: Partial<RecoPenalties> | null): RecoPenalties => ({
  violationPenalty: Math.min(1, Math.max(0, toNumber(penalties?.violationPenalty, DEFAULT_RECO_PENALTIES.violationPenalty))),
  reportRateThreshold: Math.min(1, Math.max(0, toNumber(penalties?.reportRateThreshold, DEFAULT_RECO_PENALTIES.reportRateThreshold))),
  reportRatePenalty: Math.min(1, Math.max(0, toNumber(penalties?.reportRatePenalty, DEFAULT_RECO_PENALTIES.reportRatePenalty))),
  spamPenalty: Math.min(1, Math.max(0, toNumber(penalties?.spamPenalty, DEFAULT_RECO_PENALTIES.spamPenalty))),
  lowQualityPenalty: Math.min(1, Math.max(0, toNumber(penalties?.lowQualityPenalty, DEFAULT_RECO_PENALTIES.lowQualityPenalty))),
  shadowLimitReportRate: Math.min(1, Math.max(0, toNumber(penalties?.shadowLimitReportRate, DEFAULT_RECO_PENALTIES.shadowLimitReportRate)))
});

export const normalizeRecoDiversity = (diversity?: Partial<RecoDiversity> | null): RecoDiversity => ({
  maxCategoryShare: Math.min(1, Math.max(0.05, toNumber(diversity?.maxCategoryShare, DEFAULT_RECO_DIVERSITY.maxCategoryShare))),
  maxFromSameCluster: Math.max(1, Math.floor(toNumber(diversity?.maxFromSameCluster, DEFAULT_RECO_DIVERSITY.maxFromSameCluster))),
  blendNewAndEstablished: toBoolean(diversity?.blendNewAndEstablished, DEFAULT_RECO_DIVERSITY.blendNewAndEstablished),
  blendLocalAndGlobal: toBoolean(diversity?.blendLocalAndGlobal, DEFAULT_RECO_DIVERSITY.blendLocalAndGlobal)
});

export const normalizeRecoColdStart = (coldStart?: Partial<RecoColdStart> | null): RecoColdStart => ({
  enabled: toBoolean(coldStart?.enabled, DEFAULT_RECO_COLD_START.enabled),
  regionBoost: Math.min(1, Math.max(0, toNumber(coldStart?.regionBoost, DEFAULT_RECO_COLD_START.regionBoost))),
  popularCategoryBoost: Math.min(1, Math.max(0, toNumber(coldStart?.popularCategoryBoost, DEFAULT_RECO_COLD_START.popularCategoryBoost)))
});

export type EffectiveRecoConfig = {
  surface: RecoSurface;
  entityType: RecoEntityType;
  mode: RecoMode;
  enabled: boolean;
  weights: RecoWeights;
  gating: RecoGating;
  penalties: RecoPenalties;
  diversity: RecoDiversity;
  coldStart: RecoColdStart;
  notes: string | null;
  updatedAt?: Date;
  createdAt?: Date;
};

export const defaultRecoConfig = (surface: RecoSurface, entityType: RecoEntityType): EffectiveRecoConfig => ({
  surface,
  entityType,
  mode: 'hybrid',
  enabled: true,
  weights: { ...DEFAULT_RECO_WEIGHTS },
  gating: { ...DEFAULT_RECO_GATING },
  penalties: { ...DEFAULT_RECO_PENALTIES },
  diversity: { ...DEFAULT_RECO_DIVERSITY },
  coldStart: { ...DEFAULT_RECO_COLD_START },
  notes: null
});

export const normalizeRecoMode = (value: unknown): RecoMode => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'auto' || normalized === 'manual' || normalized === 'hybrid') {
    return normalized;
  }
  return 'hybrid';
};

export const normalizeSurface = (value: unknown): RecoSurface => {
  const normalized = String(value || '').trim().toLowerCase();
  if (RECO_SURFACES.includes(normalized as RecoSurface)) return normalized as RecoSurface;
  return 'member_home';
};

export const normalizeEntityType = (value: unknown): RecoEntityType => {
  const normalized = String(value || '').trim().toLowerCase();
  if (RECO_ENTITY_TYPES.includes(normalized as RecoEntityType)) return normalized as RecoEntityType;
  return 'freelancer';
};

