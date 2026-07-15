import prisma from '../../../utils/prismaClient';
import type { SearchDomainAdapter } from './types';
import { bestLexicalScore, containsFilter } from '../retrieval/normalize';

/**
 * Marketplace listings — active/approved, not removed.
 * Indexes: status, reviewStatus, sellerId, createdAt, price, removedAt.
 */
export const marketplaceAdapter: SearchDomainAdapter = {
  domain: 'marketplace_listing',
  async retrieve(ctx) {
    const q = ctx.normalized.normalized;
    if (q.length < 1) return [];
    const contains = containsFilter(q);
    const blocked = Array.from(ctx.viewer.blockedUserIds).slice(0, 500);
    const price = ctx.filters?.price;

    const rows = await prisma.marketplaceListing.findMany({
      where: {
        status: { in: ['active', 'published', 'approved'] },
        reviewStatus: { in: ['approved', 'auto_approved', 'pending'] },
        removedAt: null,
        ...(blocked.length ? { sellerId: { notIn: blocked } } : {}),
        ...(price?.min != null || price?.max != null
          ? {
              price: {
                ...(price.min != null ? { gte: price.min } : {}),
                ...(price.max != null ? { lte: price.max } : {})
              }
            }
          : {}),
        OR: [
          { title: contains },
          { description: contains },
          { brand: contains },
          { tags: { has: q } },
          { location: contains }
        ]
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: ctx.limit,
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        price: true,
        currency: true,
        brand: true,
        location: true,
        sellerId: true,
        categoryId: true,
        status: true
      }
    });

    return rows.map((listing) => {
      const snippet = String(listing.description || '').replace(/\s+/g, ' ').trim().slice(0, 160);
      const score = bestLexicalScore([listing.title, listing.brand, listing.location, snippet], ctx.normalized);
      return {
        entityType: 'marketplace_listing' as const,
        entityId: listing.id,
        title: listing.title,
        subtitle: `${listing.currency || 'USD'} ${listing.price}${listing.location ? ` · ${listing.location}` : ''}`,
        description: snippet,
        url: `/marketplace/listing/${encodeURIComponent(listing.slug || listing.id)}`,
        authorOrOwnerId: listing.sellerId,
        category: listing.categoryId || null,
        lexicalScore: score || 0.4,
        attributes: {
          price: listing.price,
          currency: listing.currency,
          brand: listing.brand,
          location: listing.location,
          slug: listing.slug,
          status: listing.status
        }
      };
    });
  }
};
