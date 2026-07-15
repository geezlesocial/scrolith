import prisma from '../../../utils/prismaClient';
import type { SearchDomainAdapter } from './types';
import { bestLexicalScore, containsFilter } from '../retrieval/normalize';

/**
 * Companies — business pages with org signals (orgType/industry/orgSize) or all active pages as company entities.
 * Same table as pages; distinct entityType for Discovery taxonomy.
 */
export const companiesAdapter: SearchDomainAdapter = {
  domain: 'company',
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
          { industry: contains },
          { orgType: contains },
          { tagline: contains }
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
        orgSize: true,
        ownerId: true,
        location: true
      }
    });

    return rows.map((page) => {
      const slugOrHandle = page.slug || page.handle || page.id;
      const score = bestLexicalScore([page.name, page.handle, page.industry, page.orgType], ctx.normalized);
      return {
        entityType: 'company' as const,
        entityId: page.id,
        title: page.name,
        subtitle: page.industry || page.tagline || (page.handle ? `@${page.handle}` : null),
        description: page.tagline || page.industry || null,
        url: `/company/${encodeURIComponent(slugOrHandle)}`,
        authorOrOwnerId: page.ownerId,
        lexicalScore: score || 0.4,
        category: page.industry || null,
        attributes: {
          handle: page.handle || undefined,
          slug: page.slug || undefined,
          orgType: page.orgType || undefined,
          orgSize: page.orgSize || undefined,
          location: page.location || undefined
        }
      };
    });
  }
};
