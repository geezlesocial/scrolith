import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { NotificationService } from './notificationCenter';

export type MatchAccountType = 'FREELANCER' | 'CLIENT';
type MatchAction = 'INTERESTED' | 'DISMISSED';
export type MatchFilters = {
  skills?: string[];
  location?: string;
  remoteOnly?: boolean;
  experience?: string;
  availability?: string;
  minimumScore?: number;
};

export type MatchPreferences = {
  freelancer: {
    skills: string[];
    locations: string[];
    remoteOnly: boolean;
    minRate: number | null;
    maxRate: number | null;
    workTypes: string[];
  };
  client: {
    skills: string[];
    locations: string[];
    remoteOnly: boolean;
    minBudget: number | null;
    maxBudget: number | null;
    experience: string;
    workTypes: string[];
  };
};

const MATCH_CONFIG_SCOPE = 'scrolith_match';
const MATCH_EVENT_PREFIX = 'scrolith_match_';
const DAY_MS = 24 * 60 * 60 * 1000;

export type ScrolithMatchConfig = {
  enabled: boolean;
  filtersEnabled: boolean;
  insightsEnabled: boolean;
  minimumScore: number;
  maxCandidates: number;
  dailyInterestLimit: number;
  dismissCooldownDays: number;
  weights: {
    skills: number;
    experience: number;
    location: number;
    completeness: number;
    activity: number;
  };
};

export const DEFAULT_SCROLITH_MATCH_CONFIG: ScrolithMatchConfig = {
  enabled: true,
  filtersEnabled: true,
  insightsEnabled: true,
  minimumScore: 0.2,
  maxCandidates: 30,
  dailyInterestLimit: 30,
  dismissCooldownDays: 30,
  weights: { skills: 0.45, experience: 0.1, location: 0.15, completeness: 0.2, activity: 0.1 }
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const bool = (value: unknown, fallback: boolean) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};
const number = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
};

export const normalizeMatchConfig = (value: unknown): ScrolithMatchConfig => {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SCROLITH_MATCH_CONFIG, weights: { ...DEFAULT_SCROLITH_MATCH_CONFIG.weights } };
  const source = value && typeof value === 'object' ? value as any : {};
  const weights = source.weights && typeof source.weights === 'object' ? source.weights : {};
  const rawWeights = {
    skills: number(weights.skills, DEFAULT_SCROLITH_MATCH_CONFIG.weights.skills, 0, 1),
    experience: number(weights.experience, DEFAULT_SCROLITH_MATCH_CONFIG.weights.experience, 0, 1),
    location: number(weights.location, DEFAULT_SCROLITH_MATCH_CONFIG.weights.location, 0, 1),
    completeness: number(weights.completeness, DEFAULT_SCROLITH_MATCH_CONFIG.weights.completeness, 0, 1),
    activity: number(weights.activity, DEFAULT_SCROLITH_MATCH_CONFIG.weights.activity, 0, 1)
  };
  const total = Object.values(rawWeights).reduce((sum, item) => sum + item, 0) || 1;
  return {
    enabled: bool(source.enabled, DEFAULT_SCROLITH_MATCH_CONFIG.enabled),
    filtersEnabled: bool(source.filtersEnabled, DEFAULT_SCROLITH_MATCH_CONFIG.filtersEnabled),
    insightsEnabled: bool(source.insightsEnabled, DEFAULT_SCROLITH_MATCH_CONFIG.insightsEnabled),
    minimumScore: number(source.minimumScore, DEFAULT_SCROLITH_MATCH_CONFIG.minimumScore, 0, 1),
    maxCandidates: Math.floor(number(source.maxCandidates, DEFAULT_SCROLITH_MATCH_CONFIG.maxCandidates, 1, 100)),
    dailyInterestLimit: Math.floor(number(source.dailyInterestLimit, DEFAULT_SCROLITH_MATCH_CONFIG.dailyInterestLimit, 1, 1000)),
    dismissCooldownDays: Math.floor(number(source.dismissCooldownDays, DEFAULT_SCROLITH_MATCH_CONFIG.dismissCooldownDays, 1, 365)),
    weights: {
      skills: rawWeights.skills / total,
      experience: rawWeights.experience / total,
      location: rawWeights.location / total,
      completeness: rawWeights.completeness / total,
      activity: rawWeights.activity / total
    }
  };
};

const cleanList = (value: unknown, max = 20) => Array.from(new Set(
  (Array.isArray(value) ? value : String(value || '').split(','))
    .map((item) => String(item || '').trim().slice(0, 80))
    .filter(Boolean)
)).slice(0, max);

const nullableNumber = (value: unknown, min = 0, max = 1000000) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : null;
};

export const DEFAULT_MATCH_PREFERENCES: MatchPreferences = {
  freelancer: { skills: [], locations: [], remoteOnly: false, minRate: null, maxRate: null, workTypes: [] },
  client: { skills: [], locations: [], remoteOnly: false, minBudget: null, maxBudget: null, experience: '', workTypes: [] }
};

export const normalizeMatchPreferences = (value: unknown): MatchPreferences => {
  const source = value && typeof value === 'object' ? value as any : {};
  const freelancer = source.freelancer && typeof source.freelancer === 'object' ? source.freelancer : {};
  const client = source.client && typeof source.client === 'object' ? source.client : {};
  return {
    freelancer: {
      skills: cleanList(freelancer.skills),
      locations: cleanList(freelancer.locations),
      remoteOnly: bool(freelancer.remoteOnly, false),
      minRate: nullableNumber(freelancer.minRate),
      maxRate: nullableNumber(freelancer.maxRate),
      workTypes: cleanList(freelancer.workTypes, 10)
    },
    client: {
      skills: cleanList(client.skills),
      locations: cleanList(client.locations),
      remoteOnly: bool(client.remoteOnly, false),
      minBudget: nullableNumber(client.minBudget),
      maxBudget: nullableNumber(client.maxBudget),
      experience: String(client.experience || '').trim().slice(0, 40),
      workTypes: cleanList(client.workTypes, 10)
    }
  };
};

export const normalizeMatchAccountType = (value: unknown): MatchAccountType | null => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'FREELANCER' || normalized === 'SELLER') return 'FREELANCER';
  if (normalized === 'CLIENT' || normalized === 'EMPLOYER') return 'CLIENT';
  return null;
};

export const getScrolithMatchConfig = async (): Promise<ScrolithMatchConfig> => {
  try {
    const setting = await prisma.appSetting.findUnique({ where: { scope: MATCH_CONFIG_SCOPE } });
    return normalizeMatchConfig(setting?.data);
  } catch {
    return DEFAULT_SCROLITH_MATCH_CONFIG;
  }
};

export const getMatchPreferences = async (userId: string): Promise<MatchPreferences> => {
  try {
    const record = await prisma.scrolithMatchPreference.findUnique({ where: { userId } });
    return normalizeMatchPreferences(record?.data);
  } catch {
    return normalizeMatchPreferences(DEFAULT_MATCH_PREFERENCES);
  }
};

export const updateMatchPreferences = async (userId: string, value: unknown) => {
  const preferences = normalizeMatchPreferences(value);
  const record = await prisma.scrolithMatchPreference.upsert({
    where: { userId },
    create: { userId, data: preferences as any },
    update: { data: preferences as any }
  });
  emitMatchUpdate(userId, { preferencesUpdated: true });
  return { ...preferences, updatedAt: record.updatedAt };
};

export const updateScrolithMatchConfig = async (value: unknown, updatedBy?: string) => {
  const config = normalizeMatchConfig(value);
  const record = await prisma.appSetting.upsert({
    where: { scope: MATCH_CONFIG_SCOPE },
    create: { scope: MATCH_CONFIG_SCOPE, data: config as any },
    update: { data: config as any }
  });
  void updatedBy;
  return { ...config, updatedAt: record.updatedAt };
};

const tokens = (value: unknown) => Array.from(new Set(
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
));

const overlap = (left: string[], right: string[]) => {
  if (!left.length || !right.length) return 0;
  const a = new Set(left);
  const b = new Set(right);
  let common = 0;
  a.forEach((item) => { if (b.has(item)) common += 1; });
  return common / new Set([...a, ...b]).size;
};

const isActiveStatus = (value: any) => Boolean(
  value && value.status === 'ACTIVE' && value.isActive === true && value.visibility === 'PUBLIC' &&
  (!value.expiresAt || new Date(value.expiresAt).getTime() > Date.now())
);

const profileCompleteness = (user: any, status: any) => {
  const profile = user.profile || {};
  const checks = [
    Boolean(String(user.name || '').trim()),
    Boolean(String(profile.title || profile.bio || '').trim()),
    Array.isArray(profile.skills) && profile.skills.length > 0,
    Boolean(profile.location || user.country),
    Array.isArray(status?.services || status?.focusAreas) && (status.services || status.focusAreas).length > 0
  ];
  return checks.filter(Boolean).length / checks.length;
};

const experienceScore = (value: unknown) => {
  const raw = String(value || '').toLowerCase();
  if (!raw) return 0.35;
  if (/senior|expert|lead|director|10\+|10 years/.test(raw)) return 1;
  if (/mid|intermediate|5\+|5 years/.test(raw)) return 0.75;
  if (/junior|entry|beginner|1\+|2 years/.test(raw)) return 0.5;
  return 0.6;
};

const publicCandidateWhere = (accountType: MatchAccountType, now: Date) => accountType === 'FREELANCER'
  ? { clientHiringStatus: { is: { status: 'ACTIVE', isActive: true, visibility: 'PUBLIC', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } }
  : { professionalAvailability: { is: { status: 'ACTIVE', isActive: true, visibility: 'PUBLIC', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } };

const targetSelect = {
  id: true,
  isActive: true,
  name: true,
  username: true,
  avatar: true,
  profilePhotoFileId: true,
  country: true,
  lastLoginAt: true,
  updatedAt: true,
  profile: {
    select: {
      title: true, bio: true, location: true, country: true, skills: true,
      experience: true, experienceItems: true, hourlyRate: true, rating: true, completedJobs: true
    }
  },
  professionalAvailability: true,
  clientHiringStatus: true
};

const isRemotePreference = (value: unknown) => ['REMOTE', 'FLEXIBLE', 'REMOTE_ONLY'].includes(String(value || '').toUpperCase());

const preferenceFit = (target: any, accountType: MatchAccountType, preferences: MatchPreferences) => {
  const preference = accountType === 'FREELANCER' ? preferences.freelancer : preferences.client;
  const targetStatus = accountType === 'FREELANCER' ? target.clientHiringStatus : target.professionalAvailability;
  const targetProfile = target.profile || {};
  const targetTerms = tokens([
    ...(targetProfile.skills || []), targetProfile.title, targetProfile.bio,
    ...(targetStatus?.services || []), ...(targetStatus?.focusAreas || [])
  ].join(' '));
  const preferredTerms = tokens((preference.skills || []).join(' '));
  const skillFit = preferredTerms.length ? overlap(preferredTerms, targetTerms) : 0.5;
  const preferredLocations = tokens((preference.locations || []).join(' '));
  const targetLocation = tokens(`${targetProfile.location || ''} ${targetProfile.country || target.country || ''}`);
  const locationFit = preference.remoteOnly && isRemotePreference(targetStatus?.workPreference)
    ? 1
    : preferredLocations.length ? overlap(preferredLocations, targetLocation) : 0.5;
  const preferredTypes = tokens((preference.workTypes || []).join(' '));
  const targetTypes = tokens([...(targetStatus?.availabilityTypes || []), ...(targetStatus?.hiringTypes || [])].join(' '));
  const workTypeFit = preferredTypes.length ? overlap(preferredTypes, targetTypes) : 0.5;
  const rate = Number(targetProfile.hourlyRate);
  const minRate = accountType === 'FREELANCER' ? preferences.freelancer.minRate : preferences.client.minBudget;
  const maxRate = accountType === 'FREELANCER' ? preferences.freelancer.maxRate : preferences.client.maxBudget;
  const budgetFit = Number.isFinite(rate) && (minRate !== null || maxRate !== null)
    ? (minRate !== null && rate < minRate ? 0 : maxRate !== null && rate > maxRate ? 0 : 1)
    : 0.5;
  const experiencePreference = accountType === 'CLIENT' ? preferences.client.experience : '';
  const experienceFit = experiencePreference ? overlap(tokens(experiencePreference), tokens(`${targetProfile.experience || ''} ${targetProfile.experienceItems || ''}`)) || 0.35 : 0.5;
  return { score: skillFit * 0.45 + locationFit * 0.2 + workTypeFit * 0.15 + budgetFit * 0.1 + experienceFit * 0.1, skillFit, locationFit, workTypeFit, budgetFit, experienceFit };
};

const scoreCandidate = (viewer: any, target: any, accountType: MatchAccountType, config: ScrolithMatchConfig, preferences: MatchPreferences) => {
  const viewerProfile = viewer.profile || {};
  const targetProfile = target.profile || {};
  const viewerStatus = accountType === 'FREELANCER' ? viewer.professionalAvailability : viewer.clientHiringStatus;
  const targetStatus = accountType === 'FREELANCER' ? target.clientHiringStatus : target.professionalAvailability;
  const viewerTerms = accountType === 'FREELANCER'
    ? [...(viewerProfile.skills || []), viewerProfile.title, viewerProfile.bio]
    : [...(viewerStatus?.focusAreas || []), viewerProfile.title, viewerProfile.bio];
  const targetTerms = accountType === 'FREELANCER'
    ? [...(targetStatus?.focusAreas || []), targetProfile.title, targetProfile.bio]
    : [...(targetProfile.skills || []), ...(targetStatus?.services || []), targetProfile.title, targetProfile.bio];
  const skills = overlap(tokens(viewerTerms.join(' ')), tokens(targetTerms.join(' ')));
  const viewerLocation = tokens(`${viewerProfile.location || ''} ${viewerProfile.country || viewer.country || ''}`);
  const targetLocation = tokens(`${targetProfile.location || ''} ${targetProfile.country || target.country || ''}`);
  const location = targetStatus?.workPreference === 'REMOTE' || targetStatus?.workPreference === 'FLEXIBLE'
    ? 1
    : overlap(viewerLocation, targetLocation);
  const experience = accountType === 'CLIENT'
    ? experienceScore(targetProfile.experience || targetProfile.experienceItems)
    : 0.5;
  const completeness = profileCompleteness(target, targetStatus);
  const lastActivity = target.lastLoginAt ? new Date(target.lastLoginAt).getTime() : 0;
  const activity = lastActivity && Date.now() - lastActivity <= 30 * DAY_MS ? 1 : 0.35;
  const baseScore = clamp(
    skills * config.weights.skills + experience * config.weights.experience + location * config.weights.location +
      completeness * config.weights.completeness + activity * config.weights.activity,
    0,
    1
  );
  const preference = preferenceFit(target, accountType, preferences);
  const score = clamp(baseScore * 0.9 + preference.score * 0.1, 0, 1);
  const reasons = [
    skills >= 0.35 ? 'Strong focus and skill overlap' : skills > 0 ? 'Partial focus and skill overlap' : 'Professional interests are compatible',
    location >= 0.8 ? 'Location or remote preference aligns' : 'Location alignment is limited',
    completeness >= 0.8 ? 'Complete professional profile' : 'Professional profile signals available',
    activity >= 0.8 ? 'Recently active on Scrolith' : 'Recent activity signal is limited'
  ];
  if (preference.skillFit >= 0.35 && preference.skillFit > skills) reasons[0] = 'Matches your selected skills';
  if (preference.locationFit >= 0.8 && preference.locationFit > location) reasons[1] = 'Matches your location or remote preference';
  if (preference.workTypeFit >= 0.8) reasons.push('Matches your preferred work type');
  if (preference.budgetFit >= 0.8 && preference.budgetFit !== 0.5) reasons.push('Rate or budget fits your range');
  if (preference.experienceFit >= 0.8 && preference.experienceFit !== 0.5) reasons.push('Experience level matches your preference');
  return { score: Number(score.toFixed(4)), reasons };
};

const logEvent = async (actorId: string, event: string, targetId?: string) => {
  try {
    await prisma.insightEvent.create({
      data: { userId: actorId, type: `${MATCH_EVENT_PREFIX}${event}`, payload: targetId ? { targetId } : {} }
    });
  } catch {
    // Analytics must never block a Match action.
  }
};

const emitMatchUpdate = (userId: string, payload: Record<string, unknown>) => {
  realtime.emitToUser(userId, 'match:updated', { ...payload, emittedAt: new Date().toISOString() });
};

const viewerQuery = (userId: string) => prisma.user.findUnique({
  where: { id: userId },
  select: { id: true, role: true, country: true, lastLoginAt: true, profile: true, professionalAvailability: true, clientHiringStatus: true }
});

const parseExperienceFilter = (value: string, target: any) => {
  const requested = String(value || '').toLowerCase().trim();
  if (!requested) return true;
  const raw = `${target.profile?.experience || ''} ${target.profile?.experienceItems || ''}`.toLowerCase();
  if (raw.includes(requested)) return true;
  const score = experienceScore(raw);
  if (requested.includes('senior') || requested.includes('expert') || requested.includes('lead')) return score >= 0.85;
  if (requested.includes('mid') || requested.includes('intermediate')) return score >= 0.65 && score < 0.85;
  if (requested.includes('junior') || requested.includes('entry')) return score < 0.65;
  return false;
};

const matchesFilters = (target: any, accountType: MatchAccountType, scored: { score: number }, filters: MatchFilters) => {
  const status = accountType === 'FREELANCER' ? target.clientHiringStatus : target.professionalAvailability;
  const profile = target.profile || {};
  const targetTerms = tokens([
    ...(profile.skills || []), profile.title, profile.bio,
    ...(status?.services || []), ...(status?.focusAreas || [])
  ].join(' '));
  if (filters.skills?.length && !filters.skills.some((skill) => overlap(tokens(skill), targetTerms) > 0)) return false;
  const targetLocation = tokens(`${profile.location || ''} ${profile.country || target.country || ''}`);
  if (filters.location && !overlap(tokens(filters.location), targetLocation) && !isRemotePreference(status?.workPreference)) return false;
  if (filters.remoteOnly && !isRemotePreference(status?.workPreference)) return false;
  if (filters.experience && !parseExperienceFilter(filters.experience, target)) return false;
  if (filters.availability) {
    const timing = String(status?.timing || '').toLowerCase();
    if (!timing.includes(String(filters.availability).toLowerCase())) return false;
  }
  if (filters.minimumScore !== undefined && scored.score < filters.minimumScore) return false;
  return true;
};

const serializeTarget = (target: any, accountType: MatchAccountType, scored: { score: number; reasons: string[] }, interaction?: any, mutual = false) => ({
  id: target.id,
  name: target.name || target.username || 'Scrolith member',
  username: target.username || null,
  avatar: target.avatar || null,
  profilePhotoFileId: target.profilePhotoFileId || null,
  title: target.profile?.title || '',
  bio: target.profile?.bio || '',
  location: target.profile?.location || target.profile?.country || target.country || '',
  skills: Array.isArray(target.profile?.skills) ? target.profile.skills.slice(0, 12) : [],
  accountType: accountType === 'FREELANCER' ? 'CLIENT' : 'FREELANCER',
  matchScore: Math.round(scored.score * 100),
  reasons: scored.reasons,
  interaction: interaction?.action || null,
  mutual,
  href: target.username ? `/u/${encodeURIComponent(target.username)}` : `/profile/${encodeURIComponent(target.id)}`
});

export const getMatchFeed = async (input: { userId: string; accountTypeInput?: unknown; mutualOnly?: boolean; filters?: MatchFilters }) => {
  const config = await getScrolithMatchConfig();
  const viewer = await viewerQuery(input.userId);
  if (!viewer) throw new Error('User not found');
  const requestedAccountType = normalizeMatchAccountType(input.accountTypeInput);
  const accountType = requestedAccountType ||
    (normalizeMatchAccountType(viewer.role) || (isActiveStatus(viewer.clientHiringStatus) ? 'CLIENT' : 'FREELANCER'));
  if (!config.enabled) return { enabled: false, accountType, items: [], mutual: [], limits: { dailyInterestLimit: config.dailyInterestLimit, interestsUsed: 0 } };
  const viewerStatus = accountType === 'FREELANCER' ? viewer.professionalAvailability : viewer.clientHiringStatus;
  if (!isActiveStatus(viewerStatus)) {
    return { enabled: true, accountType, items: [], mutual: [], reason: 'activate_status', limits: { dailyInterestLimit: config.dailyInterestLimit, interestsUsed: 0 } };
  }
  const now = new Date();
  const filters = config.filtersEnabled ? input.filters || {} : {};
  const preferences = await getMatchPreferences(input.userId);
  const [follows, blocks, interactions] = await Promise.all([
    prisma.userFollow.findMany({ where: { followerId: input.userId }, select: { followeeId: true } }),
    prisma.userBlock.findMany({ where: { OR: [{ blockerId: input.userId }, { blockedId: input.userId }] }, select: { blockerId: true, blockedId: true } }),
    prisma.scrolithMatchInteraction.findMany({ where: { actorId: input.userId }, select: { targetId: true, action: true, updatedAt: true } })
  ]);
  const excluded = new Set<string>([
    input.userId,
    ...(input.mutualOnly ? [] : follows.map((item) => item.followeeId)),
    ...blocks.flatMap((item) => [item.blockerId, item.blockedId])
  ]);
  const interactionMap = new Map<string, { targetId: string; action: string; updatedAt: Date }>(
    interactions.map((item) => [item.targetId, item] as [string, { targetId: string; action: string; updatedAt: Date }])
  );
  const candidates = await prisma.user.findMany({
    where: { isActive: true, id: { notIn: Array.from(excluded) }, ...publicCandidateWhere(accountType, now) } as any,
    select: targetSelect as any,
    orderBy: { updatedAt: 'desc' },
    take: Math.min(300, Math.max(config.maxCandidates * 5, 50))
  });
  const items = candidates
    .filter((candidate) => isActiveStatus(accountType === 'FREELANCER' ? candidate.clientHiringStatus : candidate.professionalAvailability))
    .filter((candidate) => {
      const state = interactionMap.get(candidate.id);
      return !state || state.action !== 'DISMISSED' || new Date(state.updatedAt).getTime() + config.dismissCooldownDays * DAY_MS <= now.getTime();
    })
    .map((candidate) => ({ candidate, scored: scoreCandidate(viewer, candidate, accountType, config, preferences) }))
    .filter((entry) => entry.scored.score >= Math.max(config.minimumScore, filters.minimumScore || 0))
    .filter((entry) => matchesFilters(entry.candidate, accountType, entry.scored, filters))
    .sort((left, right) => right.scored.score - left.scored.score)
    .slice(0, config.maxCandidates);
  const reciprocal = items.length
    ? await prisma.scrolithMatchInteraction.findMany({
        where: { actorId: { in: items.map((entry) => entry.candidate.id) }, targetId: input.userId, action: 'INTERESTED' },
        select: { actorId: true }
      })
    : [];
  const reciprocalIds = new Set(reciprocal.map((item) => item.actorId));
  const serialized = items
    .map(({ candidate, scored }) => serializeTarget(candidate, accountType, config.insightsEnabled ? scored : { ...scored, reasons: [] }, interactionMap.get(candidate.id), reciprocalIds.has(candidate.id) && interactionMap.get(candidate.id)?.action === 'INTERESTED'))
    .filter((item) => !input.mutualOnly || item.mutual);
  void logEvent(input.userId, 'shown');
  if (Object.keys(filters).length) void logEvent(input.userId, 'filter_used');
  if (config.insightsEnabled) void logEvent(input.userId, 'insight_shown');
  const startOfDay = new Date(now); startOfDay.setUTCHours(0, 0, 0, 0);
  const interestsUsed = await prisma.scrolithMatchInteraction.count({ where: { actorId: input.userId, action: 'INTERESTED', updatedAt: { gte: startOfDay } } });
  return {
    enabled: true,
    accountType,
    items: serialized,
    mutual: serialized.filter((item) => item.mutual),
    filters: { enabled: config.filtersEnabled, applied: filters, resultCount: serialized.length },
    insights: { enabled: config.insightsEnabled },
    limits: { dailyInterestLimit: config.dailyInterestLimit, interestsUsed }
  };
};

const validateTarget = async (userId: string, targetId: string, accountType: MatchAccountType) => {
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: targetSelect as any });
  if (!target || target.id === userId || !target.isActive) throw new Error('Match target is unavailable');
  const status = accountType === 'FREELANCER' ? target.clientHiringStatus : target.professionalAvailability;
  if (!isActiveStatus(status)) throw new Error('Match target is no longer available');
  const [blocked, following] = await Promise.all([
    prisma.userBlock.findFirst({ where: { OR: [{ blockerId: userId, blockedId: targetId }, { blockerId: targetId, blockedId: userId }] } }),
    prisma.userFollow.findUnique({ where: { followerId_followeeId: { followerId: userId, followeeId: targetId } } })
  ]);
  if (blocked || following) throw new Error('This member is not eligible for Match');
  return target;
};

export const recordMatchAction = async (input: { userId: string; targetId: string; accountTypeInput: unknown; action: MatchAction }) => {
  const accountType = normalizeMatchAccountType(input.accountTypeInput);
  if (!accountType) throw new Error('Invalid account type');
  const config = await getScrolithMatchConfig();
  if (!config.enabled) throw new Error('Scrolith Match is currently paused');
  const viewer = await viewerQuery(input.userId);
  if (!viewer) throw new Error('User not found');
  const viewerStatus = accountType === 'FREELANCER' ? viewer.professionalAvailability : viewer.clientHiringStatus;
  if (!isActiveStatus(viewerStatus)) throw new Error('Activate your professional status before using Match');
  const target = await validateTarget(input.userId, input.targetId, accountType);
  const existing = await prisma.scrolithMatchInteraction.findUnique({ where: { actorId_targetId: { actorId: input.userId, targetId: input.targetId } } });
  if (input.action === 'INTERESTED' && existing?.action !== 'INTERESTED') {
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
    const used = await prisma.scrolithMatchInteraction.count({ where: { actorId: input.userId, action: 'INTERESTED', updatedAt: { gte: startOfDay } } });
    if (used >= config.dailyInterestLimit) throw new Error('Daily Match interest limit reached');
  }
  const interaction = await prisma.scrolithMatchInteraction.upsert({
    where: { actorId_targetId: { actorId: input.userId, targetId: input.targetId } },
    create: { actorId: input.userId, targetId: input.targetId, action: input.action },
    update: { action: input.action }
  });
  await logEvent(input.userId, input.action === 'INTERESTED' ? 'interest' : 'dismiss', input.targetId);
  emitMatchUpdate(input.userId, { targetId: input.targetId, action: input.action, mutual: false });
  let mutual = false;
  if (input.action === 'INTERESTED') {
    const reciprocal = await prisma.scrolithMatchInteraction.findUnique({ where: { actorId_targetId: { actorId: input.targetId, targetId: input.userId } } });
    mutual = reciprocal?.action === 'INTERESTED';
    if (mutual) {
      const pair = [input.userId, input.targetId].sort().join(':');
      await NotificationService.emitToUser(input.targetId, {
        type: 'scrolith_match_mutual', eventType: 'scrolith.match.mutual', category: 'social',
        actorId: input.userId, entityType: 'scrolith_match', entityId: pair,
        title: 'You have a Scrolith Match', body: 'You both expressed interest. Messaging is now available.',
        deepLink: '/match?tab=mutual', idempotencyKey: `scrolith-match-mutual:${pair}`
      });
      emitMatchUpdate(input.userId, { targetId: input.targetId, action: input.action, mutual: true });
      emitMatchUpdate(input.targetId, { targetId: input.userId, action: 'INTERESTED', mutual: true });
      await logEvent(input.userId, 'mutual', input.targetId);
    } else {
      await NotificationService.emitToUser(input.targetId, {
        type: 'scrolith_match_interest', eventType: 'scrolith.match.interest', category: 'social',
        actorId: input.userId, entityType: 'scrolith_match', entityId: input.userId,
        title: 'New Match interest', body: 'A Scrolith member is interested in connecting with you.',
        deepLink: '/match', idempotencyKey: `scrolith-match-interest:${input.userId}:${input.targetId}`
      });
    }
  }
  return { id: interaction.id, targetId: input.targetId, action: input.action, mutual };
};

export const assertMutualMatch = async (userId: string, targetId: string) => {
  if (!userId || !targetId || userId === targetId) throw new Error('Invalid Match participants');
  const [pair, blocked] = await Promise.all([
    prisma.scrolithMatchInteraction.count({
      where: {
        action: 'INTERESTED',
        OR: [
          { actorId: userId, targetId },
          { actorId: targetId, targetId: userId }
        ]
      }
    }),
    prisma.userBlock.findFirst({
      where: { OR: [{ blockerId: userId, blockedId: targetId }, { blockerId: targetId, blockedId: userId }] }
    })
  ]);
  if (blocked || pair !== 2) throw new Error('A mutual Match is required before messaging');
  return true;
};

export const getScrolithMatchAnalytics = async (daysInput: unknown = 30) => {
  const days = Math.max(1, Math.min(365, Math.floor(Number(daysInput) || 30)));
  const events = await prisma.insightEvent.findMany({ where: { type: { startsWith: MATCH_EVENT_PREFIX }, createdAt: { gte: new Date(Date.now() - days * DAY_MS) } }, select: { type: true }, take: 50000 });
  const count = (name: string) => events.filter((event) => event.type === `${MATCH_EVENT_PREFIX}${name}`).length;
  const interests = count('interest');
  const mutual = count('mutual');
  const shown = count('shown');
  const filtersUsed = count('filter_used');
  const insightsShown = count('insight_shown');
  return {
    days,
    shown,
    interests,
    dismissals: count('dismiss'),
    mutualConnections: mutual,
    conversionRate: interests ? Number((mutual / interests).toFixed(4)) : 0,
    filtersUsed,
    insightsShown,
    filterUsageRate: shown ? Number((filtersUsed / shown).toFixed(4)) : 0,
    insightEngagementRate: shown ? Number((insightsShown / shown).toFixed(4)) : 0
  };
};

export default { getMatchFeed, recordMatchAction, assertMutualMatch, getScrolithMatchConfig, updateScrolithMatchConfig, getScrolithMatchAnalytics };
