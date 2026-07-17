/**
 * Enterprise personalization & memory privacy controls.
 * Stored in ScrolithaUserPreference.metadata.privacyControls (no migration).
 * Org-level defaults can be set on ScrolithaConfig.metadata.privacyDefaults.
 */
import prisma from '../../utils/prismaClient';
import { ensureScrolithaConfig } from './scrolitha.policy';
import { enterpriseCache, hashCacheKey } from './scrolitha.enterpriseCache';

export type RecommendationCategory =
  | 'jobs'
  | 'services'
  | 'communities'
  | 'learning'
  | 'people'
  | 'companies'
  | 'discussions'
  | 'actions';

export type ScrolithaPrivacyControls = {
  memoryEnabled: boolean;
  personalizationEnabled: boolean;
  proactiveSuggestionsEnabled: boolean;
  aiVisibility: 'full' | 'subtle' | 'hidden';
  shareOrgMemory: boolean;
  recommendationCategories: Record<RecommendationCategory, boolean>;
  allowLearningLoop: boolean;
  /** User may clear memory anytime */
  allowMemoryExport: boolean;
  updatedAt?: string;
};

export type OrgPrivacyDefaults = Partial<ScrolithaPrivacyControls> & {
  enforceProactiveOff?: boolean;
  enforceMemoryOff?: boolean;
};

const ALL_CATEGORIES: RecommendationCategory[] = [
  'jobs',
  'services',
  'communities',
  'learning',
  'people',
  'companies',
  'discussions',
  'actions'
];

const defaultCategories = (): Record<RecommendationCategory, boolean> =>
  Object.fromEntries(ALL_CATEGORIES.map((c) => [c, true])) as Record<
    RecommendationCategory,
    boolean
  >;

export const DEFAULT_PRIVACY_CONTROLS: ScrolithaPrivacyControls = {
  memoryEnabled: true,
  personalizationEnabled: true,
  proactiveSuggestionsEnabled: true,
  aiVisibility: 'full',
  shareOrgMemory: false,
  recommendationCategories: defaultCategories(),
  allowLearningLoop: true,
  allowMemoryExport: false
};

const text = (v: unknown) => String(v || '').trim();

const sanitizeControls = (
  raw: unknown,
  base: ScrolithaPrivacyControls = DEFAULT_PRIVACY_CONTROLS
): ScrolithaPrivacyControls => {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, any>) : {};
  const cats = { ...base.recommendationCategories };
  if (src.recommendationCategories && typeof src.recommendationCategories === 'object') {
    for (const c of ALL_CATEGORIES) {
      if (src.recommendationCategories[c] !== undefined) {
        cats[c] = Boolean(src.recommendationCategories[c]);
      }
    }
  }
  const visibility = text(src.aiVisibility).toLowerCase();
  return {
    memoryEnabled: src.memoryEnabled !== undefined ? Boolean(src.memoryEnabled) : base.memoryEnabled,
    personalizationEnabled:
      src.personalizationEnabled !== undefined
        ? Boolean(src.personalizationEnabled)
        : base.personalizationEnabled,
    proactiveSuggestionsEnabled:
      src.proactiveSuggestionsEnabled !== undefined
        ? Boolean(src.proactiveSuggestionsEnabled)
        : base.proactiveSuggestionsEnabled,
    aiVisibility:
      visibility === 'subtle' || visibility === 'hidden' || visibility === 'full'
        ? (visibility as ScrolithaPrivacyControls['aiVisibility'])
        : base.aiVisibility,
    shareOrgMemory:
      src.shareOrgMemory !== undefined ? Boolean(src.shareOrgMemory) : base.shareOrgMemory,
    recommendationCategories: cats,
    allowLearningLoop:
      src.allowLearningLoop !== undefined ? Boolean(src.allowLearningLoop) : base.allowLearningLoop,
    allowMemoryExport:
      src.allowMemoryExport !== undefined ? Boolean(src.allowMemoryExport) : base.allowMemoryExport,
    updatedAt: text(src.updatedAt) || undefined
  };
};

export const getOrgPrivacyDefaults = async (): Promise<OrgPrivacyDefaults> => {
  try {
    const config = await ensureScrolithaConfig('user');
    const meta =
      config?.metadata && typeof config.metadata === 'object' ? (config.metadata as any) : {};
    return (meta.privacyDefaults || meta.orgPrivacyDefaults || {}) as OrgPrivacyDefaults;
  } catch {
    return {};
  }
};

export const getUserPrivacyControls = async (userId: string): Promise<ScrolithaPrivacyControls> => {
  const uid = text(userId);
  if (!uid) return { ...DEFAULT_PRIVACY_CONTROLS };

  const cacheKey = hashCacheKey(['privacy', uid]);
  const cached = enterpriseCache.get<ScrolithaPrivacyControls>('session', cacheKey);
  if (cached) return cached;

  const org = await getOrgPrivacyDefaults();
  let base = sanitizeControls(org, DEFAULT_PRIVACY_CONTROLS);
  if (org.enforceMemoryOff) base = { ...base, memoryEnabled: false };
  if (org.enforceProactiveOff) base = { ...base, proactiveSuggestionsEnabled: false };

  try {
    const pref = await prisma.scrolithaUserPreference.findUnique({
      where: { userId: uid },
      select: { metadata: true }
    });
    const meta =
      pref?.metadata && typeof pref.metadata === 'object' && !Array.isArray(pref.metadata)
        ? (pref.metadata as Record<string, any>)
        : {};
    const userControls = sanitizeControls(meta.privacyControls || meta.privacy, base);
    // Org enforce wins
    if (org.enforceMemoryOff) userControls.memoryEnabled = false;
    if (org.enforceProactiveOff) userControls.proactiveSuggestionsEnabled = false;
    enterpriseCache.set('session', cacheKey, userControls, 30_000);
    return userControls;
  } catch {
    return base;
  }
};

export const updateUserPrivacyControls = async (
  userId: string,
  patch: Partial<ScrolithaPrivacyControls>
): Promise<ScrolithaPrivacyControls> => {
  const uid = text(userId);
  if (!uid) throw new Error('userId required');

  const current = await getUserPrivacyControls(uid);
  const org = await getOrgPrivacyDefaults();
  const next = sanitizeControls({ ...current, ...patch, updatedAt: new Date().toISOString() }, current);

  if (org.enforceMemoryOff) next.memoryEnabled = false;
  if (org.enforceProactiveOff) next.proactiveSuggestionsEnabled = false;

  const pref = await prisma.scrolithaUserPreference.findUnique({ where: { userId: uid } });
  const baseMeta =
    pref?.metadata && typeof pref.metadata === 'object' && !Array.isArray(pref.metadata)
      ? { ...(pref.metadata as Record<string, any>) }
      : {};
  baseMeta.privacyControls = next;

  await prisma.scrolithaUserPreference.upsert({
    where: { userId: uid },
    create: {
      userId: uid,
      quickActions: [],
      troubleshootingMode: 'standard',
      assistantTone: 'concise',
      metadata: baseMeta
    },
    update: { metadata: baseMeta }
  });

  enterpriseCache.delete('session', hashCacheKey(['privacy', uid]));
  return next;
};

export const isRecommendationCategoryAllowed = (
  controls: ScrolithaPrivacyControls,
  category: RecommendationCategory
): boolean => Boolean(controls.recommendationCategories?.[category]);

export const recommendationKindToCategory = (
  kind: string
): RecommendationCategory | null => {
  const k = text(kind).toLowerCase();
  if (k === 'job') return 'jobs';
  if (k === 'service' || k === 'gig') return 'services';
  if (k === 'community') return 'communities';
  if (k === 'learning') return 'learning';
  if (k === 'freelancer' || k === 'user' || k === 'people') return 'people';
  if (k === 'company' || k === 'organization') return 'companies';
  if (k === 'discussion' || k === 'post') return 'discussions';
  if (k === 'action') return 'actions';
  return null;
};
