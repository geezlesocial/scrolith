import prisma from '../../../utils/prismaClient';
import type { SearchDomainAdapter } from './types';
import { bestLexicalScore, containsFilter } from '../retrieval/normalize';

/**
 * Pages — active CommunityBusinessPage.
 * Indexes: status, unique handle/slug.
 */
export const pagesAdapter: SearchDomainAdapter = {
  domain: 'page',
  async retrieve(ctx) {
    const q = ctx.normalized.normalized;
    if (q.length < 1) return [];
    const contains = containsFilter(q);
    const blocked = Array.from(ctx.viewer.blockedUserIds).slice(0, 500);

    const rows = await prisma.communityBusinessPage.findMany({
      where: {
        status: 'active',
        ...(blocked.length ? { ownerId: { notIn: blocked } } : {}),
        OR: [
          { name: contains },
          { slug: contains },
          { handle: contains },
          { tagline: contains },
          { industry: contains }
        ]
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: ctx.limit,
      select: {
        id: true,
        name: true,
        slug: true,
        handle: true,
        tagline: true,
        industry: true,
        orgType: true,
        ownerId: true,
        location: true
      }
    });

    return rows.map((page) => {
      const slugOrHandle = page.slug || page.handle || page.id;
      const score = bestLexicalScore([page.name, page.handle, page.slug, page.tagline, page.industry], ctx.normalized);
      return {
        entityType: 'page' as const,
        entityId: page.id,
        title: page.name,
        subtitle: page.tagline || (page.handle ? `@${page.handle}` : null),
        description: page.tagline || page.industry || null,
        url: `/company/${encodeURIComponent(slugOrHandle)}`,
        authorOrOwnerId: page.ownerId,
        lexicalScore: score || 0.4,
        category: page.industry || page.orgType || null,
        attributes: {
          handle: page.handle || undefined,
          slug: page.slug || undefined,
          industry: page.industry || undefined,
          orgType: page.orgType || undefined,
          location: page.location || undefined
        }
      };
    });
  }
};
