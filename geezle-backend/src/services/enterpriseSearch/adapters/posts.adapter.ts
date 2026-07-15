import prisma from '../../../utils/prismaClient';
import type { SearchDomainAdapter } from './types';
import { bestLexicalScore, containsFilter } from '../retrieval/normalize';

/**
 * Posts — public, non-deleted; exclude blocked authors + viewer-hidden.
 * Indexes: status+visibility+createdAt, authorId, status.
 */
export const postsAdapter: SearchDomainAdapter = {
  domain: 'post',
  async retrieve(ctx) {
    const q = ctx.normalized.normalized;
    if (q.length < 1) return [];
    const contains = containsFilter(q);
    const blocked = Array.from(ctx.viewer.blockedUserIds).slice(0, 500);
    const hidden = Array.from(ctx.viewer.hiddenPostIds).slice(0, 500);

    const rows = await prisma.communityPost.findMany({
      where: {
        status: { notIn: ['deleted', 'draft'] },
        visibility: 'public',
        ...(blocked.length ? { authorId: { notIn: blocked } } : {}),
        ...(hidden.length ? { id: { notIn: hidden } } : {}),
        OR: [{ title: contains }, { content: contains }, { topic: contains }]
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: ctx.limit,
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        authorId: true,
        topic: true,
        visibility: true,
        status: true
      }
    });

    return rows.map((post) => {
      const snippet = String(post.content || '').replace(/\s+/g, ' ').trim().slice(0, 180);
      const title = post.title || snippet || 'Post';
      const score = bestLexicalScore([post.title, snippet, post.topic], ctx.normalized);
      return {
        entityType: 'post' as const,
        entityId: post.id,
        title,
        subtitle: snippet,
        description: snippet,
        url: `/post/${post.id}`,
        authorOrOwnerId: post.authorId,
        createdAt: post.createdAt?.toISOString?.() || null,
        lexicalScore: score || 0.35,
        category: post.topic || null,
        attributes: {
          visibility: post.visibility,
          status: post.status,
          topic: post.topic
        }
      };
    });
  }
};
