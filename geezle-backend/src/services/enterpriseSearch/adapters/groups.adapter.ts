import { ChannelVisibility } from '@prisma/client';
import prisma from '../../../utils/prismaClient';
import type { SearchDomainAdapter } from './types';
import { bestLexicalScore, containsFilter } from '../retrieval/normalize';

/**
 * Groups — CommunityClub entities surfaced as group domain (member-oriented).
 * Same source as communities with entityType group for Discovery taxonomy.
 */
export const groupsAdapter: SearchDomainAdapter = {
  domain: 'group',
  async retrieve(ctx) {
    const q = ctx.normalized.normalized;
    if (q.length < 1) return [];
    const contains = containsFilter(q);
    const viewerId = ctx.viewer.viewerId;
    const blocked = Array.from(ctx.viewer.blockedUserIds).slice(0, 500);

    const visibilityClause = viewerId
      ? {
          OR: [
            { visibility: ChannelVisibility.PUBLIC },
            {
              visibility: ChannelVisibility.PRIVATE,
              memberships: { some: { userId: viewerId, status: 'active' } }
            }
          ]
        }
      : { visibility: ChannelVisibility.PUBLIC };

    const rows = await prisma.communityClub.findMany({
      where: {
        status: 'active',
        ...(blocked.length ? { ownerId: { notIn: blocked } } : {}),
        AND: [visibilityClause],
        OR: [{ name: contains }, { slug: contains }, { summary: contains }, { description: contains }]
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
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
        avatarImage: true
      }
    });

    return rows.map((club) => {
      const snippet = String(club.summary || club.description || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);
      const score = bestLexicalScore([club.name, club.slug, club.summary], ctx.normalized);
      return {
        entityType: 'group' as const,
        entityId: club.id,
        title: club.name,
        subtitle: `${club.memberCount || 0} members`,
        description: snippet,
        url: `/community/groups?group=${encodeURIComponent(club.slug || club.id)}`,
        avatarUrl: club.avatarImage || null,
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
