import prisma from '../utils/prismaClient';
import {
  DEFAULT_TRUST_SCORE_SETTINGS,
  normalizeTrustScoreSettings,
  TrustScoreSettings
} from '../utils/trustScoreSettings';

type TrustMetrics = {
  completedJobs: number;
  completionRate: number;
  responseRate: number;
  responseTimeHours: number | null;
  averageRating: number;
  reviewCount: number;
  disputeRate: number;
  cancellationRate: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const round = (value: number, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const percentToRatio = (value: unknown, fallback = 0.5) => {
  const parsed = toNumber(value, Number.NaN);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 1) return clamp(parsed, 0, 1);
  return clamp(parsed / 100, 0, 1);
};

const responseTimeToScore = (hours: number | null) => {
  if (hours === null || !Number.isFinite(hours)) return 60;
  if (hours <= 1) return 100;
  if (hours <= 4) return 92;
  if (hours <= 12) return 82;
  if (hours <= 24) return 70;
  if (hours <= 48) return 55;
  if (hours <= 72) return 40;
  return 25;
};

const volumeToScore = (count: number) => {
  if (count <= 0) return 45;
  return clamp((count / 20) * 100, 45, 100);
};

const ratioToPositiveScore = (ratio: number, minimum = 0) => clamp(ratio * 100, minimum, 100);
const ratioToInverseScore = (ratio: number, minimum = 0) => clamp((1 - ratio) * 100, minimum, 100);

const sumWeights = (weights: TrustScoreSettings['weights']) =>
  Object.values(weights).reduce((total, weight) => total + toNumber(weight, 0), 0);

export const getTrustScoreSettings = async (): Promise<TrustScoreSettings> => {
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
    return normalizeTrustScoreSettings((record?.data as any)?.trustScore ?? (record?.data as any)?.trust_score);
  } catch {
    return DEFAULT_TRUST_SCORE_SETTINGS;
  }
};

export const resolveTrustTier = (score: number, settings: TrustScoreSettings) => {
  if (score >= settings.thresholds.elite) return 'elite';
  if (score >= settings.thresholds.established) return 'established';
  return 'growing';
};

export const computeTrustScoreFromMetrics = (
  metrics: TrustMetrics,
  settings: TrustScoreSettings = DEFAULT_TRUST_SCORE_SETTINGS
) => {
  const completionComponent = ratioToPositiveScore(metrics.completionRate, 35);
  const responseRateComponent = ratioToPositiveScore(metrics.responseRate, 35);
  const responseTimeComponent = responseTimeToScore(metrics.responseTimeHours);
  const reviewRatingComponent =
    metrics.reviewCount > 0 ? clamp((metrics.averageRating / 5) * 100, 0, 100) : 55;
  const reviewVolumeComponent = volumeToScore(metrics.reviewCount);
  const disputeComponent = ratioToInverseScore(metrics.disputeRate, 35);
  const cancellationComponent = ratioToInverseScore(metrics.cancellationRate, 35);

  const weightTotal = sumWeights(settings.weights) || 1;
  const overall =
    ((completionComponent * settings.weights.completionRate +
      responseRateComponent * settings.weights.responseRate +
      responseTimeComponent * settings.weights.responseTime +
      reviewRatingComponent * settings.weights.reviewRating +
      reviewVolumeComponent * settings.weights.reviewVolume +
      disputeComponent * settings.weights.disputeRate +
      cancellationComponent * settings.weights.cancellationRate) /
      weightTotal) || 0;

  const reliability =
    (completionComponent +
      responseRateComponent +
      responseTimeComponent +
      disputeComponent +
      cancellationComponent) /
    5;
  const fairness = (disputeComponent + cancellationComponent + reviewRatingComponent) / 3;
  const professionalism =
    (responseRateComponent + responseTimeComponent + reviewRatingComponent + reviewVolumeComponent) / 4;

  return {
    overallScore: round(overall),
    overall_score: round(overall),
    reliability: round(reliability),
    fairness: round(fairness),
    professionalism: round(professionalism),
    trustTier: resolveTrustTier(overall, settings),
    trust_tier: resolveTrustTier(overall, settings),
    completionRate: round(metrics.completionRate * 100, 1),
    completion_rate: round(metrics.completionRate * 100, 1),
    cancellationRate: round(metrics.cancellationRate * 100, 1),
    cancellation_rate: round(metrics.cancellationRate * 100, 1),
    disputeRate: round(metrics.disputeRate * 100, 1),
    dispute_rate: round(metrics.disputeRate * 100, 1),
    responseRate: round(metrics.responseRate * 100, 1),
    response_rate: round(metrics.responseRate * 100, 1),
    responseTimeHours: metrics.responseTimeHours,
    response_time_hours: metrics.responseTimeHours,
    completedJobs: metrics.completedJobs,
    completed_jobs: metrics.completedJobs,
    reviewCount: metrics.reviewCount,
    review_count: metrics.reviewCount,
    averageRating: round(metrics.averageRating, 2),
    average_rating: round(metrics.averageRating, 2)
  };
};

const buildRiskIndicators = (metrics: TrustMetrics) => {
  const risks: string[] = [];
  if (metrics.cancellationRate >= 0.2) risks.push('Higher-than-target cancellation rate');
  if (metrics.disputeRate >= 0.1) risks.push('Dispute activity requires review');
  if (metrics.responseRate < 0.7) risks.push('Response rate is below target');
  if (metrics.responseTimeHours !== null && metrics.responseTimeHours > 48) {
    risks.push('Average response time exceeds 48 hours');
  }
  if (metrics.reviewCount >= 3 && metrics.averageRating < 4.2) {
    risks.push('Published reviews are below target');
  }
  return risks;
};

const resolveTrend = (metrics: TrustMetrics) => {
  if (metrics.completionRate >= 0.85 && metrics.disputeRate === 0 && metrics.responseRate >= 0.9) return 'up';
  if (metrics.cancellationRate >= 0.2 || metrics.disputeRate >= 0.1 || metrics.responseRate < 0.65) return 'down';
  return 'stable';
};

export const computeUserTrustScore = async (
  userId: string,
  preloaded?: {
    user?: any;
    profile?: any;
    settings?: TrustScoreSettings;
  }
) => {
  const settings = preloaded?.settings ?? (await getTrustScoreSettings());
  const userWithProfile =
    preloaded?.user && preloaded?.profile
      ? { ...preloaded.user, profile: preloaded.profile }
      : preloaded?.user && preloaded?.user.profile
      ? preloaded.user
      : await prisma.user.findUnique({
          where: { id: userId },
          include: { profile: true }
        });

  if (!userWithProfile) return null;

  const profile = preloaded?.profile ?? userWithProfile.profile ?? null;
  const [
    reviewAggregate,
    totalOrders,
    completedOrders,
    cancelledOrders,
    disputedOrders,
    completedContracts,
    terminatedContracts,
    disputeTickets
  ] = await Promise.all([
    prisma.review.aggregate({
      where: {
        subjectId: userId,
        status: 'PUBLISHED'
      },
      _avg: { rating: true },
      _count: { id: true }
    }),
    prisma.order.count({
      where: {
        freelancerId: userId
      }
    }),
    prisma.order.count({
      where: {
        freelancerId: userId,
        status: 'COMPLETED'
      }
    }),
    prisma.order.count({
      where: {
        freelancerId: userId,
        status: { in: ['CANCELLED', 'REFUNDED'] }
      }
    }),
    prisma.order.count({
      where: {
        freelancerId: userId,
        status: 'DISPUTED'
      }
    }),
    prisma.contract.count({
      where: {
        freelancerId: userId,
        status: 'COMPLETED'
      }
    }),
    prisma.contract.count({
      where: {
        freelancerId: userId,
        status: 'TERMINATED'
      }
    }),
    prisma.supportTicket.count({
      where: {
        userId,
        OR: [
          { category: { contains: 'dispute', mode: 'insensitive' } },
          { category: { contains: 'billing', mode: 'insensitive' } },
          { subject: { contains: 'dispute', mode: 'insensitive' } }
        ]
      }
    })
  ]);

  const reviewCount = toNumber(reviewAggregate?._count?.id, 0);
  const averageRating = toNumber(reviewAggregate?._avg?.rating, toNumber(profile?.rating, 0));
  const completedJobs = Math.max(
    toNumber(profile?.completedJobs, 0),
    completedOrders,
    completedContracts
  );
  const engagedJobs = Math.max(
    totalOrders,
    completedJobs + cancelledOrders + Math.max(disputedOrders, disputeTickets),
    completedContracts + terminatedContracts
  );
  const completionRate =
    engagedJobs > 0 ? clamp(completedJobs / engagedJobs, 0, 1) : completedJobs > 0 ? 1 : 0.5;
  const cancellationRate = engagedJobs > 0 ? clamp(cancelledOrders / engagedJobs, 0, 1) : 0;
  const disputeRate =
    engagedJobs > 0 ? clamp(Math.max(disputedOrders, disputeTickets) / engagedJobs, 0, 1) : disputeTickets > 0 ? 1 : 0;
  const responseRate = percentToRatio(profile?.responseRate, 0.6);
  const responseTimeHoursRaw = toNumber(profile?.responseTime, Number.NaN);
  const responseTimeHours = Number.isFinite(responseTimeHoursRaw) ? responseTimeHoursRaw : null;

  const metrics: TrustMetrics = {
    completedJobs,
    completionRate,
    responseRate,
    responseTimeHours,
    averageRating,
    reviewCount,
    disputeRate,
    cancellationRate
  };

  const computed = computeTrustScoreFromMetrics(metrics, settings);
  const riskIndicators = settings.showRiskIndicators ? buildRiskIndicators(metrics) : [];
  const trend = resolveTrend(metrics);

  return {
    userId,
    user_id: userId,
    ...computed,
    trend,
    riskIndicators,
    risk_indicators: riskIndicators
  };
};

export const computeListingTrustSummary = (
  input: {
    user?: any;
    rating?: number | null;
    reviewCount?: number | null;
  },
  settings: TrustScoreSettings = DEFAULT_TRUST_SCORE_SETTINGS
) => {
  if (!settings.enabled || !settings.showOnListings) return null;

  const profile = input.user?.profile || {};
  const completedJobs = toNumber(profile?.completedJobs, 0);
  const responseRate = percentToRatio(profile?.responseRate, 0.6);
  const responseTimeHoursRaw = toNumber(profile?.responseTime, Number.NaN);
  const responseTimeHours = Number.isFinite(responseTimeHoursRaw) ? responseTimeHoursRaw : null;
  const averageRating = Math.max(toNumber(profile?.rating, 0), toNumber(input.rating, 0));
  const reviewCount = Math.max(toNumber(input.reviewCount, 0), 0);

  if (completedJobs <= 0 && reviewCount <= 0 && averageRating <= 0) return null;

  const completionRate = completedJobs > 0 ? 0.85 : 0.55;
  const metrics: TrustMetrics = {
    completedJobs,
    completionRate,
    responseRate,
    responseTimeHours,
    averageRating,
    reviewCount,
    disputeRate: 0.05,
    cancellationRate: 0.08
  };

  const computed = computeTrustScoreFromMetrics(metrics, settings);
  return {
    freelancerTrustScore: computed.overallScore,
    freelancer_trust_score: computed.overall_score,
    freelancerTrustTier: computed.trustTier,
    freelancer_trust_tier: computed.trust_tier,
    freelancerCompletedJobs: completedJobs,
    freelancer_completed_jobs: completedJobs,
    freelancerResponseTimeHours: responseTimeHours,
    freelancer_response_time_hours: responseTimeHours
  };
};
