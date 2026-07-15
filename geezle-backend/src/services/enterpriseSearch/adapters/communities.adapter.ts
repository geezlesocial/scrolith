import prisma from '../../../utils/prismaClient';
import type { SearchDomainAdapter } from './types';
import { bestLexicalScore, containsFilter } from '../retrieval/normalize';

/**
 * Communities — public active clubs (CommunityClub).
 * Private clubs only if viewer is a member (SQL OR membership).
 * Indexes: status, visibility, ownerId.
 */
export const communitiesAdapter: SearchDomainAdapter = {
  domain: 'community',
  async retrieve(ctx) {
    const q = ctx.normalized.normalized;
    if (q.length < 1) return [];
    const contains = containsFilter(q);
    const viewerId = ctx.viewer.viewerId;
    const blocked = Array.from(ctx.viewer.blockedUserIds).slice(0, 500);

    const visibilityClause = viewerId
      ? {
          OR: [
            { visibility: 'PUBLIC' as const },
            {
              visibility: 'PRIVATE' as const,
              memberships: { some: { userId: viewerId, status: 'active' } }
            }
          ]
        }
      : { visibility: 'PUBLIC' as const };

    const rows = await prisma.communityClub.findMany({
      where: {
        status: 'active',
        ...(blocked.length ? { ownerId: { notIn: blocked } } : {}),
        AND: [visibilityClause],
        OR: [{ name: contains }, { slug: contains }, { summary: contains }, { description: contains }, { category: contains }]
      },
      orderBy: [{ memberCount: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
      take: ctx.limit,
      select: {
        id: true,
        name: true,
        slug: true,
        summary: true,
        description: true,
        visibility: true,
        category: true,
        memberCount: true,
        ownerId: true,
        avatarImage: true,
        coverImage: true
      }
    });

    return rows.map((club) => {
      const snippet = String(club.summary || club.description || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);
      const score = bestLexicalScore([club.name, club.slug, club.summary, club.category], ctx.normalized);
      return {
        entityType: 'community' as const,
        entityId: club.id,
        title: club.name,
        subtitle: club.category || `${club.memberCount || 0} members`,
        description: snippet,
        url: `/community/groups?group=${encodeURIComponent(club.slug || club.id)}`,
        avatarUrl: club.avatarImage || club.coverImage || null,
        authorOrOwnerId: club.ownerId,
        category: club.category || null,
        lexicalScore: score || 0.4,
        attributes: {
          slug: club.slug,
          visibility: club.visibility,
          memberCount: club.memberCount
        }
      };
    });
  }
};
