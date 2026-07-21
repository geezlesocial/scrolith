/**
 * Phase 29.1 — server-authoritative send gates for GROUP conversations.
 * DIRECT conversations skip group mode/permission/content gates (DM path unchanged).
 */

import prisma from '../../utils/prismaClient';
import { normalizeMemberRole, type MemberRole } from './groupPolicy';
import {
  canSendWithMode,
  computeEffectivePermissions,
  normalizeMessagingMode,
  normalizeProfileKey,
  type PermissionMap
} from './permissionEngine';
import { checkGroupSendRate } from './groupRateLimit';
import { normalizeGroupVisibility } from './groupVisibility';

export type ContentKind =
  | 'text'
  | 'image'
  | 'video'
  | 'file'
  | 'audio'
  | 'voice'
  | 'gif'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'link';

export type SendGateResult = {
  allowed: boolean;
  code?: string;
  reason?: string;
  retryAfterMs?: number;
  permissions?: PermissionMap;
  messagingMode?: string;
};

const DEFAULT_SETTINGS = {
  allowImages: true,
  allowVideos: true,
  allowFiles: true,
  allowAudio: true,
  allowVoice: true,
  allowGifs: true,
  allowStickers: true,
  allowLocation: false,
  allowContacts: false,
  allowExternalLinks: true,
  maxMentionsPerMessage: 20
};

const contentAllowed = (
  settings: typeof DEFAULT_SETTINGS,
  kinds: ContentKind[]
): { ok: boolean; kind?: ContentKind } => {
  for (const kind of kinds) {
    if (kind === 'text') continue;
    if (kind === 'image' && !settings.allowImages) return { ok: false, kind };
    if (kind === 'video' && !settings.allowVideos) return { ok: false, kind };
    if (kind === 'file' && !settings.allowFiles) return { ok: false, kind };
    if (kind === 'audio' && !settings.allowAudio) return { ok: false, kind };
    if (kind === 'voice' && !settings.allowVoice) return { ok: false, kind };
    if (kind === 'gif' && !settings.allowGifs) return { ok: false, kind };
    if (kind === 'sticker' && !settings.allowStickers) return { ok: false, kind };
    if (kind === 'location' && !settings.allowLocation) return { ok: false, kind };
    if (kind === 'contact' && !settings.allowContacts) return { ok: false, kind };
    if (kind === 'link' && !settings.allowExternalLinks) return { ok: false, kind };
  }
  return { ok: true };
};

const countMentions = (text: string) => {
  const matches = String(text || '').match(/@([a-zA-Z0-9._-]{2,40})/g) || [];
  return matches.length;
};

const hasExternalLink = (text: string) =>
  /https?:\/\/|www\./i.test(String(text || ''));

/**
 * Infer coarse content kinds from message payload (no MIME DB required).
 */
export const inferContentKinds = (input: {
  text?: string;
  attachments?: string[];
  messageType?: string | null;
  metadata?: Record<string, unknown> | null;
}): ContentKind[] => {
  const kinds: ContentKind[] = [];
  const text = String(input.text || '');
  if (text.trim()) kinds.push('text');
  if (hasExternalLink(text)) kinds.push('link');

  const mt = String(input.messageType || '').toLowerCase();
  if (mt.includes('voice')) kinds.push('voice');
  if (mt.includes('location')) kinds.push('location');
  if (mt.includes('contact')) kinds.push('contact');
  if (mt.includes('gif')) kinds.push('gif');
  if (mt.includes('sticker')) kinds.push('sticker');

  const metaKind = String((input.metadata as any)?.kind || (input.metadata as any)?.contentKind || '').toLowerCase();
  if (metaKind === 'image' || metaKind === 'video' || metaKind === 'audio' || metaKind === 'file') {
    kinds.push(metaKind as ContentKind);
  }
  if (metaKind === 'voice') kinds.push('voice');
  if (metaKind === 'gif') kinds.push('gif');
  if (metaKind === 'sticker') kinds.push('sticker');
  if (metaKind === 'location') kinds.push('location');
  if (metaKind === 'contact') kinds.push('contact');

  if ((input.attachments || []).length && !kinds.some((k) => ['image', 'video', 'audio', 'file', 'voice'].includes(k))) {
    kinds.push('file');
  }
  return Array.from(new Set(kinds));
};

export const evaluateGroupSendGate = async (input: {
  conversationId: string;
  senderId: string;
  text?: string;
  attachments?: string[];
  messageType?: string | null;
  metadata?: Record<string, unknown> | null;
  /** When conversation already loaded */
  conversation?: any;
  membership?: any;
}): Promise<SendGateResult> => {
  const conversationId = String(input.conversationId || '').trim();
  const senderId = String(input.senderId || '').trim();
  if (!conversationId || !senderId) {
    return { allowed: false, code: 'GROUP_NOT_FOUND', reason: 'missing_ids' };
  }

  let conversation = input.conversation;
  if (!conversation) {
    try {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId }
      });
    } catch {
      conversation = null;
    }
  }
  if (!conversation) {
    return { allowed: false, code: 'GROUP_NOT_FOUND', reason: 'not_found' };
  }

  // DIRECT: no group gates (caller should skip, but safe guard)
  if (String(conversation.type || '').toUpperCase() !== 'GROUP') {
    return { allowed: true, reason: 'direct_skip' };
  }

  if (conversation.archivedAt) {
    return { allowed: false, code: 'GROUP_LOCKED', reason: 'archived' };
  }

  // Temporary lockdown expiry auto-clear (best-effort)
  let messagingMode = normalizeMessagingMode(conversation.messagingMode || 'EVERYONE');
  if (conversation.lockedAt) {
    if (conversation.lockExpiresAt && new Date(conversation.lockExpiresAt).getTime() < Date.now()) {
      messagingMode = messagingMode === 'LOCKED' ? 'EVERYONE' : messagingMode;
    } else {
      messagingMode = 'LOCKED';
    }
  }
  if (messagingMode === 'LOCKED') {
    return {
      allowed: false,
      code: 'GROUP_LOCKED',
      reason: 'locked',
      messagingMode
    };
  }

  let membership = input.membership;
  if (!membership) {
    membership = await prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: senderId, deletedAt: null } as any
    });
  }
  if (!membership || membership.deletedAt) {
    return { allowed: false, code: 'GROUP_NOT_MEMBER', reason: 'not_member' };
  }

  // Active bans / mutes (restrictions table)
  try {
    const restrictions = await (prisma as any).conversationMemberRestriction.findMany({
      where: {
        conversationId,
        userId: senderId,
        active: true,
        kind: { in: ['BAN', 'TEMP_BAN', 'MUTE'] }
      },
      take: 10
    });
    const now = Date.now();
    for (const r of restrictions || []) {
      if (r.endsAt && new Date(r.endsAt).getTime() < now) continue;
      if (r.kind === 'BAN' || r.kind === 'TEMP_BAN') {
        return { allowed: false, code: 'GROUP_PERMISSION_DENIED', reason: `restriction_${String(r.kind).toLowerCase()}` };
      }
      if (r.kind === 'MUTE') {
        return { allowed: false, code: 'GROUP_PERMISSION_DENIED', reason: 'restriction_mute' };
      }
    }
  } catch {
    /* table may be missing pre-migration */
  }

  const role = normalizeMemberRole((membership as any).role) as MemberRole;
  const profileKey = normalizeProfileKey((membership as any).profileKey);
  const conversationOverrides =
    conversation.permissionOverrides && typeof conversation.permissionOverrides === 'object'
      ? (conversation.permissionOverrides as any)
      : null;
  const participantOverrides =
    (membership as any).permissionOverrides && typeof (membership as any).permissionOverrides === 'object'
      ? (membership as any).permissionOverrides
      : null;

  const sendCheck = canSendWithMode({
    role,
    profileKey,
    messagingMode,
    conversationOverrides,
    participantOverrides
  });
  if (!sendCheck.allowed) {
    return {
      allowed: false,
      code: 'GROUP_PERMISSION_DENIED',
      reason: sendCheck.reason,
      permissions: sendCheck.permissions,
      messagingMode
    };
  }

  // Slow mode
  const slow = Math.max(0, Number(conversation.slowModeSeconds || 0) || 0);
  if (slow > 0 && role !== 'OWNER' && role !== 'ADMIN') {
    const last = (membership as any).lastMessageAt
      ? new Date((membership as any).lastMessageAt).getTime()
      : 0;
    if (last && Date.now() - last < slow * 1000) {
      const retryAfterMs = slow * 1000 - (Date.now() - last);
      return {
        allowed: false,
        code: 'GROUP_SLOW_MODE',
        reason: 'slow_mode',
        retryAfterMs,
        messagingMode,
        permissions: sendCheck.permissions
      };
    }
  }

  // Rate limit
  const rate = checkGroupSendRate(senderId, conversationId);
  if (!rate.allowed) {
    return {
      allowed: false,
      code: 'GROUP_PERMISSION_DENIED',
      reason: 'rate_limit',
      retryAfterMs: rate.retryAfterMs,
      messagingMode,
      permissions: sendCheck.permissions
    };
  }

  // Content settings
  let settings = { ...DEFAULT_SETTINGS };
  try {
    const row = await (prisma as any).conversationSettings.findUnique({
      where: { conversationId }
    });
    if (row) {
      settings = {
        allowImages: row.allowImages !== false,
        allowVideos: row.allowVideos !== false,
        allowFiles: row.allowFiles !== false,
        allowAudio: row.allowAudio !== false,
        allowVoice: row.allowVoice !== false,
        allowGifs: row.allowGifs !== false,
        allowStickers: row.allowStickers !== false,
        allowLocation: Boolean(row.allowLocation),
        allowContacts: Boolean(row.allowContacts),
        allowExternalLinks: row.allowExternalLinks !== false,
        maxMentionsPerMessage: Number(row.maxMentionsPerMessage || 20)
      };
    }
  } catch {
    /* defaults */
  }

  const kinds = inferContentKinds({
    text: input.text,
    attachments: input.attachments,
    messageType: input.messageType,
    metadata: input.metadata
  });
  const content = contentAllowed(settings, kinds);
  if (!content.ok) {
    return {
      allowed: false,
      code: 'GROUP_CONTENT_FORBIDDEN',
      reason: `content_${content.kind}`,
      messagingMode,
      permissions: sendCheck.permissions
    };
  }

  // Upload-specific permission bits
  if (kinds.includes('image') && !sendCheck.permissions.canUploadImages) {
    return { allowed: false, code: 'GROUP_PERMISSION_DENIED', reason: 'permission_can_upload_images' };
  }
  if (kinds.includes('video') && !sendCheck.permissions.canUploadVideo) {
    return { allowed: false, code: 'GROUP_PERMISSION_DENIED', reason: 'permission_can_upload_video' };
  }
  if (kinds.includes('audio') && !sendCheck.permissions.canUploadAudio) {
    return { allowed: false, code: 'GROUP_PERMISSION_DENIED', reason: 'permission_can_upload_audio' };
  }
  if (kinds.includes('file') && !sendCheck.permissions.canUploadFiles && !sendCheck.permissions.canUploadDocuments) {
    return { allowed: false, code: 'GROUP_PERMISSION_DENIED', reason: 'permission_can_upload_files' };
  }

  const mentions = countMentions(String(input.text || ''));
  if (mentions > settings.maxMentionsPerMessage) {
    return {
      allowed: false,
      code: 'GROUP_CONTENT_FORBIDDEN',
      reason: 'max_mentions',
      messagingMode,
      permissions: sendCheck.permissions
    };
  }

  // Secret groups still allow member sends; visibility only affects discovery/previews
  void normalizeGroupVisibility(conversation.visibility);

  return {
    allowed: true,
    reason: 'allowed',
    permissions: sendCheck.permissions,
    messagingMode
  };
};

/** Mark last send time for slow mode after successful create */
export const markGroupMemberSent = async (conversationId: string, userId: string) => {
  try {
    await prisma.conversationParticipant.updateMany({
      where: { conversationId, userId },
      data: { lastMessageAt: new Date() } as any
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastActivityAt: new Date() } as any
    });
  } catch {
    /* columns may be missing pre-migration */
  }
};

/** Block check between sender and any other participant (DM + group) */
export const hasActiveBlockBetween = async (userId: string, otherUserIds: string[]): Promise<boolean> => {
  const others = Array.from(new Set((otherUserIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!userId || !others.length) return false;
  try {
    const hit = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: { in: others } },
          { blockerId: { in: others }, blockedId: userId }
        ]
      },
      select: { id: true }
    });
    return Boolean(hit);
  } catch {
    return false;
  }
};

export const getEffectivePermissionsForMember = (input: {
  role: string;
  profileKey?: string | null;
  conversationOverrides?: any;
  participantOverrides?: any;
}): PermissionMap =>
  computeEffectivePermissions({
    role: input.role,
    profileKey: normalizeProfileKey(input.profileKey),
    conversationOverrides: input.conversationOverrides,
    participantOverrides: input.participantOverrides
  });

export const GROUP_SEND_GATE_VERSION = '29.1';
