import fs from 'fs';
import path from 'path';
import prisma from '../utils/prismaClient';
import { notifyUser } from '../utils/notify';
import { buildNotificationActionUrl, resolveNotificationEntity } from './notificationActionUrl.service';
import { NotificationService } from './notificationCenter';

export type EngagementNotificationType =
  | 'mention_post'
  | 'mention_comment'
  | 'followed_new_post'
  | 'followed_you'
  | 'comment_on_post'
  | 'reaction_on_post'
  | 'reaction_on_comment'
  | 'repost'
  | 'job_application_created'
  | 'proposal_opened'
  | 'proposal_reply'
  | 'proposal_top_applicant'
  | 'proposal_interview_scheduled';

type PlatformNotificationSettings = {
  enableMentionNotifications: boolean;
  enableFollowedPostNotifications: boolean;
  enableFollowNotifications: boolean;
  enableCommentNotifications: boolean;
  enableReactionNotifications: boolean;
  enableRepostNotifications: boolean;
  enableJobApplicationNotifications: boolean;
  enableProposalOpenedNotifications: boolean;
  enableProposalReplyNotifications: boolean;
  enableTopApplicantNotifications: boolean;
  enableInterviewScheduledNotifications: boolean;
  enableJobLifecycleEmails: boolean;
};

type UserSettingsRow = {
  userId: string;
  inAppNotifications: boolean;
  notifyMentions?: boolean;
  notifyFollowedPosts?: boolean;
  notifyFollowedYou?: boolean;
  notifyCommentsOnPosts?: boolean;
  notifyReactionsOnPosts?: boolean;
  notifyReposts?: boolean;
  notifyJobApplications?: boolean;
  notifyApplicationUpdates?: boolean;
};

type CreateEngagementNotificationInput = {
  recipientId: string;
  actorId?: string | null;
  type: EngagementNotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
  dedupeWindowMinutes?: number;
  dedupeMetaKeys?: string[];
  skipRecipientChecks?: boolean;
};

const PLATFORM_SETTINGS_FILE = path.resolve(__dirname, '../../data/platform-system-settings.json');
const DEFAULT_PLATFORM_NOTIFICATIONS: PlatformNotificationSettings = {
  enableMentionNotifications: true,
  enableFollowedPostNotifications: true,
  enableFollowNotifications: true,
  enableCommentNotifications: true,
  enableReactionNotifications: true,
  enableRepostNotifications: true,
  enableJobApplicationNotifications: true,
  enableProposalOpenedNotifications: true,
  enableProposalReplyNotifications: true,
  enableTopApplicantNotifications: true,
  enableInterviewScheduledNotifications: true,
  enableJobLifecycleEmails: true
};

const normalizeBoolean = (value: any, fallback: boolean) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  }
  return Boolean(value);
};

const getObject = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};

const normalizeId = (value: unknown) => String(value || '').trim();

const readPlatformNotificationSettings = (): PlatformNotificationSettings => {
  try {
    if (!fs.existsSync(PLATFORM_SETTINGS_FILE)) return DEFAULT_PLATFORM_NOTIFICATIONS;
    const raw = fs.readFileSync(PLATFORM_SETTINGS_FILE, 'utf-8');
    const parsed = raw ? JSON.parse(raw) : {};
    const platform = getObject(parsed?.platform);
    const notifications = getObject(platform.notifications);
    const source = { ...platform, ...notifications };
    return {
      enableMentionNotifications: normalizeBoolean(
        source.enableMentionNotifications ?? source.enable_mention_notifications,
        DEFAULT_PLATFORM_NOTIFICATIONS.enableMentionNotifications
      ),
      enableFollowedPostNotifications: normalizeBoolean(
        source.enableFollowedPostNotifications ?? source.enable_followed_post_notifications,
        DEFAULT_PLATFORM_NOTIFICATIONS.enableFollowedPostNotifications
      ),
      enableFollowNotifications: normalizeBoolean(
        source.enableFollowNotifications ?? source.enable_follow_notifications,
        DEFAULT_PLATFORM_NOTIFICATIONS.enableFollowNotifications
      ),
      enableCommentNotifications: normalizeBoolean(
        source.enableCommentNotifications ?? source.enable_comment_notifications,
        DEFAULT_PLATFORM_NOTIFICATIONS.enableCommentNotifications
      ),
      enableReactionNotifications: normalizeBoolean(
        source.enableReactionNotifications ?? source.enable_reaction_notifications,
        DEFAULT_PLATFORM_NOTIFICATIONS.enableReactionNotifications
      ),
      enableRepostNotifications: normalizeBoolean(
        source.enableRepostNotifications ?? source.enable_repost_notifications,
        DEFAULT_PLATFORM_NOTIFICATIONS.enableRepostNotifications
      ),
      enableJobApplicationNotifications: normalizeBoolean(
        source.enableJobApplicationNotifications ?? source.enable_job_application_notifications,
        DEFAULT_PLATFORM_NOTIFICATIONS.enableJobApplicationNotifications
      ),
      enableProposalOpenedNotifications: normalizeBoolean(
        source.enableProposalOpenedNotifications ?? source.enable_proposal_opened_notifications,
        DEFAULT_PLATFORM_NOTIFICATIONS.enableProposalOpenedNotifications
      ),
      enableProposalReplyNotifications: normalizeBoolean(
        source.enableProposalReplyNotifications ?? source.enable_proposal_reply_notifications,
        DEFAULT_PLATFORM_NOTIFICATIONS.enableProposalReplyNotifications
      ),
      enableTopApplicantNotifications: normalizeBoolean(
        source.enableTopApplicantNotifications ?? source.enable_top_applicant_notifications,
        DEFAULT_PLATFORM_NOTIFICATIONS.enableTopApplicantNotifications
      ),
      enableInterviewScheduledNotifications: normalizeBoolean(
        source.enableInterviewScheduledNotifications ?? source.enable_interview_scheduled_notifications,
        DEFAULT_PLATFORM_NOTIFICATIONS.enableInterviewScheduledNotifications
      ),
      enableJobLifecycleEmails: normalizeBoolean(
        source.enableJobLifecycleEmails ?? source.enable_job_lifecycle_emails,
        DEFAULT_PLATFORM_NOTIFICATIONS.enableJobLifecycleEmails
      )
    };
  } catch (error) {
    console.warn('[engagement-notifications] Failed to read platform notification settings:', error);
    return DEFAULT_PLATFORM_NOTIFICATIONS;
  }
};

const isPlatformNotificationEnabled = (type: EngagementNotificationType) => {
  const settings = readPlatformNotificationSettings();
  if (type === 'mention_post' || type === 'mention_comment') return settings.enableMentionNotifications;
  if (type === 'followed_new_post') return settings.enableFollowedPostNotifications;
  if (type === 'followed_you') return settings.enableFollowNotifications;
  if (type === 'comment_on_post') return settings.enableCommentNotifications;
  if (type === 'reaction_on_post' || type === 'reaction_on_comment') return settings.enableReactionNotifications;
  if (type === 'job_application_created') return settings.enableJobApplicationNotifications;
  if (type === 'proposal_opened') return settings.enableProposalOpenedNotifications;
  if (type === 'proposal_reply') return settings.enableProposalReplyNotifications;
  if (type === 'proposal_top_applicant') return settings.enableTopApplicantNotifications;
  if (type === 'proposal_interview_scheduled') return settings.enableInterviewScheduledNotifications;
  return settings.enableRepostNotifications;
};

const getUserPreferenceField = (type: EngagementNotificationType): keyof UserSettingsRow | null => {
  if (type === 'mention_post' || type === 'mention_comment') return 'notifyMentions';
  if (type === 'followed_new_post') return 'notifyFollowedPosts';
  if (type === 'followed_you') return 'notifyFollowedYou';
  if (type === 'comment_on_post') return 'notifyCommentsOnPosts';
  if (type === 'reaction_on_post' || type === 'reaction_on_comment') return 'notifyReactionsOnPosts';  if (type === 'job_application_created') return 'notifyJobApplications';
  if (type === 'proposal_opened' || type === 'proposal_reply' || type === 'proposal_top_applicant' || type === 'proposal_interview_scheduled') {
    return 'notifyApplicationUpdates';
  }
  return 'notifyReposts';
};

export const filterRecipientsForNotification = async (
  notificationType: EngagementNotificationType,
  recipientIds: string[]
) => {
  if (!isPlatformNotificationEnabled(notificationType)) return [];

  const dedupedRecipientIds = Array.from(new Set(recipientIds.map((id) => String(id || '').trim()).filter(Boolean)));
  if (!dedupedRecipientIds.length) return [];

  const preferenceField = getUserPreferenceField(notificationType);
  const select: any = { userId: true, inAppNotifications: true };
  if (preferenceField) select[preferenceField] = true;

  const rows = (await prisma.userSettings.findMany({
    where: { userId: { in: dedupedRecipientIds } },
    select
  })) as unknown as UserSettingsRow[];
  const rowsByUserId = new Map<string, UserSettingsRow>(rows.map((row) => [row.userId, row]));

  return dedupedRecipientIds.filter((recipientId) => {
    const settings = rowsByUserId.get(recipientId);
    if (!settings) return true;
    if (settings.inAppNotifications === false) return false;
    if (!preferenceField) return true;
    const pref = settings[preferenceField];
    return pref !== false;
  });
};

const hasRecentDuplicate = async (input: CreateEngagementNotificationInput) => {
  const dedupeWindowMinutes = Number(input.dedupeWindowMinutes || 0);
  const dedupeMetaKeys = Array.isArray(input.dedupeMetaKeys) ? input.dedupeMetaKeys.filter(Boolean) : [];
  if (!dedupeWindowMinutes || !dedupeMetaKeys.length) return false;

  const since = new Date(Date.now() - dedupeWindowMinutes * 60_000);
  const where: any = {
    userId: input.recipientId,
    type: input.type,
    createdAt: { gte: since }
  };
  if (input.actorId) where.actorId = input.actorId;

  const recent = await prisma.notification.findMany({
    where,
    select: { id: true, meta: true }
  });
  const metadata = getObject(input.metadata);
  return recent.some((row) => {
    const existingMeta = getObject(row.meta);
    return dedupeMetaKeys.every((key) => String(existingMeta[key] ?? '') === String(metadata[key] ?? ''));
  });
};

const hasBlockingRelation = async (recipientId: string, actorId?: string | null) => {
  const recipient = normalizeId(recipientId);
  const actor = normalizeId(actorId);
  if (!recipient || !actor || recipient === actor) return false;
  const delegate = (prisma as any)?.userBlock;
  if (!delegate || typeof delegate.findFirst !== 'function') return false;
  const row = await delegate.findFirst({
    where: {
      OR: [
        { blockerId: recipient, blockedId: actor },
        { blockerId: actor, blockedId: recipient }
      ]
    },
    select: { id: true }
  });
  return Boolean(row);
};

const getActorSnapshot = async (actorId?: string | null) => {
  const normalizedActorId = normalizeId(actorId);
  if (!normalizedActorId) return null;
  const actor = await prisma.user.findUnique({
    where: { id: normalizedActorId },
    select: { id: true, name: true, username: true, avatar: true }
  });
  if (!actor) return null;
  return {
    actorId: normalizedActorId,
    actorName: actor.name || actor.username || 'Someone',
    actorUsername: actor.username || null,
    actorAvatar: actor.avatar || null
  };
};

export const createEngagementNotification = async (input: CreateEngagementNotificationInput) => {
  const recipientId = String(input.recipientId || '').trim();
  if (!recipientId) return null;
  if (input.actorId && recipientId === String(input.actorId)) return null;
  if (await hasBlockingRelation(recipientId, input.actorId)) return null;
  if (!input.skipRecipientChecks) {
    if (!isPlatformNotificationEnabled(input.type)) return null;
    const allowedRecipients = await filterRecipientsForNotification(input.type, [recipientId]);
    if (!allowedRecipients.length) return null;
  }
  if (await hasRecentDuplicate(input)) return null;

  const metadata = { ...(input.metadata || {}) };
  const actorSnapshot = await getActorSnapshot(input.actorId);
  if (actorSnapshot) {
    metadata.actorId = metadata.actorId || actorSnapshot.actorId;
    metadata.actorName = metadata.actorName || actorSnapshot.actorName;
    metadata.actorUsername = metadata.actorUsername || actorSnapshot.actorUsername;
    metadata.actorAvatar = metadata.actorAvatar || actorSnapshot.actorAvatar;
  } else if (input.actorId) {
    metadata.actorId = metadata.actorId || input.actorId;
  }

  const entity = resolveNotificationEntity(input.type, metadata);
  if (entity.entityType) metadata.entityType = metadata.entityType || entity.entityType;
  if (entity.entityId) metadata.entityId = metadata.entityId || entity.entityId;
  if (entity.parentId) metadata.parentId = metadata.parentId || entity.parentId;

  const resolvedActionUrl = input.actionUrl || buildNotificationActionUrl(input.type, metadata);
  metadata.action_url = resolvedActionUrl || null;
  metadata.actionUrl = resolvedActionUrl || null;

  // Phase 32.0 — route through unified NotificationService.emit (legacy-compatible row + taxonomy)
  try {
    const emitResult = await NotificationService.emit({
      recipientId,
      actorId: input.actorId || null,
      type: input.type,
      title: input.title || '',
      body: input.message || '',
      deepLink: resolvedActionUrl || null,
      metadata,
      entityType: metadata.entityType || null,
      entityId: metadata.entityId || null,
      source: 'engagementNotifications',
      dedupeWindowSeconds: Number(input.dedupeWindowMinutes || 0) * 60 || undefined,
      // Preferences already applied above — avoid double-filter inside emit
      skipPush: false,
      skipRealtime: false
    });
    const item = emitResult.items[0];
    if (!item || item.status === 'suppressed' || item.status === 'failed') {
      return null;
    }
    if (item.status === 'duplicate' && item.notificationId) {
      return { id: item.notificationId } as any;
    }
    if (item.notificationId) {
      return {
        id: item.notificationId,
        userId: recipientId,
        actorId: input.actorId || null,
        type: input.type,
        title: input.title || '',
        body: input.message || '',
        meta: metadata,
        isRead: false
      } as any;
    }
  } catch (facadeError) {
    console.warn(
      '[engagement-notifications] NotificationService.emit failed, using legacy create',
      (facadeError as any)?.message
    );
  }

  // Legacy fallback (pre-foundation or unexpected emit failure)
  const created = await prisma.notification.create({
    data: {
      userId: recipientId,
      actorId: input.actorId || null,
      type: input.type,
      title: input.title || '',
      body: input.message || '',
      meta: metadata,
      isRead: false
    }
  });

  notifyUser(recipientId, {
    id: created.id,
    type: created.type,
    title: created.title || 'Notification',
    body: created.body || '',
    action_url: resolvedActionUrl,
    meta: metadata,
    createdAt: created.createdAt.toISOString()
  });

  return created;
};

export const extractMentionUsernames = (content: string) => {
  const text = String(content || '');
  // Phase 20.2.4: allow 2+ chars so @ai resolves; collective tokens filtered by consumers.
  const regex = /(^|[^@\w])@([a-zA-Z0-9_.]{2,30})/g;
  const usernames = new Set<string>();
  let match: RegExpExecArray | null = regex.exec(text);
  while (match) {
    const username = String(match[2] || '').toLowerCase().trim();
    if (!username) {
      match = regex.exec(text);
      continue;
    }
    // Collective / reserved tokens are not usernames.
    if (
      username === 'everyone' ||
      username === 'moderators' ||
      username === 'mods' ||
      username === 'admins' ||
      username === 'admin' ||
      username === 'verified' ||
      username === 'staff'
    ) {
      match = regex.exec(text);
      continue;
    }
    usernames.add(username);
    match = regex.exec(text);
  }
  return Array.from(usernames);
};

export const resolveMentionedUserIds = async (usernames: string[]) => {
  const normalized = Array.from(
    new Set(
      (usernames || [])
        .map((username) => String(username || '').toLowerCase().trim())
        .filter(Boolean)
    )
  );
  if (!normalized.length) return [];
  const users = await prisma.user.findMany({
    where: {
      OR: normalized.map((username) => ({
        username: { equals: username, mode: 'insensitive' }
      }))
    },
    select: { id: true, username: true }
  });
  return users;
};

export const buildSnippet = (value: string, maxLength = 120) => {
  const compact = String(value || '').replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

export const canUserViewPostForNotification = async (
  post: { authorId: string; visibility?: string | null; mentions?: string[] | null },
  viewerUserId: string
) => {
  const viewerId = String(viewerUserId || '').trim();
  if (!viewerId) return false;
  if (post.authorId === viewerId) return true;

  const blockDelegate = (prisma as any)?.userBlock;
  if (blockDelegate && typeof blockDelegate.findFirst === 'function') {
    const blocked = await blockDelegate.findFirst({
      where: {
        OR: [
          { blockerId: post.authorId, blockedId: viewerId },
          { blockerId: viewerId, blockedId: post.authorId }
        ]
      },
      select: { id: true }
    });
    if (blocked) return false;
  }

  const visibility = String(post.visibility || 'public').toLowerCase();
  if (visibility === 'public') return true;
  if (visibility === 'network') return true;
  if (visibility === 'private') return false;

  if (visibility === 'custom') {
    const mentions = Array.isArray(post.mentions) ? post.mentions.map((id) => String(id)) : [];
    if (mentions.includes(viewerId)) return true;
    return false;
  }

  const followsAuthor = await prisma.userFollow.findUnique({
    where: {
      followerId_followeeId: {
        followerId: viewerId,
        followeeId: post.authorId
      }
    },
    select: { id: true }
  });
  if (!followsAuthor) return false;

  if (visibility !== 'mutuals') return true;

  const isMutual = await prisma.userFollow.findUnique({
    where: {
      followerId_followeeId: {
        followerId: post.authorId,
        followeeId: viewerId
      }
    },
    select: { id: true }
  });
  return Boolean(isMutual);
};

export const getPlatformNotificationSettings = () => readPlatformNotificationSettings();
