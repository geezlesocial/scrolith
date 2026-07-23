/**
 * Phase 29.1 — Enterprise Messaging Groups foundation APIs.
 * Additive routes under /api/messages/groups/* — does not replace Phase 22.2 endpoints.
 */
import { Request, Response } from 'express';
import { randomBytes, createHash } from 'crypto';
import prisma from '../utils/prismaClient';
import {
  canManageMembers,
  generateInviteCode,
  normalizeMemberRole,
  type MemberRole
} from '../services/messaging/groupPolicy';
import {
  computeEffectivePermissions,
  defaultPermissionsForRole,
  normalizeMessagingMode,
  normalizeProfileKey,
  PERMISSION_ENGINE_VERSION,
  type PermissionMap
} from '../services/messaging/permissionEngine';
import {
  normalizeGroupVisibility,
  normalizeJoinPolicy,
  resolveJoinPolicyForVisibility,
  isGroupDiscoverable,
  isGroupPreviewAllowed
} from '../services/messaging/groupVisibility';
import { recordGroupAudit } from '../services/messaging/groupAudit';
import { checkGroupInviteCreateRate } from '../services/messaging/groupRateLimit';
import { getEffectivePermissionsForMember } from '../services/messaging/groupSendGate';
import { emitGroupLifecycle, compactMember } from '../services/messaging/groupRealtime';
import { GROUP_WIRE_EVENTS } from '../services/messaging/groupRealtimeEvents';
import { groupMetrics } from '../services/messaging/groupMetrics';

const resolveUserId = (req: Request) => {
  const userId = req.user?.id;
  return typeof userId === 'string' && userId.length ? userId : '';
};

const isPlatformAdmin = (role: string) =>
  Boolean(
    String(role || '')
      .toLowerCase()
      .match(/admin|moderator|superadmin|super_admin|platform/)
  );

const getMembership = async (conversationId: string, userId: string) =>
  prisma.conversationParticipant.findFirst({
    where: { conversationId, userId, deletedAt: null } as any
  });

const requireGroup = async (conversationId: string) => {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return { error: { status: 404, message: 'Group not found', code: 'GROUP_NOT_FOUND' } };
  if (conversation.type !== 'GROUP') {
    return { error: { status: 400, message: 'Not a messaging group', code: 'GROUP_NOT_FOUND' } };
  }
  return { conversation };
};

const defaultContent = (body?: any) => ({
  allowImages: body?.allowImages !== false && body?.content?.allowImages !== false,
  allowVideos: body?.allowVideos !== false && body?.content?.allowVideos !== false,
  allowFiles: body?.allowFiles !== false && body?.content?.allowFiles !== false,
  allowAudio: body?.allowAudio !== false && body?.content?.allowAudio !== false,
  allowVoice: body?.allowVoice !== false && body?.content?.allowVoice !== false,
  allowGifs: body?.allowGifs !== false && body?.content?.allowGifs !== false,
  allowStickers: body?.allowStickers !== false && body?.content?.allowStickers !== false,
  allowPolls: body?.allowPolls !== false && body?.content?.allowPolls !== false,
  allowEvents: body?.allowEvents !== false && body?.content?.allowEvents !== false,
  allowLocation: Boolean(body?.allowLocation ?? body?.content?.allowLocation),
  allowContacts: Boolean(body?.allowContacts ?? body?.content?.allowContacts),
  allowReactions: body?.allowReactions !== false && body?.content?.allowReactions !== false,
  allowEditing: body?.allowEditing !== false && body?.content?.allowEditing !== false,
  allowDelete: body?.allowDelete !== false && body?.content?.allowDelete !== false,
  allowForward: body?.allowForward !== false && body?.content?.allowForward !== false,
  allowCopy: body?.allowCopy !== false && body?.content?.allowCopy !== false,
  allowExternalLinks: body?.allowExternalLinks !== false && body?.content?.allowExternalLinks !== false,
  maxMentionsPerMessage: Math.max(
    1,
    Math.min(50, Number(body?.maxMentionsPerMessage ?? body?.content?.maxMentionsPerMessage ?? 20) || 20)
  )
});

const serializeGroup = (conversation: any, settings?: any, extras?: Record<string, unknown>) => ({
  id: conversation.id,
  type: 'group',
  title: conversation.title || null,
  name: conversation.title || null,
  description: conversation.description || null,
  avatarFileId: conversation.avatarFileId || null,
  bannerFileId: conversation.bannerFileId || null,
  emoji: conversation.emoji || null,
  accentColor: conversation.accentColor || null,
  category: conversation.category || null,
  language: conversation.language || null,
  country: conversation.country || null,
  region: conversation.region || null,
  timezone: conversation.timezone || null,
  visibility: normalizeGroupVisibility(conversation.visibility),
  joinPolicy: normalizeJoinPolicy(conversation.joinPolicy || 'INVITE_ONLY'),
  messagingMode: normalizeMessagingMode(conversation.messagingMode || 'EVERYONE'),
  slowModeSeconds: Number(conversation.slowModeSeconds || 0),
  maxMembers: conversation.maxMembers ?? null,
  memberCount: Number(conversation.memberCount || 0),
  settingsVersion: Number(conversation.settingsVersion || 1),
  lockedAt: conversation.lockedAt ? new Date(conversation.lockedAt).toISOString() : null,
  lockExpiresAt: conversation.lockExpiresAt ? new Date(conversation.lockExpiresAt).toISOString() : null,
  lockedReason: conversation.lockedReason || null,
  archivedAt: conversation.archivedAt ? new Date(conversation.archivedAt).toISOString() : null,
  lastActivityAt: conversation.lastActivityAt ? new Date(conversation.lastActivityAt).toISOString() : null,
  orgVerified: Boolean(conversation.orgVerified),
  discoverable: isGroupDiscoverable(conversation.visibility),
  previewAllowed: isGroupPreviewAllowed(conversation.visibility),
  permissionOverrides: conversation.permissionOverrides || null,
  content: settings
    ? {
        allowImages: settings.allowImages,
        allowVideos: settings.allowVideos,
        allowFiles: settings.allowFiles,
        allowAudio: settings.allowAudio,
        allowVoice: settings.allowVoice,
        allowGifs: settings.allowGifs,
        allowStickers: settings.allowStickers,
        allowPolls: settings.allowPolls,
        allowEvents: settings.allowEvents,
        allowLocation: settings.allowLocation,
        allowContacts: settings.allowContacts,
        allowReactions: settings.allowReactions,
        allowEditing: settings.allowEditing,
        allowDelete: settings.allowDelete,
        allowForward: settings.allowForward,
        allowCopy: settings.allowCopy,
        allowExternalLinks: settings.allowExternalLinks,
        maxMentionsPerMessage: settings.maxMentionsPerMessage
      }
    : null,
  createdAt: conversation.createdAt ? new Date(conversation.createdAt).toISOString() : null,
  ...extras
});

const ensureSettings = async (conversationId: string, content?: ReturnType<typeof defaultContent>) => {
  const data = content || defaultContent();
  try {
    return await (prisma as any).conversationSettings.upsert({
      where: { conversationId },
      create: {
        id: `cset_${conversationId}`,
        conversationId,
        ...data
      },
      update: {}
    });
  } catch {
    return null;
  }
};

const recountMembers = async (conversationId: string) => {
  try {
    const count = await prisma.conversationParticipant.count({
      where: { conversationId, deletedAt: null } as any
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { memberCount: count } as any
    });
    return count;
  } catch {
    return 0;
  }
};

/** POST /messages/groups — wizard create */
export const createEnterpriseGroup = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const name = String(req.body?.name || req.body?.title || '').trim().slice(0, 120);
    if (!name) return res.status(400).json({ success: false, error: 'name required', code: 'GROUP_VALIDATION' });

    const visibility = normalizeGroupVisibility(req.body?.visibility || 'PRIVATE');
    const joinPolicy = resolveJoinPolicyForVisibility(visibility, req.body?.joinPolicy);
    const messagingMode = normalizeMessagingMode(req.body?.messagingMode || 'EVERYONE');
    const requestedMemberUserIds = (Array.isArray(req.body?.memberUserIds) ? req.body.memberUserIds : [])
      .map((id: unknown) => String(id || '').trim())
      .filter((id: string) => id && id !== userId);
    const memberUserIds = Array.from(new Set<string>(requestedMemberUserIds)).slice(0, 200);

    const content = defaultContent(req.body);
    const slowModeSeconds = Math.max(0, Math.min(3600, Number(req.body?.slowModeSeconds || 0) || 0));
    const maxMembers = req.body?.maxMembers != null ? Math.max(2, Math.min(100000, Number(req.body.maxMembers) || 0)) : null;

    const conversation = await prisma.conversation.create({
      data: {
        type: 'GROUP',
        title: name,
        description: String(req.body?.description || '').trim().slice(0, 2000) || null,
        avatarFileId: req.body?.avatarFileId ? String(req.body.avatarFileId).trim() : null,
        visibility: visibility as any,
        category: req.body?.category ? String(req.body.category).slice(0, 64) : null,
        language: req.body?.language ? String(req.body.language).slice(0, 16) : null,
        country: req.body?.country ? String(req.body.country).slice(0, 8) : null,
        region: req.body?.region ? String(req.body.region).slice(0, 64) : null,
        timezone: req.body?.timezone ? String(req.body.timezone).slice(0, 64) : null,
        bannerFileId: req.body?.bannerFileId ? String(req.body.bannerFileId).trim() : null,
        emoji: req.body?.emoji ? String(req.body.emoji).slice(0, 16) : null,
        accentColor: req.body?.accentColor ? String(req.body.accentColor).slice(0, 16) : null,
        joinPolicy: joinPolicy as any,
        messagingMode: messagingMode as any,
        slowModeSeconds,
        maxMembers,
        memberCount: 1 + memberUserIds.length,
        settingsVersion: 1,
        lastActivityAt: new Date(),
        orgVerified: Boolean(req.body?.orgVerified),
        permissionOverrides: req.body?.permissionOverrides || undefined,
        participants: {
          create: [
            { userId, role: 'OWNER' as any, profileKey: null },
            ...memberUserIds.map((id) => ({
              userId: id,
              role: 'MEMBER' as any,
              profileKey: null
            }))
          ]
        }
      } as any
    });

    const settings = await ensureSettings(conversation.id, content);
    await recordGroupAudit({
      conversationId: conversation.id,
      actorId: userId,
      action: 'group.created',
      metadata: { visibility, joinPolicy, messagingMode, memberCount: 1 + memberUserIds.length }
    });
    void emitGroupLifecycle(conversation.id, GROUP_WIRE_EVENTS.GROUP_UPDATED, {
      action: 'created',
      actorId: userId,
      settingsVersion: 1,
      messagingMode,
      visibility,
      joinPolicy
    });
    // Notify invited members they were added
    for (const mid of memberUserIds) {
      void emitGroupLifecycle(conversation.id, GROUP_WIRE_EVENTS.MEMBER_JOINED, {
        member: compactMember({ userId: mid, role: 'MEMBER' }),
        actorId: userId,
        reason: 'created_with_members'
      });
    }

    return res.status(201).json({
      success: true,
      data: serializeGroup(conversation, settings, {
        memberRole: 'OWNER',
        permissionEngineVersion: PERMISSION_ENGINE_VERSION
      })
    });
  } catch (e: any) {
    console.error('createEnterpriseGroup', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to create group' });
  }
};

/** GET /messages/groups/:id */
export const getEnterpriseGroup = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const { conversation, error } = await requireGroup(conversationId);
    if (error) return res.status(error.status).json({ success: false, error: error.message, code: error.code });

    const membership = await getMembership(conversationId, userId);
    const secret = normalizeGroupVisibility((conversation as any).visibility) === 'SECRET';
    if (!membership && !isPlatformAdmin(String(req.user?.role || ''))) {
      if (secret || !isGroupDiscoverable((conversation as any).visibility)) {
        return res.status(403).json({ success: false, error: 'Not a member', code: 'GROUP_NOT_MEMBER' });
      }
    }

    let settings = null;
    try {
      settings = await (prisma as any).conversationSettings.findUnique({ where: { conversationId } });
    } catch {
      /* optional */
    }

    const role = membership ? normalizeMemberRole((membership as any).role) : 'MEMBER';
    const perms = membership
      ? getEffectivePermissionsForMember({
          role,
          profileKey: (membership as any).profileKey,
          conversationOverrides: (conversation as any).permissionOverrides,
          participantOverrides: (membership as any).permissionOverrides
        })
      : null;

    return res.json({
      success: true,
      data: serializeGroup(conversation, settings, {
        memberRole: membership ? role : null,
        profileKey: membership ? (membership as any).profileKey || null : null,
        permissions: perms,
        isMember: Boolean(membership)
      })
    });
  } catch (e: any) {
    console.error('getEnterpriseGroup', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to load group' });
  }
};

/** PATCH /messages/groups/:id — settings + meta */
export const patchEnterpriseGroup = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const { conversation, error } = await requireGroup(conversationId);
    if (error) return res.status(error.status).json({ success: false, error: error.message, code: error.code });

    const membership = await getMembership(conversationId, userId);
    const role = normalizeMemberRole((membership as any)?.role);
    const perms = getEffectivePermissionsForMember({
      role,
      profileKey: (membership as any)?.profileKey,
      conversationOverrides: (conversation as any).permissionOverrides,
      participantOverrides: (membership as any)?.permissionOverrides
    });
    if ((!membership || !perms.canEditGroup) && !isPlatformAdmin(String(req.user?.role || ''))) {
      return res.status(403).json({ success: false, error: 'Insufficient permission', code: 'GROUP_PERMISSION_DENIED' });
    }

    const data: any = {};
    if (req.body?.name !== undefined || req.body?.title !== undefined) {
      data.title = String(req.body?.name || req.body?.title || '').trim().slice(0, 120) || null;
    }
    if (req.body?.description !== undefined) data.description = String(req.body.description || '').trim().slice(0, 2000) || null;
    if (req.body?.avatarFileId !== undefined) data.avatarFileId = String(req.body.avatarFileId || '').trim() || null;
    if (req.body?.bannerFileId !== undefined) data.bannerFileId = String(req.body.bannerFileId || '').trim() || null;
    if (req.body?.emoji !== undefined) data.emoji = String(req.body.emoji || '').slice(0, 16) || null;
    if (req.body?.accentColor !== undefined) data.accentColor = String(req.body.accentColor || '').slice(0, 16) || null;
    if (req.body?.category !== undefined) data.category = String(req.body.category || '').slice(0, 64) || null;
    if (req.body?.language !== undefined) data.language = String(req.body.language || '').slice(0, 16) || null;
    if (req.body?.country !== undefined) data.country = String(req.body.country || '').slice(0, 8) || null;
    if (req.body?.region !== undefined) data.region = String(req.body.region || '').slice(0, 64) || null;
    if (req.body?.timezone !== undefined) data.timezone = String(req.body.timezone || '').slice(0, 64) || null;
    if (req.body?.visibility !== undefined) {
      data.visibility = normalizeGroupVisibility(req.body.visibility);
      if (data.visibility === 'SECRET') data.joinPolicy = 'INVITE_ONLY';
    }
    if (req.body?.joinPolicy !== undefined) {
      const vis = data.visibility || normalizeGroupVisibility((conversation as any).visibility);
      data.joinPolicy = resolveJoinPolicyForVisibility(vis, req.body.joinPolicy);
    }
    if (req.body?.messagingMode !== undefined) {
      data.messagingMode = normalizeMessagingMode(req.body.messagingMode);
    }
    if (req.body?.slowModeSeconds !== undefined) {
      data.slowModeSeconds = Math.max(0, Math.min(3600, Number(req.body.slowModeSeconds) || 0));
    }
    if (req.body?.maxMembers !== undefined) {
      data.maxMembers =
        req.body.maxMembers == null ? null : Math.max(2, Math.min(100000, Number(req.body.maxMembers) || 0));
    }
    if (req.body?.permissionOverrides !== undefined) {
      data.permissionOverrides = req.body.permissionOverrides;
    }
    data.settingsVersion = Number((conversation as any).settingsVersion || 1) + 1;

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data
    } as any);

    let settings = null;
    if (req.body?.content && typeof req.body.content === 'object') {
      const content = defaultContent({ content: req.body.content });
      try {
        settings = await (prisma as any).conversationSettings.upsert({
          where: { conversationId },
          create: { id: `cset_${conversationId}`, conversationId, ...content },
          update: content
        });
      } catch (e: any) {
        console.warn('[group] settings update failed', e?.message || e);
      }
    } else {
      try {
        settings = await (prisma as any).conversationSettings.findUnique({ where: { conversationId } });
      } catch {
        /* optional */
      }
    }

    await recordGroupAudit({
      conversationId,
      actorId: userId,
      action: 'group.updated',
      metadata: { fields: Object.keys(data) }
    });
    void emitGroupLifecycle(conversationId, GROUP_WIRE_EVENTS.GROUP_UPDATED, {
      action: 'updated',
      actorId: userId,
      settingsVersion: (updated as any).settingsVersion,
      messagingMode: normalizeMessagingMode((updated as any).messagingMode),
      visibility: normalizeGroupVisibility((updated as any).visibility),
      joinPolicy: normalizeJoinPolicy((updated as any).joinPolicy),
      slowModeSeconds: Number((updated as any).slowModeSeconds || 0),
      title: (updated as any).title || null,
      avatarFileId: (updated as any).avatarFileId || null,
      fields: Object.keys(data)
    });
    if (data.avatarFileId !== undefined) {
      void emitGroupLifecycle(conversationId, GROUP_WIRE_EVENTS.CONVERSATION_UPDATED, {
        conversationId,
        avatarFileId: (updated as any).avatarFileId || null,
        title: (updated as any).title || null,
        actorId: userId
      });
    }
    if (data.messagingMode === 'LOCKED' || (updated as any).messagingMode === 'LOCKED') {
      void emitGroupLifecycle(conversationId, GROUP_WIRE_EVENTS.GROUP_LOCKED, {
        actorId: userId,
        messagingMode: 'LOCKED',
        settingsVersion: (updated as any).settingsVersion
      });
    }

    return res.json({ success: true, data: serializeGroup(updated, settings) });
  } catch (e: any) {
    console.error('patchEnterpriseGroup', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to update group' });
  }
};

/** GET /messages/groups/:id/permissions */
export const getGroupPermissions = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const { conversation, error } = await requireGroup(conversationId);
    if (error) return res.status(error.status).json({ success: false, error: error.message, code: error.code });
    const membership = await getMembership(conversationId, userId);
    if (!membership && !isPlatformAdmin(String(req.user?.role || ''))) {
      return res.status(403).json({ success: false, error: 'Not a member', code: 'GROUP_NOT_MEMBER' });
    }
    const role = membership ? normalizeMemberRole((membership as any).role) : 'MEMBER';
    const effective = membership
      ? getEffectivePermissionsForMember({
          role,
          profileKey: (membership as any).profileKey,
          conversationOverrides: (conversation as any).permissionOverrides,
          participantOverrides: (membership as any).permissionOverrides
        })
      : defaultPermissionsForRole('MEMBER');

    return res.json({
      success: true,
      data: {
        conversationId,
        role,
        profileKey: membership ? (membership as any).profileKey || null : null,
        messagingMode: normalizeMessagingMode((conversation as any).messagingMode),
        defaults: {
          OWNER: defaultPermissionsForRole('OWNER'),
          ADMIN: defaultPermissionsForRole('ADMIN'),
          MODERATOR: defaultPermissionsForRole('MODERATOR'),
          MEMBER: defaultPermissionsForRole('MEMBER')
        },
        conversationOverrides: (conversation as any).permissionOverrides || null,
        effective,
        engineVersion: PERMISSION_ENGINE_VERSION
      }
    });
  } catch (e: any) {
    console.error('getGroupPermissions', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to load permissions' });
  }
};

/** PATCH /messages/groups/:id/permissions */
export const patchGroupPermissions = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const { conversation, error } = await requireGroup(conversationId);
    if (error) return res.status(error.status).json({ success: false, error: error.message, code: error.code });
    const membership = await getMembership(conversationId, userId);
    const role = normalizeMemberRole((membership as any)?.role);
    if ((!membership || (role !== 'OWNER' && role !== 'ADMIN')) && !isPlatformAdmin(String(req.user?.role || ''))) {
      return res.status(403).json({ success: false, error: 'Insufficient permission', code: 'GROUP_PERMISSION_DENIED' });
    }

    const overrides = req.body?.permissionOverrides ?? req.body?.overrides ?? null;
    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        permissionOverrides: overrides,
        settingsVersion: Number((conversation as any).settingsVersion || 1) + 1
      } as any
    });
    await recordGroupAudit({
      conversationId,
      actorId: userId,
      action: 'group.permissions_updated',
      metadata: { hasOverrides: Boolean(overrides) }
    });
    void emitGroupLifecycle(conversationId, GROUP_WIRE_EVENTS.PERMISSIONS_UPDATED, {
      actorId: userId,
      settingsVersion: (updated as any).settingsVersion,
      // overrides shape only — no secrets
      hasOverrides: Boolean(overrides)
    });
    return res.json({
      success: true,
      data: {
        conversationId,
        permissionOverrides: (updated as any).permissionOverrides || null,
        settingsVersion: (updated as any).settingsVersion
      }
    });
  } catch (e: any) {
    console.error('patchGroupPermissions', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to update permissions' });
  }
};

/** POST /messages/groups/:id/join */
export const joinGroupOpen = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const { conversation, error } = await requireGroup(conversationId);
    if (error) return res.status(error.status).json({ success: false, error: error.message, code: error.code });

    const visibility = normalizeGroupVisibility((conversation as any).visibility);
    const joinPolicy = normalizeJoinPolicy((conversation as any).joinPolicy);
    if (visibility === 'SECRET' || joinPolicy !== 'OPEN') {
      return res.status(403).json({ success: false, error: 'Join not allowed', code: 'GROUP_JOIN_DENIED' });
    }
    if ((conversation as any).maxMembers != null) {
      const count = await prisma.conversationParticipant.count({
        where: { conversationId, deletedAt: null } as any
      });
      if (count >= Number((conversation as any).maxMembers)) {
        return res.status(403).json({ success: false, error: 'Group is full', code: 'GROUP_FULL' });
      }
    }

    await prisma.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: { conversationId, userId, role: 'MEMBER' as any, deletedAt: null } as any,
      update: { deletedAt: null, isArchived: false } as any
    });
    await recountMembers(conversationId);
    await recordGroupAudit({ conversationId, actorId: userId, action: 'member.joined', targetUserId: userId });
    void emitGroupLifecycle(conversationId, GROUP_WIRE_EVENTS.MEMBER_JOINED, {
      member: compactMember({ userId, role: 'MEMBER' }),
      actorId: userId,
      reason: 'open_join'
    });
    return res.json({ success: true, data: { conversationId, joined: true } });
  } catch (e: any) {
    console.error('joinGroupOpen', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to join' });
  }
};

/** POST /messages/groups/:id/join-requests */
export const createJoinRequest = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const { conversation, error } = await requireGroup(conversationId);
    if (error) return res.status(error.status).json({ success: false, error: error.message, code: error.code });

    const joinPolicy = normalizeJoinPolicy((conversation as any).joinPolicy);
    const visibility = normalizeGroupVisibility((conversation as any).visibility);
    if (visibility === 'SECRET' || joinPolicy !== 'REQUEST') {
      return res.status(403).json({ success: false, error: 'Join requests not accepted', code: 'GROUP_JOIN_DENIED' });
    }
    const existing = await getMembership(conversationId, userId);
    if (existing) return res.json({ success: true, data: { alreadyMember: true, conversationId } });

    const row = await (prisma as any).conversationJoinRequest.upsert({
      where: {
        conversationId_userId_status: { conversationId, userId, status: 'PENDING' }
      },
      create: {
        id: `cjr_${randomBytes(8).toString('hex')}`,
        conversationId,
        userId,
        message: String(req.body?.message || '').trim().slice(0, 500) || null,
        status: 'PENDING'
      },
      update: {
        message: String(req.body?.message || '').trim().slice(0, 500) || null,
        updatedAt: new Date()
      }
    });
    await recordGroupAudit({
      conversationId,
      actorId: userId,
      action: 'join_request.created',
      targetUserId: userId,
      targetId: row.id
    });
    void emitGroupLifecycle(conversationId, GROUP_WIRE_EVENTS.JOIN_REQUESTED, {
      requestId: row.id,
      userId,
      // no personal message body in realtime
      status: 'PENDING'
    });
    return res.status(201).json({ success: true, data: { id: row.id, status: 'PENDING', conversationId } });
  } catch (e: any) {
    // Fallback without compound unique name
    try {
      const conversationId = String(req.params.id || '').trim();
      const userId = resolveUserId(req);
      const existingPending = await (prisma as any).conversationJoinRequest.findFirst({
        where: { conversationId, userId, status: 'PENDING' }
      });
      if (existingPending) {
        return res.json({ success: true, data: { id: existingPending.id, status: 'PENDING', conversationId } });
      }
      const row = await (prisma as any).conversationJoinRequest.create({
        data: {
          id: `cjr_${randomBytes(8).toString('hex')}`,
          conversationId,
          userId,
          message: String(req.body?.message || '').trim().slice(0, 500) || null,
          status: 'PENDING'
        }
      });
      return res.status(201).json({ success: true, data: { id: row.id, status: 'PENDING', conversationId } });
    } catch (inner: any) {
      console.error('createJoinRequest', e, inner);
      return res.status(500).json({ success: false, error: inner?.message || e?.message || 'Failed to request join' });
    }
  }
};

/** GET /messages/groups/:id/join-requests */
export const listJoinRequests = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const membership = await getMembership(conversationId, userId);
    const perms = membership
      ? getEffectivePermissionsForMember({
          role: normalizeMemberRole((membership as any).role),
          profileKey: (membership as any).profileKey
        })
      : null;
    if ((!membership || !perms?.canApproveJoin) && !isPlatformAdmin(String(req.user?.role || ''))) {
      return res.status(403).json({ success: false, error: 'Insufficient permission', code: 'GROUP_PERMISSION_DENIED' });
    }
    const rows = await (prisma as any).conversationJoinRequest.findMany({
      where: {
        conversationId,
        status: String(req.query.status || 'PENDING').toUpperCase()
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    return res.json({ success: true, data: rows });
  } catch (e: any) {
    console.error('listJoinRequests', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to list join requests' });
  }
};

/** POST /messages/groups/:id/join-requests/:requestId/approve|reject */
export const decideJoinRequest = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const requestId = String(req.params.requestId || '').trim();
    const decision = String(req.params.decision || req.body?.decision || '').toLowerCase();
    const approve = decision === 'approve' || decision === 'approved';

    const membership = await getMembership(conversationId, userId);
    const perms = membership
      ? getEffectivePermissionsForMember({
          role: normalizeMemberRole((membership as any).role),
          profileKey: (membership as any).profileKey
        })
      : null;
    if ((!membership || !perms?.canApproveJoin) && !isPlatformAdmin(String(req.user?.role || ''))) {
      return res.status(403).json({ success: false, error: 'Insufficient permission', code: 'GROUP_PERMISSION_DENIED' });
    }

    const row = await (prisma as any).conversationJoinRequest.findFirst({
      where: { id: requestId, conversationId }
    });
    if (!row || row.status !== 'PENDING') {
      return res.status(404).json({ success: false, error: 'Request not found', code: 'GROUP_NOT_FOUND' });
    }

    if (approve) {
      await prisma.conversationParticipant.upsert({
        where: { conversationId_userId: { conversationId, userId: row.userId } },
        create: { conversationId, userId: row.userId, role: 'MEMBER' as any } as any,
        update: { deletedAt: null, isArchived: false } as any
      });
      await recountMembers(conversationId);
    }

    await (prisma as any).conversationJoinRequest.update({
      where: { id: row.id },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        reviewedById: userId,
        reviewedAt: new Date()
      }
    });
    await recordGroupAudit({
      conversationId,
      actorId: userId,
      action: approve ? 'join_request.approved' : 'join_request.rejected',
      targetUserId: row.userId,
      targetId: row.id
    });
    void emitGroupLifecycle(
      conversationId,
      approve ? GROUP_WIRE_EVENTS.JOIN_APPROVED : GROUP_WIRE_EVENTS.JOIN_REJECTED,
      {
        requestId: row.id,
        userId: row.userId,
        actorId: userId,
        status: approve ? 'APPROVED' : 'REJECTED'
      }
    );
    if (approve) {
      void emitGroupLifecycle(conversationId, GROUP_WIRE_EVENTS.MEMBER_JOINED, {
        member: compactMember({ userId: row.userId, role: 'MEMBER' }),
        actorId: userId,
        reason: 'join_approved'
      });
    }
    return res.json({ success: true, data: { id: row.id, status: approve ? 'APPROVED' : 'REJECTED' } });
  } catch (e: any) {
    console.error('decideJoinRequest', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to decide join request' });
  }
};

/** POST /messages/groups/:id/lock  { reason?, expiresInMinutes? } */
export const lockGroup = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const { conversation, error } = await requireGroup(conversationId);
    if (error) return res.status(error.status).json({ success: false, error: error.message, code: error.code });
    const membership = await getMembership(conversationId, userId);
    const role = normalizeMemberRole((membership as any)?.role);
    if (role !== 'OWNER' && role !== 'ADMIN' && !isPlatformAdmin(String(req.user?.role || ''))) {
      return res.status(403).json({ success: false, error: 'Insufficient permission', code: 'GROUP_PERMISSION_DENIED' });
    }
    const minutes = req.body?.expiresInMinutes != null ? Math.max(1, Number(req.body.expiresInMinutes) || 0) : null;
    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        messagingMode: 'LOCKED' as any,
        lockedAt: new Date(),
        lockedById: userId,
        lockedReason: String(req.body?.reason || '').slice(0, 500) || null,
        lockExpiresAt: minutes ? new Date(Date.now() + minutes * 60_000) : null,
        settingsVersion: Number((conversation as any).settingsVersion || 1) + 1
      } as any
    });
    await recordGroupAudit({
      conversationId,
      actorId: userId,
      action: 'group.locked',
      reason: String(req.body?.reason || '') || null,
      metadata: { expiresInMinutes: minutes }
    });
    void emitGroupLifecycle(conversationId, GROUP_WIRE_EVENTS.GROUP_LOCKED, {
      actorId: userId,
      messagingMode: 'LOCKED',
      lockedAt: (updated as any).lockedAt
        ? new Date((updated as any).lockedAt).toISOString()
        : new Date().toISOString(),
      lockExpiresAt: (updated as any).lockExpiresAt
        ? new Date((updated as any).lockExpiresAt).toISOString()
        : null,
      settingsVersion: (updated as any).settingsVersion
    });
    // Immediate policy signal so composers block without waiting for group_updated
    void emitGroupLifecycle(conversationId, GROUP_WIRE_EVENTS.GROUP_UPDATED, {
      action: 'locked',
      messagingMode: 'LOCKED',
      settingsVersion: (updated as any).settingsVersion,
      actorId: userId
    });
    return res.json({
      success: true,
      data: {
        conversationId,
        messagingMode: 'LOCKED',
        lockedAt: (updated as any).lockedAt,
        lockExpiresAt: (updated as any).lockExpiresAt
      }
    });
  } catch (e: any) {
    console.error('lockGroup', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to lock group' });
  }
};

/** POST /messages/groups/:id/unlock */
export const unlockGroup = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const { conversation, error } = await requireGroup(conversationId);
    if (error) return res.status(error.status).json({ success: false, error: error.message, code: error.code });
    const membership = await getMembership(conversationId, userId);
    const role = normalizeMemberRole((membership as any)?.role);
    if (role !== 'OWNER' && role !== 'ADMIN' && !isPlatformAdmin(String(req.user?.role || ''))) {
      return res.status(403).json({ success: false, error: 'Insufficient permission', code: 'GROUP_PERMISSION_DENIED' });
    }
    const mode = normalizeMessagingMode(req.body?.messagingMode || 'EVERYONE');
    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        messagingMode: mode as any,
        lockedAt: null,
        lockedById: null,
        lockedReason: null,
        lockExpiresAt: null,
        settingsVersion: Number((conversation as any).settingsVersion || 1) + 1
      } as any
    });
    await recordGroupAudit({ conversationId, actorId: userId, action: 'group.unlocked', metadata: { mode } });
    void emitGroupLifecycle(conversationId, GROUP_WIRE_EVENTS.GROUP_UNLOCKED, {
      actorId: userId,
      messagingMode: mode,
      settingsVersion: (updated as any).settingsVersion
    });
    void emitGroupLifecycle(conversationId, GROUP_WIRE_EVENTS.GROUP_UPDATED, {
      action: 'unlocked',
      messagingMode: mode,
      settingsVersion: (updated as any).settingsVersion,
      actorId: userId
    });
    return res.json({
      success: true,
      data: { conversationId, messagingMode: (updated as any).messagingMode, lockedAt: null }
    });
  } catch (e: any) {
    console.error('unlockGroup', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to unlock group' });
  }
};

/** POST /messages/groups/:id/restrictions  { userId, kind, reason?, endsAt? } */
export const applyMemberRestriction = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const targetUserId = String(req.body?.userId || '').trim();
    const kind = String(req.body?.kind || '').toUpperCase();
    if (!targetUserId || !['MUTE', 'SHADOW_MUTE', 'TEMP_BAN', 'BAN'].includes(kind)) {
      return res.status(400).json({ success: false, error: 'userId and kind required' });
    }
    const membership = await getMembership(conversationId, userId);
    const perms = membership
      ? getEffectivePermissionsForMember({
          role: normalizeMemberRole((membership as any).role),
          profileKey: (membership as any).profileKey
        })
      : null;
    const needsBan = kind === 'BAN' || kind === 'TEMP_BAN';
    if (
      (!membership || (needsBan ? !perms?.canBan : !perms?.canKick && !perms?.canBan)) &&
      !isPlatformAdmin(String(req.user?.role || ''))
    ) {
      return res.status(403).json({ success: false, error: 'Insufficient permission', code: 'GROUP_PERMISSION_DENIED' });
    }

    const row = await (prisma as any).conversationMemberRestriction.create({
      data: {
        id: `cmr_${randomBytes(8).toString('hex')}`,
        conversationId,
        userId: targetUserId,
        kind,
        reason: String(req.body?.reason || '').slice(0, 500) || null,
        actorId: userId,
        endsAt: req.body?.endsAt ? new Date(req.body.endsAt) : null,
        active: true
      }
    });

    if (kind === 'BAN' || kind === 'TEMP_BAN') {
      await prisma.conversationParticipant.updateMany({
        where: { conversationId, userId: targetUserId },
        data: { deletedAt: new Date() }
      });
      await recountMembers(conversationId);
    } else if (kind === 'MUTE') {
      await prisma.conversationParticipant.updateMany({
        where: { conversationId, userId: targetUserId },
        data: { isMuted: true }
      });
    }

    await recordGroupAudit({
      conversationId,
      actorId: userId,
      action: kind === 'MUTE' || kind === 'SHADOW_MUTE' ? 'member.muted' : 'member.banned',
      targetUserId,
      targetId: row.id,
      reason: row.reason,
      metadata: { kind }
    });
    void emitGroupLifecycle(conversationId, GROUP_WIRE_EVENTS.MEMBER_RESTRICTED, {
      userId: targetUserId,
      kind,
      actorId: userId,
      endsAt: row.endsAt ? new Date(row.endsAt).toISOString() : null
    });
    if (kind === 'BAN' || kind === 'TEMP_BAN') {
      void emitGroupLifecycle(conversationId, GROUP_WIRE_EVENTS.MEMBER_LEFT, {
        userId: targetUserId,
        reason: kind === 'BAN' ? 'banned' : 'temp_banned',
        actorId: userId
      });
    }
    return res.status(201).json({ success: true, data: row });
  } catch (e: any) {
    console.error('applyMemberRestriction', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to apply restriction' });
  }
};

/** Enhanced invite create used by enterprise path; also patches Phase 22.2 handler fields */
export const createEnterpriseInvite = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const { conversation, error } = await requireGroup(conversationId);
    if (error) return res.status(error.status).json({ success: false, error: error.message, code: error.code });

    const rate = checkGroupInviteCreateRate(userId);
    if (!rate.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Invite create rate limit',
        code: 'GROUP_PERMISSION_DENIED',
        retryAfterMs: rate.retryAfterMs
      });
    }

    const membership = await getMembership(conversationId, userId);
    const perms = membership
      ? getEffectivePermissionsForMember({
          role: normalizeMemberRole((membership as any).role),
          profileKey: (membership as any).profileKey,
          conversationOverrides: (conversation as any).permissionOverrides,
          participantOverrides: (membership as any)?.permissionOverrides
        })
      : null;
    if ((!membership || !perms?.canInvite) && !isPlatformAdmin(String(req.user?.role || ''))) {
      // Fall back to Phase 22.2 manage-members for admins without explicit canInvite override false
      const role = normalizeMemberRole((membership as any)?.role);
      if (!membership || !canManageMembers(role)) {
        return res.status(403).json({ success: false, error: 'Insufficient permission', code: 'GROUP_PERMISSION_DENIED' });
      }
    }

    const visibility = normalizeGroupVisibility((conversation as any).visibility);
    const hours = Math.max(1, Math.min(720, Number(req.body?.expiresInHours || 168) || 168));
    const code = generateInviteCode();
    const oneTime = Boolean(req.body?.oneTime);
    const maxUses =
      req.body?.maxUses != null
        ? Math.max(1, Math.min(10000, Number(req.body.maxUses) || 1))
        : oneTime
          ? 1
          : null;
    const requireApproval = Boolean(req.body?.requireApproval);
    const previewDisabled =
      Boolean(req.body?.previewDisabled) || visibility === 'SECRET' || !isGroupPreviewAllowed(visibility);
    const inviteRole = normalizeMemberRole(req.body?.role || 'MEMBER') as MemberRole;
    if (inviteRole === 'OWNER') {
      return res.status(400).json({ success: false, error: 'Cannot invite as OWNER' });
    }

    let qrTokenHash: string | null = null;
    if (req.body?.withQr !== false) {
      qrTokenHash = createHash('sha256').update(`${code}:${conversationId}`).digest('hex').slice(0, 48);
    }

    const invite = await (prisma as any).conversationInvite.create({
      data: {
        id: `cinv_${code}`,
        conversationId,
        code,
        inviteeUserId: req.body?.inviteeUserId ? String(req.body.inviteeUserId).trim() : null,
        invitedById: userId,
        role: inviteRole,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + hours * 3600 * 1000),
        maxUses,
        useCount: 0,
        oneTime,
        requireApproval,
        previewDisabled,
        label: req.body?.label ? String(req.body.label).slice(0, 80) : null,
        qrTokenHash
      }
    });

    await recordGroupAudit({
      conversationId,
      actorId: userId,
      action: 'invite.created',
      targetId: invite.id,
      metadata: { maxUses, oneTime, requireApproval, previewDisabled }
    });
    // Realtime: never broadcast raw invite code — only opaque id + flags for members who can manage
    void emitGroupLifecycle(conversationId, GROUP_WIRE_EVENTS.INVITE_CREATED, {
      inviteId: invite.id,
      role: invite.role,
      expiresAt: invite.expiresAt?.toISOString?.() || null,
      maxUses: invite.maxUses,
      oneTime: invite.oneTime,
      requireApproval: invite.requireApproval,
      previewDisabled: invite.previewDisabled,
      actorId: userId
      // code intentionally omitted
    });

    return res.status(201).json({
      success: true,
      data: {
        id: invite.id,
        code: invite.code,
        role: invite.role,
        expiresAt: invite.expiresAt?.toISOString?.() || null,
        maxUses: invite.maxUses,
        useCount: invite.useCount,
        oneTime: invite.oneTime,
        requireApproval: invite.requireApproval,
        previewDisabled: invite.previewDisabled,
        joinPath: `/messages/join/${invite.code}`,
        qrTokenHash: invite.qrTokenHash
      }
    });
  } catch (e: any) {
    console.error('createEnterpriseInvite', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to create invite' });
  }
};

/** GET /messages/groups/:id/audit */
export const listGroupAudit = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const membership = await getMembership(conversationId, userId);
    const role = normalizeMemberRole((membership as any)?.role);
    if ((!membership || (role !== 'OWNER' && role !== 'ADMIN')) && !isPlatformAdmin(String(req.user?.role || ''))) {
      return res.status(403).json({ success: false, error: 'Insufficient permission', code: 'GROUP_PERMISSION_DENIED' });
    }
    const rows = await (prisma as any).groupModerationAction.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, Math.max(1, Number(req.query.limit || 50) || 50))
    });
    return res.json({ success: true, data: rows });
  } catch (e: any) {
    console.error('listGroupAudit', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to list audit' });
  }
};
