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
  },
  {
    key: 'CHALLENGE_CREATOR',
    title: 'Challenge Creator',
    description: 'Submit your first weekly creator challenge entry.',
    tier: 'bronze',
    rules: { creatorChallengeEntries: 1 }
  },
  {
    key: 'CROWD_FAVORITE',
    title: 'Crowd Favorite',
    description: 'Earn strong audience support on a creator challenge entry.',
    tier: 'silver',
    rules: { creatorChallengeVotes: 5 }
  },
  {
    key: 'WEEKLY_SPOTLIGHT_WINNER',
    title: 'Weekly Spotlight Winner',
    description: 'Win a weekly creator challenge.',
    tier: 'gold',
    rules: { creatorChallengeWins: 1 }
  }
];

const DEFAULT_QUEST_CATALOG = [
  {
    key: 'PROFILE_POLISH_80',
    title: 'Profile Polish',
    description: 'Reach at least 80% profile completeness.',
    roleScope: ['all'],
    difficulty: 'starter',
    verificationRules: {
      all: [{ field: 'profileCompleteness', op: 'gte', value: 80 }],
      target: 1
    },
    reward: { type: 'badge', key: 'PROFILE_POLISH_80', points: 10 },
    isWeekly: false,
    rotationWeight: 90
  },
  {
    key: 'WEEKLY_CONSISTENCY_3', // gitleaks:allow — stable quest identifier, not credential material
    title: 'Consistency Sprint',
    description: 'Keep a 3-day streak this week.',
    roleScope: ['all'],
    difficulty: 'standard',
    verificationRules: {
      all: [{ field: 'currentStreakDays', op: 'gte', value: 3 }],
      target: 1
    },
    reward: { type: 'streak_bonus', points: 15 },
    isWeekly: true,
    rotationWeight: 120
  },
  {
    key: 'WEEKLY_COMMUNITY_HELPER',
    title: 'Community Helper',
    description: 'Publish at least 1 post and 3 comments.',
    roleScope: ['all'],
    difficulty: 'standard',
    verificationRules: {
      all: [
        { field: 'postsCount', op: 'gte', value: 1 },
        { field: 'commentsCount', op: 'gte', value: 3 }
      ],
      target: 1
    },
    reward: { type: 'community_boost', points: 20 },
    isWeekly: true,
    rotationWeight: 110
  },
  {
    key: 'FREELANCER_WEEKLY_PITCH',
    title: 'Pitch Power Week',
    description: 'Submit at least 2 proposals this week.',
    roleScope: ['freelancer'],
    difficulty: 'standard',
    verificationRules: {
      all: [{ field: 'totalProposals', op: 'gte', value: 2 }],
      target: 1
    },
    reward: { type: 'marketplace_boost', points: 25 },
    isWeekly: true,
    rotationWeight: 115
  },
  {
    key: 'FREELANCER_FIRST_WIN',
    title: 'First Win',
    description: 'Complete your first paid order.',
    roleScope: ['freelancer'],
    difficulty: 'milestone',
    verificationRules: {
      all: [{ field: 'completedOrders', op: 'gte', value: 1 }],
      target: 1
    },
    reward: { type: 'milestone_badge', key: 'FREELANCER_FIRST_WIN', points: 30 },
    isWeekly: false,
    rotationWeight: 100
  },
  {
    key: 'TRUST_CLEAN_WEEK',
    title: 'Trust Keeper',
    description: 'Keep your account clean with zero active violations.',
    roleScope: ['all'],
    difficulty: 'standard',
    verificationRules: {
      all: [{ field: 'violationsLast30d', op: 'lte', value: 0 }],
      target: 1
    },
    reward: { type: 'trust_signal', points: 12 },
    isWeekly: true,
    rotationWeight: 95
  }
] as const;

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

export const ensureDefaultQuestCatalog = async () => {
  await Promise.all(
    DEFAULT_QUEST_CATALOG.map((item) =>
      prisma.questCatalog.upsert({
        where: { key: item.key },
        create: {
          key: item.key,
          title: item.title,
          description: item.description,
          roleScope: [...item.roleScope],
          difficulty: item.difficulty,
          verificationRules: item.verificationRules,
          reward: item.reward,
          isWeekly: item.isWeekly,
          rotationWeight: item.rotationWeight,
          isActive: true
        },
        update: {
          title: item.title,
          description: item.description,
          roleScope: [...item.roleScope],
          difficulty: item.difficulty,
          verificationRules: item.verificationRules,
          reward: item.reward,
          isWeekly: item.isWeekly,
          rotationWeight: item.rotationWeight
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

export const grantAchievementByKeyIfMissing = async (input: {
  userId?: string | null;
  achievementKey?: string | null;
  meta?: any;
  app?: Application;
}) => {
  const userId = String(input.userId || '').trim();
  const achievementKey = String(input.achievementKey || '').trim().toUpperCase();
  if (!userId || !achievementKey) return null;

  await ensureDefaultAchievements();

  const achievement = await prisma.achievement.findUnique({
    where: { key: achievementKey }
  });
  if (!achievement || achievement.isActive === false) return null;

  const existing = await prisma.userAchievement.findFirst({
    where: {
      userId,
      achievementId: achievement.id
    }
  });
  if (existing) {
    return {
      created: false,
      data: {
        id: existing.id,
        key: achievement.key,
        title: achievement.title,
        tier: achievement.tier,
        earnedAt: existing.earnedAt
      }
    };
  }

  const row = await prisma.userAchievement.create({
    data: {
      userId,
      achievementId: achievement.id,
      meta: {
        source: 'manual-grant',
        unlockedAt: new Date().toISOString(),
        ...(input.meta && typeof input.meta === 'object' ? input.meta : {})
      }
    }
  });

  const data = {
    id: row.id,
    key: achievement.key,
    title: achievement.title,
    tier: achievement.tier,
    earnedAt: row.earnedAt
  };

  emitInsightsEvent(input.app, 'insights:achievement_unlocked', {
    userId,
    achievementKey: achievement.key,
    title: achievement.title,
    tier: achievement.tier,
    earnedAt: row.earnedAt
  });

  return {
    created: true,
    data
  };
};

const normalizeRoleToken = (value: unknown) => String(value || '').trim().toLowerCase();

const parseRoleScopeInput = (input: unknown): string[] => {
  if (Array.isArray(input)) {
    return Array.from(new Set(input.map((entry) => normalizeRoleToken(entry)).filter(Boolean)));
  }
  if (typeof input === 'string') {
    return Array.from(
      new Set(
        input
          .split(',')
          .map((entry) => normalizeRoleToken(entry))
          .filter(Boolean)
      )
    );
  }
  return [];
};

const roleAliasesForScope = (roleInput: unknown) => {
  const role = normalizeRoleToken(roleInput);
  const aliases = new Set<string>([role, 'all', '*']);
  if (role === 'client' || role === 'employer') {
    aliases.add('client');
    aliases.add('employer');
  }
  if (!role || role === 'user') aliases.add('user');
  return Array.from(aliases).filter(Boolean);
};

const roleMatchesScope = (scopeInput: unknown, roleInput: unknown) => {
  const scope = parseRoleScopeInput(scopeInput);
  if (!scope.length) return true;
  const aliases = roleAliasesForScope(roleInput);
  return scope.some((entry) => aliases.includes(entry));
};

const parseQuestTarget = (rulesInput: unknown) => {
  if (!isObject(rulesInput)) return 1;
  const target = Number((rulesInput as any).target);
  if (Number.isFinite(target) && target > 0) return Math.max(1, Math.floor(target));
  return 1;
};

const computeCurrentWeekBoundsUtc = () => {
  const now = todayUtc();
  const day = now.getUTCDay();
  const mondayDelta = day === 0 ? -6 : 1 - day;
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() + mondayDelta);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end, weekKey: isoWeekKey(now) };
};

const isQuestAlreadyAssignedForWindow = (userQuest: any, weekKey: string) => {
  const assignedWeek = String(userQuest?.meta?.weekKey || '').trim();
  if (!assignedWeek) return false;
  return assignedWeek === weekKey;
};

const formatUserQuest = (row: any) => ({
  id: row.id,
  userId: row.userId,
  questId: row.questId,
  status: row.status,
  progress: Number(row.progress || 0),
  target: Number(row.target || 1),
  assignedAt: row.assignedAt,
  startedAt: row.startedAt,
  completedAt: row.completedAt,
  expiresAt: row.expiresAt,
  rewardGranted: Boolean(row.rewardGranted),
  meta: row.meta || {},
  quest: row.quest
    ? {
        id: row.quest.id,
        key: row.quest.key,
        title: row.quest.title,
        description: row.quest.description,
        roleScope: row.quest.roleScope || [],
        difficulty: row.quest.difficulty,
        verificationRules: row.quest.verificationRules || {},
        reward: row.quest.reward || {},
        isWeekly: Boolean(row.quest.isWeekly),
        rotationWeight: Number(row.quest.rotationWeight || 100),
        isActive: Boolean(row.quest.isActive)
      }
    : null
});

const assignQuestsForUserIfNeeded = async (userId: string, app?: Application) => {
  await ensureDefaultQuestCatalog();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true }
  });
  if (!user || !user.isActive) return { assigned: 0, reused: 0 };

  const roleAliases = roleAliasesForScope(user.role);
  const activeCatalog = await prisma.questCatalog.findMany({
    where: {
      isActive: true,
      OR: [{ roleScope: { isEmpty: true } }, { roleScope: { hasSome: roleAliases } }]
    },
    orderBy: [{ isWeekly: 'desc' }, { rotationWeight: 'desc' }, { createdAt: 'asc' }]
  });

  if (!activeCatalog.length) return { assigned: 0, reused: 0 };

  const weeklyCatalog = activeCatalog.filter((item) => item.isWeekly);
  const alwaysCatalog = activeCatalog.filter((item) => !item.isWeekly);
  const weeklyLimit = 3;
  const weeklySorted = [...weeklyCatalog].sort((a, b) => {
    const aSeed = deterministicPercent(`${userId}:${isoWeekKey()}:${a.key}`) + Number(a.rotationWeight || 0);
    const bSeed = deterministicPercent(`${userId}:${isoWeekKey()}:${b.key}`) + Number(b.rotationWeight || 0);
    return bSeed - aSeed;
  });
  const selectedWeekly = weeklySorted.slice(0, weeklyLimit);
  const selected = [...alwaysCatalog, ...selectedWeekly];
  const selectedQuestIds = selected.map((item) => item.id);
  const existing = await prisma.userQuest.findMany({
    where: {
      userId,
      questId: { in: selectedQuestIds }
    },
    orderBy: [{ updatedAt: 'desc' }]
  });
  const existingByQuest = new Map<string, any>();
  existing.forEach((row) => {
    if (!existingByQuest.has(row.questId)) existingByQuest.set(row.questId, row);
  });

  const { end: weekEnd, weekKey } = computeCurrentWeekBoundsUtc();
  let assigned = 0;
  let reused = 0;

  for (const quest of selected) {
    if (!roleMatchesScope(quest.roleScope, user.role)) continue;
    const current = existingByQuest.get(quest.id);
    if (current) {
      if (!quest.isWeekly) {
        reused += 1;
        continue;
      }
      const completedThisWeek =
        current.status === 'completed' &&
        Boolean(current.completedAt) &&
        isQuestAlreadyAssignedForWindow(current, weekKey);
      const activeWeekly =
        ['assigned', 'in_progress'].includes(String(current.status || '').toLowerCase()) &&
        Boolean(current.expiresAt && new Date(current.expiresAt).getTime() >= Date.now()) &&
        isQuestAlreadyAssignedForWindow(current, weekKey);
      if (completedThisWeek || activeWeekly) {
        reused += 1;
        continue;
      }
    }

    const target = parseQuestTarget(quest.verificationRules);
    await prisma.userQuest.create({
      data: {
        userId,
        questId: quest.id,
        status: 'assigned',
        progress: 0,
        target,
        assignedAt: new Date(),
        expiresAt: quest.isWeekly ? weekEnd : null,
        meta: {
          source: 'insights-quest-engine',
          assignedAt: new Date().toISOString(),
          weekKey: quest.isWeekly ? weekKey : null
        }
      }
    });
    assigned += 1;
  }

  if (assigned > 0) {
    emitInsightsEvent(app, 'insights:quests_assigned', {
      userId,
      totalAssigned: assigned,
      weekKey
    });
  }

  return { assigned, reused };
};

export const getUserQuests = async (input: {
  userId: string;
  app?: Application;
}) => {
  const userId = String(input.userId || '').trim();
  if (!userId) return [];

  await assignQuestsForUserIfNeeded(userId, input.app);
  const rows = await prisma.userQuest.findMany({
    where: { userId },
    include: {
      quest: true
    },
    orderBy: [{ status: 'asc' }, { assignedAt: 'desc' }],
    take: 40
  });

  return rows.map(formatUserQuest);
};

const evaluateQuestVerification = (verificationRules: unknown, metrics: UserMetricsSnapshot) => {
  if (!isObject(verificationRules)) return true;
  const ruleObject = { ...(verificationRules as Record<string, any>) };
  if ('target' in ruleObject) {
    delete (ruleObject as any).target;
  }
  if (!Object.keys(ruleObject).length) return true;
  return evaluateRuleTree(ruleObject, metrics);
};

export const completeUserQuest = async (input: {
  userId: string;
  userQuestId: string;
  app?: Application;
}) => {
  const userId = String(input.userId || '').trim();
  const userQuestId = String(input.userQuestId || '').trim();
  if (!userId || !userQuestId) throw new Error('userId and userQuestId are required');

  const row = await prisma.userQuest.findFirst({
    where: { id: userQuestId, userId },
    include: { quest: true }
  });
  if (!row) throw new Error('Quest assignment not found');
  if (!row.quest || !row.quest.isActive) throw new Error('Quest is inactive');

  if (row.status === 'completed') return formatUserQuest(row);

  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    await prisma.userQuest.update({
      where: { id: row.id },
      data: { status: 'expired' }
    });
    throw new Error('Quest assignment has expired');
  }

  const metrics = await loadMetricsSnapshot(userId);
  const verified = evaluateQuestVerification(row.quest.verificationRules, metrics);
  if (!verified) {
    const pending = await prisma.userQuest.update({
      where: { id: row.id },
      data: {
        status: 'in_progress',
        startedAt: row.startedAt || new Date(),
        lastEventAt: new Date(),
        progress: Math.max(0, Number(row.progress || 0))
      },
      include: { quest: true }
    });
    emitInsightsEvent(input.app, 'insights:quests_progress', {
      userId,
      userQuestId: pending.id,
      questId: pending.questId,
      progress: pending.progress,
      target: pending.target
    });
    return formatUserQuest(pending);
  }

  const reward = row.quest.reward || null;
  const completed = await prisma.$transaction(async (tx) => {
    const updated = await tx.userQuest.update({
      where: { id: row.id },
      data: {
        status: 'completed',
        progress: Math.max(1, Number(row.target || 1)),
        startedAt: row.startedAt || new Date(),
        lastEventAt: new Date(),
        completedAt: new Date(),
        rewardGranted: reward ? true : row.rewardGranted
      },
      include: { quest: true }
    });

    await tx.questCompletionLog.create({
      data: {
        userId,
        questId: updated.questId,
        userQuestId: updated.id,
        verification: {
          verifiedAt: new Date().toISOString(),
          metrics
        },
        reward: reward || undefined
      }
    });

    return updated;
  });

  await recordInsightEvent({
    userId,
    type: 'QUEST_COMPLETED',
    payload: {
      questId: completed.questId,
      userQuestId: completed.id,
      reward
    },
    app: input.app
  });

  emitInsightsEvent(input.app, 'insights:quests_completed', {
    userId,
    userQuestId: completed.id,
    questId: completed.questId,
    key: completed.quest?.key,
    title: completed.quest?.title,
    completedAt: completed.completedAt
  });

  if (reward) {
    emitInsightsEvent(input.app, 'insights:quest_reward_granted', {
      userId,
      userQuestId: completed.id,
      questId: completed.questId,
      reward
    });
  }

  return formatUserQuest(completed);
};

export const getAdminQuestCatalog = async () => {
  await ensureDefaultQuestCatalog();
  return prisma.questCatalog.findMany({
    orderBy: [{ isActive: 'desc' }, { isWeekly: 'desc' }, { rotationWeight: 'desc' }, { createdAt: 'asc' }]
  });
};

export const createAdminQuestCatalog = async (input: {
  actorUserId?: string | null;
  key: string;
  title: string;
  description?: string | null;
  roleScope?: unknown;
  difficulty?: unknown;
  verificationRules?: unknown;
  reward?: unknown;
  isWeekly?: unknown;
  rotationWeight?: unknown;
  isActive?: unknown;
}) => {
  const key = String(input.key || '').trim().toUpperCase();
  const title = String(input.title || '').trim();
  if (!key || !title) throw new Error('key and title are required');
  const roleScope = parseRoleScopeInput(input.roleScope);
  return prisma.questCatalog.create({
    data: {
      key,
      title,
      description: input.description ? String(input.description) : null,
      roleScope,
      difficulty: String(input.difficulty || 'standard').trim().toLowerCase() || 'standard',
      verificationRules: isObject(input.verificationRules) ? input.verificationRules : {},
      reward: isObject(input.reward) ? input.reward : {},
      isWeekly: Boolean(input.isWeekly),
      rotationWeight: Math.max(1, Math.floor(Number(input.rotationWeight || 100))),
      isActive: input.isActive === undefined ? true : Boolean(input.isActive),
      createdById: input.actorUserId || null,
      updatedById: input.actorUserId || null
    }
  });
};

export const updateAdminQuestCatalog = async (input: {
  id: string;
  actorUserId?: string | null;
  title?: unknown;
  description?: unknown;
  roleScope?: unknown;
  difficulty?: unknown;
  verificationRules?: unknown;
  reward?: unknown;
  isWeekly?: unknown;
  rotationWeight?: unknown;
  isActive?: unknown;
}) => {
  const id = String(input.id || '').trim();
  if (!id) throw new Error('id is required');
  return prisma.questCatalog.update({
    where: { id },
    data: {
      title: input.title !== undefined ? String(input.title || '').trim() : undefined,
      description: input.description !== undefined ? (input.description ? String(input.description) : null) : undefined,
      roleScope: input.roleScope !== undefined ? parseRoleScopeInput(input.roleScope) : undefined,
      difficulty: input.difficulty !== undefined ? String(input.difficulty || 'standard').trim().toLowerCase() : undefined,
      verificationRules: input.verificationRules !== undefined ? (isObject(input.verificationRules) ? input.verificationRules : {}) : undefined,
      reward: input.reward !== undefined ? (isObject(input.reward) ? input.reward : {}) : undefined,
      isWeekly: input.isWeekly !== undefined ? Boolean(input.isWeekly) : undefined,
      rotationWeight:
        input.rotationWeight !== undefined ? Math.max(1, Math.floor(Number(input.rotationWeight || 100))) : undefined,
      isActive: input.isActive !== undefined ? Boolean(input.isActive) : undefined,
      updatedById: input.actorUserId !== undefined ? input.actorUserId : undefined
    }
  });
};

export const toggleAdminQuestCatalog = async (input: {
  id: string;
  actorUserId?: string | null;
}) => {
  const id = String(input.id || '').trim();
  if (!id) throw new Error('id is required');
  const current = await prisma.questCatalog.findUnique({ where: { id } });
  if (!current) throw new Error('Quest not found');
  return prisma.questCatalog.update({
    where: { id },
    data: {
      isActive: !current.isActive,
      updatedById: input.actorUserId || null
    }
  });
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

const inferOpportunityIntent = (prompt: string, role: string) => {
  const normalized = String(prompt || '').toLowerCase();
  const normalizedRole = String(role || '').toUpperCase();

  if (
    normalized.includes('hire') ||
    normalized.includes('looking for') ||
    normalized.includes('need someone') ||
    normalized.includes('need a') ||
    normalized.includes('build for me') ||
    normalized.includes('help me')
  ) {
    return 'hire';
  }

  if (
    normalized.includes('offer') ||
    normalized.includes('service') ||
    normalized.includes('package') ||
    normalized.includes('sell') ||
    normalized.includes('client work') ||
    normalized.includes('freelance')
  ) {
    return 'sell';
  }

  if (normalizedRole === 'EMPLOYER' || normalizedRole === 'CLIENT') return 'hire';
  if (normalizedRole === 'FREELANCER') return 'sell';
  return 'grow';
};

const buildOpportunityBriefTitle = (prompt: string, intent: string) => {
  const cleaned = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return intent === 'sell' ? 'New Service Offer' : 'New Opportunity Brief';
  const sentence = cleaned.split(/[.!?]/)[0] || cleaned;
  const trimmed = sentence.length > 72 ? `${sentence.slice(0, 69)}...` : sentence;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

const inferBudgetRange = (prompt: string, intent: string) => {
  const normalized = String(prompt || '').toLowerCase();
  const currencyMatch = normalized.match(/([$€£₦])\s?(\d[\d,]*(?:\.\d+)?)(?:\s*-\s*([$€£₦])?\s?(\d[\d,]*(?:\.\d+)?))?/);
  if (currencyMatch) {
    const symbol = currencyMatch[1] || currencyMatch[3] || '$';
    const start = currencyMatch[2];
    const end = currencyMatch[4];
    return end ? `${symbol}${start} - ${symbol}${end}` : `${symbol}${start}`;
  }
  if (normalized.includes('enterprise') || normalized.includes('scale')) {
    return intent === 'sell' ? 'Premium package pricing recommended' : 'Mid to enterprise budget recommended';
  }
  if (normalized.includes('urgent') || normalized.includes('asap')) {
    return intent === 'sell' ? 'Fast-turn package pricing recommended' : 'Expedited budget recommended';
  }
  return intent === 'sell' ? 'Starter / Growth / Premium package pricing' : 'Budget to be refined after shortlist';
};

const inferTimelineWindow = (prompt: string) => {
  const normalized = String(prompt || '').toLowerCase();
  if (normalized.includes('today') || normalized.includes('24 hours') || normalized.includes('tomorrow')) {
    return '24-48 hours';
  }
  if (normalized.includes('urgent') || normalized.includes('asap') || normalized.includes('this week')) {
    return '3-7 days';
  }
  if (normalized.includes('month') || normalized.includes('quarter')) {
    return '2-6 weeks';
  }
  return '1-3 weeks';
};

const uniqueSkillTokens = (prompt: string) => Array.from(new Set(tokenize(prompt))).slice(0, 8);

const buildDeliverables = (skills: string[], intent: string) => {
  const base = skills.slice(0, 4).map((skill) => `${skill} execution`);
  if (intent === 'hire') {
    return base.length
      ? base
      : ['Qualified shortlist', 'Delivery plan', 'Execution milestones'];
  }
  return base.length
    ? base
    : ['Service scope', 'Delivery workflow', 'Client-ready package'];
};

const buildPackageBlueprint = (title: string, skills: string[]) => {
  const anchor = skills[0] || 'delivery';
  const deliverables = buildDeliverables(skills, 'sell');
  return [
    {
      tier: 'starter',
      name: `${title} Starter`,
      positioning: `Fast entry package for ${anchor} needs.`,
      turnaround: '3 days',
      deliverables: deliverables.slice(0, 2),
      pricingGuidance: 'Entry pricing'
    },
    {
      tier: 'growth',
      name: `${title} Growth`,
      positioning: `Balanced scope with stronger ${anchor} depth and revisions.`,
      turnaround: '5-7 days',
      deliverables: deliverables.slice(0, 3),
      pricingGuidance: 'Mid-tier pricing'
    },
    {
      tier: 'premium',
      name: `${title} Premium`,
      positioning: `Full-service execution with strategy, QA, and launch support.`,
      turnaround: '7-14 days',
      deliverables: [...deliverables.slice(0, 3), 'Executive handoff summary'].slice(0, 4),
      pricingGuidance: 'Premium pricing'
    }
  ];
};

const resolveTrustTier = (score: number, riskFlags?: Record<string, any> | null) => {
  const riskPenalty =
    Number(Boolean(riskFlags?.highViolationRisk)) +
    Number(Boolean(riskFlags?.weakDeliveryReliability)) +
    Number(Boolean(riskFlags?.weakProfileCompleteness));
  if (score >= 760 && riskPenalty === 0) return 'Elite';
  if (score >= 620 && riskPenalty <= 1) return 'Strong';
  if (score >= 420) return 'Building';
  return 'Starter';
};

const buildOpportunityActions = (input: {
  role: string;
  profileCompleteness: number;
  kycVerified: boolean;
  activeGigs: number;
  activeJobs: number;
  activePages: number;
  portfolioProofs: number;
  activeContracts: number;
  matchesCount: number;
  ratingsCount: number;
}) => {
  const actions: string[] = [];
  const role = String(input.role || '').toUpperCase();

  if (input.profileCompleteness < 80) actions.push('Complete your professional profile to unlock stronger ranking and matching.');
  if (!input.kycVerified) actions.push('Finish verification to strengthen trust signals across hiring, gigs, and pages.');
  if (input.portfolioProofs === 0) actions.push('Add proof-of-work artifacts so buyers and employers can verify delivery quality.');

  if (role === 'FREELANCER') {
    if (input.activeGigs === 0) actions.push('Publish a packaged service offer so buyers can engage you instantly.');
    if (input.activeContracts === 0) actions.push('Use brief-to-match to target jobs and pages that align with your strongest skills.');
  } else if (role === 'EMPLOYER' || role === 'CLIENT') {
    if (input.activeJobs === 0) actions.push('Publish a structured job or brief to attract targeted proposals faster.');
    if (input.activePages === 0) actions.push('Create or optimize a business page to build credibility and pipeline visibility.');
  } else {
    actions.push('Pick a primary growth path: hire, sell services, or build through content and pages.');
  }

  if (input.matchesCount < 3) actions.push('Add more skills and portfolio detail to widen your opportunity graph coverage.');
  if (input.ratingsCount < 3) actions.push('Close more verified deliveries to strengthen review and trust momentum.');

  return Array.from(new Set(actions)).slice(0, 5);
};

export type OpportunityActionRecommendation = {
  id: string;
  category: 'trust' | 'profile' | 'creator' | 'hiring' | 'matching' | 'delivery';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  actionLabel: string;
  actionUrl: string;
  approvalRequired: boolean;
  explanation: {
    summary: string;
    signals: string[];
    privacyNote: string;
  };
};

const buildActionCenterRecommendations = (input: {
  role: string;
  profileCompleteness: number;
  kycVerified: boolean;
  portfolioProofs: number;
  activeGigs: number;
  activeJobs: number;
  activePages: number;
  activeContracts: number;
  matchesCount: number;
  ratingsCount: number;
}): OpportunityActionRecommendation[] => {
  const role = normalizeRoleLabel(input.role);
  const recommendations: OpportunityActionRecommendation[] = [];
  const privacyNote = 'Built from your Scrolith activity and profile signals. No private messages or documents are used.';

  if (!input.kycVerified) {
    recommendations.push({
      id: 'verify-identity',
      category: 'trust',
      priority: 'high',
      title: 'Strengthen your trust signal',
      description: 'Complete identity verification to increase confidence across hiring, marketplace, and delivery workflows.',
      actionLabel: 'Review verification',
      actionUrl: '/kyc',
      approvalRequired: true,
      explanation: {
        summary: 'Verification is incomplete, so trust-aware surfaces cannot show your strongest available signal.',
        signals: ['Verification status: incomplete'],
        privacyNote
      }
    });
  }

  if (input.profileCompleteness < 80) {
    recommendations.push({
      id: 'complete-profile',
      category: 'profile',
      priority: input.profileCompleteness < 55 ? 'high' : 'medium',
      title: 'Complete your professional profile',
      description: 'Add the missing professional context that helps matching, discovery, and trusted introductions.',
      actionLabel: 'Improve profile',
      actionUrl: '/profile/edit',
      approvalRequired: true,
      explanation: {
        summary: 'Profile completeness is below the recommended level for high-confidence matching.',
        signals: [`Profile completeness: ${Math.round(input.profileCompleteness)}%`],
        privacyNote
      }
    });
  }

  if (input.portfolioProofs === 0) {
    recommendations.push({
      id: 'add-proof-of-work',
      category: 'trust',
      priority: 'medium',
      title: 'Add proof of work',
      description: 'Share portfolio evidence so clients and collaborators can evaluate your delivery capability faster.',
      actionLabel: 'Add portfolio proof',
      actionUrl: '/profile/edit',
      approvalRequired: true,
      explanation: {
        summary: 'No portfolio proof is currently available to support your capability and delivery signals.',
        signals: ['Portfolio proofs: 0'],
        privacyNote
      }
    });
  }

  if (role === 'FREELANCER' && input.activeGigs === 0) {
    recommendations.push({
      id: 'publish-service',
      category: 'creator',
      priority: 'medium',
      title: 'Package a service offer',
      description: 'Create a clear, bookable service so matching can connect buyer demand to your skills.',
      actionLabel: 'Create a gig',
      actionUrl: '/create-gig',
      approvalRequired: true,
      explanation: {
        summary: 'You have no active service offer available for marketplace discovery.',
        signals: ['Active gigs: 0', `Opportunity matches: ${input.matchesCount}`],
        privacyNote
      }
    });
  }

  if ((role === 'EMPLOYER' || role === 'CLIENT') && input.activeJobs === 0) {
    recommendations.push({
      id: 'publish-hiring-brief',
      category: 'hiring',
      priority: 'medium',
      title: 'Publish a structured hiring brief',
      description: 'Turn your need into a searchable job post and receive relevant, trust-aware proposals.',
      actionLabel: 'Create a job',
      actionUrl: '/create-job',
      approvalRequired: true,
      explanation: {
        summary: 'No active job is available to start a qualified proposal pipeline.',
        signals: ['Active jobs: 0'],
        privacyNote
      }
    });
  }

  if (input.matchesCount < 3) {
    recommendations.push({
      id: 'expand-opportunity-graph',
      category: 'matching',
      priority: 'medium',
      title: 'Expand your opportunity graph',
      description: 'Review personalized discovery and add the profile context needed for more precise opportunities.',
      actionLabel: 'Explore discovery',
      actionUrl: '/discovery',
      approvalRequired: false,
      explanation: {
        summary: 'There are fewer than three active recommendations, which limits the range of next-best opportunities.',
        signals: [`Active matches: ${input.matchesCount}`],
        privacyNote
      }
    });
  }

  if (input.activeContracts > 0 || input.ratingsCount < 3) {
    recommendations.push({
      id: 'review-delivery-momentum',
      category: 'delivery',
      priority: input.activeContracts > 0 ? 'high' : 'low',
      title: input.activeContracts > 0 ? 'Keep active delivery moving' : 'Build verified delivery momentum',
      description:
        input.activeContracts > 0
          ? 'Review active workstreams, milestones, and responses before a delivery needs attention.'
          : 'Complete and collect feedback from more verified deliveries to strengthen your reputation.',
      actionLabel: 'Open workspaces',
      actionUrl: getDashboardBase(role),
      approvalRequired: false,
      explanation: {
        summary:
          input.activeContracts > 0
            ? 'Active delivery workstreams need regular review to protect response and reliability signals.'
            : 'A stronger verified delivery history improves trust-aware ranking and buyer confidence.',
        signals: [`Active contracts: ${input.activeContracts}`, `Ratings: ${input.ratingsCount}`],
        privacyNote
      }
    });
  }

  return recommendations
    .sort((left, right) => getWorkroomPriorityRank(left.priority) - getWorkroomPriorityRank(right.priority))
    .slice(0, 6);
};

type WorkroomPriority = 'high' | 'medium' | 'low';

const normalizeRoleLabel = (value: string) => String(value || '').trim().toUpperCase();

const isFreelancerRole = (role: string) => normalizeRoleLabel(role) === 'FREELANCER';

const getDashboardBase = (role: string) =>
  isFreelancerRole(role) ? '/freelancer/dashboard' : '/client/dashboard';

const getWorkroomActionUrl = (input: {
  role: string;
  source: 'contract' | 'order' | 'proposal';
  sourceId?: string | null;
  contractId?: string | null;
}) => {
  const base = getDashboardBase(input.role);
  if (input.source === 'contract' && input.sourceId) return `${base}?tab=contracts&contract_id=${encodeURIComponent(input.sourceId)}`;
  if (input.source === 'order') {
    return isFreelancerRole(input.role) ? `${base}?tab=orders` : `${base}?tab=contracts`;
  }
  if (input.contractId) return `${base}?tab=contracts&contract_id=${encodeURIComponent(input.contractId)}`;
  return isFreelancerRole(input.role) ? `${base}?tab=my-proposals` : `${base}?tab=proposals-offers`;
};

const getWorkroomPriorityRank = (priority: WorkroomPriority) => {
  if (priority === 'high') return 0;
  if (priority === 'medium') return 1;
  return 2;
};

const scoreBusinessPageMatch = (skills: string[], page: any, trustScore: number) => {
  const haystack = tokenize(
    `${page.name || ''} ${page.tagline || ''} ${page.description || ''} ${page.industry || ''} ${page.category || ''}`
  );
  const similarity = jaccard(skills, haystack);
  const followerSignal = clamp(Number(page?._count?.followers || 0) / 250, 0, 0.18);
  const score = clamp((similarity * 0.7 + followerSignal + trustScore / 1000 * 0.15) * 100, 0, 100);
  const reasons = [
    similarity > 0.2 ? 'Business page context aligns with the brief keywords.' : 'Partial page alignment detected.',
    followerSignal > 0.08 ? 'Audience traction suggests stronger commercial visibility.' : 'Early-stage audience signal.',
    `Professional trust signal applied (${Math.round((trustScore / 1000) * 100)}%).`
  ];
  return { score: Number(score.toFixed(2)), reasons };
};

export const getOpportunityHubForUser = async (input: {
  userId: string;
  app?: Application;
}) => {
  const userId = String(input.userId || '').trim();
  if (!userId) throw new Error('userId is required');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true }
  });
  if (!user) throw new Error('User not found');

  const role = normalizeRoleLabel(String(user.role || 'USER'));
  const metrics = await loadMetricsSnapshot(userId);
  const [
    professionalScore,
    matches,
    revenue,
    portfolioProofs,
    verifiedProofs,
    activeContracts,
    activeTrackingSessions,
    activeOrders,
    openProposals,
    activeGigs,
    featuredGigs,
    activeJobs,
    pages,
    workroomContracts,
    workroomOrders,
    workroomProposals
  ] =
    await Promise.all([
      getProfessionalScoreForUser(userId, input.app).catch(() => ({
        userId,
        score: 0,
        breakdown: {},
        riskFlags: { unavailable: true },
        updatedAt: new Date().toISOString()
      })),
      getOpportunityMatches({ userId, app: input.app }).catch(() => []),
      getRevenueInsights(userId).catch(() => ({
        totalEarned: 0,
        totalSpent: 0,
        pendingDue: 0,
        walletBalance: 0,
        completedOrders: 0,
        clientOrders: 0,
        trackedHours: 0
      })),
      prisma.portfolioProof.count({ where: { userId } }).catch(() => 0),
      prisma.portfolioProof.count({ where: { userId, status: 'verified' } }).catch(() => 0),
      prisma.contract.count({
        where: {
          OR: [{ clientId: userId }, { freelancerId: userId }],
          status: 'ACTIVE'
        }
      }),
      prisma.trackingSession.count({ where: { freelancerId: userId, status: 'ACTIVE' } }),
      prisma.order.count({
        where: {
          OR: [{ clientId: userId }, { freelancerId: userId }],
          status: { in: ['PAID', 'IN_PROGRESS', 'UNDER_REVIEW'] }
        }
      }),
      prisma.proposal.count({
        where: isFreelancerRole(role)
          ? {
              freelancerId: userId,
              status: { in: ['PENDING', 'SHORTLISTED'] }
            }
          : {
              job: { clientId: userId },
              status: { in: ['PENDING', 'SHORTLISTED'] }
            }
      }),
      prisma.gig.count({ where: { userId, isActive: true, status: 'ACTIVE' } }),
      prisma.gig.count({
        where: {
          userId,
          isActive: true,
          status: 'ACTIVE',
          OR: [{ isFeatured: true }, { isRecommended: true }, { isTopSelected: true }]
        }
      }),
      prisma.job.count({ where: { clientId: userId, isActive: true, isVisible: true, status: 'ACTIVE' } }),
      prisma.communityBusinessPage.findMany({
        where: { ownerId: userId, status: 'active' },
        take: 3,
        orderBy: [{ updatedAt: 'desc' }],
        select: {
          id: true,
          name: true,
          slug: true,
          tagline: true,
          status: true,
          industry: true,
          _count: {
            select: {
              followers: true,
              posts: true
            }
          }
        }
      }),
      prisma.contract.findMany({
        where: {
          OR: [{ clientId: userId }, { freelancerId: userId }],
          status: { in: ['ACTIVE', 'PAUSED'] }
        },
        take: 4,
        orderBy: [{ updatedAt: 'desc' }],
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          updatedAt: true,
          clientId: true,
          freelancerId: true,
          clientName: true,
          freelancerName: true,
          client: { select: { name: true } },
          freelancer: { select: { name: true } }
        }
      }),
      prisma.order.findMany({
        where: {
          OR: [{ clientId: userId }, { freelancerId: userId }],
          status: { in: ['PAID', 'IN_PROGRESS', 'UNDER_REVIEW'] }
        },
        take: 4,
        orderBy: [{ updatedAt: 'desc' }],
        select: {
          id: true,
          status: true,
          amount: true,
          deliveryDate: true,
          updatedAt: true,
          clientId: true,
          freelancerId: true,
          gig: { select: { title: true } },
          client: { select: { name: true } },
          freelancer: { select: { name: true } }
        }
      }),
      prisma.proposal.findMany({
        where: isFreelancerRole(role)
          ? {
              freelancerId: userId,
              status: { in: ['PENDING', 'SHORTLISTED', 'ACCEPTED'] }
            }
          : {
              job: { clientId: userId },
              status: { in: ['PENDING', 'SHORTLISTED', 'ACCEPTED'] }
            },
        take: 4,
        orderBy: [{ updatedAt: 'desc' }],
        select: {
          id: true,
          status: true,
          contractId: true,
          updatedAt: true,
          job: {
            select: {
              title: true,
              client: { select: { name: true } }
            }
          },
          freelancer: { select: { name: true } }
        }
      })
    ]);

  const profile = user.profile;
  const topSkills = Array.isArray(profile?.skills) ? profile.skills.slice(0, 6) : [];
  const activePages = pages.length;
  const trustTier = resolveTrustTier(Number(professionalScore?.score || 0), professionalScore?.riskFlags || {});
  const verificationState = metrics.kycVerified
    ? 'KYC verified'
    : Boolean(user.isVerified)
      ? 'Identity verified'
      : 'Verification in progress';

  const nowTs = Date.now();
  const contractWorkrooms = workroomContracts.map((contract) => {
    const counterpartName =
      contract.clientId === userId
        ? contract.freelancerName || contract.freelancer?.name || 'Freelancer'
        : contract.clientName || contract.client?.name || 'Client';
    const stale = nowTs - new Date(contract.updatedAt).getTime() > 72 * 60 * 60 * 1000;
    const priority: WorkroomPriority = contract.status === 'PAUSED' || stale ? 'high' : 'medium';
    return {
      id: `contract:${contract.id}`,
      source: 'contract',
      sourceId: contract.id,
      title: contract.title || 'Contract',
      subtitle: `${counterpartName} - ${String(contract.type || '').toLowerCase()} contract`,
      status: String(contract.status || 'ACTIVE'),
      priority,
      updatedAt: contract.updatedAt.toISOString(),
      actionLabel: 'Open contract',
      actionUrl: getWorkroomActionUrl({ role, source: 'contract', sourceId: contract.id })
    };
  });

  const orderWorkrooms = workroomOrders.map((order) => {
    const counterpartName =
      order.clientId === userId ? order.freelancer?.name || 'Freelancer' : order.client?.name || 'Client';
    const deliveryTs = order.deliveryDate ? new Date(order.deliveryDate).getTime() : null;
    const nearDue = deliveryTs !== null && deliveryTs <= nowTs + 24 * 60 * 60 * 1000;
    const priority: WorkroomPriority =
      order.status === 'UNDER_REVIEW' || nearDue ? 'high' : order.status === 'IN_PROGRESS' ? 'medium' : 'low';
    return {
      id: `order:${order.id}`,
      source: 'order',
      sourceId: order.id,
      title: order.gig?.title || 'Service order',
      subtitle: counterpartName ? `Counterparty: ${counterpartName}` : 'Order in progress',
      status: String(order.status || 'PAID'),
      priority,
      updatedAt: order.updatedAt.toISOString(),
      dueAt: order.deliveryDate ? order.deliveryDate.toISOString() : null,
      amount: Number(order.amount || 0),
      actionLabel: isFreelancerRole(role) ? 'Open orders' : 'Open workspace',
      actionUrl: getWorkroomActionUrl({ role, source: 'order', sourceId: order.id })
    };
  });

  const proposalWorkrooms = workroomProposals.map((proposal) => {
    const subtitle = isFreelancerRole(role)
      ? `Client: ${proposal.job?.client?.name || 'Client'}`
      : `Freelancer: ${proposal.freelancer?.name || 'Freelancer'}`;
    const priority: WorkroomPriority =
      proposal.status === 'SHORTLISTED' ? 'high' : proposal.status === 'ACCEPTED' ? 'medium' : 'low';
    return {
      id: `proposal:${proposal.id}`,
      source: 'proposal',
      sourceId: proposal.id,
      title: proposal.job?.title || 'Proposal pipeline',
      subtitle,
      status: String(proposal.status || 'PENDING'),
      priority,
      updatedAt: proposal.updatedAt.toISOString(),
      actionLabel: proposal.contractId ? 'Open contract' : 'Open proposal',
      actionUrl: getWorkroomActionUrl({
        role,
        source: 'proposal',
        sourceId: proposal.id,
        contractId: proposal.contractId || null
      })
    };
  });

  const workroomItems = [...contractWorkrooms, ...orderWorkrooms, ...proposalWorkrooms]
    .sort((a, b) => {
      const priorityDiff = getWorkroomPriorityRank(a.priority) - getWorkroomPriorityRank(b.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    })
    .slice(0, 8);
  const workroomNeedsAttention = workroomItems.filter((item) => item.priority === 'high').length;

  return {
    identity: {
      userId,
      name: user.name || 'Scrolith member',
      username: user.username || null,
      role: String(user.role || 'USER'),
      title: profile?.title || '',
      location: profile?.location || user.country || '',
      skills: topSkills,
      profileCompleteness: metrics.profileCompleteness,
      verificationState,
      verified: Boolean(user.isVerified),
      kycStatus: String(user.kycStatus || 'PENDING'),
      followersCount: metrics.followersCount,
      postsCount: metrics.postsCount,
      commentsCount: metrics.commentsCount,
      portfolioProofs,
      verifiedProofs,
      activePages
    },
    trust: {
      score: Number(professionalScore?.score || 0),
      trustTier,
      breakdown: professionalScore?.breakdown || {},
      riskFlags: professionalScore?.riskFlags || {},
      averageRating: Number(metrics.avgRating.toFixed(2)),
      ratingsCount: metrics.ratingsCount,
      completedOrders: metrics.completedOrders,
      cancelledOrders: metrics.cancelledOrders,
      proposalWinRate:
        metrics.totalProposals > 0 ? Number(((metrics.acceptedProposals / metrics.totalProposals) * 100).toFixed(1)) : 0,
      responseRate: Number(profile?.responseRate || 0),
      responseTimeHours: Number(profile?.responseTime || 0),
      updatedAt: professionalScore?.updatedAt || new Date().toISOString()
    },
    delivery: {
      activeContracts,
      activeTrackingSessions,
      activeOrders,
      openProposals,
      pendingDue: Number(revenue.pendingDue || 0),
      totalEarned: Number(revenue.totalEarned || 0),
      totalSpent: Number(revenue.totalSpent || 0),
      walletBalance: Number(revenue.walletBalance || 0),
      trackedHours: Number(revenue.trackedHours || 0)
    },
    packaging: {
      activeGigs,
      featuredGigs,
      activeJobs,
      activePages,
      pages: pages.map((page) => ({
        id: page.id,
        name: page.name,
        slug: page.slug,
        tagline: page.tagline,
        industry: page.industry,
        followersCount: Number(page._count?.followers || 0),
        postsCount: Number(page._count?.posts || 0),
        status: page.status
      }))
    },
    matching: {
      total: Array.isArray(matches) ? matches.length : 0,
      matches: Array.isArray(matches) ? matches.slice(0, 5) : []
    },
    workroom: {
      totalWorkstreams: contractWorkrooms.length + orderWorkrooms.length + proposalWorkrooms.length,
      needsAttention: workroomNeedsAttention,
      activeContracts: contractWorkrooms.length,
      activeOrders: orderWorkrooms.length,
      openProposals: proposalWorkrooms.length,
      items: workroomItems
    },
    actions: buildOpportunityActions({
      role: String(user.role || 'USER'),
      profileCompleteness: metrics.profileCompleteness,
      kycVerified: metrics.kycVerified,
      activeGigs,
      activeJobs,
      activePages,
      portfolioProofs,
      activeContracts,
      matchesCount: Array.isArray(matches) ? matches.length : 0,
      ratingsCount: metrics.ratingsCount
    }),
    actionCenter: {
      generatedAt: new Date().toISOString(),
      recommendations: buildActionCenterRecommendations({
        role: String(user.role || 'USER'),
        profileCompleteness: metrics.profileCompleteness,
        kycVerified: metrics.kycVerified,
        portfolioProofs,
        activeGigs,
        activeJobs,
        activePages,
        activeContracts,
        matchesCount: Array.isArray(matches) ? matches.length : 0,
        ratingsCount: metrics.ratingsCount
      })
    }
  };
};

export const generateOpportunityBriefMatches = async (input: {
  userId: string;
  prompt: string;
  actor?: ScrolithaActor;
  app?: Application;
}) => {
  const userId = String(input.userId || '').trim();
  const prompt = String(input.prompt || '').trim();
  if (!userId) throw new Error('userId is required');
  if (!prompt) throw new Error('Prompt is required');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true }
  });
  if (!user) throw new Error('User not found');

  const trustScore = Number(
    (
      await getProfessionalScoreForUser(userId, input.app).catch(() => ({
        score: 0
      }))
    )?.score || 0
  );
  const intent = inferOpportunityIntent(prompt, String(user.role || 'USER'));
  const skills = uniqueSkillTokens(prompt);
  const title = buildOpportunityBriefTitle(prompt, intent);
  const deliverables = buildDeliverables(skills, intent);
  const budgetRange = inferBudgetRange(prompt, intent);
  const timeline = inferTimelineWindow(prompt);
  const summary = `${intent === 'hire' ? 'Hiring brief' : intent === 'sell' ? 'Service blueprint' : 'Growth brief'} focused on ${skills.slice(0, 3).join(', ') || 'execution'}, with delivery emphasis on ${deliverables.slice(0, 2).join(' and ')}.`;

  const [jobs, gigs, pages] = await Promise.all([
    prisma.job.findMany({
      where: { isActive: true, isVisible: true, status: 'ACTIVE', clientId: { not: userId } },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      select: {
        id: true,
        title: true,
        description: true,
        tags: true,
        budget: true,
        type: true,
        subcategory: true,
        proposalsCount: true,
        client: { select: { name: true } }
      }
    }),
    prisma.gig.findMany({
      where: { isActive: true, status: 'ACTIVE', userId: { not: userId } },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      select: {
        id: true,
        title: true,
        description: true,
        tags: true,
        price: true,
        rating: true,
        deliveryTime: true,
        subcategory: true,
        user: { select: { name: true } }
      }
    }),
    prisma.communityBusinessPage.findMany({
      where: { status: 'active', ownerId: { not: userId } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        name: true,
        slug: true,
        tagline: true,
        description: true,
        category: true,
        industry: true,
        _count: { select: { followers: true } }
      }
    })
  ]);

  const jobMatches = jobs
    .map((job) => {
      const scored = scoreJobMatch(skills, job, trustScore);
      return {
        id: job.id,
        title: job.title,
        budget: job.budget,
        type: job.type,
        clientName: job.client?.name || 'Client',
        score: scored.score,
        reasons: scored.reasons,
        destinationUrl: `/jobs/${job.id}`
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const gigMatches = gigs
    .map((gig) => {
      const scored = scoreGigMatch(skills, gig, trustScore);
      return {
        id: gig.id,
        title: gig.title,
        price: gig.price,
        deliveryTime: gig.deliveryTime,
        sellerName: gig.user?.name || 'Seller',
        score: scored.score,
        reasons: scored.reasons,
        destinationUrl: `/gigs/${gig.id}`
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const pageMatches = pages
    .map((page) => {
      const scored = scoreBusinessPageMatch(skills, page, trustScore);
      return {
        id: page.id,
        name: page.name,
        slug: page.slug,
        tagline: page.tagline,
        industry: page.industry,
        followersCount: Number(page?._count?.followers || 0),
        score: scored.score,
        reasons: scored.reasons,
        destinationUrl: `/company/${page.slug}`
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const suggestedActions = [
    intent === 'hire'
      ? 'Use this brief to shortlist talent quickly and post a structured job if you need custom execution.'
      : 'Use this blueprint to create a packaged offer, company-page service post, or outbound pitch.',
    jobMatches.length ? 'Review the top aligned jobs to validate demand and positioning.' : 'Broaden the brief with clearer skills to surface stronger job demand.',
    gigMatches.length ? 'Study existing service packaging to refine your pricing and scope tiers.' : 'Create a stronger package outline so buyers can compare options instantly.',
    pageMatches.length ? 'Follow relevant business pages to build warm pipeline visibility and partnership context.' : 'Add industry keywords to surface stronger page and partner matches.'
  ].slice(0, 4);

  const promptHash = createHash('sha256').update(prompt).digest('hex');
  await prisma.aICopilotLog.create({
    data: {
      userId,
      scope: 'opportunity_brief_match',
      promptHash,
      inputSummary: prompt.slice(0, 500),
      outputSummary: JSON.stringify({
        title,
        intent,
        skills,
        jobs: jobMatches.length,
        gigs: gigMatches.length,
        pages: pageMatches.length
      }).slice(0, 1200),
      riskLevel: 'low',
      metadata: {
        intent,
        skills,
        jobs: jobMatches.length,
        gigs: gigMatches.length,
        pages: pageMatches.length
      }
    }
  });

  emitInsightsEvent(input.app, 'insights:copilot_tip', {
    userId,
    scope: 'opportunity_brief_match',
    title,
    intent,
    totalMatches: jobMatches.length + gigMatches.length + pageMatches.length
  });

  return {
    brief: {
      title,
      intent,
      summary,
      budgetRange,
      timeline,
      skills,
      deliverables
    },
    packageBlueprint: buildPackageBlueprint(title, skills),
    matches: {
      jobs: jobMatches,
      gigs: gigMatches,
      pages: pageMatches
    },
    suggestedActions
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
