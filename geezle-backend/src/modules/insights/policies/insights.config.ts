import prisma from '../../../utils/prismaClient';

export type FeedMode = 'growth' | 'opportunity' | 'network' | 'learning';

export type InsightsConfig = {
  enabled: boolean;
  pgs: {
    maxScore: number;
    weights: {
      trustCompliance: number;
      deliveryReliability: number;
      quality: number;
      communityContribution: number;
      consistency: number;
      marketplacePerformance: number;
      profileCompleteness: number;
    };
    dailyCaps: {
      communityActions: number;
      streakIncrements: number;
    };
  };
  leaderboard: {
    enabled: boolean;
    scopes: string[];
    topN: number;
  };
  matching: {
    enabled: boolean;
    maxCandidatesPerRun: number;
    refreshOnDemand: boolean;
  };
  postPrediction: {
    enabled: boolean;
    sampleRatePercent: number;
    toxicitySoftThreshold: number;
    toxicityHardThreshold: number;
    hardActionsEnabled: boolean;
  };
  feedModes: {
    defaultMode: FeedMode;
    allowedModes: FeedMode[];
  };
  moderation: {
    softEnforcementDefault: boolean;
  };
};

const SETTINGS_SCOPE = 'insights_config';

export const DEFAULT_INSIGHTS_CONFIG: InsightsConfig = {
  enabled: true,
  pgs: {
    maxScore: 1000,
    weights: {
      trustCompliance: 0.2,
      deliveryReliability: 0.18,
      quality: 0.18,
      communityContribution: 0.14,
      consistency: 0.1,
      marketplacePerformance: 0.1,
      profileCompleteness: 0.1
    },
    dailyCaps: {
      communityActions: 120,
      streakIncrements: 1
    }
  },
  leaderboard: {
    enabled: true,
    scopes: ['global', 'freelancer', 'employer'],
    topN: 50
  },
  matching: {
    enabled: true,
    maxCandidatesPerRun: 40,
    refreshOnDemand: true
  },
  postPrediction: {
    enabled: true,
    sampleRatePercent: 20,
    toxicitySoftThreshold: 65,
    toxicityHardThreshold: 88,
    hardActionsEnabled: false
  },
  feedModes: {
    defaultMode: 'growth',
    allowedModes: ['growth', 'opportunity', 'network', 'learning']
  },
  moderation: {
    softEnforcementDefault: true
  }
};

const isPlainObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const deepMerge = <T extends Record<string, any>>(base: T, patch: any): T => {
  if (!isPlainObject(patch)) return base;
  const output: Record<string, any> = { ...base };
  Object.entries(patch).forEach(([key, value]) => {
    const prev = output[key];
    if (isPlainObject(prev) && isPlainObject(value)) {
      output[key] = deepMerge(prev, value);
      return;
    }
    if (value !== undefined) output[key] = value;
  });
  return output as T;
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const normalizeFeedMode = (value: unknown): FeedMode => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'opportunity') return 'opportunity';
  if (raw === 'network') return 'network';
  if (raw === 'learning') return 'learning';
  return 'growth';
};

export const normalizeInsightsConfig = (raw: any): InsightsConfig => {
  const merged = deepMerge({ ...DEFAULT_INSIGHTS_CONFIG }, isPlainObject(raw) ? raw : {});
  const allowedModes = Array.isArray(merged.feedModes?.allowedModes)
    ? merged.feedModes.allowedModes.map(normalizeFeedMode)
    : DEFAULT_INSIGHTS_CONFIG.feedModes.allowedModes;
  const dedupedModes = Array.from(new Set<FeedMode>(allowedModes)).filter(Boolean) as FeedMode[];

  return {
    enabled: Boolean(merged.enabled),
    pgs: {
      maxScore: Math.round(clamp(merged.pgs?.maxScore, 100, 5000, DEFAULT_INSIGHTS_CONFIG.pgs.maxScore)),
      weights: {
        trustCompliance: clamp(
          merged.pgs?.weights?.trustCompliance,
          0,
          1,
          DEFAULT_INSIGHTS_CONFIG.pgs.weights.trustCompliance
        ),
        deliveryReliability: clamp(
          merged.pgs?.weights?.deliveryReliability,
          0,
          1,
          DEFAULT_INSIGHTS_CONFIG.pgs.weights.deliveryReliability
        ),
        quality: clamp(merged.pgs?.weights?.quality, 0, 1, DEFAULT_INSIGHTS_CONFIG.pgs.weights.quality),
        communityContribution: clamp(
          merged.pgs?.weights?.communityContribution,
          0,
          1,
          DEFAULT_INSIGHTS_CONFIG.pgs.weights.communityContribution
        ),
        consistency: clamp(merged.pgs?.weights?.consistency, 0, 1, DEFAULT_INSIGHTS_CONFIG.pgs.weights.consistency),
        marketplacePerformance: clamp(
          merged.pgs?.weights?.marketplacePerformance,
          0,
          1,
          DEFAULT_INSIGHTS_CONFIG.pgs.weights.marketplacePerformance
        ),
        profileCompleteness: clamp(
          merged.pgs?.weights?.profileCompleteness,
          0,
          1,
          DEFAULT_INSIGHTS_CONFIG.pgs.weights.profileCompleteness
        )
      },
      dailyCaps: {
        communityActions: Math.round(
          clamp(
            merged.pgs?.dailyCaps?.communityActions,
            10,
            20000,
            DEFAULT_INSIGHTS_CONFIG.pgs.dailyCaps.communityActions
          )
        ),
        streakIncrements: Math.round(
          clamp(
            merged.pgs?.dailyCaps?.streakIncrements,
            1,
            20,
            DEFAULT_INSIGHTS_CONFIG.pgs.dailyCaps.streakIncrements
          )
        )
      }
    },
    leaderboard: {
      enabled: Boolean(merged.leaderboard?.enabled),
      scopes: Array.isArray(merged.leaderboard?.scopes)
        ? merged.leaderboard.scopes.map((entry: unknown) => String(entry || '').trim().toLowerCase()).filter(Boolean)
        : DEFAULT_INSIGHTS_CONFIG.leaderboard.scopes,
      topN: Math.round(clamp(merged.leaderboard?.topN, 5, 500, DEFAULT_INSIGHTS_CONFIG.leaderboard.topN))
    },
    matching: {
      enabled: Boolean(merged.matching?.enabled),
      maxCandidatesPerRun: Math.round(
        clamp(merged.matching?.maxCandidatesPerRun, 5, 500, DEFAULT_INSIGHTS_CONFIG.matching.maxCandidatesPerRun)
      ),
      refreshOnDemand: merged.matching?.refreshOnDemand !== false
    },
    postPrediction: {
      enabled: Boolean(merged.postPrediction?.enabled),
      sampleRatePercent: Math.round(
        clamp(
          merged.postPrediction?.sampleRatePercent,
          0,
          100,
          DEFAULT_INSIGHTS_CONFIG.postPrediction.sampleRatePercent
        )
      ),
      toxicitySoftThreshold: clamp(
        merged.postPrediction?.toxicitySoftThreshold,
        0,
        100,
        DEFAULT_INSIGHTS_CONFIG.postPrediction.toxicitySoftThreshold
      ),
      toxicityHardThreshold: clamp(
        merged.postPrediction?.toxicityHardThreshold,
        0,
        100,
        DEFAULT_INSIGHTS_CONFIG.postPrediction.toxicityHardThreshold
      ),
      hardActionsEnabled: Boolean(merged.postPrediction?.hardActionsEnabled)
    },
    feedModes: {
      defaultMode: normalizeFeedMode(merged.feedModes?.defaultMode),
      allowedModes: dedupedModes.length ? dedupedModes : DEFAULT_INSIGHTS_CONFIG.feedModes.allowedModes
    },
    moderation: {
      softEnforcementDefault: merged.moderation?.softEnforcementDefault !== false
    }
  };
};

export const getInsightsConfig = async (): Promise<InsightsConfig> => {
  const row = await prisma.appSetting.upsert({
    where: { scope: SETTINGS_SCOPE },
    create: { scope: SETTINGS_SCOPE, data: DEFAULT_INSIGHTS_CONFIG },
    update: {}
  });
  return normalizeInsightsConfig(row.data || {});
};

export const updateInsightsConfig = async (patch: any): Promise<InsightsConfig> => {
  const current = await getInsightsConfig();
  const merged = normalizeInsightsConfig(deepMerge({ ...current }, patch));
  await prisma.appSetting.upsert({
    where: { scope: SETTINGS_SCOPE },
    create: { scope: SETTINGS_SCOPE, data: merged },
    update: { data: merged }
  });
  return merged;
};

