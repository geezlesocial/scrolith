import prisma from '../../../utils/prismaClient';
import type { SearchDomainAdapter } from './types';
import { bestLexicalScore, containsFilter } from '../retrieval/normalize';
import { serializeProfessionalAvailability } from '../../professionalAvailability.service';

/**
 * People — active users; excludes blocked; name/username match.
 * Indexes: User.username unique, isActive sequential filter (bounded take).
 */
export const peopleAdapter: SearchDomainAdapter = {
  domain: 'person',
  async retrieve(ctx) {
    const q = ctx.normalized.normalized;
    if (q.length < 1) return [];
    const contains = containsFilter(q);
    const blocked = Array.from(ctx.viewer.blockedUserIds).slice(0, 500);

    const rows = await prisma.user.findMany({
      where: {
        isActive: true,
        ...(blocked.length ? { id: { notIn: blocked } } : {}),
        OR: [{ name: contains }, { username: contains }]
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: ctx.limit,
      select: {
        id: true,
        name: true,
        username: true,
        avatar: true,
        isVerified: true,
        country: true,
        freelancerPlanActive: true,
        professionalAvailability: true
      }
    });

    return rows.map((user) => {
      const title = user.name || user.username || 'User';
      const score = bestLexicalScore([user.name, user.username], ctx.normalized);
      return {
        entityType: 'person' as const,
        entityId: user.id,
        title,
        subtitle: user.username ? `@${user.username}` : null,
        description: user.username ? `@${user.username}` : null,
        url: user.username ? `/u/${encodeURIComponent(user.username)}` : `/profile/${user.id}`,
        avatarUrl: user.avatar || null,
        authorOrOwnerId: user.id,
        lexicalScore: score || 0.4,
        attributes: {
          username: user.username || undefined,
          verified: user.isVerified,
          country: user.country || undefined,
          freelancer: Boolean(user.freelancerPlanActive),
          availableForHire: Boolean(serializeProfessionalAvailability(user.professionalAvailability, { publicOnly: true }))
        }
      };
    });
  }
};
