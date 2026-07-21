/**
 * Phase 29.5 — Enterprise Messaging Groups search (permission-aware).
 * SECRET groups never return metadata to non-members.
 */

import prisma from '../../utils/prismaClient';
import { normalizeGroupVisibility } from './groupVisibility';

export type GroupSearchCategory =
  | 'messages'
  | 'members'
  | 'groups'
  | 'pins'
  | 'files'
  | 'invites'
  | 'join_requests'
  | 'audit'
  | 'all';

export type GroupSearchInput = {
  userId: string;
  q?: string;
  category?: GroupSearchCategory;
  conversationId?: string;
  visibility?: string;
  senderId?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string | null;
  limit?: number;
  /** Admin bypass for cross-group search */
  isAdmin?: boolean;
};

export type GroupSearchHit = {
  type: string;
  id: string;
  conversationId?: string | null;
  title?: string | null;
  snippet?: string | null;
  highlight?: string | null;
  meta?: Record<string, unknown>;
  createdAt?: string | null;
  score?: number;
};

const decodeCursor = (raw?: string | null): { createdAt: string; id: string } | null => {
  if (!raw) return null;
  try {
    const json = Buffer.from(String(raw), 'base64url').toString('utf8');
    const p = JSON.parse(json);
    if (!p?.createdAt || !p?.id) return null;
    return { createdAt: String(p.createdAt), id: String(p.id) };
  } catch {
    return null;
  }
};

const encodeCursor = (createdAt: Date | string, id: string) =>
  Buffer.from(
    JSON.stringify({
      createdAt: typeof createdAt === 'string' ? createdAt : createdAt.toISOString(),
      id
    }),
    'utf8'
  ).toString('base64url');

const highlight = (text: string, q: string) => {
  const t = String(text || '');
  const query = String(q || '').trim();
  if (!query || !t) return t.slice(0, 200);
  const idx = t.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return t.slice(0, 200);
  const start = Math.max(0, idx - 40);
  const end = Math.min(t.length, idx + query.length + 80);
  const slice = t.slice(start, end);
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
  return (start > 0 ? '…' : '') + slice.replace(re, '«$1»') + (end < t.length ? '…' : '');
};

const fuzzyScore = (hay: string, needle: string) => {
  const h = hay.toLowerCase();
  const n = needle.toLowerCase();
  if (!n) return 0;
  if (h === n) return 100;
  if (h.startsWith(n)) return 90;
  if (h.includes(n)) return 70;
  // simple subsequence
  let i = 0;
  for (const ch of h) {
    if (ch === n[i]) i += 1;
    if (i >= n.length) return 40;
  }
  return 0;
};

/** Active memberships for the user (non-deleted). */
export const listUserGroupIds = async (userId: string): Promise<string[]> => {
  const rows = await prisma.conversationParticipant.findMany({
    where: {
      userId,
      deletedAt: null,
      conversation: { type: 'GROUP' }
    } as any,
    select: { conversationId: true }
  });
  return rows.map((r) => r.conversationId);
};

/**
 * Enterprise search. Non-admins only search groups they belong to.
 * PUBLIC discovery is separate (groupDiscovery.service).
 */
export const searchMessagingGroupsEnterprise = async (
  input: GroupSearchInput
): Promise<{
  hits: GroupSearchHit[];
  nextCursor: string | null;
  categories: Record<string, number>;
  tookMs: number;
}> => {
  const started = Date.now();
  const q = String(input.q || '').trim();
  const limit = Math.max(1, Math.min(50, Number(input.limit || 20) || 20));
  const category = (input.category || 'all') as GroupSearchCategory;
  const cursor = decodeCursor(input.cursor);
  const dateFrom = input.dateFrom ? new Date(input.dateFrom) : null;
  const dateTo = input.dateTo ? new Date(input.dateTo) : null;

  const memberGroupIds = input.isAdmin ? null : await listUserGroupIds(input.userId);
  if (!input.isAdmin && (!memberGroupIds || memberGroupIds.length === 0) && category !== 'groups') {
    return { hits: [], nextCursor: null, categories: {}, tookMs: Date.now() - started };
  }

  const hits: GroupSearchHit[] = [];
  const categories: Record<string, number> = {};

  const scopeIds =
    input.conversationId
      ? [input.conversationId]
      : memberGroupIds === null
        ? undefined
        : memberGroupIds;

  // If scoped to a conversation, enforce membership (or admin)
  if (input.conversationId && !input.isAdmin) {
    if (!memberGroupIds?.includes(input.conversationId)) {
      return { hits: [], nextCursor: null, categories: {}, tookMs: Date.now() - started };
    }
  }

  // --- Groups ---
  if (category === 'all' || category === 'groups') {
    const where: any = { type: 'GROUP' };
    if (scopeIds) where.id = { in: scopeIds };
    if (input.visibility) {
      const v = normalizeGroupVisibility(input.visibility);
      // non-admin never search SECRET outside membership (already scoped)
      where.visibility = v;
    }
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } }
      ];
    }
    try {
      const groups = await prisma.conversation.findMany({
        where,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          visibility: true,
          memberCount: true,
          updatedAt: true,
          category: true,
          emoji: true
        } as any
      });
      for (const g of groups as any[]) {
        // SECRET isolation: only if member (already scoped) or admin
        const vis = normalizeGroupVisibility(g.visibility);
        if (vis === 'SECRET' && !input.isAdmin && !memberGroupIds?.includes(g.id)) continue;
        const score = Math.max(
          fuzzyScore(String(g.title || ''), q),
          fuzzyScore(String(g.description || ''), q)
        );
        hits.push({
          type: 'groups',
          id: g.id,
          conversationId: g.id,
          title: g.title || 'Untitled group',
          snippet: String(g.description || '').slice(0, 160),
          highlight: q ? highlight(String(g.title || g.description || ''), q) : null,
          meta: {
            visibility: vis,
            memberCount: g.memberCount,
            category: g.category,
            emoji: g.emoji
          },
          createdAt: g.updatedAt?.toISOString?.() || null,
          score
        });
      }
      categories.groups = groups.length;
    } catch {
      categories.groups = 0;
    }
  }

  // --- Messages ---
  if ((category === 'all' || category === 'messages') && q) {
    const where: any = {
      deletedAt: null,
      text: { contains: q, mode: 'insensitive' },
      conversation: { type: 'GROUP' }
    };
    if (scopeIds) where.conversationId = { in: scopeIds };
    if (input.senderId) where.senderId = input.senderId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = dateFrom;
      if (dateTo) where.createdAt.lte = dateTo;
    }
    if (cursor) {
      const t = new Date(cursor.createdAt);
      where.AND = [
        {
          OR: [{ createdAt: { lt: t } }, { createdAt: t, id: { lt: cursor.id } }]
        }
      ];
    }
    try {
      const messages = await prisma.directMessage.findMany({
        where,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          conversationId: true,
          senderId: true,
          text: true,
          createdAt: true,
          attachments: true,
          messageType: true
        }
      });
      for (const m of messages) {
        hits.push({
          type: 'messages',
          id: m.id,
          conversationId: m.conversationId,
          title: null,
          snippet: String(m.text || '').slice(0, 200),
          highlight: highlight(String(m.text || ''), q),
          meta: {
            senderId: m.senderId,
            messageType: m.messageType,
            hasAttachments: (m.attachments || []).length > 0
          },
          createdAt: m.createdAt.toISOString(),
          score: fuzzyScore(String(m.text || ''), q)
        });
      }
      categories.messages = messages.length;
    } catch {
      categories.messages = 0;
    }
  }

  // --- Members (within accessible groups) ---
  if ((category === 'all' || category === 'members') && q) {
    try {
      const where: any = {
        deletedAt: null,
        conversation: { type: 'GROUP' },
        user: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { username: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } }
          ]
        }
      };
      if (scopeIds) where.conversationId = { in: scopeIds };
      const rows = await prisma.conversationParticipant.findMany({
        where,
        take: limit,
        include: {
          user: { select: { id: true, name: true, username: true, email: true } }
        }
      });
      for (const r of rows as any[]) {
        hits.push({
          type: 'members',
          id: `${r.conversationId}:${r.userId}`,
          conversationId: r.conversationId,
          title: r.user?.name || r.user?.username || r.userId,
          snippet: r.user?.username ? `@${r.user.username}` : null,
          highlight: q ? highlight(String(r.user?.name || r.user?.username || ''), q) : null,
          meta: { role: r.role, userId: r.userId },
          createdAt: r.joinedAt?.toISOString?.() || null,
          score: fuzzyScore(String(r.user?.name || ''), q)
        });
      }
      categories.members = rows.length;
    } catch {
      categories.members = 0;
    }
  }

  // --- Pins ---
  if (category === 'all' || category === 'pins') {
    try {
      const where: any = {};
      if (scopeIds) where.conversationId = { in: scopeIds };
      const pins = await (prisma as any).conversationPinnedMessage.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' }
      });
      for (const p of pins) {
        hits.push({
          type: 'pins',
          id: p.id,
          conversationId: p.conversationId,
          title: 'Pinned message',
          snippet: p.messageId,
          meta: { messageId: p.messageId, rank: p.rank },
          createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
          score: 50
        });
      }
      categories.pins = pins.length;
    } catch {
      categories.pins = 0;
    }
  }

  // --- Files (attachment IDs referenced in messages) ---
  if (category === 'all' || category === 'files') {
    try {
      const where: any = {
        deletedAt: null,
        attachments: { isEmpty: false },
        conversation: { type: 'GROUP' }
      };
      if (scopeIds) where.conversationId = { in: scopeIds };
      if (q) where.text = { contains: q, mode: 'insensitive' };
      const rows = await prisma.directMessage.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          conversationId: true,
          attachments: true,
          text: true,
          createdAt: true,
          messageType: true
        }
      });
      for (const m of rows) {
        hits.push({
          type: 'files',
          id: m.id,
          conversationId: m.conversationId,
          title: m.messageType || 'file',
          snippet: `${(m.attachments || []).length} attachment(s)`,
          meta: { attachmentIds: m.attachments },
          createdAt: m.createdAt.toISOString(),
          score: 30
        });
      }
      categories.files = rows.length;
    } catch {
      categories.files = 0;
    }
  }

  // Admin-only: invites, join_requests, audit
  if (input.isAdmin && (category === 'all' || category === 'invites')) {
    try {
      const rows = await (prisma as any).conversationInvite.findMany({
        where: q ? { code: { contains: q } } : {},
        take: Math.min(limit, 20),
        orderBy: { createdAt: 'desc' }
      });
      // Never return raw codes in non-admin paths; admin search may show code
      for (const inv of rows) {
        hits.push({
          type: 'invites',
          id: inv.id,
          conversationId: inv.conversationId,
          title: `Invite ${inv.status}`,
          snippet: inv.code ? `${String(inv.code).slice(0, 4)}…` : null,
          meta: {
            status: inv.status,
            maxUses: inv.maxUses,
            useCount: inv.useCount,
            expiresAt: inv.expiresAt
          },
          createdAt: inv.createdAt ? new Date(inv.createdAt).toISOString() : null,
          score: 20
        });
      }
      categories.invites = rows.length;
    } catch {
      categories.invites = 0;
    }
  }

  if (input.isAdmin && (category === 'all' || category === 'join_requests')) {
    try {
      const rows = await (prisma as any).conversationJoinRequest.findMany({
        where: { status: 'PENDING' },
        take: limit,
        orderBy: { createdAt: 'desc' }
      });
      for (const r of rows) {
        hits.push({
          type: 'join_requests',
          id: r.id,
          conversationId: r.conversationId,
          title: 'Join request',
          snippet: r.userId,
          meta: { status: r.status, userId: r.userId },
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
          score: 20
        });
      }
      categories.join_requests = rows.length;
    } catch {
      categories.join_requests = 0;
    }
  }

  if (input.isAdmin && (category === 'all' || category === 'audit')) {
    try {
      const where: any = {};
      if (q) where.action = { contains: q };
      if (input.conversationId) where.conversationId = input.conversationId;
      const rows = await (prisma as any).groupModerationAction.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' }
      });
      for (const a of rows) {
        hits.push({
          type: 'audit',
          id: a.id,
          conversationId: a.conversationId,
          title: a.action,
          snippet: a.reason || a.targetUserId || null,
          meta: { actorId: a.actorId, targetUserId: a.targetUserId },
          createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : null,
          score: 10
        });
      }
      categories.audit = rows.length;
    } catch {
      categories.audit = 0;
    }
  }

  hits.sort((a, b) => (b.score || 0) - (a.score || 0));
  const page = hits.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor =
    last?.createdAt && last?.id && category === 'messages'
      ? encodeCursor(last.createdAt, last.id)
      : null;

  return {
    hits: page,
    nextCursor,
    categories,
    tookMs: Date.now() - started
  };
};

/** In-memory recent/saved searches per user (process-local; Redis-ready later). */
const recentByUser = new Map<string, Array<{ q: string; at: number; category?: string }>>();
const savedByUser = new Map<string, Array<{ id: string; q: string; category?: string; name?: string }>>();

export const pushRecentSearch = (userId: string, q: string, category?: string) => {
  if (!userId || !q.trim()) return;
  const list = recentByUser.get(userId) || [];
  list.unshift({ q: q.trim().slice(0, 120), at: Date.now(), category });
  recentByUser.set(userId, list.slice(0, 20));
};

export const listRecentSearches = (userId: string) => recentByUser.get(userId) || [];

export const saveSearch = (userId: string, q: string, category?: string, name?: string) => {
  const id = `ss_${Date.now().toString(36)}`;
  const list = savedByUser.get(userId) || [];
  list.unshift({ id, q: q.trim().slice(0, 120), category, name: name || q });
  savedByUser.set(userId, list.slice(0, 50));
  return id;
};

export const listSavedSearches = (userId: string) => savedByUser.get(userId) || [];

export const GROUP_SEARCH_VERSION = '29.5';
