/**
 * Phase 22.2 — Group messaging APIs (members, invites, meta, jump-to-message).
 */
import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import {
  canChangeRoles,
  canEditGroupMeta,
  canManageMembers,
  canRemoveMember,
  extractMentionUsernames,
  generateInviteCode,
  normalizeMemberRole,
  normalizeNotificationLevel,
  type MemberRole
} from '../services/messaging/groupPolicy';

const resolveUserId = (req: Request) => {
  const userId = req.user?.id;
  if (typeof userId === 'string' && userId.length > 0) return userId;
  return '';
};

const isAdminRole = (role: string) =>
  String(role || '')
    .toLowerCase()
    .match(/admin|moderator|superadmin/);

const getMembership = async (conversationId: string, userId: string) => {
  return prisma.conversationParticipant.findFirst({
    where: { conversationId, userId, deletedAt: null }
  } as any);
};

const requireGroupConversation = async (conversationId: string) => {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: { where: { deletedAt: null } as any } }
  } as any);
  if (!conversation) return { error: { status: 404, message: 'Conversation not found' } };
  if (conversation.type !== 'GROUP') {
    return { error: { status: 400, message: 'Not a group conversation' } };
  }
  return { conversation };
};

/** PATCH /conversations/:id — group metadata */
export const updateGroupMeta = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const { conversation, error } = await requireGroupConversation(conversationId);
    if (error) return res.status(error.status).json({ success: false, error: error.message });

    const membership = await getMembership(conversationId, userId);
    const role = normalizeMemberRole((membership as any)?.role);
    if (!membership && !isAdminRole(String(req.user?.role || ''))) {
      return res.status(403).json({ success: false, error: 'Not a member' });
    }
    if (membership && !canEditGroupMeta(role) && !isAdminRole(String(req.user?.role || ''))) {
      return res.status(403).json({ success: false, error: 'Insufficient role' });
    }

    const data: any = {};
    if (req.body?.title !== undefined) data.title = String(req.body.title || '').trim().slice(0, 120) || null;
    if (req.body?.description !== undefined)
      data.description = String(req.body.description || '').trim().slice(0, 2000) || null;
    if (req.body?.avatarFileId !== undefined)
      data.avatarFileId = String(req.body.avatarFileId || '').trim() || null;
    if (req.body?.visibility !== undefined) {
      const v = String(req.body.visibility || 'PRIVATE').toUpperCase();
      if (['PRIVATE', 'PUBLIC', 'UNLISTED'].includes(v)) data.visibility = v;
    }

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data
    } as any);

    return res.json({
      success: true,
      data: {
        id: updated.id,
        title: (updated as any).title || null,
        description: (updated as any).description || null,
        avatarFileId: (updated as any).avatarFileId || null,
        visibility: (updated as any).visibility || 'PRIVATE',
        type: 'group'
      }
    });
  } catch (e: any) {
    console.error('updateGroupMeta', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to update group' });
  }
};

/** GET /conversations/:id/members */
export const listGroupMembers = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const membership = await getMembership(conversationId, userId);
    if (!membership && !isAdminRole(String(req.user?.role || ''))) {
      return res.status(403).json({ success: false, error: 'Not a member' });
    }

    const rows = await prisma.conversationParticipant.findMany({
      where: { conversationId, deletedAt: null },
      include: {
        user: { select: { id: true, name: true, username: true, email: true, avatar: true, isOnline: true } }
      },
      orderBy: { joinedAt: 'asc' }
    } as any);

    const members = rows.map((p: any) => ({
      userId: p.userId,
      id: p.userId,
      name: p.user?.name || p.user?.email || 'Member',
      username: p.user?.username || '',
      avatar: p.user?.avatar || '',
      role: normalizeMemberRole(p.role),
      notifications: normalizeNotificationLevel(p.notifications),
      isMuted: Boolean(p.isMuted),
      joinedAt: p.joinedAt ? new Date(p.joinedAt).toISOString() : null,
      isOnline: Boolean(p.user?.isOnline)
    }));

    return res.json({ success: true, data: members });
  } catch (e: any) {
    console.error('listGroupMembers', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to list members' });
  }
};

/** POST /conversations/:id/members  body: { userIds: string[], role? } */
export const addGroupMembers = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const { conversation, error } = await requireGroupConversation(conversationId);
    if (error) return res.status(error.status).json({ success: false, error: error.message });

    const membership = await getMembership(conversationId, userId);
    const actorRole = normalizeMemberRole((membership as any)?.role);
    if (!membership || !canManageMembers(actorRole)) {
      if (!isAdminRole(String(req.user?.role || ''))) {
        return res.status(403).json({ success: false, error: 'Insufficient role' });
      }
    }

    const userIds = Array.from(
      new Set(
        (Array.isArray(req.body?.userIds) ? req.body.userIds : [])
          .map((id: any) => String(id || '').trim())
          .filter(Boolean)
      )
    );
    if (!userIds.length) return res.status(400).json({ success: false, error: 'userIds required' });
    const role = normalizeMemberRole(req.body?.role || 'MEMBER');
    if (role === 'OWNER') return res.status(400).json({ success: false, error: 'Cannot add OWNER via this endpoint' });

    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } });
    if (users.length !== userIds.length) {
      return res.status(400).json({ success: false, error: 'One or more users not found' });
    }

    // Phase 22.3B — group invite audience privacy
    try {
      const { canInviteToGroup } = await import('../services/messaging/messagingPrivacyPolicy');
      for (const id of userIds) {
        const gate = await canInviteToGroup(userId, id, conversationId);
        if (!gate.allowed) {
          return res.status(403).json({
            success: false,
            error: gate.reason || 'This member cannot be added due to their messaging preferences.',
            code: 'MESSAGING_PRIVACY_GROUP_INVITE_DENIED'
          });
        }
      }
    } catch {
      /* optional */
    }

    for (const id of userIds) {
      await prisma.conversationParticipant.upsert({
        where: { conversationId_userId: { conversationId, userId: id } },
        create: {
          conversationId,
          userId: id,
          role,
          deletedAt: null,
          isArchived: false
        } as any,
        update: {
          deletedAt: null,
          isArchived: false,
          role
        } as any
      });
    }

    return res.json({ success: true, data: { added: userIds.length, role } });
  } catch (e: any) {
    console.error('addGroupMembers', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to add members' });
  }
};

/** DELETE /conversations/:id/members/:memberUserId */
export const removeGroupMember = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const memberUserId = String(req.params.memberUserId || '').trim();
    const { error } = await requireGroupConversation(conversationId);
    if (error) return res.status(error.status).json({ success: false, error: error.message });

    const actor = await getMembership(conversationId, userId);
    const target = await getMembership(conversationId, memberUserId);
    if (!target) return res.status(404).json({ success: false, error: 'Member not found' });

    const actorRole = normalizeMemberRole((actor as any)?.role);
    const targetRole = normalizeMemberRole((target as any)?.role);
    const selfLeave = userId === memberUserId;
    if (!selfLeave) {
      if (!actor || !canRemoveMember(actorRole, targetRole)) {
        if (!isAdminRole(String(req.user?.role || ''))) {
          return res.status(403).json({ success: false, error: 'Insufficient role' });
        }
      }
    }
    if (targetRole === 'OWNER' && !selfLeave) {
      return res.status(400).json({ success: false, error: 'Transfer ownership before removing owner' });
    }

    await prisma.conversationParticipant.update({
      where: { id: (target as any).id },
      data: { deletedAt: new Date() }
    });

    // Phase 29.2 — realtime membership leave/kick
    try {
      const { emitGroupLifecycle } = await import('../services/messaging/groupRealtime');
      const { GROUP_WIRE_EVENTS } = await import('../services/messaging/groupRealtimeEvents');
      await emitGroupLifecycle(conversationId, GROUP_WIRE_EVENTS.MEMBER_LEFT, {
        userId: memberUserId,
        reason: selfLeave ? 'left' : 'kicked',
        actorId: userId
      });
      const count = await prisma.conversationParticipant.count({
        where: { conversationId, deletedAt: null } as any
      });
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { memberCount: count } as any
      });
    } catch {
      /* optional */
    }

    return res.json({ success: true, data: { removed: memberUserId } });
  } catch (e: any) {
    console.error('removeGroupMember', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to remove member' });
  }
};

/** PATCH /conversations/:id/members/:memberUserId  { role?, notifications? } */
export const updateGroupMember = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const memberUserId = String(req.params.memberUserId || '').trim();
    const { error } = await requireGroupConversation(conversationId);
    if (error) return res.status(error.status).json({ success: false, error: error.message });

    const actor = await getMembership(conversationId, userId);
    const target = await getMembership(conversationId, memberUserId);
    if (!target) return res.status(404).json({ success: false, error: 'Member not found' });

    const actorRole = normalizeMemberRole((actor as any)?.role);
    const targetRole = normalizeMemberRole((target as any)?.role);
    const data: any = {};

    if (req.body?.notifications !== undefined) {
      if (userId !== memberUserId && !canManageMembers(actorRole)) {
        return res.status(403).json({ success: false, error: 'Cannot change another member notifications' });
      }
      data.notifications = normalizeNotificationLevel(req.body.notifications);
    }

    if (req.body?.role !== undefined) {
      const next = normalizeMemberRole(req.body.role);
      if (!actor || !canChangeRoles(actorRole, targetRole, next)) {
        if (!isAdminRole(String(req.user?.role || ''))) {
          return res.status(403).json({ success: false, error: 'Cannot change role' });
        }
      }
      if (next === 'OWNER') {
        // Transfer: demote current owners to ADMIN
        await prisma.conversationParticipant.updateMany({
          where: { conversationId, role: 'OWNER' as any, deletedAt: null },
          data: { role: 'ADMIN' as any }
        });
      }
      data.role = next;
    }

    if (!Object.keys(data).length) {
      return res.status(400).json({ success: false, error: 'No updates' });
    }

    const updated = await prisma.conversationParticipant.update({
      where: { id: (target as any).id },
      data
    } as any);

    if (req.body?.role !== undefined) {
      try {
        const { emitGroupLifecycle } = await import('../services/messaging/groupRealtime');
        const { GROUP_WIRE_EVENTS } = await import('../services/messaging/groupRealtimeEvents');
        await emitGroupLifecycle(conversationId, GROUP_WIRE_EVENTS.MEMBER_ROLE, {
          userId: memberUserId,
          role: normalizeMemberRole((updated as any).role),
          actorId: userId
        });
      } catch {
        /* optional */
      }
    }

    return res.json({
      success: true,
      data: {
        userId: memberUserId,
        role: normalizeMemberRole((updated as any).role),
        notifications: normalizeNotificationLevel((updated as any).notifications)
      }
    });
  } catch (e: any) {
    console.error('updateGroupMember', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to update member' });
  }
};

/** POST /conversations/:id/invites  { inviteeUserId?, role?, expiresInHours? } */
export const createGroupInvite = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const { error } = await requireGroupConversation(conversationId);
    if (error) return res.status(error.status).json({ success: false, error: error.message });

    const membership = await getMembership(conversationId, userId);
    const role = normalizeMemberRole((membership as any)?.role);
    if (!membership || !canManageMembers(role)) {
      if (!isAdminRole(String(req.user?.role || ''))) {
        return res.status(403).json({ success: false, error: 'Insufficient role' });
      }
    }

    const inviteeUserId = req.body?.inviteeUserId ? String(req.body.inviteeUserId).trim() : null;
    const inviteRole = normalizeMemberRole(req.body?.role || 'MEMBER');
    if (inviteRole === 'OWNER') {
      return res.status(400).json({ success: false, error: 'Cannot invite as OWNER' });
    }
    const hours = Math.max(1, Math.min(720, Number(req.body?.expiresInHours || 168) || 168));
    const code = generateInviteCode();
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000);

    const invite = await (prisma as any).conversationInvite.create({
      data: {
        id: `cinv_${code}`,
        conversationId,
        code,
        inviteeUserId,
        invitedById: userId,
        role: inviteRole,
        status: 'PENDING',
        expiresAt
      }
    });

    return res.json({
      success: true,
      data: {
        id: invite.id,
        code: invite.code,
        role: invite.role,
        expiresAt: invite.expiresAt?.toISOString?.() || null,
        joinPath: `/messages/join/${invite.code}`
      }
    });
  } catch (e: any) {
    console.error('createGroupInvite', e);
    // Table may not exist yet — graceful error
    return res.status(500).json({ success: false, error: e?.message || 'Failed to create invite' });
  }
};

/** POST /messages/invites/:code/accept */
export const acceptGroupInvite = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const code = String(req.params.code || '').trim();
    if (!code) return res.status(400).json({ success: false, error: 'code required' });

    const invite = await (prisma as any).conversationInvite.findUnique({ where: { code } });
    if (!invite || invite.status !== 'PENDING') {
      return res.status(404).json({ success: false, error: 'Invite not found or inactive', code: 'GROUP_INVITE_EXPIRED' });
    }
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
      await (prisma as any).conversationInvite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' }
      });
      return res.status(410).json({ success: false, error: 'Invite expired', code: 'GROUP_INVITE_EXPIRED' });
    }
    if (invite.inviteeUserId && invite.inviteeUserId !== userId) {
      return res.status(403).json({ success: false, error: 'Invite is for another user', code: 'GROUP_JOIN_DENIED' });
    }

    // Phase 29.1 — max uses / one-time
    const useCount = Number(invite.useCount || 0);
    const maxUses = invite.maxUses != null ? Number(invite.maxUses) : invite.oneTime ? 1 : null;
    if (maxUses != null && useCount >= maxUses) {
      await (prisma as any).conversationInvite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' }
      });
      return res.status(410).json({ success: false, error: 'Invite usage limit reached', code: 'GROUP_INVITE_EXPIRED' });
    }

    // Phase 29.1 — requireApproval → join request instead of immediate join
    if (invite.requireApproval) {
      try {
        await (prisma as any).conversationJoinRequest.create({
          data: {
            id: `cjr_${Date.now().toString(36)}`,
            conversationId: invite.conversationId,
            userId,
            message: 'Via invite (approval required)',
            status: 'PENDING'
          }
        });
      } catch {
        /* may already exist */
      }
      await (prisma as any).conversationInvite.update({
        where: { id: invite.id },
        data: {
          useCount: useCount + 1,
          ...(maxUses != null && useCount + 1 >= maxUses ? { status: 'ACCEPTED', acceptedAt: new Date() } : {})
        }
      });
      return res.json({
        success: true,
        data: {
          conversationId: invite.conversationId,
          joined: false,
          pendingApproval: true
        }
      });
    }

    // Capacity check
    try {
      const conv = await prisma.conversation.findUnique({
        where: { id: invite.conversationId },
        select: { maxMembers: true, type: true } as any
      });
      if (conv?.maxMembers != null) {
        const count = await prisma.conversationParticipant.count({
          where: { conversationId: invite.conversationId, deletedAt: null } as any
        });
        if (count >= Number(conv.maxMembers)) {
          return res.status(403).json({ success: false, error: 'Group is full', code: 'GROUP_FULL' });
        }
      }
    } catch {
      /* optional columns */
    }

    await prisma.conversationParticipant.upsert({
      where: {
        conversationId_userId: { conversationId: invite.conversationId, userId }
      },
      create: {
        conversationId: invite.conversationId,
        userId,
        role: invite.role || 'MEMBER',
        deletedAt: null
      } as any,
      update: {
        deletedAt: null,
        isArchived: false,
        role: invite.role || 'MEMBER'
      } as any
    });

    const nextUse = useCount + 1;
    const exhausted = maxUses != null && nextUse >= maxUses;
    await (prisma as any).conversationInvite.update({
      where: { id: invite.id },
      data: {
        useCount: nextUse,
        status: exhausted || invite.oneTime ? 'ACCEPTED' : 'PENDING',
        acceptedAt: exhausted || invite.oneTime ? new Date() : invite.acceptedAt,
        inviteeUserId: invite.inviteeUserId || userId
      }
    });

    try {
      const { recordGroupAudit } = await import('../services/messaging/groupAudit');
      await recordGroupAudit({
        conversationId: invite.conversationId,
        actorId: userId,
        action: 'invite.accepted',
        targetUserId: userId,
        targetId: invite.id
      });
      const count = await prisma.conversationParticipant.count({
        where: { conversationId: invite.conversationId, deletedAt: null } as any
      });
      await prisma.conversation.update({
        where: { id: invite.conversationId },
        data: { memberCount: count } as any
      });
    } catch {
      /* optional */
    }

    return res.json({
      success: true,
      data: { conversationId: invite.conversationId, joined: true }
    });
  } catch (e: any) {
    console.error('acceptGroupInvite', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to accept invite' });
  }
};

/**
 * GET /conversations/:id/messages/around/:messageId?limit=40
 * Jump-to-message window (optional 22.2 feature).
 */
export const getMessagesAround = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const messageId = String(req.params.messageId || '').trim();
    const limit = Math.max(10, Math.min(80, Number(req.query?.limit || 40) || 40));
    const half = Math.floor(limit / 2);

    const membership = await getMembership(conversationId, userId);
    if (!membership && !isAdminRole(String(req.user?.role || ''))) {
      return res.status(403).json({ success: false, error: 'Not a member' });
    }

    const anchor = await prisma.directMessage.findFirst({
      where: { id: messageId, conversationId },
      select: { id: true, createdAt: true }
    });
    if (!anchor) return res.status(404).json({ success: false, error: 'Message not found' });

    const before = await prisma.directMessage.findMany({
      where: {
        conversationId,
        OR: [
          { createdAt: { lt: anchor.createdAt } },
          { createdAt: anchor.createdAt, id: { lt: anchor.id } }
        ]
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: half
    });
    const after = await prisma.directMessage.findMany({
      where: {
        conversationId,
        OR: [
          { createdAt: { gt: anchor.createdAt } },
          { createdAt: anchor.createdAt, id: { gt: anchor.id } }
        ]
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: half
    });
    const center = await prisma.directMessage.findUnique({ where: { id: messageId } });
    const messages = [...before.reverse(), center, ...after].filter(Boolean).map((m: any) => ({
      id: m.id,
      conversationId,
      conversation_id: conversationId,
      senderId: m.senderId,
      sender_id: m.senderId,
      text: m.text,
      timestamp: m.createdAt?.toISOString?.() || null,
      clientMessageId: m.clientMessageId || null,
      metadata: m.metadata || null,
      attachments: m.attachments || []
    }));

    return res.json({
      success: true,
      data: { messages, anchorMessageId: messageId, count: messages.length }
    });
  } catch (e: any) {
    console.error('getMessagesAround', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to load messages' });
  }
};

/** Resolve mention usernames → user ids (for postMessage). */
export const resolveMentionUserIds = async (text: string): Promise<string[]> => {
  const usernames = extractMentionUsernames(text);
  if (!usernames.length) return [];
  const users = await prisma.user.findMany({
    where: {
      OR: usernames.map((u) => ({ username: { equals: u, mode: 'insensitive' as any } }))
    },
    select: { id: true }
  });
  return users.map((u) => u.id);
};

export { extractMentionUsernames, normalizeMemberRole, type MemberRole };
