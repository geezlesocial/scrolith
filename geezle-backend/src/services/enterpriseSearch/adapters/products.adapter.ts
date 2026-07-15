import prisma from '../../../utils/prismaClient';
import type { SearchDomainAdapter } from './types';
import { bestLexicalScore, containsFilter } from '../retrieval/normalize';

/**
 * Products — catalog-oriented marketplace listings (active, not removed).
 * No separate Product model; maps MarketplaceListing → entityType product.
 */
export const productsAdapter: SearchDomainAdapter = {
  domain: 'product',
  async retrieve(ctx) {
    const q = ctx.normalized.normalized;
    if (q.length < 1) return [];
    const contains = containsFilter(q);
    const blocked = Array.from(ctx.viewer.blockedUserIds).slice(0, 500);
    const price = ctx.filters?.price;

    const rows = await prisma.marketplaceListing.findMany({
      where: {
        status: { in: ['active', 'published', 'approved'] },
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
        OR: [{ title: contains }, { description: contains }, { brand: contains }, { tags: { has: q } }]
      },
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: ctx.limit,
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        price: true,
        currency: true,
        brand: true,
        sellerId: true,
        categoryId: true,
        featured: true
      }
    });

    return rows.map((listing) => {
      const snippet = String(listing.description || '').replace(/\s+/g, ' ').trim().slice(0, 160);
      const score = bestLexicalScore([listing.title, listing.brand, snippet], ctx.normalized);
      return {
        entityType: 'product' as const,
        entityId: listing.id,
        title: listing.title,
        subtitle: `${listing.currency || 'USD'} ${listing.price}`,
        description: snippet,
        url: `/marketplace/listing/${encodeURIComponent(listing.slug || listing.id)}`,
        authorOrOwnerId: listing.sellerId,
        category: listing.categoryId || null,
        lexicalScore: score || 0.4,
        attributes: {
          price: listing.price,
          currency: listing.currency,
          brand: listing.brand,
          slug: listing.slug,
          featured: listing.featured,
          source: 'marketplace_listing'
        }
      };
    });
  }
};
