/**
 * Phase 29.4 — Admin control plane for Enterprise Messaging Groups.
 * Does not touch Community Groups. Additive admin APIs only.
 */
import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { recordGroupAudit } from '../services/messaging/groupAudit';
import { emitGroupLifecycle } from '../services/messaging/groupRealtime';
import { GROUP_WIRE_EVENTS } from '../services/messaging/groupRealtimeEvents';
import { groupAdminMetrics } from '../services/messaging/groupAdminMetrics';
import { normalizeMemberRole } from '../services/messaging/groupPolicy';
import { normalizeGroupVisibility, normalizeJoinPolicy } from '../services/messaging/groupVisibility';
import { normalizeMessagingMode } from '../services/messaging/permissionEngine';
import { groupMetrics } from '../services/messaging/groupMetrics';

const SETTINGS_SCOPE = 'messaging_groups_admin_settings';
const TEMPLATES_SCOPE = 'messaging_groups_policy_templates';

const resolveActorId = (req: Request) => String(req.user?.id || '').trim() || null;

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const POLICY_TEMPLATES = [
  {
    key: 'corporate',
    label: 'Corporate',
    messagingMode: 'EVERYONE',
    joinPolicy: 'INVITE_ONLY',
    visibility: 'PRIVATE',
    slowModeSeconds: 0,
    content: { allowExternalLinks: true, allowFiles: true, allowImages: true, allowVoice: true }
  },
  {
    key: 'announcements',
    label: 'Read-only Announcements',
    messagingMode: 'ANNOUNCEMENT',
    joinPolicy: 'INVITE_ONLY',
    visibility: 'PRIVATE',
    slowModeSeconds: 0,
    content: { allowExternalLinks: true, allowFiles: false, allowImages: true, allowVoice: false }
  },
  {
    key: 'support',
    label: 'Support',
    messagingMode: 'EVERYONE',
    joinPolicy: 'REQUEST',
    visibility: 'PUBLIC',
    slowModeSeconds: 5,
    content: { allowFiles: true, allowImages: true, allowVoice: true }
  },
  {
    key: 'gaming',
    label: 'Gaming',
    messagingMode: 'EVERYONE',
    joinPolicy: 'OPEN',
    visibility: 'PUBLIC',
    slowModeSeconds: 0,
    content: { allowGifs: true, allowStickers: true, allowVoice: true }
  },
  {
    key: 'education',
    label: 'Education',
    messagingMode: 'MODS_PLUS',
    joinPolicy: 'INVITE_ONLY',
    visibility: 'PRIVATE',
    slowModeSeconds: 10,
    content: { allowFiles: true, allowImages: true }
  },
  {
    key: 'family',
    label: 'Family',
    messagingMode: 'EVERYONE',
    joinPolicy: 'INVITE_ONLY',
    visibility: 'SECRET',
    slowModeSeconds: 0,
    content: { allowImages: true, allowVoice: true, allowVideos: true }
  },
  {
    key: 'developers',
    label: 'Developers',
    messagingMode: 'EVERYONE',
    joinPolicy: 'INVITE_ONLY',
    visibility: 'PRIVATE',
    slowModeSeconds: 0,
    content: { allowFiles: true, allowExternalLinks: true }
  },
  {
    key: 'business',
    label: 'Business',
    messagingMode: 'ADMINS_ONLY',
    joinPolicy: 'INVITE_ONLY',
    visibility: 'PRIVATE',
    slowModeSeconds: 0,
    content: { allowFiles: true, allowImages: true }
  }
];

const defaultSystemSettings = () => ({
  defaultVisibility: 'PRIVATE',
  defaultJoinPolicy: 'INVITE_ONLY',
  defaultSlowModeSeconds: 0,
  maxMembers: 5000,
  maxPins: 50,
  maxInvites: 100,
  maxAttachmentsPerMessage: 10,
  maxFileSizeMb: 50,
  rateLimitPerMinute: 60,
  retentionDays: 365,
  auditRetentionDays: 730
});

/** GET /admin/messaging-groups/overview */
export const adminMessagingGroupsOverview = async (req: Request, res: Response) => {
  try {
    groupAdminMetrics.views();
    const today = startOfToday();
    const groupWhere = { type: 'GROUP' as const };

    const [
      totalGroups,
      publicGroups,
      privateGroups,
      secretGroups,
      unlistedGroups,
      messagesToday,
      pendingJoinRequests,
      activeInvites
    ] = await Promise.all([
      prisma.conversation.count({ where: groupWhere }),
      prisma.conversation.count({ where: { ...groupWhere, visibility: 'PUBLIC' as any } }).catch(() => 0),
      prisma.conversation.count({ where: { ...groupWhere, visibility: 'PRIVATE' as any } }).catch(() => 0),
      prisma.conversation.count({ where: { ...groupWhere, visibility: 'SECRET' as any } }).catch(() => 0),
      prisma.conversation.count({ where: { ...groupWhere, visibility: 'UNLISTED' as any } }).catch(() => 0),
      prisma.directMessage.count({
        where: { createdAt: { gte: today }, conversation: { type: 'GROUP' } }
      }),
      (prisma as any).conversationJoinRequest
        ?.count?.({ where: { status: 'PENDING' } })
        .catch?.(() => 0) ?? 0,
      (prisma as any).conversationInvite
        ?.count?.({ where: { status: 'PENDING' } })
        .catch?.(() => 0) ?? 0
    ]);

    let lockedGroups = 0;
    let announcementGroups = 0;
    let memberSum = 0;
    try {
      lockedGroups = await prisma.conversation.count({
        where: { type: 'GROUP', messagingMode: 'LOCKED' as any }
      });
      announcementGroups = await prisma.conversation.count({
        where: { type: 'GROUP', messagingMode: 'ANNOUNCEMENT' as any }
      });
      const agg = await prisma.conversation.aggregate({
        where: { type: 'GROUP' },
        _avg: { memberCount: true } as any,
        _sum: { memberCount: true } as any
      });
      memberSum = Number((agg as any)?._sum?.memberCount || 0);
    } catch {
      /* columns may be missing pre-migration */
    }

    let largest: any[] = [];
    try {
      largest = await prisma.conversation.findMany({
        where: { type: 'GROUP' },
        orderBy: { memberCount: 'desc' } as any,
        take: 8,
        select: {
          id: true,
          title: true,
          memberCount: true,
          visibility: true,
          messagingMode: true,
          lastMessageAt: true
        } as any
      });
    } catch {
      largest = await prisma.conversation.findMany({
        where: { type: 'GROUP' },
        orderBy: { updatedAt: 'desc' },
        take: 8,
        select: { id: true, title: true, visibility: true, lastMessageAt: true, updatedAt: true }
      });
    }

    // Activity by day (last 7) — message counts for groups
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const recentMessages = await prisma.directMessage.findMany({
      where: { createdAt: { gte: sevenDaysAgo }, conversation: { type: 'GROUP' } },
      select: { createdAt: true },
      take: 5000
    });
    const byDay: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() - i * 86400000);
      byDay[d.toISOString().slice(0, 10)] = 0;
    }
    recentMessages.forEach((m) => {
      const key = m.createdAt.toISOString().slice(0, 10);
      if (byDay[key] != null) byDay[key] += 1;
    });

    return res.json({
      success: true,
      data: {
        totals: {
          totalGroups,
          publicGroups,
          privateGroups,
          secretGroups,
          unlistedGroups,
          messagesToday,
          pendingJoinRequests,
          activeInvites,
          lockedGroups,
          announcementGroups,
          averageMembers: totalGroups ? Math.round(memberSum / totalGroups) : 0,
          memberSum
        },
        largestGroups: largest.map((g: any) => ({
          id: g.id,
          title: g.title || 'Untitled',
          memberCount: g.memberCount ?? null,
          visibility: g.visibility || 'PRIVATE',
          messagingMode: g.messagingMode || 'EVERYONE',
          lastMessageAt: g.lastMessageAt || g.updatedAt || null
        })),
        activitySeries: Object.entries(byDay)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, messages]) => ({ date, messages })),
        realtime: groupMetrics.snapshot(),
        adminMetrics: groupAdminMetrics.snapshot()
      }
    });
  } catch (e: any) {
    console.error('adminMessagingGroupsOverview', e);
    return res.status(500).json({ success: false, error: e?.message || 'Overview failed' });
  }
};

/** GET /admin/messaging-groups */
export const adminListMessagingGroups = async (req: Request, res: Response) => {
  try {
    groupAdminMetrics.views();
    const page = Math.max(1, Number(req.query.page || 1) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25) || 25));
    const q = String(req.query.q || req.query.search || '').trim();
    const visibility = String(req.query.visibility || '').trim().toUpperCase();
    const messagingMode = String(req.query.messagingMode || req.query.mode || '').trim().toUpperCase();
    const locked = String(req.query.locked || '') === '1' || String(req.query.locked || '') === 'true';

    const where: any = { type: 'GROUP' };
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { id: { contains: q } }
      ];
    }
    if (visibility && ['PUBLIC', 'PRIVATE', 'SECRET', 'UNLISTED'].includes(visibility)) {
      where.visibility = visibility;
    }
    if (messagingMode) where.messagingMode = messagingMode;
    if (locked) where.messagingMode = 'LOCKED';
    if (String(req.query.archived || '') === '1') {
      where.archivedAt = { not: null };
    }

    const [total, rows] = await Promise.all([
      prisma.conversation.count({ where }),
      prisma.conversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          participants: {
            where: { deletedAt: null } as any,
            take: 5,
            include: { user: { select: { id: true, name: true, email: true, username: true } } }
          },
          _count: { select: { messages: true, participants: true, invites: true } as any }
        }
      })
    ]);

    const data = rows.map((c: any) => {
      const owner = (c.participants || []).find((p: any) => String(p.role || '').toUpperCase() === 'OWNER');
      return {
        id: c.id,
        title: c.title || 'Untitled group',
        description: c.description || null,
        visibility: normalizeGroupVisibility(c.visibility),
        joinPolicy: normalizeJoinPolicy(c.joinPolicy),
        messagingMode: normalizeMessagingMode(c.messagingMode),
        memberCount: c.memberCount ?? c._count?.participants ?? (c.participants || []).length,
        messageCount: c._count?.messages ?? 0,
        inviteCount: c._count?.invites ?? 0,
        owner: owner?.user
          ? { id: owner.user.id, name: owner.user.name || owner.user.email, username: owner.user.username }
          : null,
        locked: String(c.messagingMode || '').toUpperCase() === 'LOCKED' || Boolean(c.lockedAt),
        archivedAt: c.archivedAt || null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        lastMessageAt: c.lastMessageAt,
        avatarFileId: c.avatarFileId || null,
        emoji: c.emoji || null,
        category: c.category || null
      };
    });

    return res.json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (e: any) {
    console.error('adminListMessagingGroups', e);
    return res.status(500).json({ success: false, error: e?.message || 'List failed' });
  }
};

/** GET /admin/messaging-groups/:id */
export const adminGetMessagingGroup = async (req: Request, res: Response) => {
  try {
    groupAdminMetrics.views();
    const id = String(req.params.id || '').trim();
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: {
          where: { deletedAt: null } as any,
          include: {
            user: { select: { id: true, name: true, email: true, username: true, avatar: true, isOnline: true } }
          },
          orderBy: { joinedAt: 'asc' }
        },
        invites: { orderBy: { createdAt: 'desc' }, take: 50 } as any,
        _count: { select: { messages: true } }
      }
    });
    if (!conversation || conversation.type !== 'GROUP') {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    let settings = null;
    let audit: any[] = [];
    let pins: any[] = [];
    let joinRequests: any[] = [];
    try {
      settings = await (prisma as any).conversationSettings.findUnique({ where: { conversationId: id } });
    } catch {
      /* optional */
    }
    try {
      audit = await (prisma as any).groupModerationAction.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: 'desc' },
        take: 100
      });
    } catch {
      audit = [];
    }
    try {
      pins = await (prisma as any).conversationPinnedMessage.findMany({
        where: { conversationId: id },
        orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }]
      });
    } catch {
      pins = [];
    }
    try {
      joinRequests = await (prisma as any).conversationJoinRequest.findMany({
        where: { conversationId: id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 50
      });
    } catch {
      joinRequests = [];
    }

    // Storage estimate: attachment count on messages
    const attachmentSample = await prisma.directMessage.findMany({
      where: { conversationId: id },
      select: { attachments: true },
      take: 500
    });
    const attachmentIds = attachmentSample.flatMap((m) => m.attachments || []);

    const members = (conversation.participants || []).map((p: any) => ({
      userId: p.userId,
      role: normalizeMemberRole(p.role),
      profileKey: p.profileKey || null,
      notifications: p.notifications || 'ALL',
      isMuted: Boolean(p.isMuted),
      joinedAt: p.joinedAt,
      name: p.user?.name || p.user?.email || 'Member',
      username: p.user?.username || '',
      avatar: p.user?.avatar || '',
      isOnline: Boolean(p.user?.isOnline)
    }));

    // Never expose invite codes to response for SECRET unless admin — still show codes only to admin (this is admin API)
    const invites = ((conversation as any).invites || []).map((inv: any) => ({
      id: inv.id,
      code: inv.code,
      status: inv.status,
      role: inv.role,
      expiresAt: inv.expiresAt,
      maxUses: inv.maxUses,
      useCount: inv.useCount,
      oneTime: inv.oneTime,
      createdAt: inv.createdAt,
      invitedById: inv.invitedById
    }));

    return res.json({
      success: true,
      data: {
        id: conversation.id,
        title: conversation.title,
        description: conversation.description,
        visibility: normalizeGroupVisibility((conversation as any).visibility),
        joinPolicy: normalizeJoinPolicy((conversation as any).joinPolicy),
        messagingMode: normalizeMessagingMode((conversation as any).messagingMode),
        slowModeSeconds: Number((conversation as any).slowModeSeconds || 0),
        memberCount: (conversation as any).memberCount ?? members.length,
        messageCount: (conversation as any)._count?.messages ?? 0,
        lockedAt: (conversation as any).lockedAt,
        lockedReason: (conversation as any).lockedReason,
        archivedAt: (conversation as any).archivedAt,
        category: (conversation as any).category,
        language: (conversation as any).language,
        country: (conversation as any).country,
        emoji: (conversation as any).emoji,
        accentColor: (conversation as any).accentColor,
        avatarFileId: (conversation as any).avatarFileId,
        bannerFileId: (conversation as any).bannerFileId,
        settingsVersion: (conversation as any).settingsVersion,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        lastMessageAt: conversation.lastMessageAt,
        members,
        invites,
        joinRequests,
        pins,
        settings,
        audit,
        storage: {
          attachmentReferenceCount: attachmentIds.length,
          uniqueAttachmentIds: Array.from(new Set(attachmentIds)).length
        }
      }
    });
  } catch (e: any) {
    console.error('adminGetMessagingGroup', e);
    return res.status(500).json({ success: false, error: e?.message || 'Detail failed' });
  }
};

/** POST /admin/messaging-groups/:id/actions */
export const adminMessagingGroupAction = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    const action = String(req.body?.action || '').trim().toLowerCase();
    const actorId = resolveActorId(req);
    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation || conversation.type !== 'GROUP') {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    groupAdminMetrics.actions();

    if (action === 'lock' || action === 'force_lock' || action === 'emergency_lockdown') {
      groupAdminMetrics.lockdowns();
      const updated = await prisma.conversation.update({
        where: { id },
        data: {
          messagingMode: 'LOCKED' as any,
          lockedAt: new Date(),
          lockedById: actorId,
          lockedReason: String(req.body?.reason || action).slice(0, 500),
          lockExpiresAt: req.body?.expiresInMinutes
            ? new Date(Date.now() + Number(req.body.expiresInMinutes) * 60_000)
            : null,
          settingsVersion: Number((conversation as any).settingsVersion || 1) + 1
        } as any
      });
      await recordGroupAudit({
        conversationId: id,
        actorId,
        action: 'group.locked',
        reason: String(req.body?.reason || action),
        metadata: { admin: true, action }
      });
      void emitGroupLifecycle(id, GROUP_WIRE_EVENTS.GROUP_LOCKED, {
        actorId,
        messagingMode: 'LOCKED',
        admin: true
      });
      return res.json({ success: true, data: { id, messagingMode: (updated as any).messagingMode } });
    }

    if (action === 'unlock') {
      const mode = normalizeMessagingMode(req.body?.messagingMode || 'EVERYONE');
      const updated = await prisma.conversation.update({
        where: { id },
        data: {
          messagingMode: mode as any,
          lockedAt: null,
          lockedById: null,
          lockedReason: null,
          lockExpiresAt: null,
          settingsVersion: Number((conversation as any).settingsVersion || 1) + 1
        } as any
      });
      await recordGroupAudit({ conversationId: id, actorId, action: 'group.unlocked', metadata: { admin: true } });
      void emitGroupLifecycle(id, GROUP_WIRE_EVENTS.GROUP_UNLOCKED, { actorId, messagingMode: mode, admin: true });
      return res.json({ success: true, data: { id, messagingMode: (updated as any).messagingMode } });
    }

    if (action === 'archive' || action === 'disable' || action === 'freeze') {
      const updated = await prisma.conversation.update({
        where: { id },
        data: {
          archivedAt: new Date(),
          messagingMode: action === 'freeze' ? ('LOCKED' as any) : (conversation as any).messagingMode
        } as any
      });
      await recordGroupAudit({
        conversationId: id,
        actorId,
        action: 'group.archived',
        reason: action,
        metadata: { admin: true }
      });
      void emitGroupLifecycle(id, GROUP_WIRE_EVENTS.GROUP_UPDATED, {
        action: 'archived',
        actorId,
        admin: true
      });
      return res.json({ success: true, data: { id, archivedAt: (updated as any).archivedAt } });
    }

    if (action === 'unarchive') {
      const updated = await prisma.conversation.update({
        where: { id },
        data: { archivedAt: null } as any
      });
      await recordGroupAudit({ conversationId: id, actorId, action: 'group.updated', metadata: { unarchived: true } });
      return res.json({ success: true, data: { id, archivedAt: (updated as any).archivedAt } });
    }

    if (action === 'set_mode') {
      const mode = normalizeMessagingMode(req.body?.messagingMode || req.body?.mode);
      const slow = Math.max(0, Math.min(3600, Number(req.body?.slowModeSeconds ?? (conversation as any).slowModeSeconds) || 0));
      const updated = await prisma.conversation.update({
        where: { id },
        data: {
          messagingMode: mode as any,
          slowModeSeconds: slow,
          settingsVersion: Number((conversation as any).settingsVersion || 1) + 1
        } as any
      });
      await recordGroupAudit({
        conversationId: id,
        actorId,
        action: 'group.updated',
        metadata: { messagingMode: mode, slowModeSeconds: slow, admin: true }
      });
      void emitGroupLifecycle(id, GROUP_WIRE_EVENTS.GROUP_UPDATED, {
        action: 'mode',
        messagingMode: mode,
        slowModeSeconds: slow,
        actorId,
        admin: true
      });
      return res.json({ success: true, data: { id, messagingMode: (updated as any).messagingMode, slowModeSeconds: slow } });
    }

    if (action === 'set_visibility') {
      const visibility = normalizeGroupVisibility(req.body?.visibility);
      const joinPolicy =
        visibility === 'SECRET' ? 'INVITE_ONLY' : normalizeJoinPolicy(req.body?.joinPolicy || (conversation as any).joinPolicy);
      const updated = await prisma.conversation.update({
        where: { id },
        data: { visibility: visibility as any, joinPolicy: joinPolicy as any } as any
      });
      await recordGroupAudit({
        conversationId: id,
        actorId,
        action: 'group.updated',
        metadata: { visibility, joinPolicy, admin: true }
      });
      return res.json({
        success: true,
        data: { id, visibility: (updated as any).visibility, joinPolicy: (updated as any).joinPolicy }
      });
    }

    if (action === 'transfer_ownership') {
      const newOwnerId = String(req.body?.userId || req.body?.newOwnerId || '').trim();
      if (!newOwnerId) return res.status(400).json({ success: false, error: 'newOwnerId required' });
      const member = await prisma.conversationParticipant.findFirst({
        where: { conversationId: id, userId: newOwnerId, deletedAt: null } as any
      });
      if (!member) return res.status(400).json({ success: false, error: 'Target must be an active member' });
      await prisma.conversationParticipant.updateMany({
        where: { conversationId: id, role: 'OWNER' as any, deletedAt: null },
        data: { role: 'ADMIN' as any }
      });
      await prisma.conversationParticipant.update({
        where: { id: member.id },
        data: { role: 'OWNER' as any }
      });
      groupAdminMetrics.promotions();
      await recordGroupAudit({
        conversationId: id,
        actorId,
        action: 'member.role_changed',
        targetUserId: newOwnerId,
        metadata: { role: 'OWNER', transfer: true, admin: true }
      });
      void emitGroupLifecycle(id, GROUP_WIRE_EVENTS.MEMBER_ROLE, {
        userId: newOwnerId,
        role: 'OWNER',
        actorId,
        admin: true
      });
      return res.json({ success: true, data: { id, ownerId: newOwnerId } });
    }

    if (action === 'kick' || action === 'ban') {
      const userId = String(req.body?.userId || '').trim();
      if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
      const member = await prisma.conversationParticipant.findFirst({
        where: { conversationId: id, userId, deletedAt: null } as any
      });
      if (!member) return res.status(404).json({ success: false, error: 'Member not found' });
      if (normalizeMemberRole((member as any).role) === 'OWNER') {
        return res.status(400).json({ success: false, error: 'Transfer ownership before removing owner' });
      }
      await prisma.conversationParticipant.update({
        where: { id: member.id },
        data: { deletedAt: new Date() }
      });
      if (action === 'ban') {
        groupAdminMetrics.bans();
        groupAdminMetrics.restrictions();
        try {
          await (prisma as any).conversationMemberRestriction.create({
            data: {
              id: `cmr_admin_${Date.now().toString(36)}`,
              conversationId: id,
              userId,
              kind: 'BAN',
              reason: String(req.body?.reason || 'Admin ban').slice(0, 500),
              actorId,
              active: true
            }
          });
        } catch {
          /* optional */
        }
      }
      await recordGroupAudit({
        conversationId: id,
        actorId,
        action: action === 'ban' ? 'member.banned' : 'member.kicked',
        targetUserId: userId,
        reason: String(req.body?.reason || ''),
        metadata: { admin: true }
      });
      void emitGroupLifecycle(id, GROUP_WIRE_EVENTS.MEMBER_LEFT, {
        userId,
        reason: action,
        actorId,
        admin: true
      });
      return res.json({ success: true, data: { id, userId, action } });
    }

    if (action === 'promote' || action === 'demote' || action === 'set_role') {
      const userId = String(req.body?.userId || '').trim();
      const role = normalizeMemberRole(req.body?.role || (action === 'promote' ? 'ADMIN' : 'MEMBER'));
      if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
      if (role === 'OWNER') {
        return res.status(400).json({ success: false, error: 'Use transfer_ownership for OWNER' });
      }
      await prisma.conversationParticipant.updateMany({
        where: { conversationId: id, userId },
        data: { role: role as any }
      });
      groupAdminMetrics.promotions();
      await recordGroupAudit({
        conversationId: id,
        actorId,
        action: 'member.role_changed',
        targetUserId: userId,
        metadata: { role, admin: true }
      });
      void emitGroupLifecycle(id, GROUP_WIRE_EVENTS.MEMBER_ROLE, { userId, role, actorId, admin: true });
      return res.json({ success: true, data: { id, userId, role } });
    }

    if (action === 'revoke_invite') {
      const inviteId = String(req.body?.inviteId || '').trim();
      if (!inviteId) return res.status(400).json({ success: false, error: 'inviteId required' });
      await (prisma as any).conversationInvite.update({
        where: { id: inviteId },
        data: { status: 'REVOKED' }
      });
      groupAdminMetrics.invitesRevoked();
      await recordGroupAudit({
        conversationId: id,
        actorId,
        action: 'invite.revoked',
        targetId: inviteId,
        metadata: { admin: true }
      });
      void emitGroupLifecycle(id, GROUP_WIRE_EVENTS.INVITE_REVOKED, { inviteId, actorId, admin: true });
      return res.json({ success: true, data: { inviteId, status: 'REVOKED' } });
    }

    if (action === 'apply_template') {
      const key = String(req.body?.templateKey || req.body?.key || '').trim().toLowerCase();
      const template = POLICY_TEMPLATES.find((t) => t.key === key);
      if (!template) return res.status(400).json({ success: false, error: 'Unknown template' });
      await prisma.conversation.update({
        where: { id },
        data: {
          visibility: template.visibility as any,
          joinPolicy: template.joinPolicy as any,
          messagingMode: template.messagingMode as any,
          slowModeSeconds: template.slowModeSeconds,
          settingsVersion: Number((conversation as any).settingsVersion || 1) + 1
        } as any
      });
      try {
        await (prisma as any).conversationSettings.upsert({
          where: { conversationId: id },
          create: { id: `cset_${id}`, conversationId: id, ...template.content },
          update: template.content
        });
      } catch {
        /* optional */
      }
      await recordGroupAudit({
        conversationId: id,
        actorId,
        action: 'group.updated',
        metadata: { template: key, admin: true }
      });
      return res.json({ success: true, data: { id, template: key } });
    }

    if (action === 'delete_message') {
      const messageId = String(req.body?.messageId || '').trim();
      if (!messageId) return res.status(400).json({ success: false, error: 'messageId required' });
      const msg = await prisma.directMessage.findFirst({ where: { id: messageId, conversationId: id } });
      if (!msg) return res.status(404).json({ success: false, error: 'Message not found' });
      await prisma.directMessage.update({
        where: { id: messageId },
        data: { deletedAt: new Date(), text: '' }
      });
      groupAdminMetrics.reportsProcessed();
      await recordGroupAudit({
        conversationId: id,
        actorId,
        action: 'moderator.delete_message',
        targetId: messageId,
        reason: String(req.body?.reason || ''),
        metadata: { admin: true }
      });
      return res.json({ success: true, data: { messageId, deleted: true } });
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
  } catch (e: any) {
    console.error('adminMessagingGroupAction', e);
    return res.status(500).json({ success: false, error: e?.message || 'Action failed' });
  }
};

/** GET /admin/messaging-groups/audit */
export const adminMessagingGroupsAudit = async (req: Request, res: Response) => {
  try {
    groupAdminMetrics.views();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50) || 50));
    const conversationId = String(req.query.conversationId || '').trim();
    const action = String(req.query.action || '').trim();
    const where: any = {};
    if (conversationId) where.conversationId = conversationId;
    if (action) where.action = { contains: action };
    const rows = await (prisma as any).groupModerationAction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    return res.json({ success: true, data: rows });
  } catch (e: any) {
    // Pre-migration
    return res.json({ success: true, data: [], note: e?.message || 'audit unavailable' });
  }
};

/** GET /admin/messaging-groups/join-requests */
export const adminListAllJoinRequests = async (req: Request, res: Response) => {
  try {
    const status = String(req.query.status || 'PENDING').toUpperCase();
    const rows = await (prisma as any).conversationJoinRequest.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    return res.json({ success: true, data: rows });
  } catch (e: any) {
    return res.json({ success: true, data: [], note: e?.message || 'join requests unavailable' });
  }
};

/** GET /admin/messaging-groups/templates */
export const adminListPolicyTemplates = async (_req: Request, res: Response) => {
  try {
    let custom: any[] = [];
    try {
      const row = await prisma.appSetting.findUnique({ where: { scope: TEMPLATES_SCOPE } });
      if (row?.data && Array.isArray((row.data as any).templates)) {
        custom = (row.data as any).templates;
      }
    } catch {
      /* optional */
    }
    return res.json({ success: true, data: { system: POLICY_TEMPLATES, custom } });
  } catch (e: any) {
    return res.json({ success: true, data: { system: POLICY_TEMPLATES, custom: [] } });
  }
};

/** GET/PUT /admin/messaging-groups/settings */
export const adminGetMessagingGroupSettings = async (_req: Request, res: Response) => {
  try {
    const row = await prisma.appSetting.findUnique({ where: { scope: SETTINGS_SCOPE } });
    const data = { ...defaultSystemSettings(), ...((row?.data as any) || {}) };
    return res.json({ success: true, data });
  } catch {
    return res.json({ success: true, data: defaultSystemSettings() });
  }
};

export const adminPutMessagingGroupSettings = async (req: Request, res: Response) => {
  try {
    groupAdminMetrics.actions();
    const next = { ...defaultSystemSettings(), ...(req.body || {}) };
    await prisma.appSetting.upsert({
      where: { scope: SETTINGS_SCOPE },
      create: { scope: SETTINGS_SCOPE, data: next },
      update: { data: next }
    });
    return res.json({ success: true, data: next });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || 'Settings failed' });
  }
};

/** GET /admin/messaging-groups/export?type=groups|audit */
export const adminExportMessagingGroups = async (req: Request, res: Response) => {
  try {
    groupAdminMetrics.actions();
    const type = String(req.query.type || 'groups').toLowerCase();
    if (type === 'audit') {
      const rows = await (prisma as any).groupModerationAction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 1000
      });
      // No message bodies
      return res.json({ success: true, data: rows, exportedAt: new Date().toISOString() });
    }
    const groups = await prisma.conversation.findMany({
      where: { type: 'GROUP' },
      select: {
        id: true,
        title: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
        lastMessageAt: true,
        memberCount: true,
        messagingMode: true,
        joinPolicy: true
      } as any,
      take: 2000
    });
    return res.json({ success: true, data: groups, exportedAt: new Date().toISOString() });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || 'Export failed' });
  }
};

/** GET /admin/messaging-groups/metrics */
export const adminMessagingGroupsMetrics = async (_req: Request, res: Response) => {
  return res.json({
    success: true,
    data: {
      admin: groupAdminMetrics.snapshot(),
      realtime: groupMetrics.snapshot()
    }
  });
};
