import prisma from '../../../utils/prismaClient';
import type { SearchDomainAdapter } from './types';
import { bestLexicalScore, containsFilter } from '../retrieval/normalize';

/**
 * Jobs — active, visible, public (or not private); exclude deleted/draft-like.
 * Indexes: status, clientId, categoryId, isActive.
 */
export const jobsAdapter: SearchDomainAdapter = {
  domain: 'job',
  async retrieve(ctx) {
    const q = ctx.normalized.normalized;
    if (q.length < 1) return [];
    const contains = containsFilter(q);
    const blocked = Array.from(ctx.viewer.blockedUserIds).slice(0, 500);

    const rows = await prisma.job.findMany({
      where: {
        isActive: true,
        isVisible: true,
        status: { in: ['ACTIVE', 'SUBMITTED'] },
        visibility: { not: 'PRIVATE' },
        ...(blocked.length ? { clientId: { notIn: blocked } } : {}),
        OR: [{ title: contains }, { description: contains }, { tags: { has: q } }]
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: ctx.limit,
      select: {
        id: true,
        title: true,
        budget: true,
        categoryId: true,
        clientId: true,
        tags: true,
        experienceLevel: true,
        createdAt: true
      }
    });

    return rows.map((job) => {
      const score = bestLexicalScore([job.title, job.budget, ...(job.tags || [])], ctx.normalized);
      return {
        entityType: 'job' as const,
        entityId: job.id,
        title: job.title,
        subtitle: job.budget ? `Budget: ${job.budget}` : 'Open job',
        description: job.budget ? `Budget: ${job.budget}` : 'Open job',
        url: `/jobs/${job.id}`,
        authorOrOwnerId: job.clientId,
        createdAt: job.createdAt?.toISOString?.() || null,
        category: job.categoryId || null,
        tags: job.tags || [],
        lexicalScore: score || 0.4,
        attributes: {
          categoryId: job.categoryId || null,
          budget: job.budget,
          experienceLevel: job.experienceLevel || null
        }
      };
    });
  }
};
