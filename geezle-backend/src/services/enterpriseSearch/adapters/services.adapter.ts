import prisma from '../../../utils/prismaClient';
import type { SearchDomainAdapter } from './types';
import { bestLexicalScore, containsFilter } from '../retrieval/normalize';

/**
 * Services (Gigs) — active/approved marketplace services.
 * Indexes: userId, category, isActive.
 */
export const servicesAdapter: SearchDomainAdapter = {
  domain: 'service',
  async retrieve(ctx) {
    const q = ctx.normalized.normalized;
    if (q.length < 1) return [];
    const contains = containsFilter(q);
    const blocked = Array.from(ctx.viewer.blockedUserIds).slice(0, 500);
    const price = ctx.filters?.price;

    const rows = await prisma.gig.findMany({
      where: {
        isActive: true,
        status: { in: ['ACTIVE', 'PENDING'] },
        adminStatus: { not: 'REJECTED' },
        ...(blocked.length ? { userId: { notIn: blocked } } : {}),
        ...(price?.min != null || price?.max != null
          ? {
              price: {
                ...(price.min != null ? { gte: price.min } : {}),
                ...(price.max != null ? { lte: price.max } : {})
              }
            }
          : {}),
        OR: [{ title: contains }, { description: contains }, { tags: { has: q } }, { subcategory: contains }]
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: ctx.limit,
      select: {
        id: true,
        slug: true,
        title: true,
        price: true,
        image: true,
        categoryId: true,
        userId: true,
        tags: true,
        rating: true
      }
    });

    return rows.map((gig) => {
      const score = bestLexicalScore([gig.title, ...(gig.tags || [])], ctx.normalized);
      return {
        entityType: 'service' as const,
        entityId: gig.id,
        title: gig.title,
        subtitle: Number.isFinite(Number(gig.price)) ? `From $${Number(gig.price).toFixed(0)}` : 'View service',
        description: Number.isFinite(Number(gig.price)) ? `From $${Number(gig.price).toFixed(0)}` : 'View service',
        url: `/gigs/${encodeURIComponent(gig.slug || gig.id)}`,
        imageUrl: gig.image || null,
        authorOrOwnerId: gig.userId,
        category: gig.categoryId || null,
        tags: gig.tags || [],
        lexicalScore: score || 0.4,
        attributes: {
          price: Number.isFinite(Number(gig.price)) ? Number(gig.price) : null,
          categoryId: gig.categoryId || null,
          slug: gig.slug,
          rating: gig.rating
        }
      };
    });
  }
};
