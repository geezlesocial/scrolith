/**
 * Phase 29.2 — pin/unpin domain service (ConversationPinnedMessage from 29.1 schema).
 */

import prisma from '../../utils/prismaClient';
import { recordGroupAudit } from './groupAudit';
import { getEffectivePermissionsForMember } from './groupSendGate';
import { normalizeMemberRole } from './groupPolicy';
import { emitGroupLifecycle } from './groupRealtime';
import { GROUP_WIRE_EVENTS } from './groupRealtimeEvents';
import { groupMetrics } from './groupMetrics';

export type PinResult =
  | { ok: true; pins: any[]; action: 'created' | 'removed' | 'noop' }
  | { ok: false; code: string; error: string };

const listPins = async (conversationId: string) => {
  try {
    const rows = await (prisma as any).conversationPinnedMessage.findMany({
      where: { conversationId },
      orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }]
    });
    // Drop pins whose messages are deleted/missing
    const messageIds = rows.map((r: any) => r.messageId);
    if (!messageIds.length) return [];
    const messages = await prisma.directMessage.findMany({
      where: { id: { in: messageIds }, conversationId, deletedAt: null },
      select: { id: true, text: true, senderId: true, createdAt: true, messageType: true }
    });
    const alive = new Set(messages.map((m) => m.id));
    const byId = new Map<string, (typeof messages)[number]>(messages.map((m) => [m.id, m]));
    return rows
      .filter((r: any) => alive.has(r.messageId))
      .map((r: any, index: number) => {
        const msg = byId.get(String(r.messageId));
        return {
          id: r.id,
          conversationId,
          messageId: r.messageId,
          pinnedById: r.pinnedById || null,
          rank: typeof r.rank === 'number' ? r.rank : index,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
          message: msg
            ? {
                id: msg.id,
                senderId: msg.senderId,
                text: String(msg.text || '').slice(0, 240),
                messageType: msg.messageType,
                createdAt: msg.createdAt ? new Date(msg.createdAt).toISOString() : null
              }
            : null
        };
      });
  } catch {
    return [];
  }
};

export const pinMessage = async (input: {
  conversationId: string;
  messageId: string;
  actorId: string;
}): Promise<PinResult> => {
  const conversationId = String(input.conversationId || '').trim();
  const messageId = String(input.messageId || '').trim();
  const actorId = String(input.actorId || '').trim();
  if (!conversationId || !messageId || !actorId) {
    return { ok: false, code: 'GROUP_VALIDATION', error: 'missing fields' };
  }

  const membership = await prisma.conversationParticipant.findFirst({
    where: { conversationId, userId: actorId, deletedAt: null } as any
  });
  if (!membership) return { ok: false, code: 'GROUP_NOT_MEMBER', error: 'Not a member' };

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.type !== 'GROUP') {
    return { ok: false, code: 'GROUP_NOT_FOUND', error: 'Not a group' };
  }

  const perms = getEffectivePermissionsForMember({
    role: normalizeMemberRole((membership as any).role),
    profileKey: (membership as any).profileKey,
    conversationOverrides: (conversation as any).permissionOverrides,
    participantOverrides: (membership as any).permissionOverrides
  });
  if (!perms.canPin) {
    return { ok: false, code: 'GROUP_PERMISSION_DENIED', error: 'Cannot pin' };
  }

  const message = await prisma.directMessage.findFirst({
    where: { id: messageId, conversationId, deletedAt: null }
  });
  if (!message) return { ok: false, code: 'GROUP_NOT_FOUND', error: 'Message not found' };

  try {
    const existing = await (prisma as any).conversationPinnedMessage.findUnique({
      where: { conversationId_messageId: { conversationId, messageId } }
    });
    if (existing) {
      const pins = await listPins(conversationId);
      return { ok: true, pins, action: 'noop' };
    }
    const maxRank = await (prisma as any).conversationPinnedMessage.aggregate({
      where: { conversationId },
      _max: { rank: true }
    });
    const rank = Number(maxRank?._max?.rank ?? -1) + 1;
    await (prisma as any).conversationPinnedMessage.create({
      data: {
        id: `cpin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        conversationId,
        messageId,
        pinnedById: actorId,
        rank
      }
    });
  } catch (e: any) {
    return { ok: false, code: 'GROUP_ERROR', error: e?.message || 'Pin failed' };
  }

  await recordGroupAudit({
    conversationId,
    actorId,
    action: 'pin.created',
    targetId: messageId,
    metadata: { messageId }
  });
  groupMetrics.pin();

  const pins = await listPins(conversationId);
  await emitGroupLifecycle(conversationId, GROUP_WIRE_EVENTS.PIN_UPDATED, {
    action: 'created',
    messageId,
    pins,
    actorId
  });
  return { ok: true, pins, action: 'created' };
};

export const unpinMessage = async (input: {
  conversationId: string;
  messageId: string;
  actorId: string;
}): Promise<PinResult> => {
  const conversationId = String(input.conversationId || '').trim();
  const messageId = String(input.messageId || '').trim();
  const actorId = String(input.actorId || '').trim();

  const membership = await prisma.conversationParticipant.findFirst({
    where: { conversationId, userId: actorId, deletedAt: null } as any
  });
  if (!membership) return { ok: false, code: 'GROUP_NOT_MEMBER', error: 'Not a member' };

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.type !== 'GROUP') {
    return { ok: false, code: 'GROUP_NOT_FOUND', error: 'Not a group' };
  }
  const perms = getEffectivePermissionsForMember({
    role: normalizeMemberRole((membership as any).role),
    profileKey: (membership as any).profileKey,
    conversationOverrides: (conversation as any).permissionOverrides,
    participantOverrides: (membership as any).permissionOverrides
  });
  if (!perms.canPin) {
    return { ok: false, code: 'GROUP_PERMISSION_DENIED', error: 'Cannot unpin' };
  }

  try {
    await (prisma as any).conversationPinnedMessage.deleteMany({
      where: { conversationId, messageId }
    });
  } catch (e: any) {
    return { ok: false, code: 'GROUP_ERROR', error: e?.message || 'Unpin failed' };
  }

  await recordGroupAudit({
    conversationId,
    actorId,
    action: 'pin.removed',
    targetId: messageId,
    metadata: { messageId }
  });
  groupMetrics.pin();

  const pins = await listPins(conversationId);
  await emitGroupLifecycle(conversationId, GROUP_WIRE_EVENTS.PIN_UPDATED, {
    action: 'removed',
    messageId,
    pins,
    actorId
  });
  return { ok: true, pins, action: 'removed' };
};

export const listGroupPins = listPins;

export const GROUP_PIN_SERVICE_VERSION = '29.2';
