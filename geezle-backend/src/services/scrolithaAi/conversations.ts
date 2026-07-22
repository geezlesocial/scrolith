/**
 * Phase 33.1 — AI conversation / session management.
 * Stores metadata and optional message previews; full sensitive prompts only when consent allows.
 */
import { randomUUID } from 'crypto';
import prisma from '../../utils/prismaClient';
import { getAIConsent } from './consent';
import { hashContent } from './audit';

const isMissing = (err: any) =>
  err?.code === 'P2021' || err instanceof TypeError || /does not exist/i.test(String(err?.message || ''));

export type AIConversationRecord = {
  id: string;
  userId: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  messageCount: number;
  lastMessageAt: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type AIMessageRecord = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  /** Preview only when history consent off — never full secrets */
  contentPreview: string;
  contentHash: string;
  /** Full content only if user opted into activity history */
  content?: string | null;
  disclosure?: Record<string, unknown> | null;
  capability?: string | null;
  correlationId?: string | null;
  createdAt: string;
};

const convMem = new Map<string, AIConversationRecord>();
const msgMem = new Map<string, AIMessageRecord[]>();

function previewOf(text: string, max = 280): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

export async function listConversations(
  userId: string,
  opts: { q?: string; limit?: number } = {}
): Promise<AIConversationRecord[]> {
  const limit = Math.min(100, Math.max(1, opts.limit || 50));
  const q = String(opts.q || '').trim().toLowerCase();
  try {
    const rows =
      (await (prisma as any).aIConversation?.findMany?.({
        where: {
          userId,
          archived: false,
          ...(q ? { title: { contains: q, mode: 'insensitive' } } : {})
        },
        orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
        take: limit
      })) || [];
    if (rows.length) {
      return rows.map(mapConv);
    }
  } catch (err) {
    if (!isMissing(err)) {
      /* soft */
    }
  }
  return Array.from(convMem.values())
    .filter((c) => c.userId === userId && !c.archived)
    .filter((c) => (q ? c.title.toLowerCase().includes(q) : true))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

function mapConv(row: any): AIConversationRecord {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title || 'New chat',
    pinned: Boolean(row.pinned),
    archived: Boolean(row.archived),
    messageCount: Number(row.messageCount || 0),
    lastMessageAt: row.lastMessageAt?.toISOString?.() || row.lastMessageAt || null,
    metadata: row.metadata || null,
    createdAt: row.createdAt?.toISOString?.() || row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt
  };
}

export async function createConversation(
  userId: string,
  title = 'New chat'
): Promise<AIConversationRecord> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const rec: AIConversationRecord = {
    id,
    userId,
    title: String(title || 'New chat').slice(0, 120),
    pinned: false,
    archived: false,
    messageCount: 0,
    lastMessageAt: null,
    metadata: { phase: '33.1' },
    createdAt: now,
    updatedAt: now
  };
  convMem.set(id, rec);
  msgMem.set(id, []);
  try {
    await (prisma as any).aIConversation?.create?.({
      data: {
        id,
        userId,
        title: rec.title,
        pinned: false,
        archived: false,
        messageCount: 0,
        metadata: rec.metadata
      }
    });
  } catch {
    /* memory */
  }
  return rec;
}

export async function getConversation(userId: string, id: string) {
  try {
    const row = await (prisma as any).aIConversation?.findFirst?.({ where: { id, userId } });
    if (row) return mapConv(row);
  } catch {
    /* mem */
  }
  const m = convMem.get(id);
  return m && m.userId === userId ? m : null;
}

export async function updateConversation(
  userId: string,
  id: string,
  patch: { title?: string; pinned?: boolean; archived?: boolean }
) {
  const existing = await getConversation(userId, id);
  if (!existing) return null;
  const next: AIConversationRecord = {
    ...existing,
    title: patch.title !== undefined ? String(patch.title).slice(0, 120) : existing.title,
    pinned: patch.pinned !== undefined ? Boolean(patch.pinned) : existing.pinned,
    archived: patch.archived !== undefined ? Boolean(patch.archived) : existing.archived,
    updatedAt: new Date().toISOString()
  };
  convMem.set(id, next);
  try {
    await (prisma as any).aIConversation?.updateMany?.({
      where: { id, userId },
      data: {
        title: next.title,
        pinned: next.pinned,
        archived: next.archived
      }
    });
  } catch {
    /* mem */
  }
  return next;
}

export async function deleteConversation(userId: string, id: string) {
  const existing = await getConversation(userId, id);
  if (!existing) return { deleted: false };
  convMem.delete(id);
  msgMem.delete(id);
  try {
    await (prisma as any).aIConversationMessage?.deleteMany?.({ where: { conversationId: id } });
    await (prisma as any).aIConversation?.deleteMany?.({ where: { id, userId } });
  } catch {
    /* mem */
  }
  return { deleted: true };
}

export async function clearAllConversations(userId: string) {
  const list = await listConversations(userId, { limit: 100 });
  for (const c of list) {
    await deleteConversation(userId, c.id);
  }
  return { cleared: list.length };
}

export async function listMessages(
  userId: string,
  conversationId: string,
  limit = 100
): Promise<AIMessageRecord[]> {
  const conv = await getConversation(userId, conversationId);
  if (!conv) return [];
  const consent = await getAIConsent(userId);
  try {
    const rows =
      (await (prisma as any).aIConversationMessage?.findMany?.({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        take: Math.min(200, Math.max(1, limit))
      })) || [];
    if (rows.length) {
      return rows.map((r: any) => ({
        id: r.id,
        conversationId: r.conversationId,
        role: r.role,
        contentPreview: r.contentPreview || '',
        contentHash: r.contentHash || '',
        content: consent.aiActivityHistoryEnabled ? r.content || null : null,
        disclosure: r.disclosure || null,
        capability: r.capability || null,
        correlationId: r.correlationId || null,
        createdAt: r.createdAt?.toISOString?.() || r.createdAt
      }));
    }
  } catch {
    /* mem */
  }
  const msgs = msgMem.get(conversationId) || [];
  return msgs.slice(-limit).map((m) => ({
    ...m,
    content: consent.aiActivityHistoryEnabled ? m.content : null
  }));
}

export async function appendMessage(input: {
  userId: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  disclosure?: Record<string, unknown> | null;
  capability?: string | null;
  correlationId?: string | null;
}): Promise<AIMessageRecord | null> {
  const conv = await getConversation(input.userId, input.conversationId);
  if (!conv) return null;
  const consent = await getAIConsent(input.userId);
  const id = randomUUID();
  const now = new Date().toISOString();
  const storeFull = consent.aiActivityHistoryEnabled;
  const rec: AIMessageRecord = {
    id,
    conversationId: input.conversationId,
    role: input.role,
    contentPreview: previewOf(input.content),
    contentHash: hashContent(input.content),
    content: storeFull ? String(input.content).slice(0, 20_000) : null,
    disclosure: input.disclosure || null,
    capability: input.capability || null,
    correlationId: input.correlationId || null,
    createdAt: now
  };
  const list = msgMem.get(input.conversationId) || [];
  list.push(rec);
  msgMem.set(input.conversationId, list);

  const nextConv: AIConversationRecord = {
    ...conv,
    messageCount: conv.messageCount + 1,
    lastMessageAt: now,
    updatedAt: now,
    title:
      conv.messageCount === 0 && input.role === 'user'
        ? previewOf(input.content, 60) || conv.title
        : conv.title
  };
  convMem.set(input.conversationId, nextConv);

  try {
    await (prisma as any).aIConversationMessage?.create?.({
      data: {
        id,
        conversationId: input.conversationId,
        role: input.role,
        contentPreview: rec.contentPreview,
        contentHash: rec.contentHash,
        content: rec.content,
        disclosure: rec.disclosure,
        capability: rec.capability,
        correlationId: rec.correlationId
      }
    });
    await (prisma as any).aIConversation?.updateMany?.({
      where: { id: input.conversationId, userId: input.userId },
      data: {
        messageCount: { increment: 1 },
        lastMessageAt: new Date(),
        title: nextConv.title
      }
    });
  } catch {
    /* mem */
  }
  return rec;
}

export async function exportConversations(userId: string) {
  const consent = await getAIConsent(userId);
  const convs = await listConversations(userId, { limit: 100 });
  const out = [];
  for (const c of convs) {
    const messages = await listMessages(userId, c.id, 200);
    out.push({
      conversation: c,
      messages: messages.map((m) => ({
        role: m.role,
        contentPreview: m.contentPreview,
        content: consent.aiActivityHistoryEnabled ? m.content : undefined,
        createdAt: m.createdAt,
        capability: m.capability
      }))
    });
  }
  return {
    exportedAt: new Date().toISOString(),
    privacyNotice:
      'Export includes previews always; full message bodies only when AI activity history is enabled. Sensitive secrets should not be present.',
    conversations: out
  };
}

export default {
  listConversations,
  createConversation,
  getConversation,
  updateConversation,
  deleteConversation,
  clearAllConversations,
  listMessages,
  appendMessage,
  exportConversations
};
