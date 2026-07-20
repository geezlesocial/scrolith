/**
 * Phase 22.3B — centralized messaging privacy policy (server authority).
 */
import prisma from '../../utils/prismaClient';

export type PrivacyAudience = 'EVERYONE' | 'CONTACTS' | 'NOBODY';
export type GroupInviteAudience = 'EVERYONE' | 'CONTACTS' | 'NOBODY';
export type DirectMessageAudience = 'EVERYONE' | 'CONTACTS' | 'FOLLOWERS' | 'NOBODY';

export type MessagingPrivacySettings = {
  onlineStatusVisibility: PrivacyAudience;
  lastSeenVisibility: PrivacyAudience;
  readReceiptsEnabled: boolean;
  typingIndicatorsEnabled: boolean;
  recordingIndicatorsEnabled: boolean;
  directMessageAudience: DirectMessageAudience;
  groupInviteAudience: GroupInviteAudience;
  notificationMessagePreviewEnabled: boolean;
  updatedAt: string | null;
};

export const MESSAGING_PRIVACY_DEFAULTS: MessagingPrivacySettings = {
  onlineStatusVisibility: 'EVERYONE',
  lastSeenVisibility: 'EVERYONE',
  readReceiptsEnabled: true,
  typingIndicatorsEnabled: true,
  recordingIndicatorsEnabled: true,
  directMessageAudience: 'EVERYONE',
  groupInviteAudience: 'EVERYONE',
  notificationMessagePreviewEnabled: true,
  updatedAt: null
};

export const MESSAGING_PRIVACY_VERSION = '22.3B';

const PRIVACY_CACHE_TTL_MS = 30_000;
const privacyCache = new Map<string, { settings: MessagingPrivacySettings; expiresAt: number }>();

export const normalizePrivacyAudience = (value: unknown, fallback: PrivacyAudience = 'EVERYONE'): PrivacyAudience => {
  const v = String(value || fallback).trim().toUpperCase();
  if (v === 'EVERYONE' || v === 'CONTACTS' || v === 'NOBODY') return v;
  return fallback;
};

export const normalizeDmAudience = (value: unknown): DirectMessageAudience => {
  const v = String(value || 'EVERYONE').trim().toUpperCase();
  if (v === 'EVERYONE' || v === 'CONTACTS' || v === 'FOLLOWERS' || v === 'NOBODY') return v;
  return 'EVERYONE';
};

export const settingsFromUserRow = (row: any): MessagingPrivacySettings => {
  if (!row) return { ...MESSAGING_PRIVACY_DEFAULTS };
  return {
    onlineStatusVisibility: normalizePrivacyAudience(
      row.presenceVisibility ?? row.onlineStatusVisibility,
      'EVERYONE'
    ),
    lastSeenVisibility: normalizePrivacyAudience(row.lastSeenVisibility, 'EVERYONE'),
    readReceiptsEnabled: row.readReceiptsEnabled !== false,
    typingIndicatorsEnabled: row.typingIndicatorsEnabled !== false,
    recordingIndicatorsEnabled: row.recordingIndicatorsEnabled !== false,
    directMessageAudience: normalizeDmAudience(row.directMessageAudience),
    groupInviteAudience: normalizePrivacyAudience(
      row.groupInviteAudience,
      'EVERYONE'
    ) as GroupInviteAudience,
    notificationMessagePreviewEnabled: row.notificationMessagePreviewEnabled !== false,
    updatedAt: row.messagingPrivacyUpdatedAt
      ? new Date(row.messagingPrivacyUpdatedAt).toISOString()
      : row.updatedAt
        ? new Date(row.updatedAt).toISOString()
        : null
  };
};

export const invalidateMessagingPrivacyCache = (userId: string) => {
  privacyCache.delete(String(userId || '').trim());
};

export const getMessagingPrivacySettings = async (userId: string): Promise<MessagingPrivacySettings> => {
  const id = String(userId || '').trim();
  if (!id) return { ...MESSAGING_PRIVACY_DEFAULTS };
  const now = Date.now();
  const cached = privacyCache.get(id);
  if (cached && cached.expiresAt > now) return cached.settings;

  try {
    const row = await prisma.user.findUnique({
      where: { id },
      select: {
        presenceVisibility: true,
        lastSeenVisibility: true,
        readReceiptsEnabled: true,
        typingIndicatorsEnabled: true,
        recordingIndicatorsEnabled: true,
        directMessageAudience: true,
        groupInviteAudience: true,
        notificationMessagePreviewEnabled: true,
        messagingPrivacyUpdatedAt: true,
        updatedAt: true
      } as any
    });
    const settings = settingsFromUserRow(row);
    privacyCache.set(id, { settings, expiresAt: now + PRIVACY_CACHE_TTL_MS });
    return settings;
  } catch {
    // Pre-migration / partial schema
    try {
      const row = await prisma.user.findUnique({
        where: { id },
        select: { presenceVisibility: true, updatedAt: true } as any
      });
      const settings = settingsFromUserRow(row);
      privacyCache.set(id, { settings, expiresAt: now + PRIVACY_CACHE_TTL_MS });
      return settings;
    } catch {
      return { ...MESSAGING_PRIVACY_DEFAULTS };
    }
  }
};

/** Contact = either direction Follow edge (canonical relationship model). */
export const isContactOf = async (viewerId: string, targetId: string): Promise<boolean> => {
  const a = String(viewerId || '').trim();
  const b = String(targetId || '').trim();
  if (!a || !b || a === b) return a === b;
  try {
    const edge = await (prisma as any).follow.findFirst({
      where: {
        OR: [
          { followerId: a, followeeId: b },
          { followerId: b, followeeId: a }
        ]
      },
      select: { followerId: true }
    });
    return Boolean(edge);
  } catch {
    return false;
  }
};

/** Viewer follows target (one-way). */
export const isFollowerOf = async (viewerId: string, targetId: string): Promise<boolean> => {
  const a = String(viewerId || '').trim();
  const b = String(targetId || '').trim();
  if (!a || !b) return false;
  try {
    const edge = await (prisma as any).follow.findFirst({
      where: { followerId: a, followeeId: b },
      select: { followerId: true }
    });
    return Boolean(edge);
  } catch {
    return false;
  }
};

const audienceAllows = async (
  audience: PrivacyAudience | DirectMessageAudience,
  viewerId: string,
  targetId: string
): Promise<boolean> => {
  if (viewerId === targetId) return true;
  if (audience === 'EVERYONE') return true;
  if (audience === 'NOBODY') return false;
  if (audience === 'FOLLOWERS') return isFollowerOf(viewerId, targetId);
  // CONTACTS
  return isContactOf(viewerId, targetId);
};

export const canViewerSeeOnlineStatus = async (viewerId: string, targetId: string): Promise<boolean> => {
  if (viewerId === targetId) return true;
  const settings = await getMessagingPrivacySettings(targetId);
  return audienceAllows(settings.onlineStatusVisibility, viewerId, targetId);
};

export const canViewerSeeLastSeen = async (viewerId: string, targetId: string): Promise<boolean> => {
  if (viewerId === targetId) return true;
  const settings = await getMessagingPrivacySettings(targetId);
  return audienceAllows(settings.lastSeenVisibility, viewerId, targetId);
};

/** Whether reader may disclose read receipts to sender/viewer. */
export const canViewerSeeReadReceipt = async (
  viewerId: string,
  readerId: string,
  _conversationId?: string
): Promise<boolean> => {
  if (viewerId === readerId) return true;
  const settings = await getMessagingPrivacySettings(readerId);
  return settings.readReceiptsEnabled !== false;
};

export const canViewerReceiveTypingEvent = async (
  viewerId: string,
  actorId: string,
  _conversationId?: string
): Promise<boolean> => {
  if (viewerId === actorId) return false;
  const settings = await getMessagingPrivacySettings(actorId);
  return settings.typingIndicatorsEnabled !== false;
};

export const canViewerReceiveRecordingEvent = async (
  viewerId: string,
  actorId: string,
  _conversationId?: string
): Promise<boolean> => {
  if (viewerId === actorId) return false;
  const settings = await getMessagingPrivacySettings(actorId);
  return settings.recordingIndicatorsEnabled !== false;
};

export const canInitiateDirectMessage = async (
  senderId: string,
  targetId: string
): Promise<{ allowed: boolean; reason?: string }> => {
  if (!senderId || !targetId) return { allowed: false, reason: 'invalid' };
  if (senderId === targetId) return { allowed: true };
  const settings = await getMessagingPrivacySettings(targetId);
  const ok = await audienceAllows(settings.directMessageAudience, senderId, targetId);
  if (!ok) {
    return {
      allowed: false,
      reason: 'This member cannot be messaged due to their messaging preferences.'
    };
  }
  return { allowed: true };
};

export const canInviteToGroup = async (
  inviterId: string,
  targetId: string,
  _conversationId?: string
): Promise<{ allowed: boolean; reason?: string }> => {
  if (!inviterId || !targetId) return { allowed: false, reason: 'invalid' };
  if (inviterId === targetId) return { allowed: true };
  const settings = await getMessagingPrivacySettings(targetId);
  const ok = await audienceAllows(settings.groupInviteAudience, inviterId, targetId);
  if (!ok) {
    return {
      allowed: false,
      reason: 'This member cannot be added due to their messaging preferences.'
    };
  }
  return { allowed: true };
};

export const canIncludeMessagePreview = async (recipientId: string): Promise<boolean> => {
  const settings = await getMessagingPrivacySettings(recipientId);
  return settings.notificationMessagePreviewEnabled !== false;
};

/** Privacy-safe presence projection for APIs/sockets. */
export const projectPresenceForViewer = async (
  viewerId: string,
  target: {
    userId: string;
    isOnline?: boolean;
    state?: string;
    lastSeenAt?: string | null;
  }
) => {
  const canOnline = await canViewerSeeOnlineStatus(viewerId, target.userId);
  const canLastSeen = await canViewerSeeLastSeen(viewerId, target.userId);
  if (!canOnline && !canLastSeen) {
    return {
      userId: target.userId,
      state: 'offline',
      isOnline: false,
      lastSeenAt: null,
      presenceHidden: true
    };
  }
  return {
    userId: target.userId,
    state: canOnline ? target.state || (target.isOnline ? 'online' : 'offline') : 'offline',
    isOnline: canOnline ? Boolean(target.isOnline) : false,
    lastSeenAt: canLastSeen ? target.lastSeenAt || null : null,
    presenceHidden: !canOnline
  };
};
