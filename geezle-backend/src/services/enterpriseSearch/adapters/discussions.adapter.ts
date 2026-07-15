import prisma from '../../../utils/prismaClient';
import type { SearchDomainAdapter } from './types';
import { bestLexicalScore, containsFilter } from '../retrieval/normalize';

/**
 * Discussions — ForumThread (open/solved, not locked as primary).
 * Indexes: status, userId, categoryId, createdAt.
 */
export const discussionsAdapter: SearchDomainAdapter = {
  domain: 'discussion',
  async retrieve(ctx) {
    const q = ctx.normalized.normalized;
    if (q.length < 1) return [];
    const contains = containsFilter(q);
    const blocked = Array.from(ctx.viewer.blockedUserIds).slice(0, 500);

    const rows = await prisma.forumThread.findMany({
      where: {
        status: { in: ['OPEN', 'SOLVED'] },
        ...(blocked.length ? { userId: { notIn: blocked } } : {}),
        OR: [{ title: contains }, { content: contains }, { tags: { has: q } }]
      },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: ctx.limit,
      select: {
        id: true,
        title: true,
        content: true,
        userId: true,
        status: true,
        tags: true,
        views: true,
        upvotes: true,
        createdAt: true,
        categoryId: true
      }
    });

    return rows.map((thread) => {
      const snippet = String(thread.content || '').replace(/\s+/g, ' ').trim().slice(0, 160);
      const score = bestLexicalScore([thread.title, snippet, ...(thread.tags || [])], ctx.normalized);
      return {
        entityType: 'discussion' as const,
        entityId: thread.id,
        title: thread.title,
        subtitle: snippet,
        description: snippet,
        url: `/community/forum?thread=${encodeURIComponent(thread.id)}`,
        authorOrOwnerId: thread.userId,
        createdAt: thread.createdAt?.toISOString?.() || null,
        tags: thread.tags || [],
        category: thread.categoryId || null,
        lexicalScore: score || 0.35,
        attributes: {
          status: thread.status,
          views: thread.views,
          upvotes: thread.upvotes
        }
      };
    });
  }
};
