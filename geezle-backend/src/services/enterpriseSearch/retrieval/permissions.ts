/**
 * Viewer permission / block context for retrieval (does not modify Discovery eligibility).
 */
import prisma from '../../../utils/prismaClient';
import type { SearchCandidate } from '../contracts/types';
import { recordSearchMetric } from '../observability/observability';

export type SearchViewerContext = {
  viewerId: string | null;
  /** Users this viewer blocked or who blocked the viewer */
  blockedUserIds: Set<string>;
  /** Posts hidden by viewer */
  hiddenPostIds: Set<string>;
  /** Club ids viewer is an active member of */
  memberClubIds: Set<string>;
};

export const emptyViewerContext = (): SearchViewerContext => ({
  viewerId: null,
  blockedUserIds: new Set(),
  hiddenPostIds: new Set(),
  memberClubIds: new Set()
});

export const loadSearchViewerContext = async (viewerId?: string | null): Promise<SearchViewerContext> => {
  const id = String(viewerId || '').trim();
  if (!id) return emptyViewerContext();

  try {
    const [blocks, hidden, memberships] = await Promise.all([
      prisma.userBlock.findMany({
        where: { OR: [{ blockerId: id }, { blockedId: id }] },
        select: { blockerId: true, blockedId: true },
        take: 2_000
      }),
      prisma.communityPostHidden.findMany({
        where: { userId: id },
        select: { postId: true },
        take: 2_000
      }),
      prisma.clubMembership.findMany({
        where: { userId: id, status: 'active' },
        select: { clubId: true },
        take: 500
      })
    ]);

    const blockedUserIds = new Set<string>();
    for (const b of blocks) {
      if (b.blockerId === id) blockedUserIds.add(b.blockedId);
      if (b.blockedId === id) blockedUserIds.add(b.blockerId);
    }

    return {
      viewerId: id,
      blockedUserIds,
      hiddenPostIds: new Set(hidden.map((h) => h.postId)),
      memberClubIds: new Set(memberships.map((m) => m.clubId))
    };
  } catch {
    recordSearchMetric('viewer_context_error', 1);
    return { viewerId: id, blockedUserIds: new Set(), hiddenPostIds: new Set(), memberClubIds: new Set() };
  }
};

/**
 * Post-retrieval permission / visibility filter (defense in depth after adapter SQL).
 */
export const applyPermissionFilters = (
  candidates: SearchCandidate[],
  ctx: SearchViewerContext
): SearchCandidate[] => {
  if (!candidates.length) return [];
  const out: SearchCandidate[] = [];
  for (const c of candidates) {
    const owner = c.authorOrOwnerId ? String(c.authorOrOwnerId) : '';
    if (owner && ctx.blockedUserIds.has(owner)) {
      recordSearchMetric('filter_blocked', 1);
      continue;
    }
    if (c.entityType === 'post' && ctx.hiddenPostIds.has(c.entityId)) {
      recordSearchMetric('filter_hidden', 1);
      continue;
    }
    // Private club/group: require membership
    const vis = String(c.attributes?.visibility || '').toUpperCase();
    if ((c.entityType === 'group' || c.entityType === 'community') && vis === 'PRIVATE') {
      if (!ctx.viewerId || !ctx.memberClubIds.has(c.entityId)) {
        recordSearchMetric('filter_private_club', 1);
        continue;
      }
    }
    out.push(c);
  }
  return out;
};
