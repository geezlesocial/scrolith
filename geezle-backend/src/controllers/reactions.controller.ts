import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { createEngagementNotification } from '../services/engagementNotifications.service';

type ReactionTargetType = 'POST' | 'COMMENT' | 'MESSAGE' | 'STORY' | 'SCROLL';

type AllowedReaction = {
  key: string;
  label: string;
  emoji: string;
  enabled?: boolean;
};

type ReactionSettings = {
  enabled: boolean;
  postsEnabled: boolean;
  commentsEnabled: boolean;
  messagesEnabled: boolean;
  storiesEnabled: boolean;
  scrollEnabled: boolean;
  showReactors: boolean;
  rateLimitPerMinute: number;
  allowed: AllowedReaction[];
};

type TargetAccessOk = {
  ok: true;
  targetType: ReactionTargetType;
  targetId: string;
  postId?: string;
  scrollId?: string;
  conversationId?: string;
  participantUserIds?: string[];
};

type TargetAccessErr = {
  ok: false;
  status: number;
  error: string;
};

type TargetAccessResult = TargetAccessOk | TargetAccessErr;

const PLATFORM_SETTINGS_FILE = path.resolve(__dirname, '../../data/platform-system-settings.json');

const DEFAULT_ALLOWED: AllowedReaction[] = [
  { key: 'like', label: 'Like', emoji: '\u{1F44D}', enabled: true },
  { key: 'love', label: 'Love', emoji: '\u2764\uFE0F', enabled: true },
  { key: 'good', label: 'Good', emoji: '\u2705', enabled: true },
  { key: 'happy', label: 'Happy', emoji: '\u{1F604}', enabled: true },
  { key: 'handwave', label: 'Handwave', emoji: '\u{1F44B}', enabled: true },
  { key: 'angry', label: 'Angry', emoji: '\u{1F621}', enabled: true },
  { key: 'cry', label: 'Cry', emoji: '\u{1F622}', enabled: true },
  { key: 'mad', label: 'Mad', emoji: '\u{1F92C}', enabled: true },
  { key: 'sorry', label: 'Sorry', emoji: '\u{1F64F}', enabled: true }
];

const DEFAULT_SETTINGS: ReactionSettings = {
  enabled: true,
  postsEnabled: true,
  commentsEnabled: true,
  messagesEnabled: true,
  storiesEnabled: true,
  scrollEnabled: true,
  showReactors: true,
  rateLimitPerMinute: 40,
  allowed: DEFAULT_ALLOWED
};

const rateWindow = new Map<string, { start: number; count: number }>();

const resolveUserId = (req: Request) => {
  const fromAuth = req.user?.id;
  if (typeof fromAuth === 'string' && fromAuth.trim()) return fromAuth.trim();
  const fromBody = req.body?.userId;
  if (typeof fromBody === 'string' && fromBody.trim()) return fromBody.trim();
  const fromQuery = req.query?.userId;
  if (typeof fromQuery === 'string' && fromQuery.trim()) return fromQuery.trim();
  return '';
};

const normalizeAllowed = (value: any): AllowedReaction[] => {
  if (!Array.isArray(value)) return DEFAULT_ALLOWED;
  const cleaned = value
    .map((entry) => ({
      key: String(entry?.key || '').trim().toLowerCase(),
      label: String(entry?.label || '').trim() || 'Reaction',
      emoji: String(entry?.emoji || '').trim(),
      enabled: entry?.enabled !== false
    }))
    .filter((entry) => entry.key && entry.emoji && entry.enabled !== false);
  return cleaned.length ? cleaned : DEFAULT_ALLOWED;
};

const readReactionSettings = (): ReactionSettings => {
  try {
    if (!fs.existsSync(PLATFORM_SETTINGS_FILE)) return DEFAULT_SETTINGS;
    const raw = fs.readFileSync(PLATFORM_SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    const platform = parsed?.platform || {};
    const reactionsRaw = platform?.reactions || {};
    return {
      enabled: reactionsRaw.enabled ?? DEFAULT_SETTINGS.enabled,
      postsEnabled: reactionsRaw.postsEnabled ?? reactionsRaw.posts_enabled ?? DEFAULT_SETTINGS.postsEnabled,
      commentsEnabled: reactionsRaw.commentsEnabled ?? reactionsRaw.comments_enabled ?? DEFAULT_SETTINGS.commentsEnabled,
      messagesEnabled: reactionsRaw.messagesEnabled ?? reactionsRaw.messages_enabled ?? DEFAULT_SETTINGS.messagesEnabled,
      storiesEnabled: reactionsRaw.storiesEnabled ?? reactionsRaw.stories_enabled ?? DEFAULT_SETTINGS.storiesEnabled,
      scrollEnabled: reactionsRaw.scrollEnabled ?? reactionsRaw.scroll_enabled ?? DEFAULT_SETTINGS.scrollEnabled,
      showReactors: reactionsRaw.showReactors ?? reactionsRaw.show_reactors ?? DEFAULT_SETTINGS.showReactors,
      rateLimitPerMinute: Number(
        reactionsRaw.rateLimitPerMinute ?? reactionsRaw.rate_limit_per_minute ?? DEFAULT_SETTINGS.rateLimitPerMinute
      ) || DEFAULT_SETTINGS.rateLimitPerMinute,
      allowed: normalizeAllowed(reactionsRaw.allowed)
    };
  } catch (error) {
    console.warn('[reactions] Failed to read platform settings; using defaults.', error);
    return DEFAULT_SETTINGS;
  }
};

const assertRateLimit = (userId: string, settings: ReactionSettings) => {
  const now = Date.now();
  const minute = 60_000;
  const current = rateWindow.get(userId);
  if (!current || now - current.start >= minute) {
    rateWindow.set(userId, { start: now, count: 1 });
    return true;
  }
  if (current.count >= settings.rateLimitPerMinute) return false;
  current.count += 1;
  rateWindow.set(userId, current);
  return true;
};

const normalizeTargetType = (value: any): ReactionTargetType | null => {
  const normalized = String(value || '').trim().toUpperCase();
  if (
    normalized === 'POST' ||
    normalized === 'COMMENT' ||
    normalized === 'MESSAGE' ||
    normalized === 'STORY' ||
    normalized === 'SCROLL'
  ) {
    return normalized;
  }
  return null;
};

const normalizeReactionKey = (input: any, settings: ReactionSettings): string | null => {
  const value = String(input || '').trim();
  if (!value) return null;
  const byKey = new Map(settings.allowed.map((entry) => [entry.key.toLowerCase(), entry.key]));
  const byEmoji = new Map(settings.allowed.map((entry) => [entry.emoji, entry.key]));
  return byKey.get(value.toLowerCase()) || byEmoji.get(value) || null;
};

const isFeatureEnabledForTarget = (targetType: ReactionTargetType, settings: ReactionSettings) => {
  if (!settings.enabled) return false;
  if (targetType === 'POST') return settings.postsEnabled;
  if (targetType === 'COMMENT') return settings.commentsEnabled;
  if (targetType === 'MESSAGE') return settings.messagesEnabled;
  if (targetType === 'STORY') return settings.storiesEnabled;
  return settings.scrollEnabled;
};

const getAppIo = (req: Request) => (req.app as any).get('communityIo') || (req.app as any).get('io');

const getReactionSummaryDelegate = () => {
  const delegate = (prisma as any)?.reactionSummary;
  if (!delegate || typeof delegate !== 'object') return null;
  return delegate;
};

const hasSummaryDelegateMethod = (delegate: any, method: 'findUnique' | 'upsert') =>
  Boolean(delegate && typeof delegate[method] === 'function');

const isReactionSummaryStoreUnavailable = (error: any) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  const normalized = message.replace(/\s+/g, ' ').toLowerCase();
  return (
    code === 'P2021' ||
    code === 'P2022' ||
    message.includes('relation "ReactionSummary" does not exist') ||
    (message.includes('table') && message.includes('ReactionSummary') && message.includes('does not exist')) ||
    (normalized.includes('reactionsummary') && normalized.includes('does not exist'))
  );
};

const ensureTargetAccess = async (
  userId: string,
  targetType: ReactionTargetType,
  targetId: string
): Promise<TargetAccessResult> => {
  const hasBlockRelation = async (otherUserId?: string | null) => {
    const other = String(otherUserId || '').trim();
    if (!other || other === userId) return false;
    const row = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: other },
          { blockerId: other, blockedId: userId }
        ]
      },
      select: { id: true }
    });
    return Boolean(row);
  };

  if (targetType === 'POST') {
    const post = await prisma.communityPost.findUnique({
      where: { id: targetId },
      select: { id: true, status: true, authorId: true }
    });
    if (!post || post.status === 'deleted') {
      return { ok: false, status: 404, error: 'Post not found' };
    }
    if (await hasBlockRelation(post.authorId)) {
      return { ok: false, status: 403, error: 'Not authorized for this post' };
    }
    return { ok: true, targetType, targetId, postId: post.id };
  }

  if (targetType === 'COMMENT') {
    const comment = await prisma.communityPostComment.findUnique({
      where: { id: targetId },
      select: { id: true, status: true, postId: true, authorId: true, post: { select: { status: true, authorId: true } } }
    });
    if (comment && comment.status !== 'deleted' && comment.post?.status !== 'deleted') {
      if (await hasBlockRelation(comment.authorId) || await hasBlockRelation(comment.post?.authorId)) {
        return { ok: false, status: 403, error: 'Not authorized for this comment' };
      }
      return { ok: true, targetType, targetId, postId: comment.postId };
    }

    const prismaAny = prisma as any;
    const scrollComment = await prismaAny.scrollComment?.findUnique?.({
      where: { id: targetId },
      select: {
        id: true,
        status: true,
        scrollId: true,
        authorId: true,
        scroll: { select: { id: true, status: true, authorId: true, visibility: true } }
      }
    });
    if (!scrollComment || String(scrollComment.status || '').toLowerCase() === 'deleted' || String(scrollComment.scroll?.status || '').toLowerCase() !== 'active') {
      return { ok: false, status: 404, error: 'Comment not found' };
    }
    if (await hasBlockRelation(scrollComment.authorId) || await hasBlockRelation(scrollComment.scroll?.authorId)) {
      return { ok: false, status: 403, error: 'Not authorized for this comment' };
    }
    const visibility = String(scrollComment.scroll?.visibility || '').toLowerCase();
    if (visibility === 'private' && String(scrollComment.scroll?.authorId || '') !== String(userId)) {
      return { ok: false, status: 403, error: 'Not authorized for this comment' };
    }
    return { ok: true, targetType, targetId, scrollId: scrollComment.scrollId };
  }

  if (targetType === 'STORY') {
    const story = await prisma.communityStory.findUnique({
      where: { id: targetId },
      select: { id: true, authorId: true, visibility: true, expiresAt: true }
    });
    if (!story || (story.expiresAt && story.expiresAt <= new Date())) {
      return { ok: false, status: 404, error: 'Story not found' };
    }
    if (await hasBlockRelation(story.authorId)) {
      return { ok: false, status: 403, error: 'Not authorized for this story' };
    }
    const visibility = String(story.visibility || '').toLowerCase();
    if ((visibility === 'private' || visibility === 'custom') && String(story.authorId) !== String(userId)) {
      return { ok: false, status: 403, error: 'Not authorized for this story' };
    }
    return { ok: true, targetType, targetId };
  }

  if (targetType === 'SCROLL') {
    const prismaAny = prisma as any;
    const scroll = await prismaAny.scrollVideo.findUnique({
      where: { id: targetId },
      select: { id: true, authorId: true, visibility: true, status: true }
    });
    if (!scroll || String(scroll.status || '').toLowerCase() !== 'active') {
      return { ok: false, status: 404, error: 'Scroll not found' };
    }
    if (await hasBlockRelation(scroll.authorId)) {
      return { ok: false, status: 403, error: 'Not authorized for this scroll' };
    }
    const visibility = String(scroll.visibility || '').toLowerCase();
    if (visibility === 'private' && String(scroll.authorId) !== String(userId)) {
      return { ok: false, status: 403, error: 'Not authorized for this scroll' };
    }
    return { ok: true, targetType, targetId, scrollId: scroll.id };
  }

  const message = await prisma.directMessage.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      deletedAt: true,
      conversationId: true,
      conversation: {
        select: {
          participants: { select: { userId: true } }
        }
      }
    }
  });

  if (!message || message.deletedAt) {
    return { ok: false, status: 404, error: 'Message not found' };
  }

  const participantUserIds = (message.conversation?.participants || []).map((entry) => entry.userId);
  if (!participantUserIds.includes(userId)) {
    return { ok: false, status: 403, error: 'Not authorized for this conversation' };
  }

  return {
    ok: true,
    targetType,
    targetId,
    conversationId: message.conversationId,
    participantUserIds
  };
};

const rebuildSummary = async (targetType: ReactionTargetType, targetId: string) => {
  const grouped = await prisma.reaction.groupBy({
    by: ['reactionKey'],
    where: { targetType, targetId },
    _count: { _all: true }
  });
  const counts: Record<string, number> = {};
  (grouped as Array<{ reactionKey: string; _count: { _all: number } }>).forEach((row) => {
    counts[row.reactionKey] = row._count._all;
  });

  const summaryDelegate = getReactionSummaryDelegate();
  const upsert = summaryDelegate && typeof summaryDelegate.upsert === 'function'
    ? summaryDelegate.upsert.bind(summaryDelegate)
    : null;
  if (upsert) {
    try {
      await upsert({
        where: { targetType_targetId: { targetType, targetId } },
        create: { targetType, targetId, counts },
        update: { counts }
      });
    } catch (error: any) {
      if (!isReactionSummaryStoreUnavailable(error)) throw error;
    }
  }

  return counts;
};

const sumReactionCounts = (counts: Record<string, number>) =>
  Object.values(counts || {}).reduce((total, value) => total + Math.max(0, Number(value || 0)), 0);

const normalizeReactorUser = (entry: {
  userId: string;
  reactionKey: string;
  reactedAt: Date;
  user?: { id?: string | null; name?: string | null; username?: string | null; avatar?: string | null } | null;
}) => ({
  userId: entry.userId,
  name: entry.user?.name || entry.user?.username || 'Scrolith member',
  username: entry.user?.username || null,
  avatar: entry.user?.avatar || null,
  reactionKey: entry.reactionKey,
  reactedAt: entry.reactedAt.toISOString()
});

const syncScrollReactionMetrics = async (
  req: Request,
  scrollId: string,
  counts: Record<string, number>,
  actorUserId: string
) => {
  const prismaAny = prisma as any;
  const updated = await prismaAny.scrollVideo.update({
    where: { id: scrollId },
    data: { likesCount: sumReactionCounts(counts) },
    select: {
      id: true,
      authorId: true,
      impressions: true,
      views3s: true,
      views10s: true,
      views25pct: true,
      views50pct: true,
      views95pct: true,
      likesCount: true,
      commentsCount: true,
      repostsCount: true,
      sharesCount: true,
      sendCount: true
    }
  });

  const io = getAppIo(req);
  const payload = {
    scrollId,
    type: 'like',
    userId: actorUserId,
    created: Number(updated?.likesCount || 0) > 0,
    liked: Number(updated?.likesCount || 0) > 0,
    metrics: {
      impressions: Number(updated?.impressions || 0),
      views3s: Number(updated?.views3s || 0),
      views10s: Number(updated?.views10s || 0),
      views25pct: Number(updated?.views25pct || 0),
      views50pct: Number(updated?.views50pct || 0),
      views95pct: Number(updated?.views95pct || 0),
      likes: Number(updated?.likesCount || 0),
      comments: Number(updated?.commentsCount || 0),
      reposts: Number(updated?.repostsCount || 0),
      shares: Number(updated?.sharesCount || 0),
      sends: Number(updated?.sendCount || 0)
    }
  };

  try {
    io?.emit?.('scroll:engagement_update', payload);
  } catch (error) {
    console.warn('[reactions] scroll engagement emit failed', error);
  }

  try {
    realtime.emitToRoom('community:global', 'scroll:engagement_update', payload);
  } catch {}

  if (updated?.authorId) {
    try {
      realtime.emitToUser(String(updated.authorId), 'scroll:engagement_update', payload);
    } catch {}
  }
};

const getSummaryCounts = async (targetType: ReactionTargetType, targetId: string) => {
  const summaryDelegate = getReactionSummaryDelegate();
  const findUnique = summaryDelegate && typeof summaryDelegate.findUnique === 'function'
    ? summaryDelegate.findUnique.bind(summaryDelegate)
    : null;
  if (findUnique) {
    try {
      const cached = await findUnique({
        where: { targetType_targetId: { targetType, targetId } }
      });
      if (cached?.counts && typeof cached.counts === 'object' && !Array.isArray(cached.counts)) {
        return cached.counts as Record<string, number>;
      }
    } catch (error: any) {
      if (!isReactionSummaryStoreUnavailable(error)) {
        const maybeTypeError = error instanceof TypeError ? String(error?.message || '') : '';
        if (!maybeTypeError.includes('findUnique') && !maybeTypeError.includes('upsert')) {
          throw error;
        }
      }
    }
  }
  return rebuildSummary(targetType, targetId);
};

const emitReactionUpdate = async (
  req: Request,
  details: {
    targetType: ReactionTargetType;
    targetId: string;
    counts: Record<string, number>;
    userReaction: string | null;
    actorUserId: string;
    postId?: string;
    scrollId?: string;
    conversationId?: string;
    participantUserIds?: string[];
  }
) => {
  const io = getAppIo(req);
  const payload = {
    targetType: details.targetType,
    targetId: details.targetId,
    counts: details.counts,
    userReaction: details.userReaction,
    actorUserId: details.actorUserId
  };
  try {
    io?.emit?.('reactions:updated', payload);
  } catch (e) {
    console.warn('[reactions] io emit failed', e);
  }

  if (details.targetType === 'POST' && details.postId) {
    try {
      realtime.emitToPost(details.postId, 'reactions:updated', payload);
    } catch (e) {}
  }

  if (details.targetType === 'COMMENT' && details.postId) {
    try {
      realtime.emitToPost(details.postId, 'reactions:updated', payload);
    } catch (e) {}
    try {
      io?.emit?.('comments:updated', payload);
    } catch (e) {}
  }

  if (details.targetType === 'COMMENT' && details.scrollId) {
    try {
      realtime.emitToRoom('community:global', 'reactions:updated', payload);
    } catch (e) {}
    try {
      io?.emit?.('scroll:comment_reaction_updated', {
        scrollId: details.scrollId,
        ...payload
      });
    } catch (e) {}
  }

  if (details.targetType === 'MESSAGE' && details.conversationId) {
    const messagePayload = {
      conversationId: details.conversationId,
      messageId: details.targetId,
      reactionSummary: details.counts,
      userReaction: details.userReaction,
      actorUserId: details.actorUserId
    };

    const recipients = Array.from(new Set(details.participantUserIds || []));
    recipients.forEach((participantId) => {
      try {
        realtime.emitToUser(participantId, 'reactions:updated', payload);
      } catch (e) {}
      try {
        realtime.emitToUser(participantId, 'messages:updated', messagePayload);
      } catch (e) {}
    });
  }

  if (details.targetType === 'STORY') {
    try {
      io?.emit?.('community:story_reactions_updated', payload);
    } catch (e) {}
  }

  if (details.targetType === 'SCROLL') {
    try {
      io?.emit?.('scroll:reaction_updated', payload);
    } catch (e) {}
  }
};

export const upsertReaction = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const targetType = normalizeTargetType(req.body?.targetType);
    const targetId = String(req.body?.targetId || '').trim();
    if (!targetType || !targetId) {
      return res.status(400).json({ success: false, error: 'targetType and targetId are required' });
    }

    const settings = readReactionSettings();
    if (!isFeatureEnabledForTarget(targetType, settings)) {
      return res.status(403).json({ success: false, error: 'Reactions are disabled for this content' });
    }

    if (!assertRateLimit(userId, settings)) {
      return res.status(429).json({ success: false, error: 'Too many reactions, please try again shortly' });
    }

    const reactionKey = normalizeReactionKey(req.body?.reactionKey, settings);
    if (!reactionKey) {
      return res.status(400).json({ success: false, error: 'Invalid or disabled reaction key' });
    }

    const access = await ensureTargetAccess(userId, targetType, targetId);
    if (!access.ok) {
      const denied = access as TargetAccessErr;
      return res.status(denied.status).json({ success: false, error: denied.error });
    }

    let userReaction: string | null = null;
    let createdOrChanged = false;
    await prisma.$transaction(async (tx) => {
      const existingRows = await tx.reaction.findMany({
        where: { userId, targetType, targetId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, reactionKey: true }
      });

      const [primary, ...duplicates] = existingRows;
      if (duplicates.length) {
        await tx.reaction.deleteMany({
          where: { id: { in: duplicates.map((row) => row.id) } }
        });
      }

      if (!primary) {
        await tx.reaction.create({
          data: { userId, targetType, targetId, reactionKey }
        });
        userReaction = reactionKey;
        createdOrChanged = true;
      } else if (primary.reactionKey === reactionKey) {
        await tx.reaction.delete({ where: { id: primary.id } });
        userReaction = null;
      } else {
        await tx.reaction.update({
          where: { id: primary.id },
          data: { reactionKey }
        });
        userReaction = reactionKey;
        createdOrChanged = true;
      }
    });

    const shouldNotifyPostAuthor =
      targetType === 'POST' &&
      userReaction !== null &&
      createdOrChanged;

    if (shouldNotifyPostAuthor) {
      try {
        const post = await prisma.communityPost.findUnique({
          where: { id: targetId },
          select: { authorId: true, status: true }
        });
        if (post && post.status !== 'deleted' && post.authorId !== userId) {
          const actor = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, username: true }
          });
          const actorName = actor?.name || actor?.username || 'Someone';
          await createEngagementNotification({
            recipientId: post.authorId,
            actorId: userId,
             type: 'reaction_on_post',
             title: 'New reaction',
             message: `${actorName} reacted ${reactionKey} to your post.`,
            actionUrl: `/post/${targetId}`,
             metadata: {
               postId: targetId,
               actorId: userId,
               postAuthorId: post.authorId,
              reactionType: reactionKey
            },
            dedupeWindowMinutes: 20,
            dedupeMetaKeys: ['postId', 'actorId']
          });
        }
      } catch (notifyError) {
        console.warn('[reactions] reaction_on_post notification failed', notifyError);
      }
    }

    // Phase 20.2.3: notify comment authors when someone reacts to their comment.
    if (targetType === 'COMMENT' && userReaction !== null && createdOrChanged) {
      try {
        const comment = await prisma.communityPostComment.findUnique({
          where: { id: targetId },
          select: { id: true, authorId: true, postId: true, status: true }
        });
        if (comment && comment.status !== 'deleted' && comment.authorId !== userId) {
          const actor = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, username: true }
          });
          const actorName = actor?.name || actor?.username || 'Someone';
          await createEngagementNotification({
            recipientId: comment.authorId,
            actorId: userId,
            type: 'reaction_on_comment',
            title: 'New reaction',
            message: `${actorName} reacted ${reactionKey} to your comment.`,
            actionUrl: comment.postId ? `/post/${comment.postId}?commentId=${comment.id}` : undefined,
            metadata: {
              commentId: comment.id,
              postId: comment.postId,
              actorId: userId,
              reactionType: reactionKey
            },
            dedupeWindowMinutes: 20,
            dedupeMetaKeys: ['commentId', 'actorId']
          });
        }
      } catch (notifyError) {
        console.warn('[reactions] reaction_on_comment notification failed', notifyError);
      }
    }

    // Dual-write CommunityPostReaction so legacy feed bars stay consistent with unified Reaction.
    if (targetType === 'POST') {
      try {
        if (userReaction) {
          await prisma.communityPostReaction.upsert({
            where: { postId_userId: { postId: targetId, userId } },
            create: { postId: targetId, userId, type: userReaction },
            update: { type: userReaction }
          });
        } else {
          await prisma.communityPostReaction.deleteMany({ where: { postId: targetId, userId } });
        }
      } catch (syncError) {
        console.warn('[reactions] CommunityPostReaction dual-write failed', syncError);
      }
    }

    const counts = await rebuildSummary(targetType, targetId);
    if (targetType === 'SCROLL') {
      await syncScrollReactionMetrics(req, access.scrollId || targetId, counts, userId);
    }
    await emitReactionUpdate(req, {
      targetType,
      targetId,
      counts,
      userReaction,
      actorUserId: userId,
      postId: access.postId,
      scrollId: access.scrollId,
      conversationId: access.conversationId,
      participantUserIds: access.participantUserIds
    });

    // Compatibility event for PostEngagementBar listeners.
    if (targetType === 'POST') {
      try {
        const io = getAppIo(req);
        const legacyPayload = {
          postId: targetId,
          post_id: targetId,
          reactions: counts,
          userReaction,
          actorId: userId,
          userId
        };
        io?.emit?.('community:post_reaction_updated', { data: legacyPayload });
        realtime.emitToPost(targetId, 'community:post_reaction_updated', { data: legacyPayload });
      } catch (legacyEmitError) {
        console.warn('[reactions] legacy post reaction emit failed', legacyEmitError);
      }
    }

    return res.json({
      success: true,
      data: {
        targetType,
        targetId,
        counts,
        userReaction
      }
    });
  } catch (error: any) {
    console.error('[reactions] upsert error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update reaction' });
  }
};

export const getReactionSummary = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const targetType = normalizeTargetType(req.query?.targetType);
    const targetId = String(req.query?.targetId || '').trim();
    if (!targetType || !targetId) {
      return res.status(400).json({ success: false, error: 'targetType and targetId are required' });
    }

    const settings = readReactionSettings();
    if (!isFeatureEnabledForTarget(targetType, settings)) {
      return res.status(403).json({ success: false, error: 'Reactions are disabled for this content' });
    }

    const access = await ensureTargetAccess(userId, targetType, targetId);
    if (!access.ok) {
      const denied = access as TargetAccessErr;
      return res.status(denied.status).json({ success: false, error: denied.error });
    }

    const [counts, mineRows] = await Promise.all([
      getSummaryCounts(targetType, targetId),
      prisma.reaction.findMany({
        where: { userId, targetType, targetId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, reactionKey: true }
      })
    ]);

    const [mine, ...duplicates] = mineRows;
    if (duplicates.length) {
      await prisma.reaction.deleteMany({
        where: { id: { in: duplicates.map((row) => row.id) } }
      });
    }

    return res.json({
      success: true,
      data: {
        targetType,
        targetId,
        counts,
        userReaction: mine?.reactionKey || null,
        allowed: settings.allowed
      }
    });
  } catch (error: any) {
    console.error('[reactions] summary error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load reaction summary' });
  }
};

export const getReactionSummaryBulk = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const targetType = normalizeTargetType(req.body?.targetType);
    const rawTargetIds = Array.isArray(req.body?.targetIds) ? req.body.targetIds : [];
    const targetIds: string[] = Array.from(
      new Set(rawTargetIds.map((id: any) => String(id || '').trim()).filter(Boolean))
    );
    if (!targetType || !targetIds.length) {
      return res.status(400).json({ success: false, error: 'targetType and targetIds are required' });
    }

    const settings = readReactionSettings();
    if (!isFeatureEnabledForTarget(targetType, settings)) {
      return res.status(403).json({ success: false, error: 'Reactions are disabled for this content' });
    }

    let scopedTargetIds = targetIds.slice(0, 200);
    if (targetType === 'MESSAGE') {
      const allowedMessages = await prisma.directMessage.findMany({
        where: {
          id: { in: scopedTargetIds },
          deletedAt: null,
          conversation: {
            participants: { some: { userId } }
          }
        },
        select: { id: true }
      });
      scopedTargetIds = allowedMessages.map((message) => message.id);
    } else if (targetType === 'POST') {
      const posts = await prisma.communityPost.findMany({
        where: { id: { in: scopedTargetIds }, status: { not: 'deleted' } },
        select: { id: true }
      });
      scopedTargetIds = posts.map((post) => post.id);
    } else if (targetType === 'COMMENT') {
      const prismaAny = prisma as any;
      const [postComments, scrollComments] = await Promise.all([
        prisma.communityPostComment.findMany({
          where: { id: { in: scopedTargetIds }, status: { not: 'deleted' }, post: { status: { not: 'deleted' } } },
          select: { id: true }
        }),
        prismaAny.scrollComment?.findMany?.({
          where: {
            id: { in: scopedTargetIds },
            status: { not: 'deleted' },
            scroll: { status: 'active' }
          },
          select: {
            id: true,
            scroll: { select: { authorId: true, visibility: true } }
          }
        }) || Promise.resolve([])
      ]);
      scopedTargetIds = Array.from(
        new Set([
          ...(postComments || []).map((comment) => comment.id),
          ...(scrollComments || [])
            .filter((comment: any) => {
              const visibility = String(comment?.scroll?.visibility || '').toLowerCase();
              if (visibility === 'private') {
                return String(comment?.scroll?.authorId || '') === String(userId);
              }
              return true;
            })
            .map((comment: any) => comment.id)
        ])
      );
    } else if (targetType === 'STORY') {
      const stories = await prisma.communityStory.findMany({
        where: { id: { in: scopedTargetIds }, expiresAt: { gt: new Date() } },
        select: { id: true, authorId: true, visibility: true }
      });
      scopedTargetIds = stories
        .filter((story) => {
          const visibility = String(story.visibility || '').toLowerCase();
          if (visibility === 'private' || visibility === 'custom') {
            return String(story.authorId) === String(userId);
          }
          return true;
        })
        .map((story) => story.id);
    } else if (targetType === 'SCROLL') {
      const prismaAny = prisma as any;
      const scrolls = await prismaAny.scrollVideo.findMany({
        where: { id: { in: scopedTargetIds }, status: 'active' },
        select: { id: true, authorId: true, visibility: true }
      });
      scopedTargetIds = scrolls
        .filter((scroll: any) => {
          const visibility = String(scroll.visibility || '').toLowerCase();
          if (visibility === 'private') return String(scroll.authorId) === String(userId);
          return true;
        })
        .map((scroll: any) => scroll.id);
    }

    if (!scopedTargetIds.length) {
      return res.json({ success: true, data: {} });
    }

    const [grouped, mine] = await Promise.all([
      prisma.reaction.groupBy({
        by: ['targetId', 'reactionKey'],
        where: { targetType, targetId: { in: scopedTargetIds } },
        _count: { _all: true }
      }),
      prisma.reaction.findMany({
        where: { targetType, targetId: { in: scopedTargetIds }, userId },
        select: { targetId: true, reactionKey: true }
      })
    ]);

    const data: Record<string, { counts: Record<string, number>; userReaction: string | null }> = {};
    scopedTargetIds.forEach((targetId) => {
      data[targetId] = { counts: {}, userReaction: null };
    });
    (grouped as Array<{ targetId: string; reactionKey: string; _count: { _all: number } }>).forEach((row) => {
      if (!data[row.targetId]) data[row.targetId] = { counts: {}, userReaction: null };
      data[row.targetId].counts[row.reactionKey] = row._count._all;
    });
    (mine as Array<{ targetId: string; reactionKey: string }>).forEach((row) => {
      if (!data[row.targetId]) data[row.targetId] = { counts: {}, userReaction: null };
      data[row.targetId].userReaction = row.reactionKey;
    });

    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('[reactions] summary bulk error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load reactions summary' });
  }
};

export const getReactionUsers = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const targetType = normalizeTargetType(req.query?.targetType);
    const targetId = String(req.query?.targetId || '').trim();
    const reactionKey = String(req.query?.reactionKey || '').trim().toLowerCase();
    if (!targetType || !targetId || !reactionKey) {
      return res.status(400).json({ success: false, error: 'targetType, targetId, and reactionKey are required' });
    }

    const settings = readReactionSettings();
    if (!settings.showReactors) {
      return res.status(403).json({ success: false, error: 'Viewing reactors is disabled by admin' });
    }
    if (!isFeatureEnabledForTarget(targetType, settings)) {
      return res.status(403).json({ success: false, error: 'Reactions are disabled for this content' });
    }

    const access = await ensureTargetAccess(userId, targetType, targetId);
    if (!access.ok) {
      const denied = access as TargetAccessErr;
      return res.status(denied.status).json({ success: false, error: denied.error });
    }

    const genericUsers = await prisma.reaction.findMany({
      where: { targetType, targetId, reactionKey },
      orderBy: { createdAt: 'desc' },
      take: 150,
      include: {
        user: {
          select: { id: true, name: true, username: true, avatar: true }
        }
      }
    });

    const legacyPostUsers =
      targetType === 'POST'
        ? await prisma.communityPostReaction.findMany({
            where: { postId: targetId, type: reactionKey },
            orderBy: { createdAt: 'desc' },
            take: 150,
            include: {
              user: {
                select: { id: true, name: true, username: true, avatar: true }
              }
            }
          })
        : [];

    const merged = new Map<
      string,
      {
        userId: string;
        reactionKey: string;
        reactedAt: Date;
        user?: { id?: string | null; name?: string | null; username?: string | null; avatar?: string | null } | null;
      }
    >();

    [
      ...legacyPostUsers.map((entry) => ({
        userId: entry.userId,
        reactionKey: entry.type,
        reactedAt: entry.createdAt,
        user: entry.user
      })),
      ...genericUsers.map((entry) => ({
        userId: entry.userId,
        reactionKey: entry.reactionKey,
        reactedAt: entry.createdAt,
        user: entry.user
      }))
    ]
      .sort((a, b) => b.reactedAt.getTime() - a.reactedAt.getTime())
      .forEach((entry) => {
        if (!merged.has(entry.userId)) merged.set(entry.userId, entry);
      });

    return res.json({
      success: true,
      data: Array.from(merged.values()).slice(0, 150).map(normalizeReactorUser)
    });
  } catch (error: any) {
    console.error('[reactions] users error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load reactors' });
  }
};
