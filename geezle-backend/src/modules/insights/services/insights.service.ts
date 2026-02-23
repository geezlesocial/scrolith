import type { Application } from 'express';
import { createHash } from 'crypto';
import prisma from '../../../utils/prismaClient';
import { emitInsightsEvent } from '../realtime/insights.realtime';
import { DEFAULT_INSIGHTS_CONFIG, FeedMode, getInsightsConfig } from '../policies/insights.config';
import { ScrolithaService } from '../../scrolitha/inference/scrolitha.service';
import type { ScrolithaActor } from '../../../services/scrolitha/scrolitha.types';

type ScoreBreakdown = {
  trustCompliance: number;
  deliveryReliability: number;
  quality: number;
  communityContribution: number;
  consistency: number;
  marketplacePerformance: number;
  profileCompleteness: number;
};

type UserMetricsSnapshot = {
  userId: string;
  role: string;
  kycVerified: boolean;
  isVerified: boolean;
  profileCompleteness: number;
  completedOrders: number;
  cancelledOrders: number;
  avgRating: number;
  ratingsCount: number;
  postsCount: number;
  commentsCount: number;
  followersCount: number;
  acceptedProposals: number;
  totalProposals: number;
  violationsLast30d: number;
  currentStreakDays: number;
  updatedAt: string;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const toScore100 = (value: number) => clamp(value, 0, 100);

const todayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const isSameUtcDay = (a?: Date | null, b?: Date | null) => {
  if (!a || !b) return false;
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
};

const isYesterdayUtc = (last?: Date | null, today = todayUtc()) => {
  if (!last) return false;
  const y = new Date(today);
  y.setUTCDate(today.getUTCDate() - 1);
  return isSameUtcDay(last, y);
};

const isoWeekKey = (date = new Date()) => {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

const tokenize = (input: string) =>
  String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);

const jaccard = (a: string[], b: string[]) => {
  const setA = new Set(a);
  const setB = new Set(b);
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  setA.forEach((item) => {
    if (setB.has(item)) intersection += 1;
  });
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
};

const deterministicPercent = (seed: string) => {
  const digest = createHash('sha256').update(seed).digest();
  return digest[0] % 100;
};

const textIncludesAny = (source: string, tokens: string[]) => {
  const normalized = ` ${String(source || '').toLowerCase()} `;
  return tokens.some((token) => normalized.includes(` ${token.toLowerCase()} `));
};

const DEFAULT_ACHIEVEMENTS = [
  {
    key: 'CONSISTENCY_7_DAYS',
    title: 'Consistency 7 Days',
    description: 'Maintain a 7-day professional activity streak.',
    tier: 'silver',
    rules: { streakDays: 7 }
  },
  {
    key: 'FIRST_10_FOLLOWERS',
    title: 'First 10 Followers',
    description: 'Gain your first 10 followers in the network.',
    tier: 'bronze',
    rules: { followers: 10 }
  },
  {
    key: 'FIRST_5_SALES',
    title: 'First 5 Sales',
    description: 'Complete your first 5 paid orders.',
    tier: 'silver',
    rules: { completedOrders: 5 }
  },
  {
    key: 'TOP_HELPER',
    title: 'Top Helper',
    description: 'Contribute high-value community posts and comments consistently.',
    tier: 'gold',
    rules: { posts: 8, comments: 20 }
  },
  {
    key: 'TRUSTED_SELLER',
    title: 'Trusted Seller',
    description: 'Pass verification and keep a clean trust profile.',
    tier: 'gold',
    rules: { verified: true, violations: 0 }
  },
  {
    key: 'PROFILE_80',
    title: 'Profile Optimized',
    description: 'Reach at least 80% profile completeness.',
    tier: 'bronze',
    rules: { profileCompleteness: 80 }
  }
];

export const ensureDefaultAchievements = async () => {
  await Promise.all(
    DEFAULT_ACHIEVEMENTS.map((item) =>
      prisma.achievement.upsert({
        where: { key: item.key },
        create: {
          key: item.key,
          title: item.title,
          description: item.description,
          tier: item.tier,
          rules: item.rules,
          isActive: true
        },
        update: {
          title: item.title,
          description: item.description,
          tier: item.tier,
          rules: item.rules
        }
      })
    )
  );
};

const computeProfileCompleteness = (profile: any) => {
  if (!profile) return 0;
  const checks: boolean[] = [
    Boolean(profile.title),
    Boolean(profile.bio),
    Boolean(profile.location),
    Array.isArray(profile.skills) && profile.skills.length > 0,
    Boolean(profile.hourlyRate && Number(profile.hourlyRate) > 0),
    Boolean(profile.experience),
    Array.isArray(profile.languages) && profile.languages.length > 0,
    Boolean(profile.portfolioUrl || profile.githubUrl || profile.linkedinUrl || profile.websiteUrl),
    Boolean(profile.introVideoUrl),
    Boolean(profile.coverPhotoUrl)
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
};

const loadMetricsSnapshot = async (userId: string): Promise<UserMetricsSnapshot> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true }
  });
  if (!user) throw new Error('User not found');

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [
    completedOrders,
    cancelledOrders,
    ratingAgg,
    postsCount,
    commentsCount,
    followersCount,
    acceptedProposals,
    totalProposals,
    violationsLast30d,
    streak
  ] = await Promise.all([
    prisma.order.count({ where: { freelancerId: userId, status: 'COMPLETED' } }),
    prisma.order.count({ where: { freelancerId: userId, status: 'CANCELLED' } }),
    prisma.review.aggregate({
      where: { subjectId: userId, rating: { gt: 0 } },
      _avg: { rating: true },
      _count: { _all: true }
    }),
    prisma.communityPost.count({ where: { authorId: userId, status: 'active' } }),
    prisma.communityPostComment.count({ where: { authorId: userId, status: 'active' } }),
    prisma.userFollow.count({ where: { followeeId: userId } }),
    prisma.proposal.count({ where: { freelancerId: userId, status: 'ACCEPTED' } }),
    prisma.proposal.count({ where: { freelancerId: userId } }),
    prisma.accountViolation.count({ where: { userId, resolvedAt: null, createdAt: { gte: since30d } } }),
    prisma.userStreak.findUnique({ where: { userId } })
  ]);

  return {
    userId,
    role: String(user.role || 'USER'),
    kycVerified: String(user.kycStatus || '').toUpperCase() === 'VERIFIED',
    isVerified: Boolean(user.isVerified),
    profileCompleteness: computeProfileCompleteness(user.profile),
    completedOrders,
    cancelledOrders,
    avgRating: Number(ratingAgg._avg.rating || 0),
    ratingsCount: Number(ratingAgg._count._all || 0),
    postsCount,
    commentsCount,
    followersCount,
    acceptedProposals,
    totalProposals,
    violationsLast30d,
    currentStreakDays: Number(streak?.currentStreakDays || 0),
    updatedAt: new Date().toISOString()
  };
};

const computeBreakdown = (metrics: UserMetricsSnapshot, config: Awaited<ReturnType<typeof getInsightsConfig>>) => {
  const deliveryRatio =
    metrics.completedOrders + metrics.cancelledOrders > 0
      ? metrics.completedOrders / (metrics.completedOrders + metrics.cancelledOrders)
      : 0.5;
  const proposalWinRatio = metrics.totalProposals > 0 ? metrics.acceptedProposals / metrics.totalProposals : 0;
  const qualityScore = toScore100((metrics.avgRating / 5) * 80 + Math.min(20, metrics.ratingsCount * 2));
  const trustScore = toScore100(
    (metrics.kycVerified ? 55 : 20) +
      (metrics.isVerified ? 20 : 0) +
      Math.max(0, 25 - metrics.violationsLast30d * 8)
  );
  const communityScore = toScore100(metrics.postsCount * 4 + metrics.commentsCount * 1.8 + metrics.followersCount * 0.6);
  const consistencyScore = toScore100(metrics.currentStreakDays * 5);
  const deliveryScore = toScore100(deliveryRatio * 100);
  const marketScore = toScore100(40 + proposalWinRatio * 60);
  const profileScore = toScore100(metrics.profileCompleteness);

  const breakdown: ScoreBreakdown = {
    trustCompliance: trustScore,
    deliveryReliability: deliveryScore,
    quality: qualityScore,
    communityContribution: communityScore,
    consistency: consistencyScore,
    marketplacePerformance: marketScore,
    profileCompleteness: profileScore
  };

  const weighted100 =
    breakdown.trustCompliance * clamp01(config.pgs.weights.trustCompliance) +
    breakdown.deliveryReliability * clamp01(config.pgs.weights.deliveryReliability) +
    breakdown.quality * clamp01(config.pgs.weights.quality) +
    breakdown.communityContribution * clamp01(config.pgs.weights.communityContribution) +
    breakdown.consistency * clamp01(config.pgs.weights.consistency) +
    breakdown.marketplacePerformance * clamp01(config.pgs.weights.marketplacePerformance) +
    breakdown.profileCompleteness * clamp01(config.pgs.weights.profileCompleteness);

  const normalizedScore = Math.round((weighted100 / 100) * config.pgs.maxScore);
  const riskFlags = {
    highViolationRisk: metrics.violationsLast30d >= 3,
    weakDeliveryReliability: deliveryRatio < 0.6,
    weakProfileCompleteness: metrics.profileCompleteness < 45
  };

  return { breakdown, normalizedScore, riskFlags };
};

const isObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeFieldName = (fieldInput: unknown) => {
  const field = String(fieldInput || '').trim();
  if (!field) return '';
  const aliases: Record<string, keyof UserMetricsSnapshot> = {
    streakDays: 'currentStreakDays',
    streak: 'currentStreakDays',
    followers: 'followersCount',
    followers_count: 'followersCount',
    posts: 'postsCount',
    comments: 'commentsCount',
    completions: 'completedOrders',
    sales: 'completedOrders',
    verified: 'kycVerified',
    violations: 'violationsLast30d',
    profile: 'profileCompleteness'
  };
  return String((aliases[field] as string) || field);
};

const getMetricValue = (metrics: UserMetricsSnapshot, fieldInput: unknown) => {
  const field = normalizeFieldName(fieldInput);
  return field ? (metrics as any)?.[field] : undefined;
};

const toComparableString = (value: unknown) => String(value ?? '').trim().toLowerCase();

const toComparableNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const evaluateRuleLeaf = (
  node: { field?: unknown; op?: unknown; value?: unknown },
  metrics: UserMetricsSnapshot
) => {
  const field = normalizeFieldName(node.field);
  if (!field) return false;
  const actual = getMetricValue(metrics, field);
  const expected = node.value;
  const op = String(node.op || 'eq').trim().toLowerCase();

  if (op === 'exists') {
    const shouldExist = expected === undefined ? true : Boolean(expected);
    const exists = actual !== undefined && actual !== null && !(typeof actual === 'string' && !actual.trim());
    return shouldExist ? exists : !exists;
  }

  if (op === 'contains') {
    if (Array.isArray(actual)) {
      return actual.map(toComparableString).includes(toComparableString(expected));
    }
    return toComparableString(actual).includes(toComparableString(expected));
  }

  if (op === 'not_contains') {
    if (Array.isArray(actual)) {
      return !actual.map(toComparableString).includes(toComparableString(expected));
    }
    return !toComparableString(actual).includes(toComparableString(expected));
  }

  if (op === 'in' || op === 'not_in') {
    const list = Array.isArray(expected) ? expected : [];
    const found = list.map(toComparableString).includes(toComparableString(actual));
    return op === 'in' ? found : !found;
  }

  const actualNum = toComparableNumber(actual);
  const expectedNum = toComparableNumber(expected);
  const canNumeric = actualNum !== null && expectedNum !== null;

  if (op === 'gt') return canNumeric ? actualNum > expectedNum : toComparableString(actual) > toComparableString(expected);
  if (op === 'gte') return canNumeric ? actualNum >= expectedNum : toComparableString(actual) >= toComparableString(expected);
  if (op === 'lt') return canNumeric ? actualNum < expectedNum : toComparableString(actual) < toComparableString(expected);
  if (op === 'lte') return canNumeric ? actualNum <= expectedNum : toComparableString(actual) <= toComparableString(expected);
  if (op === 'ne' || op === 'neq') {
    return canNumeric ? actualNum !== expectedNum : toComparableString(actual) !== toComparableString(expected);
  }
  return canNumeric ? actualNum === expectedNum : toComparableString(actual) === toComparableString(expected);
};

const evaluateRuleTree = (rules: unknown, metrics: UserMetricsSnapshot): boolean => {
  if (Array.isArray(rules)) return rules.every((entry) => evaluateRuleTree(entry, metrics));
  if (!isObject(rules)) return false;

  if (rules.field !== undefined) return evaluateRuleLeaf(rules, metrics);

  const hasGroups = Array.isArray(rules.all) || Array.isArray(rules.any) || Array.isArray(rules.not);
  if (hasGroups) {
    const allPass = Array.isArray(rules.all) ? rules.all.every((entry) => evaluateRuleTree(entry, metrics)) : true;
    const anyPass = Array.isArray(rules.any) ? (rules.any.length ? rules.any.some((entry) => evaluateRuleTree(entry, metrics)) : true) : true;
    const notPass = Array.isArray(rules.not) ? rules.not.every((entry) => !evaluateRuleTree(entry, metrics)) : true;
    return allPass && anyPass && notPass;
  }

  const entries = Object.entries(rules);
  if (!entries.length) return false;

  // Legacy shorthand rule object:
  // { streakDays: 7, followers: 10, verified: true, violations: 0 }
  return entries.every(([field, value]) => {
    const op =
      typeof value === 'number'
        ? field.toLowerCase() === 'violations' || field.toLowerCase() === 'violationslast30d'
          ? 'lte'
          : 'gte'
        : 'eq';
    return evaluateRuleLeaf({ field, op, value }, metrics);
  });
};

const evaluateLegacyAchievementKey = (key: string, metrics: UserMetricsSnapshot) => {
  switch (key) {
    case 'CONSISTENCY_7_DAYS':
      return metrics.currentStreakDays >= 7;
    case 'FIRST_10_FOLLOWERS':
      return metrics.followersCount >= 10;
    case 'FIRST_5_SALES':
      return metrics.completedOrders >= 5;
    case 'TOP_HELPER':
      return metrics.postsCount >= 8 && metrics.commentsCount >= 20;
    case 'TRUSTED_SELLER':
      return metrics.kycVerified && metrics.violationsLast30d === 0;
    case 'PROFILE_80':
      return metrics.profileCompleteness >= 80;
    default:
      return false;
  }
};

const evaluateAchievementRule = (achievement: { key: string; rules?: unknown }, metrics: UserMetricsSnapshot) => {
  if (isObject(achievement.rules) && Object.keys(achievement.rules).length > 0) {
    return evaluateRuleTree(achievement.rules, metrics);
  }
  return evaluateLegacyAchievementKey(String(achievement.key || ''), metrics);
};

const unlockAchievementsIfNeeded = async (userId: string, metrics: UserMetricsSnapshot, app?: Application) => {
  await ensureDefaultAchievements();
  const achievements = await prisma.achievement.findMany({ where: { isActive: true } });
  if (!achievements.length) return [];

  const existing = await prisma.userAchievement.findMany({
    where: { userId },
    select: { achievementId: true }
  });
  const existingIds = new Set(existing.map((row) => row.achievementId));
  const unlocked: any[] = [];

  for (const achievement of achievements) {
    if (existingIds.has(achievement.id)) continue;
    if (!evaluateAchievementRule(achievement, metrics)) continue;
    const row = await prisma.userAchievement.create({
      data: {
        userId,
        achievementId: achievement.id,
        meta: {
          source: 'insights-engine',
          unlockedAt: new Date().toISOString()
        }
      }
    });
    unlocked.push({
      id: row.id,
      key: achievement.key,
      title: achievement.title,
      tier: achievement.tier,
      earnedAt: row.earnedAt
    });
    emitInsightsEvent(app, 'insights:achievement_unlocked', {
      userId,
      achievementKey: achievement.key,
      title: achievement.title,
      tier: achievement.tier,
      earnedAt: row.earnedAt
    });
  }

  return unlocked;
};

export const getProfessionalScoreForUser = async (userId: string, app?: Application) => {
  const existing = await prisma.professionalScore.findUnique({ where: { userId } });
  if (existing) return existing;
  return recomputeProfessionalScore(userId, app);
};

export const recomputeProfessionalScore = async (userId: string, app?: Application) => {
  const config = await getInsightsConfig();
  const metrics = await loadMetricsSnapshot(userId);
  const { breakdown, normalizedScore, riskFlags } = computeBreakdown(metrics, config);

  const score = await prisma.professionalScore.upsert({
    where: { userId },
    create: {
      userId,
      score: normalizedScore,
      breakdown,
      riskFlags
    },
    update: {
      score: normalizedScore,
      breakdown,
      riskFlags
    }
  });

  await prisma.insightEvent.create({
    data: {
      userId,
      type: 'PGS_RECOMPUTED',
      payload: {
        score: normalizedScore,
        breakdown,
        riskFlags
      }
    }
  });

  const unlocked = await unlockAchievementsIfNeeded(userId, metrics, app);

  emitInsightsEvent(app, 'insights:pgs_updated', {
    userId,
    score: normalizedScore,
    breakdown,
    riskFlags,
    unlockedCount: unlocked.length
  });

  return score;
};

const bumpUserStreak = async (userId: string, app?: Application) => {
  const today = todayUtc();
  const current = await prisma.userStreak.findUnique({ where: { userId } });
  if (!current) {
    const created = await prisma.userStreak.create({
      data: {
        userId,
        currentStreakDays: 1,
        bestStreakDays: 1,
        lastActiveDate: today
      }
    });
    emitInsightsEvent(app, 'insights:streak_updated', {
      userId,
      currentStreakDays: created.currentStreakDays,
      bestStreakDays: created.bestStreakDays
    });
    return created;
  }

  if (isSameUtcDay(current.lastActiveDate, today)) {
    return current;
  }

  const nextStreak = isYesterdayUtc(current.lastActiveDate, today) ? current.currentStreakDays + 1 : 1;
  const best = Math.max(current.bestStreakDays, nextStreak);

  const updated = await prisma.userStreak.update({
    where: { userId },
    data: {
      currentStreakDays: nextStreak,
      bestStreakDays: best,
      lastActiveDate: today
    }
  });

  emitInsightsEvent(app, 'insights:streak_updated', {
    userId,
    currentStreakDays: updated.currentStreakDays,
    bestStreakDays: updated.bestStreakDays
  });
  return updated;
};

export const recordInsightEvent = async (input: {
  userId?: string | null;
  type: string;
  payload?: any;
  countForStreak?: boolean;
  recomputeScore?: boolean;
  app?: Application;
}) => {
  const userId = String(input.userId || '').trim();
  if (!userId) return null;

  const event = await prisma.insightEvent.create({
    data: {
      userId,
      type: String(input.type || 'GENERIC_EVENT').trim().toUpperCase(),
      payload: input.payload ?? null
    }
  });

  if (input.countForStreak !== false) {
    await bumpUserStreak(userId, input.app);
  }

  if (input.recomputeScore !== false) {
    await recomputeProfessionalScore(userId, input.app);
  }

  return event;
};

export const getUserAchievements = async (userId: string) => {
  await ensureDefaultAchievements();
  const [catalog, earned] = await Promise.all([
    prisma.achievement.findMany({ where: { isActive: true }, orderBy: [{ tier: 'asc' }, { createdAt: 'asc' }] }),
    prisma.userAchievement.findMany({
      where: { userId },
      include: {
        achievement: true
      },
      orderBy: { earnedAt: 'desc' }
    })
  ]);
  const earnedByKey = new Map<string, Date>();
  earned.forEach((row) => {
    earnedByKey.set(row.achievement.key, row.earnedAt);
  });

  return catalog.map((item) => ({
    id: item.id,
    key: item.key,
    title: item.title,
    description: item.description,
    tier: item.tier,
    earned: earnedByKey.has(item.key),
    earnedAt: earnedByKey.get(item.key) || null,
    rules: item.rules || {}
  }));
};

export const getUserStreak = async (userId: string) => {
  const row = await prisma.userStreak.upsert({
    where: { userId },
    create: {
      userId,
      currentStreakDays: 0,
      bestStreakDays: 0
    },
    update: {}
  });
  return row;
};

const parseInsightsScope = (scope: unknown) => {
  const value = String(scope || '').trim().toLowerCase();
  if (value === 'freelancer') return 'freelancer';
  if (value === 'employer') return 'employer';
  return 'global';
};

export const buildWeeklyLeaderboard = async (scopeInput: unknown, app?: Application) => {
  const config = await getInsightsConfig();
  const scope = parseInsightsScope(scopeInput);
  const weekKey = isoWeekKey();

  const raw = await prisma.professionalScore.findMany({
    orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
    take: Math.max(config.leaderboard.topN * 4, 120),
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
          avatar: true
        }
      }
    }
  });

  const filtered = raw.filter((row) => {
    const role = String(row.user?.role || '').toUpperCase();
    if (scope === 'freelancer') return role === 'FREELANCER';
    if (scope === 'employer') return role === 'EMPLOYER' || role === 'CLIENT';
    return true;
  });

  const entries = filtered.slice(0, config.leaderboard.topN).map((row, index) => ({
    rank: index + 1,
    userId: row.userId,
    score: row.score,
    user: {
      id: row.user?.id,
      name: row.user?.name,
      username: row.user?.username,
      role: row.user?.role,
      avatar: row.user?.avatar
    }
  }));

  const leaderboard = await prisma.weeklyLeaderboard.upsert({
    where: {
      weekKey_scope: {
        weekKey,
        scope
      }
    },
    create: {
      weekKey,
      scope,
      entries,
      builtAt: new Date()
    },
    update: {
      entries,
      builtAt: new Date()
    }
  });

  emitInsightsEvent(app, 'insights:leaderboard_updated', {
    scope,
    weekKey,
    total: entries.length
  });
  return leaderboard;
};

export const getLeaderboard = async (scopeInput: unknown, weekKeyInput?: unknown, app?: Application) => {
  const scope = parseInsightsScope(scopeInput);
  const weekKey = String(weekKeyInput || isoWeekKey());
  let row = await prisma.weeklyLeaderboard.findUnique({
    where: {
      weekKey_scope: {
        weekKey,
        scope
      }
    }
  });
  if (!row) row = await buildWeeklyLeaderboard(scope, app);
  return row;
};

export const recomputeAllProfessionalScores = async (input?: {
  limit?: number;
  app?: Application;
}) => {
  const limit = Math.max(1, Math.min(5000, Math.floor(Number(input?.limit || 250))));
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true },
    take: limit,
    orderBy: { updatedAt: 'desc' }
  });
  let success = 0;
  let failed = 0;
  for (const user of users) {
    try {
      await recomputeProfessionalScore(user.id, input?.app);
      success += 1;
    } catch (error) {
      failed += 1;
      console.warn('[insights] recompute user failed', user.id, error);
    }
  }
  return {
    queued: true,
    limit,
    total: users.length,
    success,
    failed
  };
};

const roleScopeForMatches = (role: string): Array<'job' | 'gig'> => {
  const normalized = String(role || '').toUpperCase();
  if (normalized === 'FREELANCER') return ['job'];
  if (normalized === 'EMPLOYER' || normalized === 'CLIENT') return ['gig'];
  return ['job', 'gig'];
};

const scoreJobMatch = (skills: string[], job: any, trustScore: number) => {
  const haystack = tokenize(`${job.title || ''} ${job.description || ''} ${(job.tags || []).join(' ')}`);
  const similarity = jaccard(skills, haystack);
  const categoryBonus = textIncludesAny(String(job.subcategory || ''), skills) ? 0.12 : 0;
  const proposalSignal = clamp(Number(job.proposalsCount || 0) / 40, 0, 0.25);
  const score = clamp((similarity * 0.62 + categoryBonus + proposalSignal + trustScore / 1000 * 0.26) * 100, 0, 100);
  const reasons = [
    similarity > 0.25 ? 'Strong skill overlap with job requirements.' : 'Moderate skill overlap.',
    categoryBonus > 0 ? 'Category/subcategory alignment detected.' : 'Category alignment is limited.',
    `Professional trust score boost applied (${Math.round((trustScore / 1000) * 100)}%).`
  ];
  return { score: Number(score.toFixed(2)), reasons };
};

const scoreGigMatch = (skills: string[], gig: any, trustScore: number) => {
  const haystack = tokenize(`${gig.title || ''} ${gig.description || ''} ${(gig.tags || []).join(' ')}`);
  const similarity = jaccard(skills, haystack);
  const ratingSignal = clamp(Number(gig.rating || 0) / 5, 0, 0.2);
  const categoryBonus = textIncludesAny(String(gig.subcategory || ''), skills) ? 0.1 : 0;
  const score = clamp((similarity * 0.64 + categoryBonus + ratingSignal + trustScore / 1000 * 0.22) * 100, 0, 100);
  const reasons = [
    similarity > 0.25 ? 'Gig content matches current skill profile.' : 'Partial skill alignment with gig content.',
    ratingSignal > 0.12 ? 'High quality historical rating signal.' : 'Limited rating signal weight.',
    `Professional trust score boost applied (${Math.round((trustScore / 1000) * 100)}%).`
  ];
  return { score: Number(score.toFixed(2)), reasons };
};

export const refreshOpportunityMatchesForUser = async (input: {
  userId: string;
  type?: unknown;
  app?: Application;
  emitEvent?: boolean;
}) => {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    include: { profile: true }
  });
  if (!user) throw new Error('User not found');

  const config = await getInsightsConfig();
  if (!config.matching.enabled) return { total: 0, items: [] };

  const score = await getProfessionalScoreForUser(user.id);
  const trustScore = Number(score?.score || 0);
  const profileSkills = [
    ...tokenize((user.profile?.skills || []).join(' ')),
    ...tokenize(`${user.profile?.title || ''} ${user.profile?.bio || ''}`)
  ];
  const uniqueSkills = Array.from(new Set(profileSkills));

  const requestedType = String(input.type || '').trim().toLowerCase();
  const types = requestedType === 'job' || requestedType === 'gig' ? [requestedType] : roleScopeForMatches(String(user.role));

  const allMatches: Array<{
    userId: string;
    targetType: string;
    targetId: string;
    score: number;
    reasons: string[];
  }> = [];

  for (const type of types) {
    if (type === 'job') {
      const jobs = await prisma.job.findMany({
        where: { isActive: true, isVisible: true, status: 'ACTIVE', clientId: { not: user.id } },
        select: {
          id: true,
          title: true,
          description: true,
          tags: true,
          subcategory: true,
          proposalsCount: true
        },
        orderBy: { updatedAt: 'desc' },
        take: config.matching.maxCandidatesPerRun
      });

      jobs.forEach((job) => {
        const scored = scoreJobMatch(uniqueSkills, job, trustScore);
        allMatches.push({
          userId: user.id,
          targetType: 'job',
          targetId: job.id,
          score: scored.score,
          reasons: scored.reasons
        });
      });
    } else {
      const gigs = await prisma.gig.findMany({
        where: { isActive: true, status: 'ACTIVE', userId: { not: user.id } },
        select: {
          id: true,
          title: true,
          description: true,
          tags: true,
          rating: true,
          subcategory: true
        },
        orderBy: { updatedAt: 'desc' },
        take: config.matching.maxCandidatesPerRun
      });

      gigs.forEach((gig) => {
        const scored = scoreGigMatch(uniqueSkills, gig, trustScore);
        allMatches.push({
          userId: user.id,
          targetType: 'gig',
          targetId: gig.id,
          score: scored.score,
          reasons: scored.reasons
        });
      });
    }
  }

  const sorted = allMatches
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(20, config.matching.maxCandidatesPerRun));

  await prisma.$transaction(async (tx) => {
    if (types.length === 1) {
      await tx.opportunityMatch.deleteMany({
        where: {
          userId: user.id,
          targetType: types[0]
        }
      });
    } else {
      await tx.opportunityMatch.deleteMany({ where: { userId: user.id } });
    }

    if (sorted.length) {
      await tx.opportunityMatch.createMany({
        data: sorted.map((item) => ({
          userId: item.userId,
          targetType: item.targetType,
          targetId: item.targetId,
          score: item.score,
          reasons: item.reasons
        })),
        skipDuplicates: true
      });
    }
  });

  if (input.emitEvent !== false) {
    emitInsightsEvent(input.app, 'insights:opportunity_match_ready', {
      userId: user.id,
      total: sorted.length,
      types
    });
  }

  return { total: sorted.length, items: sorted };
};

const hydrateOpportunityMatches = async (rows: any[]) => {
  const jobIds = rows.filter((item) => item.targetType === 'job').map((item) => item.targetId);
  const gigIds = rows.filter((item) => item.targetType === 'gig').map((item) => item.targetId);

  const [jobs, gigs] = await Promise.all([
    jobIds.length
      ? prisma.job.findMany({
          where: { id: { in: jobIds } },
          select: { id: true, title: true, budget: true, type: true, clientId: true, client: { select: { name: true } } }
        })
      : Promise.resolve([]),
    gigIds.length
      ? prisma.gig.findMany({
          where: { id: { in: gigIds } },
          select: { id: true, title: true, price: true, deliveryTime: true, userId: true, user: { select: { name: true } } }
        })
      : Promise.resolve([])
  ]);

  const jobMap = new Map(jobs.map((job) => [job.id, job]));
  const gigMap = new Map(gigs.map((gig) => [gig.id, gig]));

  return rows.map((row) => {
    const target = row.targetType === 'job' ? jobMap.get(row.targetId) : gigMap.get(row.targetId);
    return {
      id: row.id,
      targetType: row.targetType,
      targetId: row.targetId,
      score: row.score,
      reasons: Array.isArray(row.reasons) ? row.reasons : [],
      target
    };
  });
};

export const getOpportunityMatches = async (input: {
  userId: string;
  type?: unknown;
  app?: Application;
}) => {
  const type = String(input.type || '').trim().toLowerCase();
  const filterType = type === 'job' || type === 'gig' ? type : undefined;
  let rows = await prisma.opportunityMatch.findMany({
    where: {
      userId: input.userId,
      ...(filterType ? { targetType: filterType } : {})
    },
    orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    take: 50
  });
  if (!rows.length) {
    await refreshOpportunityMatchesForUser({ userId: input.userId, type: filterType, app: input.app, emitEvent: false });
    rows = await prisma.opportunityMatch.findMany({
      where: {
        userId: input.userId,
        ...(filterType ? { targetType: filterType } : {})
      },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: 50
    });
  }
  return hydrateOpportunityMatches(rows);
};

export const getRevenueInsights = async (userId: string) => {
  const [freelancerAgg, clientAgg, wallet, pendingTimeEntries, completedTimeEntries] = await Promise.all([
    prisma.order.aggregate({
      where: { freelancerId: userId, status: 'COMPLETED' },
      _sum: { amount: true },
      _count: { _all: true }
    }),
    prisma.order.aggregate({
      where: { clientId: userId, status: { in: ['PAID', 'IN_PROGRESS', 'COMPLETED'] } },
      _sum: { amount: true },
      _count: { _all: true }
    }),
    prisma.wallet.findUnique({ where: { userId }, select: { balance: true } }),
    prisma.timeEntry.aggregate({
      where: { freelancerId: userId, status: 'PENDING' },
      _sum: { earnings: true, durationMinutes: true }
    }),
    prisma.timeEntry.aggregate({
      where: { freelancerId: userId, status: 'APPROVED' },
      _sum: { earnings: true, durationMinutes: true }
    })
  ]);

  const totalEarned = Number(freelancerAgg._sum.amount || 0) + Number(completedTimeEntries._sum.earnings || 0);
  const totalSpent = Number(clientAgg._sum.amount || 0);
  const pendingDue = Number(pendingTimeEntries._sum.earnings || 0);
  const trackedMinutes = Number(completedTimeEntries._sum.durationMinutes || 0);

  return {
    totalEarned: Number(totalEarned.toFixed(2)),
    totalSpent: Number(totalSpent.toFixed(2)),
    pendingDue: Number(pendingDue.toFixed(2)),
    walletBalance: Number(Number(wallet?.balance || 0).toFixed(2)),
    completedOrders: Number(freelancerAgg._count._all || 0),
    clientOrders: Number(clientAgg._count._all || 0),
    trackedHours: Number((trackedMinutes / 60).toFixed(2))
  };
};

const parseAiList = (text: string) =>
  String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*\d.]+\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 10);

const shouldGeneratePrediction = (post: { id: string; aiInsightEnabled?: boolean }, sampleRatePercent: number) => {
  if (post.aiInsightEnabled) return true;
  if (sampleRatePercent <= 0) return false;
  return deterministicPercent(post.id) < sampleRatePercent;
};

export const generatePostPrediction = async (input: {
  postId: string;
  actor?: ScrolithaActor;
  app?: Application;
  force?: boolean;
}) => {
  const post = await prisma.communityPost.findUnique({
    where: { id: input.postId },
    select: {
      id: true,
      authorId: true,
      content: true,
      title: true,
      tags: true,
      likesCount: true,
      sharesCount: true,
      repostsCount: true,
      aiInsightEnabled: true
    }
  });
  if (!post) throw new Error('Post not found');
  const config = await getInsightsConfig();
  if (!config.postPrediction.enabled) return null;

  const existing = await prisma.postPrediction.findUnique({ where: { postId: post.id } });
  if (existing && !input.force) return existing;
  if (!input.force && !shouldGeneratePrediction(post, config.postPrediction.sampleRatePercent)) return null;

  const commentCount = await prisma.communityPostComment.count({
    where: { postId: post.id, status: 'active' }
  });

  const actor: ScrolithaActor =
    input.actor ||
    ({
      id: post.authorId,
      role: 'user',
      scope: 'user',
      isAdmin: false
    } as ScrolithaActor);

  const safety = await ScrolithaService.classifySafety(`${post.title || ''} ${post.content || ''}`);
  const [hashtagsRaw, commentsRaw] = await Promise.all([
    ScrolithaService.generate({
      scope: 'user',
      actor,
      prompt: `Generate 8 hashtags for this post:\n${post.content}`,
      system: 'Return hashtag suggestions only, one per line.'
    }),
    ScrolithaService.generate({
      scope: 'user',
      actor,
      prompt: `Generate 5 constructive comments for this post:\n${post.content}`,
      system: 'Return comment suggestions only, one per line.'
    })
  ]);

  const hashtags = parseAiList(hashtagsRaw.text).map((entry) => (entry.startsWith('#') ? entry : `#${entry}`));
  const commentSuggestions = parseAiList(commentsRaw.text);

  const baseEngagement =
    28 + post.likesCount * 1.5 + post.sharesCount * 2 + post.repostsCount * 2 + commentCount * 2.2 + hashtags.length * 0.8;
  const engagementScore = clamp(Number((baseEngagement - safety.score * 0.22).toFixed(2)), 0, 100);

  const prediction = await prisma.postPrediction.upsert({
    where: { postId: post.id },
    create: {
      postId: post.id,
      authorId: post.authorId,
      engagementScore,
      toxicityScore: safety.score,
      hashtagSuggestions: hashtags,
      commentSuggestions,
      notes: {
        generatedBy: 'scrolitha',
        provider: hashtagsRaw.provider,
        model: hashtagsRaw.model
      }
    },
    update: {
      engagementScore,
      toxicityScore: safety.score,
      hashtagSuggestions: hashtags,
      commentSuggestions,
      notes: {
        generatedBy: 'scrolitha',
        provider: hashtagsRaw.provider,
        model: hashtagsRaw.model
      }
    }
  });

  emitInsightsEvent(input.app, 'insights:post_prediction_ready', {
    userId: post.authorId,
    postId: post.id,
    engagementScore: prediction.engagementScore,
    toxicityScore: prediction.toxicityScore
  });

  if (prediction.toxicityScore >= config.postPrediction.toxicitySoftThreshold) {
    emitInsightsEvent(input.app, 'insights:toxicity_flagged', {
      userId: post.authorId,
      postId: post.id,
      toxicityScore: prediction.toxicityScore,
      softThreshold: config.postPrediction.toxicitySoftThreshold,
      hardThreshold: config.postPrediction.toxicityHardThreshold,
      hardActionsEnabled: config.postPrediction.hardActionsEnabled
    });
  }

  return prediction;
};

export const getPostPrediction = async (input: {
  postId: string;
  actor?: ScrolithaActor;
  app?: Application;
}) => {
  const row = await prisma.postPrediction.findUnique({ where: { postId: input.postId } });
  if (row) return row;
  return generatePostPrediction({ postId: input.postId, actor: input.actor, app: input.app, force: true });
};

const buildTopDemandSkills = async () => {
  const [jobs, gigs] = await Promise.all([
    prisma.job.findMany({
      where: { isActive: true, isVisible: true, status: 'ACTIVE' },
      select: { title: true, description: true, tags: true },
      take: 250,
      orderBy: { updatedAt: 'desc' }
    }),
    prisma.gig.findMany({
      where: { isActive: true, status: 'ACTIVE' },
      select: { title: true, description: true, tags: true },
      take: 250,
      orderBy: { updatedAt: 'desc' }
    })
  ]);

  const frequency = new Map<string, number>();
  const addToken = (token: string, weight = 1) => {
    const key = token.trim().toLowerCase();
    if (!key || key.length < 3) return;
    frequency.set(key, (frequency.get(key) || 0) + weight);
  };

  [...jobs, ...gigs].forEach((item) => {
    tokenize(`${item.title || ''} ${item.description || ''}`).forEach((token) => addToken(token, 1));
    (item.tags || []).forEach((tag) => addToken(String(tag || ''), 2));
  });

  return Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([skill, demandScore]) => ({ skill, demandScore }));
};

export const generateSkillGapReport = async (input: {
  userId: string;
  actor?: ScrolithaActor;
  app?: Application;
}) => {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    include: { profile: true }
  });
  if (!user) throw new Error('User not found');

  const topDemandSkills = await buildTopDemandSkills();
  const userSkills = Array.from(new Set((user.profile?.skills || []).map((skill: string) => String(skill || '').toLowerCase())));
  const gaps = topDemandSkills.filter((entry) => !userSkills.includes(entry.skill)).slice(0, 8);

  const report = {
    generatedAt: new Date().toISOString(),
    userId: user.id,
    currentSkills: userSkills,
    topDemandSkills,
    gaps,
    recommendations: gaps.slice(0, 5).map((entry, index) => ({
      priority: index + 1,
      skill: entry.skill,
      reason: `Demand score ${entry.demandScore} in active marketplace listings.`,
      nextStep: `Create one portfolio sample and publish one community post around ${entry.skill}.`
    }))
  };

  const row = await prisma.skillGapReport.create({
    data: {
      userId: user.id,
      report,
      generatedBy: input.actor?.id || 'scrolitha'
    }
  });

  emitInsightsEvent(input.app, 'insights:copilot_tip', {
    userId: user.id,
    tipType: 'skill-gap',
    reportId: row.id
  });

  return row;
};

export const getLatestSkillGapReport = async (userId: string) => {
  return prisma.skillGapReport.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });
};

export const setUserFeedMode = async (userId: string, modeInput: unknown) => {
  const modeRaw = String(modeInput || '').trim().toLowerCase() as FeedMode;
  const config = await getInsightsConfig();
  const mode = (config.feedModes.allowedModes.includes(modeRaw) ? modeRaw : config.feedModes.defaultMode) as FeedMode;
  return prisma.feedModePreference.upsert({
    where: { userId },
    create: { userId, mode },
    update: { mode }
  });
};

export const getUserFeedMode = async (userId: string): Promise<FeedMode> => {
  const config = await getInsightsConfig();
  const pref = await prisma.feedModePreference.findUnique({ where: { userId } });
  return (pref?.mode as FeedMode) || config.feedModes.defaultMode || DEFAULT_INSIGHTS_CONFIG.feedModes.defaultMode;
};
