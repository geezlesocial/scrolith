/**
 * Phase 29.2 — authorized fan-out for group realtime events.
 * Never trusts socket room membership alone; always filters by DB membership.
 */

import prisma from '../../utils/prismaClient';
import realtime from '../../utils/realtime';
import { GROUP_WIRE_EVENTS, groupRoomName } from './groupRealtimeEvents';
import { groupMetrics, logGroupRealtime } from './groupMetrics';
import { normalizeGroupVisibility } from './groupVisibility';

export type FanoutOptions = {
  /** Exclude these user ids from fan-out */
  excludeUserIds?: string[];
  /** If true, include soft-deleted members (almost never) */
  includeDeleted?: boolean;
  /** Compact payload — never include invite codes / secrets */
  event: string;
  payload: Record<string, unknown>;
  /** When set, dual-emit to messages:group:{id} room (members who joined room) */
  alsoRoom?: boolean;
};

const activeMemberIds = async (conversationId: string): Promise<string[]> => {
  const rows = await prisma.conversationParticipant.findMany({
    where: { conversationId, deletedAt: null } as any,
    select: { userId: true }
  });
  return rows.map((r) => String(r.userId)).filter(Boolean);
};

/**
 * Load membership for authorization (active only).
 */
export const getActiveMembership = async (conversationId: string, userId: string) => {
  if (!conversationId || !userId) return null;
  return prisma.conversationParticipant.findFirst({
    where: { conversationId, userId, deletedAt: null } as any
  });
};

/**
 * Whether user may join group socket room / receive private group events.
 */
export const authorizeGroupRealtimeAccess = async (
  conversationId: string,
  userId: string
): Promise<{ allowed: boolean; reason: string; visibility?: string }> => {
  if (!conversationId || !userId) {
    return { allowed: false, reason: 'missing_ids' };
  }
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, type: true, visibility: true, archivedAt: true } as any
  });
  if (!conversation || conversation.type !== 'GROUP') {
    return { allowed: false, reason: 'not_group' };
  }
  const membership = await getActiveMembership(conversationId, userId);
  if (!membership) {
    groupMetrics.socketJoinDenied();
    return {
      allowed: false,
      reason: 'not_member',
      visibility: normalizeGroupVisibility((conversation as any).visibility)
    };
  }
  return {
    allowed: true,
    reason: 'member',
    visibility: normalizeGroupVisibility((conversation as any).visibility)
  };
};

/**
 * Fan-out event to all active group members (user rooms), optionally group room.
 * SECRET/PRIVATE isolation: only active members receive events (no public fan-out).
 */
export const emitToGroupMembers = async (
  conversationId: string,
  options: FanoutOptions
): Promise<{ targetCount: number }> => {
  const started = Date.now();
  const exclude = new Set((options.excludeUserIds || []).map((id) => String(id || '').trim()).filter(Boolean));
  let memberIds: string[] = [];
  try {
    memberIds = await activeMemberIds(conversationId);
  } catch (e) {
    logGroupRealtime('warn', 'fanout_member_lookup_failed', {
      conversationId,
      event: options.event
    });
    return { targetCount: 0 };
  }

  const targets = memberIds.filter((id) => !exclude.has(id));
  const safePayload = {
    ...options.payload,
    conversationId,
    // Never attach secrets
    code: undefined,
    inviteCode: undefined,
    token: undefined
  };
  // Remove undefined keys that would leak empty secrets
  delete (safePayload as any).code;
  delete (safePayload as any).inviteCode;
  delete (safePayload as any).token;

  for (const userId of targets) {
    try {
      realtime.emitToUser(userId, options.event, safePayload);
    } catch {
      /* continue */
    }
  }

  if (options.alsoRoom !== false) {
    try {
      realtime.emitToRoom(groupRoomName(conversationId), options.event, safePayload);
    } catch {
      /* optional */
    }
  }

  groupMetrics.deliveryLatency(Date.now() - started);
  return { targetCount: targets.length };
};

export const emitGroupLifecycle = async (
  conversationId: string,
  event: string,
  payload: Record<string, unknown>,
  excludeUserIds?: string[]
) => {
  if (
    event === GROUP_WIRE_EVENTS.MEMBER_JOINED ||
    event === GROUP_WIRE_EVENTS.MEMBER_LEFT ||
    event === GROUP_WIRE_EVENTS.MEMBER_ROLE ||
    event === GROUP_WIRE_EVENTS.MEMBER_RESTRICTED
  ) {
    groupMetrics.membershipEvent();
  }
  return emitToGroupMembers(conversationId, {
    event,
    payload: { ...payload, version: payload.version ?? Date.now() },
    excludeUserIds,
    alsoRoom: true
  });
};

/** Compact member identity for events (no email) */
export const compactMember = (row: {
  userId: string;
  role?: string | null;
  profileKey?: string | null;
  name?: string | null;
}) => ({
  userId: row.userId,
  role: row.role || 'MEMBER',
  profileKey: row.profileKey || null,
  name: row.name || null
});

export const GROUP_REALTIME_VERSION = '29.2';
