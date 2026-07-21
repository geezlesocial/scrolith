/**
 * Phase 29.1 — append-only group moderation / lifecycle audit.
 */

import prisma from '../../utils/prismaClient';

export type GroupAuditAction =
  | 'group.created'
  | 'group.updated'
  | 'group.settings_updated'
  | 'group.permissions_updated'
  | 'group.locked'
  | 'group.unlocked'
  | 'group.archived'
  | 'member.joined'
  | 'member.left'
  | 'member.kicked'
  | 'member.banned'
  | 'member.muted'
  | 'member.role_changed'
  | 'invite.created'
  | 'invite.accepted'
  | 'invite.revoked'
  | 'invite.expired'
  | 'join_request.created'
  | 'join_request.approved'
  | 'join_request.rejected'
  | 'message.send_denied'
  | string;

export const recordGroupAudit = async (input: {
  conversationId: string;
  actorId?: string | null;
  action: GroupAuditAction;
  targetUserId?: string | null;
  targetId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> => {
  const conversationId = String(input.conversationId || '').trim();
  if (!conversationId || !input.action) return;
  try {
    await (prisma as any).groupModerationAction.create({
      data: {
        id: `gma_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
        conversationId,
        actorId: input.actorId || null,
        action: String(input.action),
        targetUserId: input.targetUserId || null,
        targetId: input.targetId || null,
        reason: input.reason || null,
        metadata: input.metadata || undefined
      }
    });
  } catch (e) {
    // Table may not exist until migration; never break primary path
    console.warn('[group-audit] write failed', (e as any)?.message || e);
  }
};

export const GROUP_AUDIT_VERSION = '29.1';
