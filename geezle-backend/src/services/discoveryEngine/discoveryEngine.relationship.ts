/**
 * Relationship scoring using existing authorized graph data only.
 * Internal features only — user explanations stay aggregate/safe.
 */
import prisma from '../../utils/prismaClient';
import { discoveryCache } from './discoveryEngine.cache';
import type { RecommendationCandidate, ViewerInterestProfile } from './discoveryEngine.types';

export type RelationshipContext = {
  followingUserIds: Set<string>;
  followerUserIds: Set<string>;
  memberClubIds: Set<string>;
  sharedSkillBoost: Map<string, number>;
};

const emptyCtx = (): RelationshipContext => ({
  followingUserIds: new Set(),
  followerUserIds: new Set(),
  memberClubIds: new Set(),
  sharedSkillBoost: new Map()
});

export const loadRelationshipContext = async (
  viewerId: string | null
): Promise<RelationshipContext> => {
  if (!viewerId) return emptyCtx();
  const cacheKey = `relctx:${viewerId}`;
  const cached = discoveryCache.get<RelationshipContext>(cacheKey);
  if (cached) return cached;

  const ctx = emptyCtx();
  try {
    const following = await (prisma as any).follow?.findMany?.({
      where: { followerId: viewerId },
      take: 300,
      select: { followingId: true }
    });
    for (const row of following || []) {
      if (row?.followingId) ctx.followingUserIds.add(String(row.followingId));
    }
  } catch {
    try {
      const following = await (prisma as any).userFollow?.findMany?.({
        where: { followerId: viewerId },
        take: 300,
        select: { followingId: true }
      });
      for (const row of following || []) {
        if (row?.followingId) ctx.followingUserIds.add(String(row.followingId));
      }
    } catch {
      // optional
    }
  }

  try {
    const followers = await (prisma as any).follow?.findMany?.({
      where: { followingId: viewerId },
      take: 200,
      select: { followerId: true }
    });
    for (const row of followers || []) {
      if (row?.followerId) ctx.followerUserIds.add(String(row.followerId));
    }
  } catch {
    // optional
  }

  try {
    const memberships = await prisma.clubMembership.findMany({
      where: { userId: viewerId, status: 'active' },
      take: 50,
      select: { clubId: true }
    });
    for (const m of memberships) ctx.memberClubIds.add(m.clubId);
  } catch {
    // optional
  }

  discoveryCache.set(cacheKey, ctx, 60_000);
  return ctx;
};

export const scoreRelationshipFeatures = (input: {
  candidate: RecommendationCandidate;
  profile: ViewerInterestProfile;
  rel: RelationshipContext;
}): {
  score: number;
  followedAuthor: boolean;
  sharedCommunity: boolean;
  reverseFollow: boolean;
  mutualLike: boolean;
} => {
  const owner = input.candidate.authorOrOwnerId || '';
  const followedAuthor = Boolean(owner && input.rel.followingUserIds.has(owner));
  const reverseFollow = Boolean(owner && input.rel.followerUserIds.has(owner));
  const mutualLike = followedAuthor && reverseFollow;

  const clubId = String(input.candidate.baseFeatures?.clubId || input.candidate.metadata?.clubId || '');
  const sharedCommunity =
    Boolean(clubId && input.rel.memberClubIds.has(clubId)) ||
    (input.candidate.tags || []).some((t) =>
      input.profile.communities.some((c) => c.includes(t.toLowerCase()) || t.toLowerCase().includes(c))
    );

  let score = 0.08;
  if (followedAuthor) score += 0.4;
  if (reverseFollow) score += 0.12;
  if (mutualLike) score += 0.1;
  if (sharedCommunity) score += 0.22;

  // Skills overlap already partially in interest; light relationship-professional signal
  const skillHits = (input.candidate.tags || []).filter((t) =>
    input.profile.skills.includes(t.toLowerCase())
  ).length;
  if (skillHits > 0) score += Math.min(0.15, skillHits * 0.05);

  if (owner && input.profile.viewerId === owner) score = 0;

  return {
    score: Math.max(0, Math.min(1, score)),
    followedAuthor,
    sharedCommunity,
    reverseFollow,
    mutualLike
  };
};
