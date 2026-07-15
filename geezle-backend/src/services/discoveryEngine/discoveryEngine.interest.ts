/**
 * Privacy-safe interest graph — runtime-derived from authorized profile + recent feedback.
 * No durable psychological profiling; no private message content.
 */
import prisma from '../../utils/prismaClient';
import type { ViewerInterestProfile } from './discoveryEngine.types';
import { getDiscoveryPrivacyControls } from './discoveryEngine.privacy';
import { discoveryCache } from './discoveryEngine.cache';

const text = (v: unknown) => String(v || '').trim();
const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9_#@+-]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && t.length <= 40)
    .slice(0, 40);

const uniq = (items: string[], max = 40) => Array.from(new Set(items.map((i) => i.toLowerCase()).filter(Boolean))).slice(0, max);

export const buildViewerInterestProfile = async (
  viewerId: string | null
): Promise<ViewerInterestProfile> => {
  if (!viewerId) {
    return {
      viewerId: null,
      skills: [],
      topics: [],
      communities: [],
      categories: [],
      locations: [],
      negativeTokens: [],
      explicitWeight: 0,
      implicitWeight: 0,
      coldStart: true,
      personalizationAllowed: false
    };
  }

  const cacheKey = `interest:${viewerId}`;
  const cached = discoveryCache.get<ViewerInterestProfile>(cacheKey);
  if (cached) return cached;

  const privacy = await getDiscoveryPrivacyControls(viewerId);
  if (!privacy.personalizationEnabled || !privacy.interestTrackingEnabled) {
    const blocked: ViewerInterestProfile = {
      viewerId,
      skills: [],
      topics: [],
      communities: [],
      categories: [],
      locations: [],
      negativeTokens: [],
      explicitWeight: 0,
      implicitWeight: 0,
      coldStart: true,
      personalizationAllowed: false
    };
    discoveryCache.set(cacheKey, blocked, 20_000);
    return blocked;
  }

  const skills: string[] = [];
  const topics: string[] = [];
  const communities: string[] = [];
  const categories: string[] = [];
  const locations: string[] = [];
  const negativeTokens: string[] = [];

  try {
    const user = await prisma.user.findUnique({
      where: { id: viewerId },
      select: {
        profile: { select: { skills: true, title: true, bio: true, location: true, interests: true as any } }
      }
    });
    const profile = user?.profile as any;
    if (Array.isArray(profile?.skills)) skills.push(...profile.skills.map(String));
    if (profile?.title) topics.push(...tokenize(profile.title));
    if (profile?.location) locations.push(String(profile.location));
    if (Array.isArray(profile?.interests)) topics.push(...profile.interests.map(String));
  } catch {
    // interests field may not exist
    try {
      const user = await prisma.user.findUnique({
        where: { id: viewerId },
        select: { profile: { select: { skills: true, title: true, location: true } } }
      });
      if (Array.isArray(user?.profile?.skills)) skills.push(...user!.profile!.skills.map(String));
      if (user?.profile?.title) topics.push(...tokenize(user.profile.title));
      if (user?.profile?.location) locations.push(String(user.profile.location));
    } catch {
      // ignore
    }
  }

  // Community memberships (CommunityClub)
  try {
    const memberships = await prisma.clubMembership.findMany({
      where: { userId: viewerId, status: 'active' },
      take: 20,
      select: { club: { select: { name: true, slug: true, category: true } } }
    });
    for (const m of memberships) {
      if (m?.club?.name) communities.push(String(m.club.name));
      if (m?.club?.slug) topics.push(String(m.club.slug));
      if (m?.club?.category) categories.push(String(m.club.category));
    }
  } catch {
    // optional
  }

  // Negative feedback tokens (hide / not_interested / dismiss)
  if (privacy.behavioralRankingEnabled) {
    try {
      const feedback = await prisma.recoFeedbackLog.findMany({
        where: {
          viewerId,
          action: { in: ['hide', 'dismiss', 'not_interested', 'report'] },
          createdAt: { gte: new Date(Date.now() - 45 * 24 * 60 * 60_000) }
        },
        take: 80,
        orderBy: { createdAt: 'desc' },
        select: { entityType: true, entityId: true, action: true }
      });
      for (const f of feedback) {
        negativeTokens.push(`${f.entityType}:${f.entityId}`.toLowerCase());
      }
    } catch {
      // ignore
    }
  }

  const explicitCount = skills.length + communities.length;
  const profile: ViewerInterestProfile = {
    viewerId,
    skills: uniq(skills, 24),
    topics: uniq(topics, 30),
    communities: uniq(communities, 20),
    categories: uniq(categories, 20),
    locations: uniq(locations, 10),
    negativeTokens: uniq(negativeTokens, 100),
    explicitWeight: explicitCount > 0 ? 0.7 : 0.25,
    implicitWeight: explicitCount > 0 ? 0.3 : 0.55,
    coldStart: explicitCount < 2,
    personalizationAllowed: true
  };

  discoveryCache.set(cacheKey, profile, 45_000);
  return profile;
};

export const interestOverlapScore = (
  profile: ViewerInterestProfile,
  tags: string[] = [],
  category?: string | null,
  textBlob?: string | null
): number => {
  if (!profile.personalizationAllowed) return 0.15;
  const bag = new Set([
    ...profile.skills,
    ...profile.topics,
    ...profile.communities,
    ...profile.categories
  ]);
  if (!bag.size) return profile.coldStart ? 0.2 : 0.1;

  const candidateTokens = new Set([
    ...tags.map((t) => t.toLowerCase()),
    ...(category ? [category.toLowerCase()] : []),
    ...tokenize(textBlob || '')
  ]);
  if (!candidateTokens.size) return 0.12;

  let hits = 0;
  for (const t of candidateTokens) {
    if (bag.has(t)) hits += 1;
  }
  const ratio = hits / Math.max(1, Math.min(12, candidateTokens.size));
  return Math.max(0, Math.min(1, 0.15 + ratio * 0.85));
};
