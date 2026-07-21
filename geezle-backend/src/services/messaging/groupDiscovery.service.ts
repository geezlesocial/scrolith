/**
 * Phase 29.5 — Public messaging group discovery.
 * SECRET never appears. PRIVATE only if explicitly public policy (never here).
 */

import prisma from '../../utils/prismaClient';
import { normalizeGroupVisibility } from './groupVisibility';

export type DiscoveryMode = 'trending' | 'active' | 'growing' | 'recommended';

export const discoverPublicMessagingGroups = async (input: {
  mode?: DiscoveryMode;
  language?: string;
  category?: string;
  limit?: number;
  userId?: string;
}) => {
  const limit = Math.max(1, Math.min(40, Number(input.limit || 20) || 20));
  const mode = input.mode || 'active';

  const where: any = {
    type: 'GROUP',
    visibility: 'PUBLIC',
    archivedAt: null
  };
  if (input.language) where.language = input.language;
  if (input.category) where.category = { contains: input.category, mode: 'insensitive' };

  let orderBy: any = { updatedAt: 'desc' };
  if (mode === 'active') orderBy = { lastMessageAt: 'desc' };
  if (mode === 'growing' || mode === 'trending') orderBy = { memberCount: 'desc' };
  if (mode === 'recommended') orderBy = { updatedAt: 'desc' };

  let rows: any[] = [];
  try {
    rows = await prisma.conversation.findMany({
      where,
      orderBy,
      take: limit,
      select: {
        id: true,
        title: true,
        description: true,
        visibility: true,
        memberCount: true,
        joinPolicy: true,
        category: true,
        language: true,
        emoji: true,
        accentColor: true,
        avatarFileId: true,
        lastMessageAt: true,
        createdAt: true,
        updatedAt: true
      } as any
    });
  } catch {
    // Pre-migration fallback
    rows = await prisma.conversation.findMany({
      where: { type: 'GROUP', visibility: 'PUBLIC' as any },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        description: true,
        visibility: true,
        updatedAt: true,
        lastMessageAt: true,
        createdAt: true
      }
    });
  }

  // Mutual-member recommendations: groups sharing members with user's groups
  let recommendedIds = new Set<string>();
  if (input.userId && mode === 'recommended') {
    try {
      const myGroups = await prisma.conversationParticipant.findMany({
        where: { userId: input.userId, deletedAt: null, conversation: { type: 'GROUP' } } as any,
        select: { conversationId: true }
      });
      const myIds = myGroups.map((g) => g.conversationId);
      if (myIds.length) {
        const peers = await prisma.conversationParticipant.findMany({
          where: {
            conversationId: { in: myIds },
            deletedAt: null,
            userId: { not: input.userId }
          } as any,
          select: { userId: true },
          take: 100
        });
        const peerIds = Array.from(new Set(peers.map((p) => p.userId))).slice(0, 40);
        if (peerIds.length) {
          const shared = await prisma.conversationParticipant.findMany({
            where: {
              userId: { in: peerIds },
              deletedAt: null,
              conversation: { type: 'GROUP', visibility: 'PUBLIC' as any }
            } as any,
            select: { conversationId: true },
            take: 100
          });
          shared.forEach((s) => recommendedIds.add(s.conversationId));
        }
      }
    } catch {
      recommendedIds = new Set();
    }
  }

  const mapped = rows
    .filter((g) => normalizeGroupVisibility(g.visibility) === 'PUBLIC')
    .map((g) => ({
      id: g.id,
      title: g.title || 'Public group',
      description: g.description ? String(g.description).slice(0, 200) : null,
      visibility: 'PUBLIC',
      memberCount: g.memberCount ?? null,
      joinPolicy: g.joinPolicy || 'OPEN',
      category: g.category || null,
      language: g.language || null,
      emoji: g.emoji || null,
      accentColor: g.accentColor || null,
      avatarFileId: g.avatarFileId || null,
      lastMessageAt: g.lastMessageAt || g.updatedAt || null,
      createdAt: g.createdAt,
      recommended: recommendedIds.has(g.id)
    }));

  if (mode === 'recommended' && recommendedIds.size) {
    mapped.sort((a, b) => Number(b.recommended) - Number(a.recommended));
  }

  return {
    mode,
    groups: mapped,
    note: 'SECRET groups never appear. PRIVATE groups are not listed in public discovery.'
  };
};

export const GROUP_DISCOVERY_VERSION = '29.5';
