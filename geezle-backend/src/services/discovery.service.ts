import prisma from '../utils/prismaClient';

type SearchRuleFilters = {
  scope?: string;
  targetType?: string;
  query?: string;
  activeOnly?: boolean;
};

type SaveSearchRuleInput = {
  id?: string;
  key?: string;
  label?: string;
  description?: string | null;
  scope?: string;
  targetType?: string;
  targetId?: string | null;
  queryPattern?: string | null;
  action?: string;
  value?: number;
  priority?: number;
  metadata?: unknown;
  isActive?: boolean;
};

type SaveFeedRecipeInput = {
  id?: string;
  key?: string;
  label?: string;
  description?: string | null;
  mode?: string;
  weights?: Record<string, any>;
  queryTakeMultiplier?: number;
  queryTakeCap?: number;
  isActive?: boolean;
  isSystemRecipe?: boolean;
};

type RankedDiscoveryItem = {
  id: string;
  type?: string;
  title?: string;
  name?: string;
  subtitle?: string;
  description?: string;
  meta?: Record<string, any>;
  [key: string]: any;
};

const DISCOVERY_FEED_MODES = ['for_you', 'following', 'hire', 'sell', 'learn', 'local'] as const;

const DEFAULT_FEED_RECIPE_SEEDS = [
  {
    key: 'feed-recipe-for-you',
    label: 'For You',
    description: 'Balanced default discovery tuned for recency, engagement, and viewer interest.',
    mode: 'for_you',
    weights: {
      freshnessBaseHours: 42,
      highlightBoost: 18,
      followedTopicBoost: 28,
      interestedTopicBoost: 18,
      requestedTopicBoost: 24,
      regionalBoost: 26,
      hireIntentBoost: 34,
      sellIntentBoost: 34,
      learnIntentBoost: 34,
      localContextBoost: 12,
      shareWeight: 2,
      repostWeight: 2,
      viewWeight: 0.08
    },
    queryTakeMultiplier: 4,
    queryTakeCap: 120
  },
  {
    key: 'feed-recipe-following',
    label: 'Following',
    description: 'Chronological-ish feed for followed people and business pages.',
    mode: 'following',
    weights: {
      freshnessBaseHours: 42,
      highlightBoost: 12,
      followedTopicBoost: 12,
      interestedTopicBoost: 8,
      requestedTopicBoost: 18,
      regionalBoost: 18,
      hireIntentBoost: 20,
      sellIntentBoost: 20,
      learnIntentBoost: 20,
      localContextBoost: 8,
      shareWeight: 1.5,
      repostWeight: 1.5,
      viewWeight: 0.05
    },
    queryTakeMultiplier: 1,
    queryTakeCap: 50
  },
  {
    key: 'feed-recipe-hire',
    label: 'Hire',
    description: 'Bias toward hiring signals, recruiting intent, and professional demand posts.',
    mode: 'hire',
    weights: {
      freshnessBaseHours: 36,
      highlightBoost: 18,
      followedTopicBoost: 24,
      interestedTopicBoost: 18,
      requestedTopicBoost: 24,
      regionalBoost: 18,
      hireIntentBoost: 52,
      sellIntentBoost: 10,
      learnIntentBoost: 10,
      localContextBoost: 10,
      shareWeight: 2,
      repostWeight: 2,
      viewWeight: 0.08
    },
    queryTakeMultiplier: 5,
    queryTakeCap: 120
  },
  {
    key: 'feed-recipe-sell',
    label: 'Sell',
    description: 'Bias toward services, offers, portfolios, and seller discovery.',
    mode: 'sell',
    weights: {
      freshnessBaseHours: 36,
      highlightBoost: 20,
      followedTopicBoost: 24,
      interestedTopicBoost: 18,
      requestedTopicBoost: 20,
      regionalBoost: 16,
      hireIntentBoost: 8,
      sellIntentBoost: 52,
      learnIntentBoost: 8,
      localContextBoost: 10,
      shareWeight: 2,
      repostWeight: 2,
      viewWeight: 0.08
    },
    queryTakeMultiplier: 5,
    queryTakeCap: 120
  },
  {
    key: 'feed-recipe-learn',
    label: 'Learn',
    description: 'Bias toward guides, breakdowns, case studies, and educational content.',
    mode: 'learn',
    weights: {
      freshnessBaseHours: 48,
      highlightBoost: 18,
      followedTopicBoost: 28,
      interestedTopicBoost: 20,
      requestedTopicBoost: 24,
      regionalBoost: 12,
      hireIntentBoost: 8,
      sellIntentBoost: 10,
      learnIntentBoost: 56,
      localContextBoost: 8,
      shareWeight: 1.8,
      repostWeight: 1.8,
      viewWeight: 0.08
    },
    queryTakeMultiplier: 5,
    queryTakeCap: 120
  },
  {
    key: 'feed-recipe-local',
    label: 'Local',
    description: 'Bias toward local discovery and location-relevant community posts.',
    mode: 'local',
    weights: {
      freshnessBaseHours: 36,
      highlightBoost: 18,
      followedTopicBoost: 18,
      interestedTopicBoost: 14,
      requestedTopicBoost: 18,
      regionalBoost: 48,
      hireIntentBoost: 16,
      sellIntentBoost: 16,
      learnIntentBoost: 16,
      localContextBoost: 20,
      shareWeight: 1.8,
      repostWeight: 1.8,
      viewWeight: 0.08
    },
    queryTakeMultiplier: 5,
    queryTakeCap: 120
  }
];

let seeded = false;
let activeSearchRuleCache: any[] | null = null;
let activeSearchRuleCacheAt = 0;
let feedRecipeCache = new Map<string, any>();
let feedRecipeCacheAt = 0;

const cleanString = (value: unknown) => String(value || '').trim();

const normalizeOptionalString = (value: unknown) => {
  const next = cleanString(value);
  return next.length ? next : null;
};

const normalizeScope = (value: unknown) => {
  const normalized = cleanString(value).toLowerCase();
  if (normalized === 'search' || normalized === 'unified' || normalized === 'all') return normalized;
  return 'all';
};

const normalizeTargetType = (value: unknown) => {
  const normalized = cleanString(value).toLowerCase();
  if (['all', 'posts', 'people', 'pages', 'jobs', 'gigs'].includes(normalized)) return normalized;
  return 'all';
};

const normalizeRuleAction = (value: unknown) => {
  const normalized = cleanString(value).toLowerCase();
  if (['pin', 'boost', 'demote', 'exclude'].includes(normalized)) return normalized;
  return 'boost';
};

const normalizeNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const normalizePriority = (value: unknown) => Math.round(normalizeNumber(value, 100, 1, 1000));

const normalizeWeights = (value: unknown, fallback: Record<string, any>) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  return { ...fallback, ...(value as Record<string, any>) };
};

const mapSearchRule = (rule: any) => ({
  id: rule.id,
  key: rule.key,
  label: rule.label,
  description: rule.description || '',
  scope: rule.scope,
  targetType: rule.targetType,
  targetId: rule.targetId || null,
  queryPattern: rule.queryPattern || null,
  action: rule.action,
  value: typeof rule.value === 'number' ? rule.value : 1,
  priority: Number(rule.priority || 100),
  metadata: rule.metadata || null,
  isActive: Boolean(rule.isActive),
  createdByStaffId: rule.createdByStaffId || null,
  updatedByStaffId: rule.updatedByStaffId || null,
  createdAt: rule.createdAt,
  updatedAt: rule.updatedAt
});

const mapFeedRecipe = (recipe: any) => ({
  id: recipe.id,
  key: recipe.key,
  label: recipe.label,
  description: recipe.description || '',
  mode: recipe.mode,
  weights: recipe.weights || {},
  queryTakeMultiplier: Number(recipe.queryTakeMultiplier || 4),
  queryTakeCap: Number(recipe.queryTakeCap || 120),
  isSystemRecipe: Boolean(recipe.isSystemRecipe),
  isActive: Boolean(recipe.isActive),
  createdByStaffId: recipe.createdByStaffId || null,
  updatedByStaffId: recipe.updatedByStaffId || null,
  createdAt: recipe.createdAt,
  updatedAt: recipe.updatedAt
});

const invalidateDiscoveryCache = () => {
  activeSearchRuleCache = null;
  activeSearchRuleCacheAt = 0;
  feedRecipeCache.clear();
  feedRecipeCacheAt = 0;
};

export const ensureDiscoveryDefaultsSeeded = async () => {
  if (seeded) return;

  for (const recipe of DEFAULT_FEED_RECIPE_SEEDS) {
    await prisma.feedRecipe.upsert({
      where: { key: recipe.key },
      create: {
        key: recipe.key,
        label: recipe.label,
        description: recipe.description,
        mode: recipe.mode,
        weights: recipe.weights as any,
        queryTakeMultiplier: recipe.queryTakeMultiplier,
        queryTakeCap: recipe.queryTakeCap,
        isSystemRecipe: true,
        isActive: true
      },
      update: {
        label: recipe.label,
        description: recipe.description,
        mode: recipe.mode,
        weights: recipe.weights as any,
        queryTakeMultiplier: recipe.queryTakeMultiplier,
        queryTakeCap: recipe.queryTakeCap,
        isSystemRecipe: true,
        isActive: true
      }
    });
  }

  seeded = true;
};

export const getDiscoverySummary = async () => {
  await ensureDiscoveryDefaultsSeeded();
  const [searchRules, activeSearchRules, feedRecipes, activeFeedRecipes, recoConfigs, recoManualRules] =
    await prisma.$transaction([
      prisma.searchRankingRule.count(),
      prisma.searchRankingRule.count({ where: { isActive: true } }),
      prisma.feedRecipe.count(),
      prisma.feedRecipe.count({ where: { isActive: true } }),
      prisma.recoConfig.count(),
      prisma.recoManualRule.count({ where: { isActive: true } })
    ]);

  return {
    searchRules,
    activeSearchRules,
    feedRecipes,
    activeFeedRecipes,
    recommendationConfigs: recoConfigs,
    recommendationRules: recoManualRules
  };
};

export const listSearchRankingRules = async (filters: SearchRuleFilters = {}) => {
  await ensureDiscoveryDefaultsSeeded();
  const query = cleanString(filters.query);
  const targetType = cleanString(filters.targetType);
  const scope = cleanString(filters.scope);
  const rules = await prisma.searchRankingRule.findMany({
    where: {
      ...(filters.activeOnly !== undefined ? { isActive: Boolean(filters.activeOnly) } : {}),
      ...(targetType ? { targetType: normalizeTargetType(targetType) } : {}),
      ...(scope ? { scope: normalizeScope(scope) } : {}),
      ...(query
        ? {
            OR: [
              { key: { contains: query, mode: 'insensitive' } },
              { label: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
              { queryPattern: { contains: query, mode: 'insensitive' } },
              { targetId: { contains: query, mode: 'insensitive' } }
            ]
          }
        : {})
    },
    orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }]
  });
  return rules.map(mapSearchRule);
};

export const saveSearchRankingRule = async (input: SaveSearchRuleInput, staffUserId?: string | null) => {
  await ensureDiscoveryDefaultsSeeded();
  const key = cleanString(input.key);
  const label = cleanString(input.label);
  if (!key) throw new Error('Rule key is required');
  if (!label) throw new Error('Rule label is required');

  const payload = {
    key,
    label,
    description: normalizeOptionalString(input.description),
    scope: normalizeScope(input.scope),
    targetType: normalizeTargetType(input.targetType),
    targetId: normalizeOptionalString(input.targetId),
    queryPattern: normalizeOptionalString(input.queryPattern),
    action: normalizeRuleAction(input.action),
    value: normalizeNumber(input.value, 1, 0, 1000),
    priority: normalizePriority(input.priority),
    metadata: (input.metadata && typeof input.metadata === 'object' ? input.metadata : null) as any,
    isActive: input.isActive !== false,
    updatedByStaffId: staffUserId || null
  };

  const saved = input.id
    ? await prisma.searchRankingRule.update({
        where: { id: input.id },
        data: payload
      })
    : await prisma.searchRankingRule.create({
        data: {
          ...payload,
          createdByStaffId: staffUserId || null
        }
      });

  invalidateDiscoveryCache();
  return mapSearchRule(saved);
};

export const deactivateSearchRankingRule = async (id: string, staffUserId?: string | null) => {
  const saved = await prisma.searchRankingRule.update({
    where: { id },
    data: {
      isActive: false,
      updatedByStaffId: staffUserId || null
    }
  });
  invalidateDiscoveryCache();
  return mapSearchRule(saved);
};

export const listFeedRecipes = async (filters?: { activeOnly?: boolean }) => {
  await ensureDiscoveryDefaultsSeeded();
  const rows = await prisma.feedRecipe.findMany({
    where: filters?.activeOnly !== undefined ? { isActive: Boolean(filters.activeOnly) } : undefined,
    orderBy: [{ mode: 'asc' }, { updatedAt: 'desc' }]
  });
  return rows.map(mapFeedRecipe);
};

export const saveFeedRecipe = async (input: SaveFeedRecipeInput, staffUserId?: string | null) => {
  await ensureDiscoveryDefaultsSeeded();
  const key = cleanString(input.key);
  const label = cleanString(input.label);
  const mode = cleanString(input.mode).toLowerCase();
  if (!key) throw new Error('Recipe key is required');
  if (!label) throw new Error('Recipe label is required');
  if (!mode) throw new Error('Recipe mode is required');
  if (!DISCOVERY_FEED_MODES.includes(mode as (typeof DISCOVERY_FEED_MODES)[number])) {
    throw new Error('Invalid recipe mode');
  }

  const defaultSeed = DEFAULT_FEED_RECIPE_SEEDS.find((item) => item.mode === mode);
  const saved = input.id
    ? await prisma.feedRecipe.update({
        where: { id: input.id },
        data: {
          key,
          label,
          description: normalizeOptionalString(input.description),
          mode,
          weights: normalizeWeights(input.weights, defaultSeed?.weights || {}) as any,
          queryTakeMultiplier: Math.round(normalizeNumber(input.queryTakeMultiplier, defaultSeed?.queryTakeMultiplier || 4, 1, 8)),
          queryTakeCap: Math.round(normalizeNumber(input.queryTakeCap, defaultSeed?.queryTakeCap || 120, 20, 200)),
          isActive: input.isActive !== false,
          isSystemRecipe: input.isSystemRecipe === true,
          updatedByStaffId: staffUserId || null
        }
      })
    : await prisma.feedRecipe.create({
        data: {
          key,
          label,
          description: normalizeOptionalString(input.description),
          mode,
          weights: normalizeWeights(input.weights, defaultSeed?.weights || {}) as any,
          queryTakeMultiplier: Math.round(normalizeNumber(input.queryTakeMultiplier, defaultSeed?.queryTakeMultiplier || 4, 1, 8)),
          queryTakeCap: Math.round(normalizeNumber(input.queryTakeCap, defaultSeed?.queryTakeCap || 120, 20, 200)),
          isActive: input.isActive !== false,
          isSystemRecipe: input.isSystemRecipe === true,
          createdByStaffId: staffUserId || null,
          updatedByStaffId: staffUserId || null
        }
      });

  invalidateDiscoveryCache();
  return mapFeedRecipe(saved);
};

const getCachedActiveSearchRules = async () => {
  await ensureDiscoveryDefaultsSeeded();
  const now = Date.now();
  if (activeSearchRuleCache && activeSearchRuleCacheAt > now - 30_000) {
    return activeSearchRuleCache;
  }

  const rows = await prisma.searchRankingRule.findMany({
    where: { isActive: true },
    orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }]
  });
  activeSearchRuleCache = rows.map(mapSearchRule);
  activeSearchRuleCacheAt = now;
  return activeSearchRuleCache;
};

export const getActiveFeedRecipe = async (mode: string) => {
  await ensureDiscoveryDefaultsSeeded();
  const normalizedMode = cleanString(mode).toLowerCase();
  const now = Date.now();
  if (feedRecipeCacheAt > now - 30_000 && feedRecipeCache.has(normalizedMode)) {
    return feedRecipeCache.get(normalizedMode);
  }

  const row = await prisma.feedRecipe.findFirst({
    where: {
      mode: normalizedMode,
      isActive: true
    }
  });

  const recipe = row ? mapFeedRecipe(row) : null;
  feedRecipeCache.set(normalizedMode, recipe);
  feedRecipeCacheAt = now;
  return recipe;
};

const ruleMatchesItem = (
  rule: any,
  item: RankedDiscoveryItem,
  scope: 'search' | 'unified',
  query: string
) => {
  if (!rule?.isActive) return false;
  if (![scope, 'all'].includes(String(rule.scope || 'all'))) return false;
  const itemType = cleanString(item.type).toLowerCase() === 'post' ? 'posts' : cleanString(item.type).toLowerCase();
  if (![itemType, 'all'].includes(String(rule.targetType || 'all'))) return false;
  const targetId = cleanString(rule.targetId);
  if (targetId && targetId !== '*' && targetId !== String(item.id)) return false;
  const pattern = cleanString(rule.queryPattern).toLowerCase();
  if (pattern && !query.toLowerCase().includes(pattern)) return false;

  const categoryId = cleanString(rule.metadata?.categoryId);
  if (categoryId && cleanString(item.meta?.categoryId) !== categoryId) return false;
  return true;
};

export const applySearchRankingRules = async (
  items: RankedDiscoveryItem[],
  input: { scope: 'search' | 'unified'; query: string }
) => {
  const rules = await getCachedActiveSearchRules();
  if (!Array.isArray(items) || !items.length || !rules.length) return items;

  const scored = items.map((item, index) => {
    let score = 10_000 - index;
    let excluded = false;

    for (const rule of rules) {
      if (!ruleMatchesItem(rule, item, input.scope, input.query)) continue;
      const value = Number(rule.value || 1);
      switch (String(rule.action || 'boost')) {
        case 'pin':
          score += 100_000 + (1_000 - Number(rule.priority || 100));
          break;
        case 'exclude':
          excluded = true;
          break;
        case 'demote':
          score -= value * 100;
          break;
        case 'boost':
        default:
          score += value * 100;
          break;
      }
    }

    return { item, score, excluded, index };
  });

  return scored
    .filter((entry) => !entry.excluded)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    })
    .map((entry) => entry.item);
};
