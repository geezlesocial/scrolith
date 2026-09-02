import prisma from '../utils/prismaClient';

export type HiringAccountType = 'FREELANCER' | 'CLIENT';
export type HiringRecommendationKey = 'AVAILABLE_FOR_HIRE' | 'WE_ARE_HIRING';

export type HiringRecommendationConfig = {
  enabled: boolean;
  timing: {
    showAfterLogin: boolean;
    showAfterAccountSwitch: boolean;
    showAfterProfileCompletion: boolean;
    showAfterProfessionalActivity: boolean;
    initialDelaySeconds: number;
    cooldownDays: number;
    secondDismissCooldownDays: number;
    maxImpressions: number;
    maxPerSession: number;
  };
  ai: {
    enabled: boolean;
    personalizationEnabled: boolean;
    scoringEnabled: boolean;
    messagePersonalizationEnabled: boolean;
    fallbackEnabled: boolean;
    minimumRecommendationScore: number;
    evaluationFrequencyMinutes: number;
  };
  freelancer: HiringRecommendationCopy;
  client: HiringRecommendationCopy;
};

export type HiringRecommendationCopy = {
  enabled: boolean;
  title: string;
  description: string;
  ctaLabel: string;
  secondaryLabel: string;
  eligibilityThreshold: number;
};

type RecommendationSignals = {
  profileCompleteness: number;
  hasProfessionalProfile: boolean;
  hasSkills: boolean;
  hasPortfolio: boolean;
  hasServices: boolean;
  hasProfessionalActivity: boolean;
  meaningfulInformation: boolean;
};

export type HiringRecommendationResult = {
  eligible: boolean;
  accountType: HiringAccountType;
  recommendation: HiringRecommendationKey;
  title: string;
  description: string;
  ctaLabel: string;
  secondaryLabel: string;
  delaySeconds: number;
  signals?: RecommendationSignals;
  reason?: string;
};

export const HIRING_RECOMMENDATION_SCOPE = 'hiring_recommendations';
export const HIRING_RECOMMENDATION_EVENT_PREFIX = 'hiring_recommendation_';

export const DEFAULT_HIRING_RECOMMENDATION_CONFIG: HiringRecommendationConfig = {
  enabled: true,
  timing: {
    showAfterLogin: true,
    showAfterAccountSwitch: true,
    showAfterProfileCompletion: true,
    showAfterProfessionalActivity: true,
    initialDelaySeconds: 0,
    cooldownDays: 7,
    secondDismissCooldownDays: 14,
    maxImpressions: 3,
    maxPerSession: 1
  },
  ai: {
    enabled: true,
    personalizationEnabled: true,
    scoringEnabled: true,
    messagePersonalizationEnabled: true,
    fallbackEnabled: true,
    minimumRecommendationScore: 0.7,
    evaluationFrequencyMinutes: 1440
  },
  freelancer: {
    enabled: true,
    title: "You're ready for new work",
    description: 'Let people on Scrolith know you are available for freelance projects and new opportunities.',
    ctaLabel: 'Turn On Available for Hire',
    secondaryLabel: 'Not Now',
    eligibilityThreshold: 0.4
  },
  client: {
    enabled: true,
    title: 'Are you looking for talent?',
    description: 'Let skilled professionals on Scrolith know that your team is currently hiring.',
    ctaLabel: 'Turn On We Are Hiring',
    secondaryLabel: 'Not Now',
    eligibilityThreshold: 0.4
  }
};

const toBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return fallback;
};

const toNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const plainText = (value: unknown, fallback: string, maxLength: number) => {
  const normalized = String(value ?? fallback).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  return (normalized || fallback).slice(0, maxLength);
};

const normalizeCopy = (value: any, fallback: HiringRecommendationCopy): HiringRecommendationCopy => ({
  enabled: toBoolean(value?.enabled, fallback.enabled),
  title: plainText(value?.title, fallback.title, 90),
  description: plainText(value?.description, fallback.description, 240),
  ctaLabel: plainText(value?.ctaLabel, fallback.ctaLabel, 60),
  secondaryLabel: plainText(value?.secondaryLabel, fallback.secondaryLabel, 30),
  eligibilityThreshold: toNumber(value?.eligibilityThreshold, fallback.eligibilityThreshold, 0, 1)
});

export const normalizeHiringRecommendationConfig = (value: any): HiringRecommendationConfig => ({
  enabled: toBoolean(value?.enabled, DEFAULT_HIRING_RECOMMENDATION_CONFIG.enabled),
  timing: {
    showAfterLogin: toBoolean(value?.timing?.showAfterLogin, DEFAULT_HIRING_RECOMMENDATION_CONFIG.timing.showAfterLogin),
    showAfterAccountSwitch: toBoolean(value?.timing?.showAfterAccountSwitch, DEFAULT_HIRING_RECOMMENDATION_CONFIG.timing.showAfterAccountSwitch),
    showAfterProfileCompletion: toBoolean(value?.timing?.showAfterProfileCompletion, DEFAULT_HIRING_RECOMMENDATION_CONFIG.timing.showAfterProfileCompletion),
    showAfterProfessionalActivity: toBoolean(value?.timing?.showAfterProfessionalActivity, DEFAULT_HIRING_RECOMMENDATION_CONFIG.timing.showAfterProfessionalActivity),
    initialDelaySeconds: toNumber(value?.timing?.initialDelaySeconds, 0, 0, 300),
    cooldownDays: toNumber(value?.timing?.cooldownDays, 7, 1, 365),
    secondDismissCooldownDays: toNumber(value?.timing?.secondDismissCooldownDays, 14, 1, 365),
    maxImpressions: Math.floor(toNumber(value?.timing?.maxImpressions, 3, 1, 100)),
    maxPerSession: Math.floor(toNumber(value?.timing?.maxPerSession, 1, 1, 10))
  },
  ai: {
    enabled: toBoolean(value?.ai?.enabled, true),
    personalizationEnabled: toBoolean(value?.ai?.personalizationEnabled, true),
    scoringEnabled: toBoolean(value?.ai?.scoringEnabled, true),
    messagePersonalizationEnabled: toBoolean(value?.ai?.messagePersonalizationEnabled, true),
    fallbackEnabled: toBoolean(value?.ai?.fallbackEnabled, true),
    minimumRecommendationScore: toNumber(value?.ai?.minimumRecommendationScore, 0.7, 0, 1),
    evaluationFrequencyMinutes: Math.floor(toNumber(value?.ai?.evaluationFrequencyMinutes, 1440, 15, 10080))
  },
  freelancer: normalizeCopy(value?.freelancer, DEFAULT_HIRING_RECOMMENDATION_CONFIG.freelancer),
  client: normalizeCopy(value?.client, DEFAULT_HIRING_RECOMMENDATION_CONFIG.client)
});

export const normalizeHiringAccountType = (value: unknown): HiringAccountType | null => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'FREELANCER' || normalized === 'SELLER') return 'FREELANCER';
  if (normalized === 'CLIENT' || normalized === 'EMPLOYER') return 'CLIENT';
  return null;
};

export const evaluateHiringEligibility = (input: {
  accountType: HiringAccountType;
  config: HiringRecommendationConfig;
  statusActive: boolean;
  signals: RecommendationSignals;
  state?: { lastDismissedAt: Date | null; snoozeUntil: Date | null; impressionCount: number; sessionKey: string | null; sessionImpressionCount: number; dismissCount: number } | null;
  sessionKey?: string | null;
  now?: Date;
}) => {
  const now = input.now || new Date();
  const copy = input.accountType === 'FREELANCER' ? input.config.freelancer : input.config.client;
  if (!input.config.enabled || !copy.enabled) return { eligible: false, reason: 'disabled' };
  if (input.statusActive) return { eligible: false, reason: 'already_active' };
  if (!input.signals.meaningfulInformation || input.signals.profileCompleteness < copy.eligibilityThreshold) {
    return { eligible: false, reason: 'insufficient_profile_signals' };
  }
  const state = input.state;
  if (state?.snoozeUntil && state.snoozeUntil > now) return { eligible: false, reason: 'snoozed' };
  if (state?.lastDismissedAt) {
    const cooldownDays = state.dismissCount > 1 ? input.config.timing.secondDismissCooldownDays : input.config.timing.cooldownDays;
    if (state.lastDismissedAt.getTime() + cooldownDays * 86400000 > now.getTime()) return { eligible: false, reason: 'cooldown' };
  }
  if ((state?.impressionCount || 0) >= input.config.timing.maxImpressions) return { eligible: false, reason: 'max_impressions' };
  if (input.sessionKey && state?.sessionKey === input.sessionKey && (state.sessionImpressionCount || 0) >= input.config.timing.maxPerSession) {
    return { eligible: false, reason: 'session_limit' };
  }
  return { eligible: true, reason: 'eligible' };
};

const dateValue = (value: unknown) => (value instanceof Date ? value : value ? new Date(String(value)) : null);
const daysSince = (value: Date | null, now: Date) => value ? Math.max(0, (now.getTime() - value.getTime()) / 86400000) : Infinity;
const hasJsonEntries = (value: unknown) => Array.isArray(value) ? value.length > 0 : Boolean(value && typeof value === 'object' && Object.keys(value as object).length);

const buildSignals = (user: any, now: Date): RecommendationSignals => {
  const profile = user.profile || {};
  const hasSkills = Array.isArray(profile.skills) && profile.skills.some(Boolean);
  const hasPortfolio = hasJsonEntries(profile.portfolio) || hasJsonEntries(profile.portfolioItems);
  const hasServices = Boolean(user.professionalAvailability?.services?.length || user.gigsCount);
  const hasProfessionalActivity = Boolean(
    user.jobsCount || user.communityPostsCount || daysSince(dateValue(user.lastLoginAt), now) <= 30 || daysSince(dateValue(profile.updatedAt), now) <= 30
  );
  const hasProfessionalProfile = Boolean(String(profile.title || '').trim() || String(profile.bio || '').trim());
  const fieldScore = [hasProfessionalProfile, hasSkills, hasPortfolio, hasServices, hasProfessionalActivity].filter(Boolean).length / 5;
  return {
    profileCompleteness: Number(fieldScore.toFixed(3)),
    hasProfessionalProfile,
    hasSkills,
    hasPortfolio,
    hasServices,
    hasProfessionalActivity,
    meaningfulInformation: hasProfessionalProfile && (hasSkills || hasPortfolio || hasServices || hasProfessionalActivity)
  };
};

const eventType = (event: string) => `${HIRING_RECOMMENDATION_EVENT_PREFIX}${event}`;
const recordEvent = async (userId: string, accountType: HiringAccountType, recommendation: HiringRecommendationKey, event: string, metadata?: Record<string, any>) => {
  try {
    await prisma.insightEvent.create({
      data: {
        userId,
        type: eventType(event),
        payload: { accountType, recommendation, ...(metadata || {}) }
      }
    });
  } catch (error) {
    console.warn('[hiring-recommendation] analytics write failed', error);
  }
};

const recommendationFor = (accountType: HiringAccountType): HiringRecommendationKey => accountType === 'FREELANCER' ? 'AVAILABLE_FOR_HIRE' : 'WE_ARE_HIRING';

const getState = (userId: string, accountType: HiringAccountType) => prisma.hiringRecommendationState.findUnique({
  where: { userId_accountType: { userId, accountType } }
});

export const getHiringRecommendationConfig = async () => {
  const record = await prisma.appSetting.findUnique({ where: { scope: HIRING_RECOMMENDATION_SCOPE } });
  return normalizeHiringRecommendationConfig(record?.data);
};

export const updateHiringRecommendationConfig = async (value: any, updatedBy?: string) => {
  const config = normalizeHiringRecommendationConfig(value);
  const record = await prisma.appSetting.upsert({
    where: { scope: HIRING_RECOMMENDATION_SCOPE },
    create: { scope: HIRING_RECOMMENDATION_SCOPE, data: config as any },
    update: { data: config as any }
  });
  void updatedBy;
  return { ...config, updatedAt: record.updatedAt };
};

export const getHiringRecommendation = async (userId: string, accountTypeInput: unknown, sessionKey?: string | null) => {
  const accountType = normalizeHiringAccountType(accountTypeInput);
  if (!accountType) return null;
  const now = new Date();
  const config = await getHiringRecommendationConfig();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      lastLoginAt: true,
      profile: { select: { title: true, bio: true, skills: true, portfolio: true, updatedAt: true } },
      professionalAvailability: { select: { isActive: true, status: true, services: true, updatedAt: true } },
      clientHiringStatus: { select: { isActive: true, status: true, updatedAt: true } },
      _count: { select: { gigs: true, jobs: true, communityPosts: true } }
    }
  });
  if (!user) return null;
  const status = accountType === 'FREELANCER' ? user.professionalAvailability : user.clientHiringStatus;
  const statusActive = Boolean(status?.isActive && status.status === 'ACTIVE');
  const signals = buildSignals({
    ...user,
    profile: user.profile,
    gigsCount: user._count.gigs,
    jobsCount: user._count.jobs,
    communityPostsCount: user._count.communityPosts
  }, now);
  const state = await getState(userId, accountType);
  if (statusActive && state?.lastClickedAt && !state.activatedAt && state.lastClickedAt <= (status as any).updatedAt) {
    await prisma.hiringRecommendationState.update({ where: { id: state.id }, data: { activatedAt: now } });
    await recordEvent(userId, accountType, recommendationFor(accountType), 'activated');
  }
  const eligibility = evaluateHiringEligibility({
    accountType,
    config,
    statusActive,
    signals,
    state,
    sessionKey,
    now
  });
  if (eligibility.eligible) {
    void recordEvent(userId, accountType, recommendationFor(accountType), 'eligible');
  }
  const copy = accountType === 'FREELANCER' ? config.freelancer : config.client;
  return {
    eligible: eligibility.eligible,
    accountType,
    recommendation: recommendationFor(accountType),
    title: copy.title,
    description: copy.description,
    ctaLabel: copy.ctaLabel,
    secondaryLabel: copy.secondaryLabel,
    delaySeconds: config.timing.initialDelaySeconds,
    ...(eligibility.eligible ? { signals } : { reason: eligibility.reason })
  } as HiringRecommendationResult;
};

const actionContext = async (userId: string, accountTypeInput: unknown, sessionKey?: string | null) => {
  const accountType = normalizeHiringAccountType(accountTypeInput);
  if (!accountType) throw new Error('Invalid account type');
  const recommendation = await getHiringRecommendation(userId, accountType, sessionKey);
  if (!recommendation) throw new Error('User not found');
  return { accountType, recommendation };
};

export const recordHiringRecommendationImpression = async (userId: string, accountTypeInput: unknown, sessionKeyInput?: unknown) => {
  const sessionKey = String(sessionKeyInput || '').trim().slice(0, 120) || null;
  const { accountType, recommendation } = await actionContext(userId, accountTypeInput, sessionKey);
  if (!recommendation.eligible) return { recorded: false, reason: recommendation.reason || 'not_eligible' };
  const existing = await getState(userId, accountType);
  const nextSessionCount = existing?.sessionKey === sessionKey ? (existing.sessionImpressionCount || 0) + 1 : 1;
  const state = await prisma.hiringRecommendationState.upsert({
    where: { userId_accountType: { userId, accountType } },
    create: { userId, accountType, lastShownAt: new Date(), impressionCount: 1, sessionKey, sessionImpressionCount: nextSessionCount },
    update: { lastShownAt: new Date(), impressionCount: { increment: 1 }, sessionKey, sessionImpressionCount: nextSessionCount }
  });
  await recordEvent(userId, accountType, recommendation.recommendation, 'shown');
  return { recorded: true, impressionCount: state.impressionCount };
};

export const dismissHiringRecommendation = async (userId: string, accountTypeInput: unknown) => {
  const { accountType, recommendation } = await actionContext(userId, accountTypeInput);
  const existing = await getState(userId, accountType);
  const dismissCount = (existing?.dismissCount || 0) + 1;
  const config = await getHiringRecommendationConfig();
  const cooldownDays = dismissCount > 1 ? config.timing.secondDismissCooldownDays : config.timing.cooldownDays;
  await prisma.hiringRecommendationState.upsert({
    where: { userId_accountType: { userId, accountType } },
    create: { userId, accountType, lastDismissedAt: new Date(), dismissCount, snoozeUntil: new Date(Date.now() + cooldownDays * 86400000) },
    update: { lastDismissedAt: new Date(), dismissCount, snoozeUntil: new Date(Date.now() + cooldownDays * 86400000) }
  });
  await recordEvent(userId, accountType, recommendation.recommendation, 'dismissed');
  return { recorded: true, cooldownDays };
};

export const snoozeHiringRecommendation = async (userId: string, accountTypeInput: unknown) => {
  const { accountType, recommendation } = await actionContext(userId, accountTypeInput);
  const config = await getHiringRecommendationConfig();
  const snoozeUntil = new Date(Date.now() + config.timing.cooldownDays * 86400000);
  await prisma.hiringRecommendationState.upsert({
    where: { userId_accountType: { userId, accountType } },
    create: { userId, accountType, snoozeUntil },
    update: { snoozeUntil }
  });
  await recordEvent(userId, accountType, recommendation.recommendation, 'snoozed');
  return { recorded: true, cooldownDays: config.timing.cooldownDays };
};

export const clickHiringRecommendation = async (userId: string, accountTypeInput: unknown) => {
  const { accountType, recommendation } = await actionContext(userId, accountTypeInput);
  await prisma.hiringRecommendationState.upsert({
    where: { userId_accountType: { userId, accountType } },
    create: { userId, accountType, lastClickedAt: new Date() },
    update: { lastClickedAt: new Date() }
  });
  await recordEvent(userId, accountType, recommendation.recommendation, 'cta_clicked');
  return { recorded: true };
};

export const getHiringRecommendationAnalytics = async (daysInput: unknown = 30) => {
  const days = Math.max(1, Math.min(365, Math.floor(Number(daysInput) || 30)));
  const since = new Date(Date.now() - days * 86400000);
  const events = await prisma.insightEvent.findMany({
    where: { type: { startsWith: HIRING_RECOMMENDATION_EVENT_PREFIX }, createdAt: { gte: since } },
    select: { type: true, payload: true },
    take: 20000,
    orderBy: { createdAt: 'desc' }
  });
  const result = {
    days,
    dataAvailable: events.length > 0,
    freelancer: { eligible: 0, shown: 0, clicked: 0, dismissed: 0, snoozed: 0, activated: 0, conversionRate: 0 },
    client: { eligible: 0, shown: 0, clicked: 0, dismissed: 0, snoozed: 0, activated: 0, conversionRate: 0 }
  } as any;
  for (const event of events) {
    const payload = event.payload && typeof event.payload === 'object' ? event.payload as any : {};
    const bucket = String(payload.accountType || '').toUpperCase() === 'CLIENT' ? result.client : result.freelancer;
    const rawMetric = String(event.type).replace(HIRING_RECOMMENDATION_EVENT_PREFIX, '');
    const metric = rawMetric === 'cta_clicked' ? 'clicked' : rawMetric;
    if (metric in bucket) bucket[metric] += 1;
  }
  result.freelancer.conversionRate = result.freelancer.shown ? Number((result.freelancer.activated / result.freelancer.shown).toFixed(4)) : 0;
  result.client.conversionRate = result.client.shown ? Number((result.client.activated / result.client.shown).toFixed(4)) : 0;
  return result;
};
