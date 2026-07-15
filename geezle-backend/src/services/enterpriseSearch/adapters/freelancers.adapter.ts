import prisma from '../../../utils/prismaClient';
import type { SearchDomainAdapter } from './types';
import { bestLexicalScore, containsFilter } from '../retrieval/normalize';

/**
 * Freelancers — active users with freelancer plan or active gigs signal.
 * Profile.title / bio used for match (no separate headline field).
 */
export const freelancersAdapter: SearchDomainAdapter = {
  domain: 'freelancer',
  async retrieve(ctx) {
    const q = ctx.normalized.normalized;
    if (q.length < 1) return [];
    const contains = containsFilter(q);
    const blocked = Array.from(ctx.viewer.blockedUserIds).slice(0, 500);

    const rows = await prisma.user.findMany({
      where: {
        isActive: true,
        ...(blocked.length ? { id: { notIn: blocked } } : {}),
        OR: [{ freelancerPlanActive: true }, { gigs: { some: { isActive: true, status: 'ACTIVE' } } }],
        AND: [
          {
            OR: [
              { name: contains },
              { username: contains },
              { profile: { is: { title: contains } } },
              { profile: { is: { bio: contains } } }
            ]
          }
        ]
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: ctx.limit,
      select: {
        id: true,
        name: true,
        username: true,
        avatar: true,
        isVerified: true,
        freelancerPlanActive: true,
        country: true,
        profile: { select: { title: true, bio: true } }
      }
    });

    return rows.map((user) => {
      const title = user.name || user.username || 'Freelancer';
      const headline = user.profile?.title || null;
      const score = bestLexicalScore([user.name, user.username, headline, user.profile?.bio], ctx.normalized);
      return {
        entityType: 'freelancer' as const,
        entityId: user.id,
        title,
        subtitle: headline || (user.username ? `@${user.username}` : 'Freelancer'),
        description: headline || null,
        url: user.username ? `/u/${encodeURIComponent(user.username)}` : `/profile/${user.id}`,
        avatarUrl: user.avatar || null,
        authorOrOwnerId: user.id,
        lexicalScore: score || 0.4,
        attributes: {
          username: user.username || undefined,
          verified: user.isVerified,
          freelancerPlanActive: user.freelancerPlanActive,
          country: user.country || undefined
        }
      };
    });
  }
};
