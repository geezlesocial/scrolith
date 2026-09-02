import { Role } from '@prisma/client';
import prisma from '../../utils/prismaClient';
import { recoCache } from './reco.cache';
import {
  defaultRecoConfig,
  EffectiveRecoConfig,
  normalizeEntityType,
  normalizeRecoColdStart,
  normalizeRecoDiversity,
  normalizeRecoGating,
  normalizeRecoMode,
  normalizeRecoPenalties,
  normalizeRecoWeights,
  normalizeSurface,
  RecoEntityType,
  RecoFeedbackAction,
  RecoManualAction,
  RecoSurface
} from './reco.defaults';
import {
  clamp01,
  computeProfileCompleteness,
  daysSince,
  evaluateEligibilityGate,
  evaluateSafetyGate,
  jaccardSimilarity,
  normalizeTokens,
  ratio,
  recencyScore
} from './reco.policy';
import { applyManualRules } from './reco.manual';

type StringMapNumber = Map<string, number>;

const RECO_CONFIG_CACHE_PREFIX = 'reco:config:';
const RECO_RULES_CACHE_PREFIX = 'reco:rules:';
const RECO_CONFIG_TTL_MS = 60_000;
const RECO_RULES_TTL_MS = 30_000;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const CANDIDATE_MULTIPLIER = 6;
const CANDIDATE_MIN_POOL = 60;
const REPORT_RATE_WINDOW_DAYS = 30;
const ACTIVITY_WINDOW_DAYS = 30;
const INTERACTION_WINDOW_DAYS = 60;

type ViewerContext = {
  viewerId: string;
  viewerLocation: string;
  viewerLanguages: Set<string>;
  viewerInterestTokens: Set<string>;
  viewerFollowingUserIds: Set<string>;
  viewerFollowedPageIds: Set<string>;
  blockedUserIds: Set<string>;
  dismissedKeys: Set<string>;
  hasStrongSignals: boolean;
};

type CandidateSocialSignals = {
  mutualCount: number;
  reverseFollow: boolean;
  interactionCount: number;
};

type CandidatePerformanceSignals = {
  ratingScore: number;
  completedScore: number;
  successScore: number;
  disputePenalty: number;
  cancellationPenalty: number;
  engagementScore: number;
  consistencyScore: number;
};

type CandidateRecord = {
  entityType: RecoEntityType;
  entityId: string;
  displayName: string;
  username: string | null;
  avatar: string | null;
  headline: string | null;
  category: string;
  clusterKey: string;
  location: string;
  tags: string[];
  languages: string[];
  isActive: boolean;
  isVerified: boolean;
  kycVerified: boolean;
  accountAgeDays: number;
  profileCompleteness: number;
  lastActiveAt: Date | null;
  activityRefAt: Date | null;
  activityCadenceScore: number;
  alreadyFollowing: boolean;
  blocked: boolean;
  severeViolation: boolean;
  reportRate: number;
  spamSignals: number;
  social: CandidateSocialSignals;
  performance: CandidatePerformanceSignals;
  extra: Record<string, any>;
};

type ScoreBreakdown = {
  relevance: number;
  quality: number;
  activity: number;
  social: number;
  performance: number;
  diversityBoost: number;
  baseScore: number;
  finalScore: number;
};

type ScoredCandidate = {
  entityType: RecoEntityType;
  entityId: string;
  surface: RecoSurface;
  score: number;
  pinnedRank: number | null;
  excluded: boolean;
  category: string;
  clusterKey: string;
  account: Record<string, any>;
  gating: {
    passed: boolean;
    reasons: string[];
  };
  safety: {
    passed: boolean;
    reasons: string[];
    penalties: {
      violationPenalty: number;
      reportRatePenalty: number;
      spamPenalty: number;
      lowQualityPenalty: number;
      totalPenalty: number;
    };
  };
  breakdown: ScoreBreakdown;
  manualApplied: Array<Record<string, any>>;
};

export type RecommendationFeedbackInput = {
  viewerId?: string;
  surface: unknown;
  entityType: unknown;
  entityId: unknown;
  action: unknown;
  metadata?: Record<string, any>;
};

export type RecommendationListInput = {
  viewerId: string;
  surface: unknown;
  entityType: unknown;
  limit?: unknown;
  query?: unknown;
  includeDebug?: boolean;
};

const normalizeLimit = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(n)));
};

const startOfUtcDay = (at = new Date()) =>
  new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));

const normalizeManualAction = (value: unknown): RecoManualAction | null => {
  const action = String(value || '').trim().toLowerCase();
  if (action === 'boost' || action === 'pin' || action === 'exclude' || action === 'shadow') {
    return action;
  }
  return null;
};

const normalizeFeedbackAction = (value: unknown): RecoFeedbackAction | null => {
  const action = String(value || '').trim().toLowerCase();
  if (action === 'click' || action === 'follow' || action === 'dismiss' || action === 'hide' || action === 'report') {
    return action;
  }
  return null;
};

const safeText = (value: unknown) => String(value || '').trim();
const safeLower = (value: unknown) => safeText(value).toLowerCase();

const buildConfigCacheKey = (surface: RecoSurface, entityType: RecoEntityType) =>
  `${RECO_CONFIG_CACHE_PREFIX}${surface}:${entityType}`;

const buildRulesCacheKey = (surface: RecoSurface, entityType: RecoEntityType) =>
  `${RECO_RULES_CACHE_PREFIX}${surface}:${entityType}`;

const normalizeRecoConfigRecord = (record: any): EffectiveRecoConfig => {
  const surface = normalizeSurface(record?.surface);
  const entityType = normalizeEntityType(record?.entityType);
  const defaults = defaultRecoConfig(surface, entityType);
  return {
    surface,
    entityType,
    mode: normalizeRecoMode(record?.mode),
    enabled: typeof record?.enabled === 'boolean' ? record.enabled : defaults.enabled,
    weights: normalizeRecoWeights(record?.weights as any),
    gating: normalizeRecoGating(record?.gating as any),
    penalties: normalizeRecoPenalties(record?.penalties as any),
    diversity: normalizeRecoDiversity(record?.diversity as any),
    coldStart: normalizeRecoColdStart(record?.coldStart as any),
    notes: typeof record?.notes === 'string' ? record.notes : defaults.notes,
    createdAt: record?.createdAt,
    updatedAt: record?.updatedAt
  };
};

export const invalidateRecoCaches = (prefix?: string) => {
  if (prefix) return recoCache.invalidateByPrefix(prefix);
  return recoCache.invalidateByPrefix('reco:');
};

const ensureRecoConfig = async (surface: RecoSurface, entityType: RecoEntityType): Promise<EffectiveRecoConfig> => {
  const cacheKey = buildConfigCacheKey(surface, entityType);
  const cached = recoCache.get<EffectiveRecoConfig>(cacheKey);
  if (cached) return cached;

  const existing = await prisma.recoConfig.findUnique({
    where: {
      surface_entityType: {
        surface,
        entityType
      }
    }
  });

  if (existing) {
    const normalized = normalizeRecoConfigRecord(existing);
    recoCache.set(cacheKey, normalized, RECO_CONFIG_TTL_MS);
    return normalized;
  }

  const defaults = defaultRecoConfig(surface, entityType);
  const created = await prisma.recoConfig.create({
    data: {
      surface,
      entityType,
      mode: defaults.mode,
      enabled: defaults.enabled,
      weights: defaults.weights as any,
      gating: defaults.gating as any,
      penalties: defaults.penalties as any,
      diversity: defaults.diversity as any,
      coldStart: defaults.coldStart as any,
      notes: defaults.notes
    }
  });

  const normalized = normalizeRecoConfigRecord(created);
  recoCache.set(cacheKey, normalized, RECO_CONFIG_TTL_MS);
  return normalized;
};

export const getRecoConfig = async (input?: {
  surface?: unknown;
  entityType?: unknown;
}) => {
  const surfaceRaw = input?.surface;
  const entityTypeRaw = input?.entityType;

  if (surfaceRaw && entityTypeRaw) {
    return ensureRecoConfig(normalizeSurface(surfaceRaw), normalizeEntityType(entityTypeRaw));
  }

  const surfaces: RecoSurface[] = ['member_home', 'who_to_follow', 'search_suggest', 'directory'];
  const entityTypes: RecoEntityType[] = ['freelancer', 'client', 'page'];
  const matrix = await Promise.all(
    surfaces.flatMap((surface) => entityTypes.map((entityType) => ensureRecoConfig(surface, entityType)))
  );
  return matrix;
};

export const updateRecoConfig = async (input: {
  surface: unknown;
  entityType: unknown;
  mode?: unknown;
  enabled?: unknown;
  weights?: any;
  gating?: any;
  penalties?: any;
  diversity?: any;
  coldStart?: any;
  notes?: unknown;
  updatedBy?: string;
}) => {
  const surface = normalizeSurface(input.surface);
  const entityType = normalizeEntityType(input.entityType);
  const existing = await ensureRecoConfig(surface, entityType);

  const mode = normalizeRecoMode(input.mode ?? existing.mode);
  const enabled = typeof input.enabled === 'boolean' ? input.enabled : existing.enabled;
  const weights = normalizeRecoWeights(input.weights ?? existing.weights);
  const gating = normalizeRecoGating(input.gating ?? existing.gating);
  const penalties = normalizeRecoPenalties(input.penalties ?? existing.penalties);
  const diversity = normalizeRecoDiversity(input.diversity ?? existing.diversity);
  const coldStart = normalizeRecoColdStart(input.coldStart ?? existing.coldStart);
  const notes =
    typeof input.notes === 'string'
      ? input.notes.trim() || null
      : typeof existing.notes === 'string'
        ? existing.notes
        : null;

  const updated = await prisma.recoConfig.upsert({
    where: {
      surface_entityType: {
        surface,
        entityType
      }
    },
    create: {
      surface,
      entityType,
      mode,
      enabled,
      weights: weights as any,
      gating: gating as any,
      penalties: penalties as any,
      diversity: diversity as any,
      coldStart: coldStart as any,
      notes,
      updatedBy: input.updatedBy || null
    },
    update: {
      mode,
      enabled,
      weights: weights as any,
      gating: gating as any,
      penalties: penalties as any,
      diversity: diversity as any,
      coldStart: coldStart as any,
      notes,
      updatedBy: input.updatedBy || null
    }
  });

  invalidateRecoCaches(buildConfigCacheKey(surface, entityType));
  invalidateRecoCaches(buildRulesCacheKey(surface, entityType));
  return normalizeRecoConfigRecord(updated);
};

const listActiveManualRules = async (surface: RecoSurface, entityType: RecoEntityType) => {
  const cacheKey = buildRulesCacheKey(surface, entityType);
  const cached = recoCache.get<any[]>(cacheKey);
  if (cached) return cached;

  const now = new Date();
  const rules = await prisma.recoManualRule.findMany({
    where: {
      isActive: true,
      surface: { in: [surface, '*'] },
      entityType: { in: [entityType, '*'] },
      OR: [
        { startAt: null, endAt: null },
        { startAt: { lte: now }, endAt: null },
        { startAt: null, endAt: { gte: now } },
        { startAt: { lte: now }, endAt: { gte: now } }
      ]
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }]
  });
  recoCache.set(cacheKey, rules, RECO_RULES_TTL_MS);
  return rules;
};

export const listRecoRules = async (input?: {
  surface?: unknown;
  entityType?: unknown;
  action?: unknown;
  includeInactive?: unknown;
}) => {
  const surface = input?.surface ? safeLower(input.surface) : '';
  const entityType = input?.entityType ? safeLower(input.entityType) : '';
  const action = input?.action ? safeLower(input.action) : '';
  const includeInactive = input?.includeInactive === true || String(input?.includeInactive || '') === 'true';
  const where: Record<string, any> = {};
  if (surface) where.surface = surface;
  if (entityType) where.entityType = entityType;
  if (action) where.action = action;
  if (!includeInactive) where.isActive = true;
  return prisma.recoManualRule.findMany({
    where,
    orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }]
  });
};

const normalizeRuleValue = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const createRecoRule = async (input: {
  entityType?: unknown;
  entityId?: unknown;
  action?: unknown;
  value?: unknown;
  priority?: unknown;
  surface?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  isActive?: unknown;
  metadata?: any;
  note?: unknown;
  createdBy?: string;
}) => {
  const action = normalizeManualAction(input.action);
  if (!action) throw new Error('Invalid manual action');

  const entityType = safeLower(input.entityType || '*') || '*';
  const surface = safeLower(input.surface || '*') || '*';
  const entityId = safeText(input.entityId || '*') || '*';
  const priorityRaw = Number(input.priority);
  const priority = Number.isFinite(priorityRaw) ? Math.max(1, Math.floor(priorityRaw)) : 100;
  const parsedStartAt = input.startAt ? new Date(String(input.startAt)) : null;
  const parsedEndAt = input.endAt ? new Date(String(input.endAt)) : null;
  const startAt = parsedStartAt && !Number.isNaN(parsedStartAt.getTime()) ? parsedStartAt : null;
  const endAt = parsedEndAt && !Number.isNaN(parsedEndAt.getTime()) ? parsedEndAt : null;
  if (startAt && endAt && startAt > endAt) {
    throw new Error('startAt cannot be after endAt');
  }

  const created = await prisma.recoManualRule.create({
    data: {
      entityType,
      entityId,
      action,
      value: normalizeRuleValue(input.value),
      priority,
      surface,
      startAt,
      endAt,
      isActive: input.isActive === false ? false : true,
      metadata: (input.metadata || null) as any,
      note: safeText(input.note) || null,
      createdBy: input.createdBy || null,
      updatedBy: input.createdBy || null
    }
  });

  invalidateRecoCaches(RECO_RULES_CACHE_PREFIX);
  return created;
};

export const updateRecoRule = async (
  id: string,
  input: {
    entityType?: unknown;
    entityId?: unknown;
    action?: unknown;
    value?: unknown;
    priority?: unknown;
    surface?: unknown;
    startAt?: unknown;
    endAt?: unknown;
    isActive?: unknown;
    metadata?: any;
    note?: unknown;
    updatedBy?: string;
  }
) => {
  const existing = await prisma.recoManualRule.findUnique({ where: { id } });
  if (!existing) throw new Error('Rule not found');

  const action = input.action === undefined ? existing.action : normalizeManualAction(input.action);
  if (!action) throw new Error('Invalid manual action');

  const entityType = input.entityType === undefined ? existing.entityType : safeLower(input.entityType || '*') || '*';
  const surface = input.surface === undefined ? existing.surface : safeLower(input.surface || '*') || '*';
  const entityId = input.entityId === undefined ? existing.entityId : safeText(input.entityId || '*') || '*';
  const priority =
    input.priority === undefined
      ? existing.priority
      : Math.max(1, Math.floor(Number.isFinite(Number(input.priority)) ? Number(input.priority) : existing.priority));
  const startAt =
    input.startAt === undefined
      ? existing.startAt
      : input.startAt
        ? new Date(String(input.startAt))
        : null;
  const endAt =
    input.endAt === undefined
      ? existing.endAt
      : input.endAt
        ? new Date(String(input.endAt))
        : null;
  if (startAt && endAt && startAt > endAt) {
    throw new Error('startAt cannot be after endAt');
  }

  const updated = await prisma.recoManualRule.update({
    where: { id },
    data: {
      entityType,
      entityId,
      action,
      value: input.value === undefined ? existing.value : normalizeRuleValue(input.value),
      priority,
      surface,
      startAt: startAt && !Number.isNaN(startAt.getTime()) ? startAt : null,
      endAt: endAt && !Number.isNaN(endAt.getTime()) ? endAt : null,
      isActive: input.isActive === undefined ? existing.isActive : Boolean(input.isActive),
      metadata: input.metadata === undefined ? existing.metadata : (input.metadata || null),
      note: input.note === undefined ? existing.note : safeText(input.note) || null,
      updatedBy: input.updatedBy || null
    }
  });

  invalidateRecoCaches(RECO_RULES_CACHE_PREFIX);
  return updated;
};

export const deleteRecoRule = async (id: string) => {
  const existing = await prisma.recoManualRule.findUnique({ where: { id } });
  if (!existing) return null;
  await prisma.recoManualRule.delete({ where: { id } });
  invalidateRecoCaches(RECO_RULES_CACHE_PREFIX);
  return existing;
};

const toIsoDay = (date: Date) => startOfUtcDay(date);

const buildCountMap = (entries: Array<{ key: string; value: number }>) => {
  const map = new Map<string, number>();
  entries.forEach((entry) => map.set(entry.key, (map.get(entry.key) || 0) + entry.value));
  return map;
};

const buildProfileLinks = (profile: any): string[] =>
  [profile?.portfolioUrl, profile?.githubUrl, profile?.linkedinUrl, profile?.websiteUrl]
    .map((item) => String(item || '').trim())
    .filter(Boolean);

const normalizeRole = (value: unknown) => safeLower(value).toUpperCase();

const deriveCategory = (input: {
  preferred?: string | null;
  fallback?: string | null;
  role?: string | null;
}) => {
  const preferred = safeLower(input.preferred);
  if (preferred) return preferred;
  const fallback = safeLower(input.fallback);
  if (fallback) return fallback;
  const role = safeLower(input.role);
  return role || 'general';
};

const normalizeCandidatePoolSize = (limit: number) =>
  Math.max(CANDIDATE_MIN_POOL, Math.min(300, limit * CANDIDATE_MULTIPLIER));

const countOverlap = (left: Set<string>, right: Set<string>) => {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  left.forEach((item) => {
    if (right.has(item)) overlap += 1;
  });
  return overlap;
};

const parsePortfolioFlag = (value: any) => {
  if (!value) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
};

const extractRecentViolationSignals = (
  violations: Array<{ type: string; severity: string | null; createdAt: Date }>,
  config: EffectiveRecoConfig
) => {
  const severeSeverity = new Set(config.gating.severeViolationSeverities.map((item) => safeLower(item)));
  const severeType = new Set(config.gating.severeViolationTypes.map((item) => safeLower(item)));
  let severeViolation = false;
  let spamSignals = 0;
  let disputeSignals = 0;

  violations.forEach((violation) => {
    const type = safeLower(violation.type);
    const severity = safeLower(violation.severity);
    if (severeSeverity.has(severity) || severeType.has(type)) {
      severeViolation = true;
    }
    if (type.includes('spam') || type.includes('bot') || type.includes('fraud')) {
      spamSignals += 1;
    }
    if (type.includes('dispute') || type.includes('refund')) {
      disputeSignals += 1;
    }
  });

  return {
    severeViolation,
    spamSignals: clamp01(spamSignals / 3),
    disputeSignals
  };
};

const getViewerContext = async (viewerId: string, query?: string): Promise<ViewerContext> => {
  const now = new Date();
  const lookback = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const hideDismissLookback = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [viewer, followings, pageFollowings, blocks, recentPosts, followedUsers, followedPages, feedback] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: viewerId },
        select: {
          id: true,
          country: true,
          profile: {
            select: {
              skills: true,
              languages: true,
              location: true
            }
          }
        }
      }),
      prisma.userFollow.findMany({
        where: { followerId: viewerId },
        select: { followeeId: true }
      }),
      prisma.communityBusinessPageFollower.findMany({
        where: { userId: viewerId },
        select: { pageId: true }
      }),
      prisma.userBlock.findMany({
        where: {
          OR: [{ blockerId: viewerId }, { blockedId: viewerId }]
        },
        select: {
          blockerId: true,
          blockedId: true
        }
      }),
      prisma.communityPost.findMany({
        where: {
          authorId: viewerId,
          createdAt: { gte: lookback }
        },
        select: {
          tags: true,
          topic: true,
          location: true
        },
        take: 60,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.userFollow.findMany({
        where: { followerId: viewerId },
        select: {
          followee: {
            select: {
              id: true,
              country: true,
              profile: {
                select: {
                  skills: true,
                  languages: true,
                  location: true
                }
              }
            }
          }
        },
        take: 200
      }),
      prisma.communityBusinessPageFollower.findMany({
        where: { userId: viewerId },
        select: {
          page: {
            select: {
              id: true,
              category: true,
              industry: true,
              location: true,
              tagline: true
            }
          }
        },
        take: 100
      }),
      prisma.recoFeedbackLog.findMany({
        where: {
          viewerId,
          action: { in: ['dismiss', 'hide'] },
          createdAt: { gte: hideDismissLookback }
        },
        select: {
          entityType: true,
          entityId: true
        },
        take: 500
      })
    ]);

  const viewerFollowingUserIds = new Set<string>(
    followings.map((row) => String(row.followeeId || '')).filter(Boolean)
  );
  const viewerFollowedPageIds = new Set<string>(
    pageFollowings.map((row) => String(row.pageId || '')).filter(Boolean)
  );

  const blockedUserIds = new Set<string>();
  blocks.forEach((row) => {
    if (row.blockerId === viewerId && row.blockedId) blockedUserIds.add(row.blockedId);
    if (row.blockedId === viewerId && row.blockerId) blockedUserIds.add(row.blockerId);
  });

  const dismissedKeys = new Set<string>(
    feedback.map((row) => `${safeLower(row.entityType)}:${safeText(row.entityId)}`)
  );

  const tokens: string[] = [];
  const profileSkills = viewer?.profile?.skills || [];
  const profileLanguages = viewer?.profile?.languages || [];
  const profileLocation = viewer?.profile?.location || viewer?.country || '';
  tokens.push(...profileSkills, ...profileLanguages, profileLocation);

  recentPosts.forEach((post) => {
    tokens.push(...(post.tags || []), post.topic || '', post.location || '');
  });

  followedUsers.forEach((entry) => {
    tokens.push(
      ...(entry.followee?.profile?.skills || []),
      ...(entry.followee?.profile?.languages || []),
      entry.followee?.profile?.location || '',
      entry.followee?.country || ''
    );
  });

  followedPages.forEach((entry) => {
    tokens.push(
      entry.page?.category || '',
      entry.page?.industry || '',
      entry.page?.location || '',
      entry.page?.tagline || ''
    );
  });

  if (query) tokens.push(query);

  const viewerInterestTokens = normalizeTokens(tokens);
  return {
    viewerId,
    viewerLocation: safeLower(profileLocation),
    viewerLanguages: normalizeTokens(profileLanguages),
    viewerInterestTokens,
    viewerFollowingUserIds,
    viewerFollowedPageIds,
    blockedUserIds,
    dismissedKeys,
    hasStrongSignals: viewerInterestTokens.size >= 6
  };
};

const getReportRateMap = async (entityType: RecoEntityType, entityIds: string[]) => {
  if (!entityIds.length) return new Map<string, number>();
  const since = new Date(Date.now() - REPORT_RATE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [reports, impressions] = await Promise.all([
    prisma.recoFeedbackLog.groupBy({
      by: ['entityId'],
      where: {
        entityType,
        entityId: { in: entityIds },
        action: 'report',
        createdAt: { gte: since }
      },
      _count: { _all: true }
    }),
    prisma.recoImpressionLog.groupBy({
      by: ['entityId'],
      where: {
        entityType,
        entityId: { in: entityIds },
        shownAtDay: { gte: startOfUtcDay(since) }
      },
      _sum: { count: true }
    })
  ]);

  const reportCountMap = buildCountMap(
    reports.map((row) => ({ key: row.entityId, value: row._count._all || 0 }))
  );
  const impressionCountMap = buildCountMap(
    impressions.map((row) => ({ key: row.entityId, value: Number(row._sum.count || 0) }))
  );

  const output = new Map<string, number>();
  entityIds.forEach((id) => {
    const reportCount = reportCountMap.get(id) || 0;
    const impressionCount = impressionCountMap.get(id) || 0;
    output.set(id, ratio(reportCount, Math.max(impressionCount, 1)));
  });
  return output;
};

const getViewerFrequencyMap = async (
  viewerId: string,
  entityType: RecoEntityType,
  surface: RecoSurface
): Promise<Map<string, number>> => {
  const today = toIsoDay(new Date());
  const rows = await prisma.recoImpressionLog.findMany({
    where: {
      viewerId,
      entityType,
      surface,
      shownAtDay: { gte: today }
    },
    select: {
      entityId: true,
      count: true
    }
  });
  return buildCountMap(rows.map((row) => ({ key: row.entityId, value: row.count })));
};

const getUserViolationMap = async (
  userIds: string[],
  config: EffectiveRecoConfig
): Promise<Map<string, Array<{ type: string; severity: string | null; createdAt: Date }>>> => {
  if (!userIds.length) return new Map();
  const since = new Date(
    Date.now() - Math.max(1, config.gating.violationLookbackDays) * 24 * 60 * 60 * 1000
  );
  const rows = await prisma.accountViolation.findMany({
    where: {
      userId: { in: userIds },
      createdAt: { gte: since }
    },
    select: {
      userId: true,
      type: true,
      severity: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' }
  });

  const map = new Map<string, Array<{ type: string; severity: string | null; createdAt: Date }>>();
  rows.forEach((row) => {
    const list = map.get(row.userId) || [];
    list.push({ type: row.type, severity: row.severity, createdAt: row.createdAt });
    map.set(row.userId, list);
  });
  return map;
};

const loadFreelancerCandidates = async (input: {
  viewer: ViewerContext;
  config: EffectiveRecoConfig;
  surface: RecoSurface;
  limit: number;
  query: string;
  entityIds?: string[];
}): Promise<CandidateRecord[]> => {
  const { viewer, config, surface, limit, query } = input;
  const poolSize = normalizeCandidatePoolSize(limit);
  const idFilter = input.entityIds?.length ? { in: input.entityIds } : undefined;

  const users = await prisma.user.findMany({
    where: {
      id: idFilter ? idFilter : { not: viewer.viewerId },
      role: Role.FREELANCER,
      ...(idFilter ? {} : { id: { not: viewer.viewerId } }),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { username: { contains: query, mode: 'insensitive' } },
              { profile: { bio: { contains: query, mode: 'insensitive' } } }
            ]
          }
        : {})
    },
    select: {
      id: true,
      name: true,
      username: true,
      avatar: true,
      role: true,
      country: true,
      isActive: true,
      isVerified: true,
      kycStatus: true,
      createdAt: true,
      lastLoginAt: true,
      lastSeenAt: true,
      profile: {
        select: {
          bio: true,
          location: true,
          skills: true,
          languages: true,
          portfolio: true,
          portfolioUrl: true,
          githubUrl: true,
          linkedinUrl: true,
          websiteUrl: true,
          rating: true,
          completedJobs: true,
          responseRate: true
        }
      },
      gigs: {
        where: { isActive: true },
        select: {
          categoryId: true,
          subcategory: true,
          tags: true,
          updatedAt: true
        },
        orderBy: { updatedAt: 'desc' },
        take: 8
      }
    },
    take: idFilter ? input.entityIds!.length : poolSize
  });

  const userIds = users.map((user) => user.id);
  const [violationMap, reportRateMap, viewerFrequencyMap, mutualFollowRows, reverseFollowRows, profileViewRows, orderGroupRows] =
    await Promise.all([
      getUserViolationMap(userIds, config),
      getReportRateMap('freelancer', userIds),
      getViewerFrequencyMap(viewer.viewerId, 'freelancer', surface),
      viewer.viewerFollowingUserIds.size
        ? prisma.userFollow.groupBy({
            by: ['followeeId'],
            where: {
              followeeId: { in: userIds },
              followerId: { in: Array.from(viewer.viewerFollowingUserIds) }
            },
            _count: { _all: true }
          })
        : Promise.resolve([] as Array<{ followeeId: string; _count: { _all: number } }>),
      prisma.userFollow.findMany({
        where: {
          followerId: { in: userIds },
          followeeId: viewer.viewerId
        },
        select: { followerId: true }
      }),
      prisma.profileView.groupBy({
        by: ['viewedUserId'],
        where: {
          viewerId: viewer.viewerId,
          viewedUserId: { in: userIds },
          createdAt: { gte: new Date(Date.now() - INTERACTION_WINDOW_DAYS * 24 * 60 * 60 * 1000) }
        },
        _count: { _all: true }
      }),
      prisma.order.groupBy({
        by: ['freelancerId', 'status'],
        where: {
          freelancerId: { in: userIds }
        },
        _count: { _all: true }
      })
    ]);

  const mutualMap: StringMapNumber = buildCountMap(
    mutualFollowRows.map((row) => ({ key: row.followeeId, value: row._count._all || 0 }))
  );
  const reverseFollowSet = new Set(reverseFollowRows.map((row) => row.followerId));
  const profileViewMap: StringMapNumber = buildCountMap(
    profileViewRows.map((row) => ({ key: row.viewedUserId, value: row._count._all || 0 }))
  );

  const orderStatsMap = new Map<string, { total: number; completed: number; cancelled: number; disputed: number }>();
  orderGroupRows.forEach((row) => {
    const stats = orderStatsMap.get(row.freelancerId) || {
      total: 0,
      completed: 0,
      cancelled: 0,
      disputed: 0
    };
    const count = row._count._all || 0;
    stats.total += count;
    if (row.status === 'COMPLETED') stats.completed += count;
    if (row.status === 'CANCELLED') stats.cancelled += count;
    if (row.status === 'DISPUTED' || row.status === 'REFUNDED') stats.disputed += count;
    orderStatsMap.set(row.freelancerId, stats);
  });

  return users.map((user) => {
    const profile = user.profile;
    const links = buildProfileLinks(profile);
    const portfolioFlag = parsePortfolioFlag(profile?.portfolio);
    const profileCompleteness = computeProfileCompleteness({
      photo: user.avatar,
      bio: profile?.bio,
      location: profile?.location || user.country,
      skills: profile?.skills || [],
      links,
      hasPortfolio: portfolioFlag
    });
    const violations = violationMap.get(user.id) || [];
    const violationSignals = extractRecentViolationSignals(violations, config);
    const orderStats = orderStatsMap.get(user.id) || {
      total: 0,
      completed: 0,
      cancelled: 0,
      disputed: 0
    };
    const ratingScore = clamp01(Number(profile?.rating || 0) / 5);
    const completedScore = clamp01(Number(profile?.completedJobs || orderStats.completed || 0) / 25);
    const successScore = clamp01(ratio(orderStats.completed, Math.max(orderStats.total, 1)));
    const cancellationPenalty = clamp01(ratio(orderStats.cancelled, Math.max(orderStats.total, 1)));
    const disputePenalty = clamp01(ratio(orderStats.disputed, Math.max(orderStats.total, 1)));
    const latestGigUpdate = user.gigs?.[0]?.updatedAt || null;
    const tags = [
      ...(profile?.skills || []),
      ...(profile?.languages || []),
      ...(user.gigs || []).flatMap((gig) => [gig.categoryId || '', gig.subcategory || '', ...(gig.tags || [])])
    ];

    return {
      entityType: 'freelancer' as const,
      entityId: user.id,
      displayName: safeText(user.name) || safeText(user.username) || 'Freelancer',
      username: user.username || null,
      avatar: user.avatar || null,
      headline: safeText(profile?.bio || '').slice(0, 160) || null,
      category: deriveCategory({
        preferred: user.gigs?.[0]?.subcategory || user.gigs?.[0]?.categoryId,
        role: 'freelancer'
      }),
      clusterKey: deriveCategory({
        preferred: user.gigs?.[0]?.subcategory,
        fallback: user.gigs?.[0]?.categoryId,
        role: 'freelancer'
      }),
      location: safeLower(profile?.location || user.country),
      tags: normalizeTokens(tags).size ? Array.from(normalizeTokens(tags)) : [],
      languages: Array.from(normalizeTokens(profile?.languages || [])),
      isActive: Boolean(user.isActive),
      isVerified: Boolean(user.isVerified),
      kycVerified: safeLower(user.kycStatus) === 'verified',
      accountAgeDays: daysSince(user.createdAt),
      profileCompleteness,
      lastActiveAt: user.lastSeenAt || user.lastLoginAt || null,
      activityRefAt: latestGigUpdate,
      activityCadenceScore: user.gigs?.length ? clamp01(user.gigs.length / 8) : 0,
      alreadyFollowing: viewer.viewerFollowingUserIds.has(user.id),
      blocked: viewer.blockedUserIds.has(user.id),
      severeViolation: violationSignals.severeViolation,
      reportRate: reportRateMap.get(user.id) || 0,
      spamSignals: violationSignals.spamSignals,
      social: {
        mutualCount: mutualMap.get(user.id) || 0,
        reverseFollow: reverseFollowSet.has(user.id),
        interactionCount: profileViewMap.get(user.id) || 0
      },
      performance: {
        ratingScore,
        completedScore,
        successScore,
        disputePenalty,
        cancellationPenalty,
        engagementScore: clamp01(Number(profile?.responseRate || 0) / 100),
        consistencyScore: clamp01((viewerFrequencyMap.get(user.id) || 0) / Math.max(1, config.gating.maxFrequencyPerViewerPerDay))
      },
      extra: {
        role: normalizeRole(user.role),
        frequencyToday: viewerFrequencyMap.get(user.id) || 0
      }
    };
  });
};

const loadClientCandidates = async (input: {
  viewer: ViewerContext;
  config: EffectiveRecoConfig;
  surface: RecoSurface;
  limit: number;
  query: string;
  entityIds?: string[];
}): Promise<CandidateRecord[]> => {
  const { viewer, config, surface, limit, query } = input;
  const poolSize = normalizeCandidatePoolSize(limit);
  const idFilter = input.entityIds?.length ? { in: input.entityIds } : undefined;

  const users = await prisma.user.findMany({
    where: {
      id: idFilter ? idFilter : { not: viewer.viewerId },
      role: { in: [Role.CLIENT, Role.EMPLOYER] },
      ...(idFilter ? {} : { id: { not: viewer.viewerId } }),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { username: { contains: query, mode: 'insensitive' } },
              { profile: { bio: { contains: query, mode: 'insensitive' } } }
            ]
          }
        : {})
    },
    select: {
      id: true,
      name: true,
      username: true,
      avatar: true,
      role: true,
      country: true,
      isActive: true,
      isVerified: true,
      kycStatus: true,
      createdAt: true,
      lastLoginAt: true,
      lastSeenAt: true,
      profile: {
        select: {
          bio: true,
          location: true,
          skills: true,
          languages: true,
          portfolio: true,
          portfolioUrl: true,
          githubUrl: true,
          linkedinUrl: true,
          websiteUrl: true
        }
      },
      jobs: {
        select: {
          categoryId: true,
          subcategory: true,
          tags: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: 8
      }
    },
    take: idFilter ? input.entityIds!.length : poolSize
  });

  const userIds = users.map((user) => user.id);
  const [violationMap, reportRateMap, viewerFrequencyMap, mutualFollowRows, reverseFollowRows, orderGroupRows, jobActivityRows] =
    await Promise.all([
      getUserViolationMap(userIds, config),
      getReportRateMap('client', userIds),
      getViewerFrequencyMap(viewer.viewerId, 'client', surface),
      viewer.viewerFollowingUserIds.size
        ? prisma.userFollow.groupBy({
            by: ['followeeId'],
            where: {
              followeeId: { in: userIds },
              followerId: { in: Array.from(viewer.viewerFollowingUserIds) }
            },
            _count: { _all: true }
          })
        : Promise.resolve([] as Array<{ followeeId: string; _count: { _all: number } }>),
      prisma.userFollow.findMany({
        where: {
          followerId: { in: userIds },
          followeeId: viewer.viewerId
        },
        select: { followerId: true }
      }),
      prisma.order.groupBy({
        by: ['clientId', 'status'],
        where: {
          clientId: { in: userIds }
        },
        _count: { _all: true }
      }),
      prisma.job.groupBy({
        by: ['clientId'],
        where: {
          clientId: { in: userIds }
        },
        _count: { _all: true },
        _max: { createdAt: true }
      })
    ]);

  const mutualMap: StringMapNumber = buildCountMap(
    mutualFollowRows.map((row) => ({ key: row.followeeId, value: row._count._all || 0 }))
  );
  const reverseFollowSet = new Set(reverseFollowRows.map((row) => row.followerId));
  const ordersMap = new Map<string, { total: number; completed: number; disputed: number }>();
  orderGroupRows.forEach((row) => {
    const stats = ordersMap.get(row.clientId) || { total: 0, completed: 0, disputed: 0 };
    const count = row._count._all || 0;
    stats.total += count;
    if (row.status === 'COMPLETED') stats.completed += count;
    if (row.status === 'DISPUTED' || row.status === 'REFUNDED' || row.status === 'CANCELLED') {
      stats.disputed += count;
    }
    ordersMap.set(row.clientId, stats);
  });
  const jobMap = new Map<string, { total: number; latestCreatedAt: Date | null }>();
  jobActivityRows.forEach((row) => {
    jobMap.set(row.clientId, {
      total: row._count._all || 0,
      latestCreatedAt: row._max.createdAt || null
    });
  });

  return users.map((user) => {
    const profile = user.profile;
    const links = buildProfileLinks(profile);
    const profileCompleteness = computeProfileCompleteness({
      photo: user.avatar,
      bio: profile?.bio,
      location: profile?.location || user.country,
      skills: profile?.skills || [],
      links,
      hasPortfolio: parsePortfolioFlag(profile?.portfolio)
    });
    const violations = violationMap.get(user.id) || [];
    const violationSignals = extractRecentViolationSignals(violations, config);
    const orderStats = ordersMap.get(user.id) || { total: 0, completed: 0, disputed: 0 };
    const jobStats = jobMap.get(user.id) || { total: 0, latestCreatedAt: null };
    const hiringSuccess = clamp01(ratio(orderStats.completed, Math.max(orderStats.total, 1)));
    const disputePenalty = clamp01(ratio(orderStats.disputed, Math.max(orderStats.total, 1)));
    const tags = [
      ...(profile?.skills || []),
      ...(user.jobs || []).flatMap((job) => [job.categoryId || '', job.subcategory || '', ...(job.tags || [])])
    ];

    return {
      entityType: 'client' as const,
      entityId: user.id,
      displayName: safeText(user.name) || safeText(user.username) || 'Client',
      username: user.username || null,
      avatar: user.avatar || null,
      headline: safeText(profile?.bio || '').slice(0, 160) || null,
      category: deriveCategory({
        preferred: user.jobs?.[0]?.subcategory || user.jobs?.[0]?.categoryId,
        role: normalizeRole(user.role)
      }),
      clusterKey: deriveCategory({
        preferred: user.jobs?.[0]?.subcategory,
        fallback: user.jobs?.[0]?.categoryId,
        role: normalizeRole(user.role)
      }),
      location: safeLower(profile?.location || user.country),
      tags: Array.from(normalizeTokens(tags)),
      languages: Array.from(normalizeTokens(profile?.languages || [])),
      isActive: Boolean(user.isActive),
      isVerified: Boolean(user.isVerified),
      kycVerified: safeLower(user.kycStatus) === 'verified',
      accountAgeDays: daysSince(user.createdAt),
      profileCompleteness,
      lastActiveAt: user.lastSeenAt || user.lastLoginAt || null,
      activityRefAt: jobStats.latestCreatedAt,
      activityCadenceScore: clamp01((user.jobs?.length || 0) / 8),
      alreadyFollowing: viewer.viewerFollowingUserIds.has(user.id),
      blocked: viewer.blockedUserIds.has(user.id),
      severeViolation: violationSignals.severeViolation,
      reportRate: reportRateMap.get(user.id) || 0,
      spamSignals: violationSignals.spamSignals,
      social: {
        mutualCount: mutualMap.get(user.id) || 0,
        reverseFollow: reverseFollowSet.has(user.id),
        interactionCount: 0
      },
      performance: {
        ratingScore: 0,
        completedScore: clamp01((jobStats.total || 0) / 20),
        successScore: hiringSuccess,
        disputePenalty,
        cancellationPenalty: 0,
        engagementScore: clamp01((user.jobs?.length || 0) / 8),
        consistencyScore: clamp01((viewerFrequencyMap.get(user.id) || 0) / Math.max(1, config.gating.maxFrequencyPerViewerPerDay))
      },
      extra: {
        role: normalizeRole(user.role),
        frequencyToday: viewerFrequencyMap.get(user.id) || 0
      }
    };
  });
};

const loadPageCandidates = async (input: {
  viewer: ViewerContext;
  config: EffectiveRecoConfig;
  surface: RecoSurface;
  limit: number;
  query: string;
  entityIds?: string[];
}): Promise<CandidateRecord[]> => {
  const { viewer, config, surface, limit, query } = input;
  const poolSize = normalizeCandidatePoolSize(limit);
  const idFilter = input.entityIds?.length ? { in: input.entityIds } : undefined;

  const pages = await prisma.communityBusinessPage.findMany({
    where: {
      id: idFilter ? idFilter : undefined,
      status: 'active',
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { handle: { contains: query, mode: 'insensitive' } },
              { category: { contains: query, mode: 'insensitive' } },
              { industry: { contains: query, mode: 'insensitive' } }
            ]
          }
        : {})
    },
    select: {
      id: true,
      ownerId: true,
      name: true,
      handle: true,
      slug: true,
      tagline: true,
      category: true,
      description: true,
      industry: true,
      location: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      owner: {
        select: {
          id: true,
          isActive: true,
          isVerified: true,
          kycStatus: true,
          createdAt: true,
          lastLoginAt: true,
          lastSeenAt: true
        }
      },
      _count: {
        select: {
          followers: true,
          posts: true
        }
      }
    },
    take: idFilter ? input.entityIds!.length : poolSize,
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
  });

  const pageIds = pages.map((page) => page.id);
  const ownerIds = pages.map((page) => page.ownerId);
  const [ownerViolationMap, reportRateMap, viewerFrequencyMap, networkFollowersRows, pagePostAggRows, interactionRows] =
    await Promise.all([
      getUserViolationMap(ownerIds, config),
      getReportRateMap('page', pageIds),
      getViewerFrequencyMap(viewer.viewerId, 'page', surface),
      viewer.viewerFollowingUserIds.size
        ? prisma.communityBusinessPageFollower.groupBy({
            by: ['pageId'],
            where: {
              pageId: { in: pageIds },
              userId: { in: Array.from(viewer.viewerFollowingUserIds) }
            },
            _count: { _all: true }
          })
        : Promise.resolve([] as Array<{ pageId: string; _count: { _all: number } }>),
      prisma.communityPost.groupBy({
        by: ['businessPageId'],
        where: {
          businessPageId: { in: pageIds },
          status: 'active'
        },
        _count: { _all: true },
        _sum: {
          likesCount: true,
          viewsCount: true,
          sharesCount: true,
          repostsCount: true
        },
        _max: { createdAt: true }
      }),
      prisma.communityPostReaction.findMany({
        where: {
          userId: viewer.viewerId,
          post: {
            businessPageId: { in: pageIds }
          },
          createdAt: { gte: new Date(Date.now() - INTERACTION_WINDOW_DAYS * 24 * 60 * 60 * 1000) }
        },
        select: {
          post: {
            select: {
              businessPageId: true
            }
          }
        },
        take: 1000
      })
    ]);

  const networkFollowersMap: StringMapNumber = buildCountMap(
    networkFollowersRows.map((row) => ({ key: row.pageId, value: row._count._all || 0 }))
  );
  const postAggMap = new Map<
    string,
    {
      postCount: number;
      likes: number;
      views: number;
      shares: number;
      reposts: number;
      latestPostAt: Date | null;
    }
  >();
  pagePostAggRows.forEach((row) => {
    postAggMap.set(safeText(row.businessPageId), {
      postCount: row._count._all || 0,
      likes: Number(row._sum.likesCount || 0),
      views: Number(row._sum.viewsCount || 0),
      shares: Number(row._sum.sharesCount || 0),
      reposts: Number(row._sum.repostsCount || 0),
      latestPostAt: row._max.createdAt || null
    });
  });
  const interactionMap: StringMapNumber = buildCountMap(
    interactionRows
      .map((row) => safeText(row.post?.businessPageId))
      .filter(Boolean)
      .map((pageId) => ({ key: pageId, value: 1 }))
  );

  return pages.map((page) => {
    const ownerViolations = ownerViolationMap.get(page.ownerId) || [];
    const violationSignals = extractRecentViolationSignals(ownerViolations, config);
    const postAgg = postAggMap.get(page.id) || {
      postCount: 0,
      likes: 0,
      views: 0,
      shares: 0,
      reposts: 0,
      latestPostAt: null
    };
    const engagementRaw = postAgg.likes + postAgg.shares + postAgg.reposts;
    const engagementRate = postAgg.views > 0 ? engagementRaw / postAgg.views : engagementRaw / Math.max(1, postAgg.postCount * 10);
    const profileCompleteness = computeProfileCompleteness({
      photo: null,
      bio: page.description || page.tagline,
      location: page.location,
      skills: [page.category || '', page.industry || ''],
      links: [],
      hasPortfolio: postAgg.postCount > 0
    });
    const tags = [page.category || '', page.industry || '', page.tagline || '', page.location || ''];

    return {
      entityType: 'page' as const,
      entityId: page.id,
      displayName: page.name,
      username: page.handle || null,
      avatar: null,
      headline: safeText(page.tagline || page.description || '').slice(0, 160) || null,
      category: deriveCategory({ preferred: page.category, fallback: page.industry, role: 'page' }),
      clusterKey: deriveCategory({ preferred: page.category, fallback: page.industry, role: page.handle }),
      location: safeLower(page.location),
      tags: Array.from(normalizeTokens(tags)),
      languages: [],
      isActive: Boolean(page.owner?.isActive) && safeLower(page.status) === 'active',
      isVerified: Boolean(page.owner?.isVerified),
      kycVerified: safeLower(page.owner?.kycStatus) === 'verified',
      accountAgeDays: daysSince(page.createdAt),
      profileCompleteness,
      lastActiveAt: page.owner?.lastSeenAt || page.owner?.lastLoginAt || null,
      activityRefAt: postAgg.latestPostAt,
      activityCadenceScore: clamp01(postAgg.postCount / 20),
      alreadyFollowing: viewer.viewerFollowedPageIds.has(page.id),
      blocked: viewer.blockedUserIds.has(page.ownerId),
      severeViolation: violationSignals.severeViolation,
      reportRate: reportRateMap.get(page.id) || 0,
      spamSignals: violationSignals.spamSignals,
      social: {
        mutualCount: networkFollowersMap.get(page.id) || 0,
        reverseFollow: false,
        interactionCount: interactionMap.get(page.id) || 0
      },
      performance: {
        ratingScore: 0,
        completedScore: clamp01((page._count.followers || 0) / 500),
        successScore: 0,
        disputePenalty: clamp01(violationSignals.disputeSignals / 5),
        cancellationPenalty: 0,
        engagementScore: clamp01(engagementRate),
        consistencyScore: clamp01((page._count.posts || 0) / 25)
      },
      extra: {
        pageSlug: page.slug,
        pageHandle: page.handle,
        followersCount: page._count.followers || 0,
        postsCount: page._count.posts || 0,
        frequencyToday: viewerFrequencyMap.get(page.id) || 0
      }
    };
  });
};

const loadCandidates = async (input: {
  viewer: ViewerContext;
  config: EffectiveRecoConfig;
  surface: RecoSurface;
  entityType: RecoEntityType;
  limit: number;
  query: string;
  entityIds?: string[];
}) => {
  if (input.entityType === 'freelancer') return loadFreelancerCandidates(input);
  if (input.entityType === 'client') return loadClientCandidates(input);
  return loadPageCandidates(input);
};

const computeRelevanceScore = (
  candidate: CandidateRecord,
  viewer: ViewerContext,
  config: EffectiveRecoConfig
) => {
  const candidateTokens = normalizeTokens([
    ...candidate.tags,
    ...candidate.languages,
    candidate.location,
    candidate.category,
    candidate.clusterKey
  ]);
  const tokenScore = jaccardSimilarity(viewer.viewerInterestTokens, candidateTokens);
  const locationScore =
    viewer.viewerLocation && candidate.location
      ? viewer.viewerLocation === candidate.location
        ? 1
        : viewer.viewerLocation.includes(candidate.location) || candidate.location.includes(viewer.viewerLocation)
          ? 0.7
          : 0
      : 0;
  const languageOverlap = countOverlap(viewer.viewerLanguages, normalizeTokens(candidate.languages));
  const languageScore = clamp01(languageOverlap / Math.max(1, viewer.viewerLanguages.size));

  let coldStartBoost = 0;
  if (!viewer.hasStrongSignals && config.coldStart.enabled) {
    if (locationScore > 0.6) coldStartBoost += config.coldStart.regionBoost;
    if (tokenScore < 0.2 && candidate.category) coldStartBoost += config.coldStart.popularCategoryBoost;
  }

  return clamp01(0.72 * tokenScore + 0.18 * locationScore + 0.1 * languageScore + coldStartBoost);
};

const computeQualityScore = (candidate: CandidateRecord) => {
  const verificationScore =
    (candidate.isVerified ? 0.5 : 0) + (candidate.kycVerified ? 0.5 : 0);
  const trustScore = clamp01(candidate.accountAgeDays / 365);
  return clamp01(0.45 * candidate.profileCompleteness + 0.25 * verificationScore + 0.3 * trustScore);
};

const computeActivityScore = (candidate: CandidateRecord) => {
  const activePresence = recencyScore(candidate.lastActiveAt);
  const domainRecency = recencyScore(candidate.activityRefAt);
  return clamp01(0.45 * activePresence + 0.4 * domainRecency + 0.15 * candidate.activityCadenceScore);
};

const computeSocialScore = (candidate: CandidateRecord) => {
  const mutualScore = clamp01(candidate.social.mutualCount / 10);
  const reverseFollow = candidate.social.reverseFollow ? 1 : 0;
  const interactionScore = clamp01(candidate.social.interactionCount / 8);
  return clamp01(0.45 * mutualScore + 0.25 * reverseFollow + 0.3 * interactionScore);
};

const computePerformanceScore = (candidate: CandidateRecord) => {
  const positive =
    0.25 * candidate.performance.ratingScore +
    0.2 * candidate.performance.completedScore +
    0.2 * candidate.performance.successScore +
    0.2 * candidate.performance.engagementScore +
    0.15 * candidate.performance.consistencyScore;
  const negative = 0.6 * candidate.performance.disputePenalty + 0.4 * candidate.performance.cancellationPenalty;
  return clamp01(positive * (1 - clamp01(negative)));
};

const computeDiversityScore = (
  candidate: CandidateRecord,
  allCandidates: CandidateRecord[],
  viewer: ViewerContext
) => {
  const category = candidate.category || 'uncategorized';
  const sameCategoryCount = allCandidates.filter((item) => (item.category || 'uncategorized') === category).length;
  const rarity = clamp01(1 - ratio(Math.max(0, sameCategoryCount - 1), Math.max(1, allCandidates.length - 1)));
  const newCreator = candidate.accountAgeDays <= 30 ? 1 : candidate.accountAgeDays <= 120 ? 0.65 : 0.35;
  const localGlobalBlend =
    viewer.viewerLocation && candidate.location
      ? viewer.viewerLocation === candidate.location
        ? 1
        : 0.45
      : 0.6;
  return clamp01(0.55 * rarity + 0.25 * newCreator + 0.2 * localGlobalBlend);
};

const computeScoreBreakdown = (
  candidate: CandidateRecord,
  candidates: CandidateRecord[],
  viewer: ViewerContext,
  config: EffectiveRecoConfig
): ScoreBreakdown => {
  const relevance = computeRelevanceScore(candidate, viewer, config);
  const quality = computeQualityScore(candidate);
  const activity = computeActivityScore(candidate);
  const social = computeSocialScore(candidate);
  const performance = computePerformanceScore(candidate);
  const diversityBoost = computeDiversityScore(candidate, candidates, viewer);

  const baseScore = clamp01(
    config.weights.relevance * relevance +
      config.weights.quality * quality +
      config.weights.activity * activity +
      config.weights.social * social +
      config.weights.performance * performance +
      config.weights.diversityBoost * diversityBoost
  );

  return {
    relevance,
    quality,
    activity,
    social,
    performance,
    diversityBoost,
    baseScore,
    finalScore: baseScore
  };
};

const applyDiversityConstraints = (
  items: ScoredCandidate[],
  limit: number,
  config: EffectiveRecoConfig
) => {
  if (!items.length) return [];
  const maxPerCategory = Math.max(1, Math.floor(limit * config.diversity.maxCategoryShare));
  const maxPerCluster = Math.max(1, config.diversity.maxFromSameCluster);
  const categoryCount = new Map<string, number>();
  const clusterCount = new Map<string, number>();
  const selected: ScoredCandidate[] = [];
  const deferred: ScoredCandidate[] = [];

  for (const item of items) {
    const category = item.category || 'uncategorized';
    const cluster = item.clusterKey || category;
    const categoryUsed = categoryCount.get(category) || 0;
    const clusterUsed = clusterCount.get(cluster) || 0;
    const canUseCategory = categoryUsed < maxPerCategory;
    const canUseCluster = clusterUsed < maxPerCluster;
    if (canUseCategory && canUseCluster) {
      selected.push(item);
      categoryCount.set(category, categoryUsed + 1);
      clusterCount.set(cluster, clusterUsed + 1);
      if (selected.length >= limit) return selected.slice(0, limit);
      continue;
    }
    deferred.push(item);
  }

  for (const item of deferred) {
    selected.push(item);
    if (selected.length >= limit) break;
  }

  return selected.slice(0, limit);
};

const hydrateAccountPayload = (candidate: CandidateRecord) => ({
  id: candidate.entityId,
  entityType: candidate.entityType,
  name: candidate.displayName,
  username: candidate.username,
  avatar: candidate.avatar,
  headline: candidate.headline,
  category: candidate.category,
  clusterKey: candidate.clusterKey,
  location: candidate.location || null,
  tags: candidate.tags,
  languages: candidate.languages,
  isVerified: candidate.isVerified,
  kycVerified: candidate.kycVerified,
  isFollowing: candidate.alreadyFollowing,
  isActive: candidate.isActive,
  profileCompleteness: candidate.profileCompleteness,
  accountAgeDays: candidate.accountAgeDays,
  ...candidate.extra
});

const buildScoredCandidates = async (input: {
  viewerId: string;
  surface: RecoSurface;
  entityType: RecoEntityType;
  limit: number;
  query: string;
  entityIds?: string[];
  includeDebug?: boolean;
}) => {
  const { viewerId, surface, entityType, limit, query } = input;
  const config = await ensureRecoConfig(surface, entityType);
  if (!config.enabled) {
    return {
      config,
      generatedAt: new Date().toISOString(),
      items: [] as ScoredCandidate[]
    };
  }

  const viewer = await getViewerContext(viewerId, query);
  const rawCandidates = await loadCandidates({
    viewer,
    config,
    surface,
    entityType,
    limit,
    query,
    entityIds: input.entityIds
  });

  const scored: ScoredCandidate[] = rawCandidates.map((candidate) => {
    const baseBreakdown = computeScoreBreakdown(candidate, rawCandidates, viewer, config);
    const frequencyToday = Number(candidate.extra?.frequencyToday || 0);
    const dismissedKey = `${candidate.entityType}:${candidate.entityId}`;
    const extraReasons: string[] = [];

    if (frequencyToday >= config.gating.maxFrequencyPerViewerPerDay) {
      extraReasons.push('Reached max frequency for viewer today');
    }
    if (viewer.dismissedKeys.has(dismissedKey)) {
      extraReasons.push(`Viewer dismissed/hid in last ${config.gating.hideDismissLookbackDays} days`);
    }

    const eligibility = evaluateEligibilityGate({
      isActive: candidate.isActive,
      blocked: candidate.blocked,
      alreadyFollowing: candidate.alreadyFollowing,
      accountAgeDays: candidate.accountAgeDays,
      profileCompleteness: candidate.profileCompleteness,
      kycVerified: candidate.kycVerified,
      verified: candidate.isVerified,
      gating: config.gating,
      surface
    });

    const safety = evaluateSafetyGate({
      severeViolation: candidate.severeViolation,
      reportRate: candidate.reportRate,
      spamSignals: candidate.spamSignals,
      profileCompleteness: candidate.profileCompleteness,
      penalties: config.penalties,
      minProfileCompleteness: config.gating.minProfileCompleteness
    });

    const passed = eligibility.passed && safety.passed && extraReasons.length === 0;
    const totalPenalty = safety.penalties.totalPenalty;
    const finalScore = clamp01(baseBreakdown.baseScore * (1 - totalPenalty));

    return {
      entityType: candidate.entityType,
      entityId: candidate.entityId,
      surface,
      score: finalScore,
      pinnedRank: null,
      excluded: !passed,
      category: candidate.category,
      clusterKey: candidate.clusterKey,
      account: hydrateAccountPayload(candidate),
      gating: {
        passed: passed,
        reasons: [...eligibility.reasons, ...extraReasons]
      },
      safety,
      breakdown: {
        ...baseBreakdown,
        finalScore
      },
      manualApplied: []
    };
  });

  let kept = scored.filter((item) => !item.excluded);
  const rules = await listActiveManualRules(surface, entityType);
  if (config.mode !== 'auto' && rules.length > 0) {
    kept = applyManualRules<ScoredCandidate>({
      items: kept,
      rules: rules as any,
      getEntityId: (item) => item.entityId,
      getEntityType: (item) => item.entityType,
      getSurface: (item) => item.surface,
      getScore: (item) => item.score,
      setScore: (item, value) => {
        item.score = clamp01(value);
        item.breakdown.finalScore = item.score;
      },
      setPinnedRank: (item, rank) => {
        item.pinnedRank = rank;
      },
      pushManualInfo: (item, info) => {
        item.manualApplied.push(info);
      }
    });
    if (config.mode === 'manual') {
      const manuallyTouched = kept.filter((item) => item.manualApplied.length > 0);
      if (manuallyTouched.length) kept = manuallyTouched;
    }
  }

  kept.sort((left, right) => {
    const leftPin = left.pinnedRank ?? Number.POSITIVE_INFINITY;
    const rightPin = right.pinnedRank ?? Number.POSITIVE_INFINITY;
    if (leftPin !== rightPin) return leftPin - rightPin;
    return right.score - left.score;
  });

  const diversified = applyDiversityConstraints(kept, limit, config);
  return {
    config,
    generatedAt: new Date().toISOString(),
    items: diversified
  };
};

const logImpressions = async (
  viewerId: string,
  surface: RecoSurface,
  entityType: RecoEntityType,
  entityIds: string[]
) => {
  if (!entityIds.length) return;
  const shownAtDay = toIsoDay(new Date());
  await prisma.$transaction(
    entityIds.map((entityId) =>
      prisma.recoImpressionLog.upsert({
        where: {
          viewerId_entityType_entityId_surface_shownAtDay: {
            viewerId,
            entityType,
            entityId,
            surface,
            shownAtDay
          }
        },
        create: {
          viewerId,
          entityType,
          entityId,
          surface,
          shownAtDay,
          count: 1
        },
        update: {
          count: { increment: 1 }
        }
      })
    )
  );
};

export const getRecoAccounts = async (input: RecommendationListInput) => {
  const viewerId = safeText(input.viewerId);
  if (!viewerId) throw new Error('viewerId is required');

  const surface = normalizeSurface(input.surface);
  const entityType = normalizeEntityType(input.entityType);
  const limit = normalizeLimit(input.limit);
  const query = safeText(input.query).toLowerCase();
  const includeDebug = input.includeDebug === true;

  const result = await buildScoredCandidates({
    viewerId,
    surface,
    entityType,
    limit,
    query,
    includeDebug
  });

  await logImpressions(
    viewerId,
    surface,
    entityType,
    result.items.map((item) => item.entityId)
  );

  return {
    surface,
    entityType,
    mode: result.config.mode,
    generatedAt: result.generatedAt,
    items: result.items.map((item, index) => ({
      rank: index + 1,
      entityType: item.entityType,
      entityId: item.entityId,
      score: item.score,
      account: item.account,
      reasons: item.gating.reasons,
      ...(includeDebug
        ? {
            gating: item.gating,
            safety: item.safety,
            breakdown: item.breakdown,
            manualApplied: item.manualApplied
          }
        : {})
    }))
  };
};

export const submitRecoFeedback = async (input: RecommendationFeedbackInput) => {
  const surface = normalizeSurface(input.surface);
  const entityType = normalizeEntityType(input.entityType);
  const entityId = safeText(input.entityId);
  const action = normalizeFeedbackAction(input.action);
  if (!entityId) throw new Error('entityId is required');
  if (!action) throw new Error('Invalid feedback action');

  const payload = await prisma.recoFeedbackLog.create({
    data: {
      viewerId: safeText(input.viewerId) || null,
      surface,
      entityType,
      entityId,
      action,
      metadata: (input.metadata || null) as any
    }
  });

  if (payload.viewerId && (action === 'hide' || action === 'dismiss' || action === 'report')) {
    invalidateRecoCaches(`reco:${payload.viewerId}:`);
  }

  return payload;
};

export const getRecoAudit = async (input: {
  viewerId: string;
  surface: unknown;
  entityType: unknown;
  entityId: string;
}) => {
  const viewerId = safeText(input.viewerId);
  const entityId = safeText(input.entityId);
  if (!viewerId) throw new Error('viewerId is required');
  if (!entityId) throw new Error('entityId is required');

  const surface = normalizeSurface(input.surface);
  const entityType = normalizeEntityType(input.entityType);
  const result = await buildScoredCandidates({
    viewerId,
    surface,
    entityType,
    limit: 1,
    query: '',
    entityIds: [entityId],
    includeDebug: true
  });
  const item = result.items.find((entry) => entry.entityId === entityId) || null;
  if (item) {
    return {
      found: true,
      generatedAt: result.generatedAt,
      config: result.config,
      entityType,
      entityId,
      account: item.account,
      gates: item.gating,
      safety: item.safety,
      breakdown: item.breakdown,
      manualRulesApplied: item.manualApplied
    };
  }

  const config = await ensureRecoConfig(surface, entityType);
  return {
    found: false,
    generatedAt: result.generatedAt,
    config,
    entityType,
    entityId
  };
};

const sumMapValues = (map: Map<string, number>) => Array.from(map.values()).reduce((acc, value) => acc + value, 0);

export const getRecoAnalytics = async (input?: { days?: unknown }) => {
  const daysRaw = Number(input?.days);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(365, Math.floor(daysRaw))) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const sinceDay = toIsoDay(since);

  const [impressionGroups, feedbackGroups, topImpressions] = await Promise.all([
    prisma.recoImpressionLog.groupBy({
      by: ['surface', 'entityType'],
      where: {
        shownAtDay: { gte: sinceDay }
      },
      _sum: {
        count: true
      }
    }),
    prisma.recoFeedbackLog.groupBy({
      by: ['surface', 'entityType', 'action'],
      where: {
        createdAt: { gte: since }
      },
      _count: {
        _all: true
      }
    }),
    prisma.recoImpressionLog.groupBy({
      by: ['surface', 'entityType', 'entityId'],
      where: {
        shownAtDay: { gte: sinceDay }
      },
      _sum: {
        count: true
      }
    })
  ]);

  const keyOf = (surface: string, entityType: string) => `${surface}:${entityType}`;
  const impressionsMap = new Map<string, number>();
  impressionGroups.forEach((row) => {
    impressionsMap.set(keyOf(row.surface, row.entityType), Number(row._sum.count || 0));
  });

  const feedbackMap = new Map<string, Record<string, number>>();
  feedbackGroups.forEach((row) => {
    const key = keyOf(row.surface, row.entityType);
    const current = feedbackMap.get(key) || {};
    current[row.action] = (current[row.action] || 0) + (row._count._all || 0);
    feedbackMap.set(key, current);
  });

  const surfaceRows = Array.from(new Set([...impressionsMap.keys(), ...feedbackMap.keys()])).map((key) => {
    const [surface, entityType] = key.split(':');
    const impressions = impressionsMap.get(key) || 0;
    const feedback = feedbackMap.get(key) || {};
    const clicks = feedback.click || 0;
    const follows = feedback.follow || 0;
    const hides = feedback.hide || 0;
    const dismisses = feedback.dismiss || 0;
    const reports = feedback.report || 0;
    return {
      surface,
      entityType,
      impressions,
      clicks,
      follows,
      hides,
      dismisses,
      reports,
      ctr: impressions > 0 ? clamp01(clicks / impressions) : 0,
      followRate: impressions > 0 ? clamp01(follows / impressions) : 0,
      reportRate: impressions > 0 ? clamp01(reports / impressions) : 0
    };
  });

  const topEntities = topImpressions
    .map((row) => ({
      surface: row.surface,
      entityType: row.entityType,
      entityId: row.entityId,
      impressions: Number(row._sum.count || 0)
    }))
    .sort((left, right) => right.impressions - left.impressions)
    .slice(0, 50);

  const totalImpressions = sumMapValues(impressionsMap);
  const totalClicks = surfaceRows.reduce((acc, row) => acc + row.clicks, 0);
  const totalFollows = surfaceRows.reduce((acc, row) => acc + row.follows, 0);

  return {
    windowDays: days,
    generatedAt: new Date().toISOString(),
    totals: {
      impressions: totalImpressions,
      clicks: totalClicks,
      follows: totalFollows,
      ctr: totalImpressions > 0 ? clamp01(totalClicks / totalImpressions) : 0,
      followRate: totalImpressions > 0 ? clamp01(totalFollows / totalImpressions) : 0
    },
    bySurface: surfaceRows,
    topEntities
  };
};
