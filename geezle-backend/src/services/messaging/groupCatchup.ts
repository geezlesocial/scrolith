/**
 * Phase 29.2 — reconnect catch-up (cursor-based, bounded).
 * Ordering: (createdAt ASC, id ASC). Cursor is opaque base64 JSON.
 */

import prisma from '../../utils/prismaClient';
import { listGroupPins } from './groupPinService';
import { snapshotEphemeral } from './groupEphemeralIndicators';
import { normalizeMessagingMode } from './permissionEngine';
import { normalizeGroupVisibility, normalizeJoinPolicy } from './groupVisibility';
import { groupMetrics } from './groupMetrics';

export type CatchupCursor = {
  createdAt: string;
  id: string;
};

export const encodeCatchupCursor = (createdAt: Date | string, id: string): string => {
  const payload: CatchupCursor = {
    createdAt: typeof createdAt === 'string' ? createdAt : createdAt.toISOString(),
    id: String(id)
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
};

export const decodeCatchupCursor = (raw?: string | null): CatchupCursor | null => {
  if (!raw) return null;
  try {
    const json = Buffer.from(String(raw), 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (!parsed?.createdAt || !parsed?.id) return null;
    return { createdAt: String(parsed.createdAt), id: String(parsed.id) };
  } catch {
    return null;
  }
};

export const buildGroupCatchup = async (input: {
  conversationId: string;
  userId: string;
  cursor?: string | null;
  limit?: number;
}) => {
  const conversationId = String(input.conversationId || '').trim();
  const userId = String(input.userId || '').trim();
  const limit = Math.max(1, Math.min(100, Number(input.limit || 50) || 50));

  const membership = await prisma.conversationParticipant.findFirst({
    where: { conversationId, userId, deletedAt: null } as any
  });
  if (!membership) {
    return { ok: false as const, code: 'GROUP_NOT_MEMBER', error: 'Not a member' };
  }

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.type !== 'GROUP') {
    return { ok: false as const, code: 'GROUP_NOT_FOUND', error: 'Not a group' };
  }

  const cursor = decodeCatchupCursor(input.cursor);
  const where: any = {
    conversationId,
    deletedAt: null
  };
  if (cursor) {
    const t = new Date(cursor.createdAt);
    where.OR = [
      { createdAt: { gt: t } },
      { createdAt: t, id: { gt: cursor.id } }
    ];
  }

  const messages = await prisma.directMessage.findMany({
    where,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit + 1,
    select: {
      id: true,
      conversationId: true,
      senderId: true,
      text: true,
      messageType: true,
      attachments: true,
      replyToMessageId: true,
      metadata: true,
      editedAt: true,
      createdAt: true,
      clientMessageId: true
    }
  });

  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;
  const last = page[page.length - 1];
  const nextCursor = last ? encodeCatchupCursor(last.createdAt, last.id) : input.cursor || null;

  const pins = await listGroupPins(conversationId);
  const ephemeral = snapshotEphemeral(conversationId);

  // Recent membership-relevant audit (bounded)
  let recentMembershipEvents: any[] = [];
  try {
    recentMembershipEvents = await (prisma as any).groupModerationAction.findMany({
      where: {
        conversationId,
        action: {
          in: [
            'member.joined',
            'member.left',
            'member.kicked',
            'member.banned',
            'member.muted',
            'group.locked',
            'group.unlocked',
            'group.updated',
            'group.permissions_updated',
            'invite.created',
            'invite.revoked',
            'join_request.approved',
            'join_request.rejected'
          ]
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 30
    });
  } catch {
    recentMembershipEvents = [];
  }

  groupMetrics.reconnectCatchup();

  return {
    ok: true as const,
    data: {
      conversationId,
      cursor: nextCursor,
      hasMore,
      ordering: 'createdAt_asc_id_asc',
      messages: page.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        text: m.text,
        messageType: m.messageType,
        attachments: m.attachments || [],
        replyToMessageId: m.replyToMessageId,
        metadata: m.metadata,
        editedAt: m.editedAt?.toISOString?.() || null,
        createdAt: m.createdAt.toISOString(),
        clientMessageId: (m as any).clientMessageId || null,
        timestamp: m.createdAt.toISOString()
      })),
      group: {
        visibility: normalizeGroupVisibility((conversation as any).visibility),
        joinPolicy: normalizeJoinPolicy((conversation as any).joinPolicy),
        messagingMode: normalizeMessagingMode((conversation as any).messagingMode),
        slowModeSeconds: Number((conversation as any).slowModeSeconds || 0),
        settingsVersion: Number((conversation as any).settingsVersion || 1),
        lockedAt: (conversation as any).lockedAt
          ? new Date((conversation as any).lockedAt).toISOString()
          : null,
        lockExpiresAt: (conversation as any).lockExpiresAt
          ? new Date((conversation as any).lockExpiresAt).toISOString()
          : null,
        memberRole: (membership as any).role || 'MEMBER'
      },
      pins,
      ephemeral: {
        typing: ephemeral.typing,
        recording: ephemeral.recording
      },
      recentEvents: recentMembershipEvents.map((e: any) => ({
        id: e.id,
        action: e.action,
        actorId: e.actorId,
        targetUserId: e.targetUserId,
        createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : null
        // no secrets
      }))
    }
  };
};

export const GROUP_CATCHUP_VERSION = '29.2';
