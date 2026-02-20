import prisma from '../utils/prismaClient';
import { getPlanById, PlanRecord, planHasFeature } from './planStore';

export type ListingType = 'gig' | 'job';

export interface ListingFeaturePolicy {
  freeFeaturedGigsPerMonth: number;
  freeFeaturedJobsPerMonth: number;
  feedCardEveryPosts: number;
  maxListingCardsPerFeed: number;
  recommendedPoolLimit: number;
}

export interface FeaturedEligibility {
  allowed: boolean;
  source: 'free' | 'plan';
  used: number;
  limit: number;
  remaining: number;
  reason?: string;
}

const DEFAULT_LISTING_FEATURE_POLICY: ListingFeaturePolicy = {
  freeFeaturedGigsPerMonth: 1,
  freeFeaturedJobsPerMonth: 1,
  feedCardEveryPosts: 2,
  maxListingCardsPerFeed: 8,
  recommendedPoolLimit: 20
};

const GIG_FEATURE_CODES = ['featured_gigs', 'featured_gig_cards', 'featured_gig_card', 'featured_gig'];
const JOB_FEATURE_CODES = ['featured_jobs', 'featured_job_cards', 'featured_job_card', 'featured_job'];

const isPlainObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toPositiveInt = (value: unknown, fallback: number, min = 0, max = 10_000) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
};

const normalizePolicy = (raw: unknown): ListingFeaturePolicy => {
  const source = isPlainObject(raw) ? raw : {};
  return {
    freeFeaturedGigsPerMonth: toPositiveInt(
      source.freeFeaturedGigsPerMonth ?? source.free_featured_gigs_per_month,
      DEFAULT_LISTING_FEATURE_POLICY.freeFeaturedGigsPerMonth,
      0,
      500
    ),
    freeFeaturedJobsPerMonth: toPositiveInt(
      source.freeFeaturedJobsPerMonth ?? source.free_featured_jobs_per_month,
      DEFAULT_LISTING_FEATURE_POLICY.freeFeaturedJobsPerMonth,
      0,
      500
    ),
    feedCardEveryPosts: toPositiveInt(
      source.feedCardEveryPosts ?? source.feed_card_every_posts,
      DEFAULT_LISTING_FEATURE_POLICY.feedCardEveryPosts,
      2,
      20
    ),
    maxListingCardsPerFeed: toPositiveInt(
      source.maxListingCardsPerFeed ?? source.max_listing_cards_per_feed,
      DEFAULT_LISTING_FEATURE_POLICY.maxListingCardsPerFeed,
      1,
      50
    ),
    recommendedPoolLimit: toPositiveInt(
      source.recommendedPoolLimit ?? source.recommended_pool_limit,
      DEFAULT_LISTING_FEATURE_POLICY.recommendedPoolLimit,
      4,
      200
    )
  };
};

const getMonthBounds = (from = new Date()) => {
  const start = new Date(from.getFullYear(), from.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(from.getFullYear(), from.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
};

const isPlanActive = (active: unknown, expiresAt: unknown) => {
  if (!active) return false;
  if (!expiresAt) return true;
  const expiry = new Date(String(expiresAt));
  if (Number.isNaN(expiry.getTime())) return true;
  return expiry.getTime() > Date.now();
};

const parseFeatureLimit = (value: unknown): number | null => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes('unlimited')) return Number.POSITIVE_INFINITY;
  const matched = raw.match(/\d+/);
  if (!matched) return null;
  const numeric = Number(matched[0]);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.floor(numeric);
};

const resolvePlanFeaturedLimit = (plan: PlanRecord | null | undefined, listingType: ListingType): number | null => {
  if (!plan) return null;
  const targetCodes = listingType === 'gig' ? GIG_FEATURE_CODES : JOB_FEATURE_CODES;
  const matched = plan.features.find((feature) => {
    if (!feature?.included) return false;
    const featureCode = String(feature.code || '').trim().toLowerCase();
    return Boolean(featureCode) && targetCodes.includes(featureCode);
  });
  if (!matched) return null;
  const parsedLimit = parseFeatureLimit(matched.limit);
  return parsedLimit === null ? Number.POSITIVE_INFINITY : parsedLimit;
};

const resolveSystemListingPolicySource = (data: any) => {
  const fromListings = isPlainObject(data?.listings) ? data.listings : {};
  const explicitPolicy =
    fromListings.featurePolicy ??
    fromListings.feature_policy ??
    data?.listingsFeaturePolicy ??
    data?.listings_feature_policy ??
    {};

  return {
    ...explicitPolicy,
    freeFeaturedGigsPerMonth:
      explicitPolicy?.freeFeaturedGigsPerMonth ??
      explicitPolicy?.free_featured_gigs_per_month ??
      fromListings.freeFeaturedGigsPerMonth ??
      fromListings.free_featured_gigs_per_month,
    freeFeaturedJobsPerMonth:
      explicitPolicy?.freeFeaturedJobsPerMonth ??
      explicitPolicy?.free_featured_jobs_per_month ??
      fromListings.freeFeaturedJobsPerMonth ??
      fromListings.free_featured_jobs_per_month,
    feedCardEveryPosts:
      explicitPolicy?.feedCardEveryPosts ??
      explicitPolicy?.feed_card_every_posts ??
      fromListings.feedCardEveryPosts ??
      fromListings.feed_card_every_posts,
    maxListingCardsPerFeed:
      explicitPolicy?.maxListingCardsPerFeed ??
      explicitPolicy?.max_listing_cards_per_feed ??
      fromListings.maxListingCardsPerFeed ??
      fromListings.max_listing_cards_per_feed,
    recommendedPoolLimit:
      explicitPolicy?.recommendedPoolLimit ??
      explicitPolicy?.recommended_pool_limit ??
      fromListings.recommendedPoolLimit ??
      fromListings.recommended_pool_limit
  };
};

const hasPlanFeature = (plan: PlanRecord | null | undefined, listingType: ListingType) => {
  const targetCodes = listingType === 'gig' ? GIG_FEATURE_CODES : JOB_FEATURE_CODES;
  return targetCodes.some((code) => planHasFeature(plan, code));
};

const countMonthlyFeaturedListings = async (params: {
  listingType: ListingType;
  userId: string;
  excludeId?: string;
}) => {
  const { start, end } = getMonthBounds();
  if (params.listingType === 'gig') {
    return prisma.gig.count({
      where: {
        userId: params.userId,
        isFeatured: true,
        updatedAt: { gte: start, lt: end },
        ...(params.excludeId ? { id: { not: params.excludeId } } : {})
      }
    });
  }

  return prisma.job.count({
    where: {
      clientId: params.userId,
      isFeatured: true,
      updatedAt: { gte: start, lt: end },
      ...(params.excludeId ? { id: { not: params.excludeId } } : {})
    }
  });
};

const getActivePlanForListingType = (user: any, listingType: ListingType) => {
  if (listingType === 'gig') {
    if (!isPlanActive(user?.freelancerPlanActive, user?.freelancerPlanExpiresAt)) return null;
    return user?.freelancerPlanId ? getPlanById(String(user.freelancerPlanId)) : null;
  }
  if (!isPlanActive(user?.employerPlanActive, user?.employerPlanExpiresAt)) return null;
  return user?.employerPlanId ? getPlanById(String(user.employerPlanId)) : null;
};

export const getListingFeaturePolicy = async (): Promise<ListingFeaturePolicy> => {
  try {
    const record = await prisma.appSetting.findUnique({
      where: { scope: 'system' },
      select: { data: true }
    });
    const source = resolveSystemListingPolicySource(record?.data);
    return normalizePolicy(source);
  } catch {
    return { ...DEFAULT_LISTING_FEATURE_POLICY };
  }
};

export const resolveFeaturedListingEligibility = async (params: {
  listingType: ListingType;
  userId: string;
  excludeListingId?: string;
}): Promise<FeaturedEligibility> => {
  const policy = await getListingFeaturePolicy();
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true,
      freelancerPlanId: true,
      freelancerPlanActive: true,
      freelancerPlanExpiresAt: true,
      employerPlanId: true,
      employerPlanActive: true,
      employerPlanExpiresAt: true
    }
  });

  if (!user) {
    return {
      allowed: false,
      source: 'free',
      used: 0,
      limit: 0,
      remaining: 0,
      reason: 'User not found'
    };
  }

  const listingType = params.listingType;
  const activePlan = getActivePlanForListingType(user, listingType);
  const coveredByPlan = hasPlanFeature(activePlan, listingType);
  const freeLimit =
    listingType === 'gig' ? policy.freeFeaturedGigsPerMonth : policy.freeFeaturedJobsPerMonth;
  const planLimit = coveredByPlan ? resolvePlanFeaturedLimit(activePlan, listingType) : null;
  const effectiveLimit = planLimit !== null ? planLimit : freeLimit;
  const used = await countMonthlyFeaturedListings({
    listingType,
    userId: params.userId,
    excludeId: params.excludeListingId
  });
  const remaining = Number.isFinite(effectiveLimit)
    ? Math.max(0, Math.floor(effectiveLimit) - used)
    : Number.MAX_SAFE_INTEGER;

  if (Number.isFinite(effectiveLimit) && used >= Math.floor(effectiveLimit)) {
    const isGig = listingType === 'gig';
    return {
      allowed: false,
      source: coveredByPlan ? 'plan' : 'free',
      used,
      limit: Math.max(0, Math.floor(effectiveLimit)),
      remaining: 0,
      reason: coveredByPlan
        ? `Your current plan featured ${isGig ? 'gig' : 'job'} limit is fully used for this month.`
        : `You have used all free featured ${isGig ? 'gig' : 'job'} slots for this month. Upgrade to continue.`
    };
  }

  return {
    allowed: true,
    source: coveredByPlan ? 'plan' : 'free',
    used,
    limit: Number.isFinite(effectiveLimit) ? Math.max(0, Math.floor(effectiveLimit)) : Number.MAX_SAFE_INTEGER,
    remaining
  };
};
