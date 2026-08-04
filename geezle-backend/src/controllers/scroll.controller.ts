import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { addFileUsage, removeUsage } from '../utils/fileUsage';
import { resolveDirectMediaUrl, resolveFileBaseUrl } from '../utils/mediaUrl';
import {
  getOrCreateScrollConfig,
  updateScrollConfig,
  isScrollSchemaMissingError
} from '../services/scroll.service';
import {
  assessVideoIntegrityByFile,
  buildVideoIntegrityUpdate
} from '../services/videoIntegrity.service';
import { isStoredMediaAvailable } from '../services/media/mediaAvailability.service';
import { getScrollDashTotals } from '../services/gcoinDonationTotals.service';
import {
  normalizeStoredContentOfferTags,
  resolveSubmittedContentOfferTags
} from '../services/contentOfferTagging.service';
import { dispatchMessageReceiptNotifications } from '../services/messageNotifications';
import {
  extractInterestKeywords,
  getViewerFeedContext,
  recordFeedIntentSignal,
  scoreScrollForMode
} from '../services/opportunityGraph.service';

const SCROLL_VISIBILITIES = new Set(['public', 'network', 'followers', 'private']);
const SCROLL_FILTER_PRESETS = new Set(['none', 'vibrant', 'cinematic', 'bw', 'sepia', 'warm']);
const SCROLL_RESPONSE_MODES = new Set(['remix', 'duet']);
const SCROLL_ENGAGEMENT_TYPES = new Set([
  'like',
  'comment',
  'repost',
  'share',
  'dash',
  'send',
  'impression',
  'view_3s',
  'view_10s',
  'view_25',
  'view_50',
  'view_95',
  // Phase 23 — Scrolitha learning signals (no public counter inflation)
  'learn_pause',
  'learn_replay',
  'learn_mute',
  'learn_unmute',
  'learn_seek',
  'learn_complete',
  'learn_watch'
]);

const SCROLL_LEARNING_TYPES = new Set([
  'learn_pause',
  'learn_replay',
  'learn_mute',
  'learn_unmute',
  'learn_seek',
  'learn_complete',
  'learn_watch'
]);

const getBaseFileUrl = (req?: Request) => resolveFileBaseUrl(req);

const buildFileContentUrl = (fileId: string, baseUrl: string) =>
  `${baseUrl}/api/files/content/${encodeURIComponent(fileId)}`;

const absolutizeMediaUrl = (value: string | null | undefined, baseUrl: string) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${baseUrl}${raw}`;
  return `${baseUrl}/${raw.replace(/^\/+/, '')}`;
};

const resolveStoredFileUrl = (
  file: { id?: string; url?: string | null; storageKey?: string | null; storageProvider?: string | null },
  baseUrl: string
) => {
  const provider = String(file.storageProvider || '').trim().toLowerCase();
  const directUrl = resolveDirectMediaUrl(file.url, baseUrl);
  if (['database_storage', 'firebase_storage', 'azure_blob'].includes(provider)) {
    if (file.id) return buildFileContentUrl(file.id, baseUrl);
    return absolutizeMediaUrl(directUrl || file.url || null, baseUrl);
  }
  if (directUrl) {
    return absolutizeMediaUrl(directUrl, baseUrl);
  }
  if (file.storageKey) {
    return `${baseUrl}/uploads/${String(file.storageKey).replace(/^\/+/, '')}`;
  }
  return absolutizeMediaUrl(file.url || null, baseUrl);
};

/** Dual-path media object for Scroll responses (url + optional uploads fallback). */
const resolveStoredFileMedia = (
  file: {
    id?: string;
    url?: string | null;
    storageKey?: string | null;
    storageProvider?: string | null;
    thumbnailUrl?: string | null;
    mimeType?: string | null;
    width?: number | null;
    height?: number | null;
    duration?: number | null;
  },
  baseUrl: string
) => {
  const preferred = resolveStoredFileUrl(file, baseUrl);
  const uploads =
    file.storageKey
      ? `${baseUrl}/uploads/${String(file.storageKey).replace(/^\/+/, '')}`
      : null;
  const content = file.id ? buildFileContentUrl(file.id, baseUrl) : null;
  const fallback =
    preferred && uploads && preferred !== uploads
      ? uploads
      : preferred && content && preferred !== content
        ? content
        : null;
  return {
    url: preferred,
    fallbackUrl: fallback,
    storagePath: file.storageKey || null,
    thumbnailUrl: absolutizeMediaUrl(
      resolveDirectMediaUrl(file.thumbnailUrl, baseUrl) || file.thumbnailUrl || null,
      baseUrl
    ),
    mimeType: file.mimeType || null,
    width: file.width ?? null,
    height: file.height ?? null,
    duration: file.duration ?? null
  };
};

const toInt = (value: any, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
};

const normalizeVisibility = (value: any, fallback = 'public') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (SCROLL_VISIBILITIES.has(normalized)) return normalized;
  return fallback;
};

const normalizeFilterPreset = (value: any) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'none';
  if (SCROLL_FILTER_PRESETS.has(normalized)) return normalized;
  return 'none';
};

const normalizeResponseMode = (value: any) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (SCROLL_RESPONSE_MODES.has(normalized)) return normalized;
  return null;
};

const uniqueStrings = (values: any): string[] => {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
};

const normalizeSeriesIds = (value: any) => uniqueStrings(value);

const normalizeSeriesStatus = (value: any, fallback = 'active') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['active', 'archived'].includes(normalized)) return normalized;
  return fallback;
};

const sanitizeSeriesTitle = (value: any) => String(value || '').trim().slice(0, 120);

const sanitizeSeriesDescription = (value: any) => {
  const normalized = String(value || '').trim();
  return normalized ? normalized.slice(0, 4000) : null;
};

const normalizeTagRows = (rawTags: any): Array<{ taggedUserId: string | null; taggedPageId: string | null }> => {
  if (!Array.isArray(rawTags)) return [];
  const unique = new Set<string>();
  const rows: Array<{ taggedUserId: string | null; taggedPageId: string | null }> = [];
  for (const entry of rawTags) {
    const taggedUserId = String(entry?.taggedUserId || entry?.userId || '').trim() || null;
    const taggedPageId = String(entry?.taggedPageId || entry?.pageId || '').trim() || null;
    if (!taggedUserId && !taggedPageId) continue;
    const key = `${taggedUserId || ''}:${taggedPageId || ''}`;
    if (unique.has(key)) continue;
    unique.add(key);
    rows.push({ taggedUserId, taggedPageId });
  }
  return rows;
};

const hasUserBlockRelation = async (userId?: string | null, otherUserId?: string | null) => {
  const actorId = String(userId || '').trim();
  const targetId = String(otherUserId || '').trim();
  if (!actorId || !targetId || actorId === targetId) return false;
  const row = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: actorId, blockedId: targetId },
        { blockerId: targetId, blockedId: actorId }
      ]
    },
    select: { id: true }
  });
  return Boolean(row);
};

const isPrivilegedUser = (user: any) => {
  const role = String(user?.role || '').trim().toLowerCase();
  return role.includes('admin') || role.includes('moderator') || role.includes('superadmin');
};

const canAccessScroll = async (
  scroll: { id: string; authorId: string; visibility?: string | null; status?: string | null } | null,
  viewerId?: string | null,
  privileged = false
) => {
  if (!scroll || String(scroll.status || '').toLowerCase() !== 'active') {
    return { ok: false, status: 404, error: 'Scroll video not found.' };
  }
  if (viewerId && await hasUserBlockRelation(viewerId, scroll.authorId)) {
    return { ok: false, status: 404, error: 'Scroll video not found.' };
  }
  const visibility = String(scroll.visibility || '').trim().toLowerCase();
  if (visibility === 'private' && !privileged && String(scroll.authorId) !== String(viewerId || '').trim()) {
    return { ok: false, status: 403, error: 'You are not allowed to access this scroll.' };
  }
  return { ok: true, status: 200, error: '' };
};

const isAdminRequest = (req: Request) => String((req as any)?.user?.role || '').toLowerCase().includes('admin');

const emitScrollEvent = (req: Request, event: string, payload: any) => {
  const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
  try {
    io?.emit(event, payload);
  } catch {}
  try {
    realtime.emitToRoom('community:global', event, payload);
  } catch {}
  if (payload?.scroll?.authorId) {
    try {
      realtime.emitToUser(payload.scroll.authorId, event, payload);
    } catch {}
  }
};

const emitNotificationEvent = (userId: string, payload: any) => {
  const targetUserId = String(userId || '').trim();
  if (!targetUserId) return;
  try {
    realtime.emitToUser(targetUserId, 'notifications:new', payload);
  } catch {}
};

const buildRestrictionPayload = (restriction: any) => {
  if (!restriction?.id) return null;
  return {
    id: restriction.id,
    userId: restriction.userId,
    reason: restriction.reason || '',
    note: restriction.note || '',
    startsAt: restriction.startsAt,
    endsAt: restriction.endsAt,
    createdByAdminId: restriction.createdByAdminId || null,
    liftedAt: restriction.liftedAt || null,
    liftedByAdminId: restriction.liftedByAdminId || null,
    createdAt: restriction.createdAt,
    updatedAt: restriction.updatedAt
  };
};

const loadActiveScrollPostingRestrictions = async (userIds: string[]) => {
  const ids = Array.from(new Set((userIds || []).map((value) => String(value || '').trim()).filter(Boolean)));
  const map = new Map<string, any>();
  if (!ids.length) return map;
  const now = new Date();
  const rows = await (prisma as any).scrollPostingRestriction.findMany({
    where: {
      userId: { in: ids },
      liftedAt: null,
      endsAt: { gt: now }
    },
    orderBy: [{ endsAt: 'desc' }, { createdAt: 'desc' }]
  });
  (rows || []).forEach((row: any) => {
    const userId = String(row?.userId || '').trim();
    if (!userId || map.has(userId)) return;
    map.set(userId, row);
  });
  return map;
};

const getActiveScrollPostingRestriction = async (userId?: string | null) => {
  const targetUserId = String(userId || '').trim();
  if (!targetUserId) return null;
  return (prisma as any).scrollPostingRestriction.findFirst({
    where: {
      userId: targetUserId,
      liftedAt: null,
      endsAt: { gt: new Date() }
    },
    orderBy: [{ endsAt: 'desc' }, { createdAt: 'desc' }]
  });
};

const createRuntimeNotification = async (input: {
  userId: string;
  actorId?: string | null;
  type: string;
  title: string;
  body: string;
  actionUrl?: string | null;
  meta?: Record<string, any> | null;
}) => {
  const userId = String(input.userId || '').trim();
  if (!userId) return null;
  const created = await prisma.notification.create({
    data: {
      userId,
      actorId: input.actorId || null,
      type: input.type,
      title: input.title,
      body: input.body,
      meta: {
        ...(input.meta || {}),
        actionUrl: input.actionUrl || null
      }
    }
  });
  emitNotificationEvent(userId, {
    id: created.id,
    type: created.type,
    title: created.title,
    body: created.body,
    actionUrl: input.actionUrl || null,
    createdAt: created.createdAt.toISOString(),
    meta: created.meta
  });
  return created;
};

const getOrCreateDirectConversation = async (leftUserId: string, rightUserId: string) => {
  const userAId = String(leftUserId || '').trim();
  const userBId = String(rightUserId || '').trim();
  if (!userAId || !userBId) {
    throw new Error('Conversation participants are required.');
  }
  const existing = await prisma.conversation.findFirst({
    where: {
      type: 'DIRECT',
      participants: {
        some: {
          userId: userAId
        }
      },
      AND: [
        {
          participants: {
            some: {
              userId: userBId
            }
          }
        }
      ]
    },
    include: {
      participants: {
        select: {
          userId: true
        }
      }
    }
  });
  if (existing?.id) return existing;
  return prisma.conversation.create({
    data: {
      type: 'DIRECT',
      participants: {
        create: [
          { userId: userAId, label: 'other' },
          { userId: userBId, label: 'other' }
        ]
      }
    },
    include: {
      participants: {
        select: {
          userId: true
        }
      }
    }
  });
};

const createAdminConversationMessage = async (
  req: Request,
  input: {
    senderId: string;
    targetUserId: string;
    scrollId: string;
    text: string;
    kind: 'message' | 'warning';
  }
) => {
  const senderId = String(input.senderId || '').trim();
  const targetUserId = String(input.targetUserId || '').trim();
  const scrollId = String(input.scrollId || '').trim();
  const text = String(input.text || '').trim();
  if (!senderId || !targetUserId || !scrollId || !text) {
    throw new Error('Message context is incomplete.');
  }

  const conversation = await getOrCreateDirectConversation(senderId, targetUserId);
  const message = await prisma.directMessage.create({
    data: {
      conversationId: conversation.id,
      senderId,
      text,
      isSystem: input.kind === 'warning',
      metadata: {
        category: input.kind === 'warning' ? 'scroll_warning' : 'scroll_admin_message',
        scrollId,
        adminGenerated: true
      }
    },
    select: {
      id: true,
      conversationId: true,
      senderId: true,
      text: true,
      createdAt: true,
      messageType: true
    }
  });

  const lastMessageText = text.length > 220 ? `${text.slice(0, 217)}...` : text;
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageText,
      lastMessageAt: message.createdAt,
      lastMessageSenderId: senderId
    }
  });

  const payload = {
    id: message.id,
    messageId: message.id,
    conversationId: conversation.id,
    conversation_id: conversation.id,
    senderId,
    sender_id: senderId,
    receiverId: targetUserId,
    receiver_id: targetUserId,
    text: message.text,
    messageType: String(message.messageType || 'text').toLowerCase(),
    message_type: String(message.messageType || 'text').toLowerCase(),
    timestamp: message.createdAt.toISOString(),
    createdAt: message.createdAt.toISOString(),
    metadata: {
      category: input.kind === 'warning' ? 'scroll_warning' : 'scroll_admin_message',
      scrollId
    },
    attachments: [],
    is_deleted: false,
    isDeleted: false
  };

  try {
    realtime.emitToUser(targetUserId, 'messages:new', payload);
    realtime.emitToUser(senderId, 'messages:sent', payload);
    realtime.emitToUser(targetUserId, 'messages:conversation_updated', {
      conversationId: conversation.id,
      last_message: lastMessageText,
      lastMessage: lastMessageText,
      last_message_at: message.createdAt.toISOString(),
      lastMessageAt: message.createdAt.toISOString()
    });
  } catch {}

  void dispatchMessageReceiptNotifications({
    receiverIds: [targetUserId],
    senderId,
    conversationId: conversation.id,
    messageId: message.id,
    preview: message.text,
    fallbackPreview: input.kind === 'warning' ? 'You received a Scroll warning.' : 'You received a new admin message.',
    messageType: 'text'
  }).catch((notifyError) => {
    console.warn('Failed to send scroll admin message notifications', notifyError);
  });

  return {
    conversationId: conversation.id,
    messageId: message.id
  };
};

const resolveScrollMedia = async (fileId: string, req: Request) => {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      ownerId: true,
      originalName: true,
      mimeType: true,
      duration: true,
      storageKey: true,
      storageProvider: true,
      thumbnailUrl: true,
      width: true,
      height: true,
      url: true
    }
  });
  if (!file) return null;
  const baseUrl = getBaseFileUrl(req);
  const media = resolveStoredFileMedia(file, baseUrl);
  return {
    id: file.id,
    ownerId: file.ownerId,
    name: file.originalName,
    mimeType: file.mimeType,
    duration: file.duration ?? null,
    url: media.url,
    fallbackUrl: media.fallbackUrl,
    storagePath: media.storagePath,
    thumbnailUrl: media.thumbnailUrl,
    width: file.width ?? null,
    height: file.height ?? null
  };
};

const buildScrollMediaMap = async (fileIds: string[], req: Request) => {
  const ids = Array.from(new Set((fileIds || []).map((value) => String(value || '').trim()).filter(Boolean)));
  if (!ids.length) return new Map<string, any>();
  const files = await prisma.file.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      ownerId: true,
      originalName: true,
      mimeType: true,
      duration: true,
      storageKey: true,
      storageProvider: true,
      thumbnailUrl: true,
      width: true,
      height: true,
      url: true
    }
  });
  const baseUrl = getBaseFileUrl(req);
  const unavailableFileIds = new Set<string>();
  await Promise.all(
    files.map(async (file) => {
      const available = await isStoredMediaAvailable(file);
      if (!available) unavailableFileIds.add(file.id);
    })
  );
  return new Map(
    files.map((file) => {
      const media = resolveStoredFileMedia(file, baseUrl);
      const unavailable = unavailableFileIds.has(file.id);
      return [
        file.id,
        {
          id: file.id,
          ownerId: file.ownerId,
          name: file.originalName,
          mimeType: file.mimeType,
          duration: file.duration ?? null,
          url: unavailable ? null : media.url,
          fallbackUrl: unavailable ? null : media.fallbackUrl,
          storagePath: media.storagePath,
          unavailable,
          unavailableReason: unavailable ? 'storage_missing' : null,
          thumbnailUrl: media.thumbnailUrl,
          width: file.width ?? null,
          height: file.height ?? null
        }
      ];
    })
  );
};

const scrollVideoListSelect: any = {
  id: true,
  authorId: true,
  fileId: true,
  sourceScrollId: true,
  responseMode: true,
  title: true,
  description: true,
  offerTags: true,
  location: true,
  visibility: true,
  graphicWarning: true,
  isAIEnhanced: true,
  filterPreset: true,
  filterStrength: true,
  status: true,
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
  sendCount: true,
  videoIntegrityStatus: true,
  videoIntegrityMatchMethod: true,
  videoIntegrityMatchScore: true,
  videoMonetizationBlocked: true,
  createdAt: true,
  updatedAt: true
};

const buildScrollIntentMeta = (scroll: any, seriesTitles: string[] = []) => ({
  topics: extractInterestKeywords(scroll?.title, scroll?.description, scroll?.location, seriesTitles),
  authorId: String(scroll?.authorId || '').trim(),
  visibility: String(scroll?.visibility || '').trim(),
  responseMode: String(scroll?.responseMode || '').trim()
});

const buildSourceScrollSummaryMap = async (
  req: Request,
  scrolls: any[],
  viewerId?: string | null
) => {
  const sourceIds = uniqueStrings(scrolls.map((scroll) => scroll?.sourceScrollId));
  const map = new Map<string, any>();
  if (!sourceIds.length) return map;

  const prismaAny = prisma as any;
  const sourceRows = await prismaAny.scrollVideo.findMany({
    where: { id: { in: sourceIds } },
    select: scrollVideoListSelect
  });
  if (!sourceRows.length) return map;

  const privileged = isPrivilegedUser((req as any)?.user);
  const accessResults = await Promise.all(
    sourceRows.map(async (row: any) => {
      const access = await canAccessScroll(row, viewerId, privileged);
      return [String(row.id), access] as const;
    })
  );
  const accessMap = new Map<string, { ok: boolean; status: number; error: string }>(accessResults);
  const authorIds = uniqueStrings(sourceRows.map((row: any) => row?.authorId));
  const fileIds = uniqueStrings(sourceRows.map((row: any) => row?.fileId));
  const [authors, mediaMap] = await Promise.all([
    authorIds.length
      ? prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: {
            id: true,
            name: true,
            avatar: true,
            username: true,
            isVerified: true
          }
        })
      : Promise.resolve([]),
    buildScrollMediaMap(fileIds, req)
  ]);
  const authorMap = new Map<string, any>((authors as any[]).map((author: any) => [String(author.id), author]));

  sourceRows.forEach((row: any) => {
    const sourceId = String(row.id);
    const access = accessMap.get(sourceId);
    if (!access?.ok) {
      map.set(sourceId, {
        id: sourceId,
        unavailable: true
      });
      return;
    }
    const author = authorMap.get(String(row.authorId)) || null;
    map.set(sourceId, {
      id: sourceId,
      authorId: row.authorId,
      author: {
        id: author?.id || row.authorId,
        name: author?.name || 'Community member',
        avatar: resolveDirectMediaUrl(author?.avatar, getBaseFileUrl(req)) || author?.avatar || null,
        username: author?.username || null,
        isVerified: Boolean(author?.isVerified)
      },
      title: row.title || null,
      description: row.description || null,
      media: mediaMap.get(String(row.fileId)) || null,
      createdAt: row.createdAt,
      responseMode: row.responseMode || null
    });
  });

  return map;
};

const buildScrollSeriesSummaryMap = async (
  scrolls: any[],
  viewerId?: string | null,
  includeAdminFields = false
) => {
  const scrollIds = uniqueStrings(scrolls.map((scroll) => scroll?.id));
  const result = new Map<string, any[]>();
  if (!scrollIds.length) return result;

  const prismaAny = prisma as any;
  const itemRows = await prismaAny.scrollSeriesItem.findMany({
    where: {
      scrollId: { in: scrollIds },
      series: {
        status: { not: 'archived' }
      }
    },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: {
      scrollId: true,
      position: true,
      seriesId: true,
      series: {
        select: {
          id: true,
          creatorUserId: true,
          title: true,
          description: true,
          visibility: true,
          status: true,
          createdAt: true,
          updatedAt: true
        }
      }
    }
  });

  if (!itemRows.length) return result;

  const seriesIds = uniqueStrings(itemRows.map((row: any) => row?.seriesId));
  const countRows = await prismaAny.scrollSeriesItem.findMany({
    where: { seriesId: { in: seriesIds } },
    select: { seriesId: true }
  });
  const counts = new Map<string, number>();
  (countRows || []).forEach((row: any) => {
    const seriesId = String(row?.seriesId || '').trim();
    if (!seriesId) return;
    counts.set(seriesId, Number(counts.get(seriesId) || 0) + 1);
  });

  itemRows.forEach((row: any) => {
    const scrollId = String(row?.scrollId || '').trim();
    const series = row?.series;
    if (!scrollId || !series?.id) return;
    const canEdit =
      Boolean(viewerId) && String(series.creatorUserId || '').trim() === String(viewerId || '').trim();
    const visibility = String(series.visibility || '').trim().toLowerCase();
    const canView =
      visibility === 'public' ||
      visibility === 'network' ||
      visibility === 'followers' ||
      canEdit ||
      includeAdminFields;
    if (!canView) return;
    if (!result.has(scrollId)) result.set(scrollId, []);
    result.get(scrollId)!.push({
      id: series.id,
      creatorUserId: series.creatorUserId,
      title: series.title,
      description: series.description || null,
      visibility: series.visibility,
      status: series.status,
      position: Number(row.position || 0),
      itemCount: Number(counts.get(String(series.id)) || 0),
      canEdit,
      createdAt: series.createdAt,
      updatedAt: series.updatedAt
    });
  });

  return result;
};

const syncScrollSeriesMembership = async (
  tx: any,
  input: {
    scrollId: string;
    ownerUserId: string;
    actorUserId: string;
    seriesIds: string[];
  }
) => {
  const scrollId = String(input.scrollId || '').trim();
  const ownerUserId = String(input.ownerUserId || '').trim();
  const actorUserId = String(input.actorUserId || '').trim();
  const desiredSeriesIds = normalizeSeriesIds(input.seriesIds);
  if (!scrollId || !ownerUserId || !actorUserId) return;

  const validSeries = desiredSeriesIds.length
    ? await tx.scrollSeries.findMany({
        where: {
          id: { in: desiredSeriesIds },
          creatorUserId: ownerUserId,
          status: 'active'
        },
        select: { id: true }
      })
    : [];
  const validSeriesIds = uniqueStrings(validSeries.map((row: any) => row?.id));
  if (validSeriesIds.length !== desiredSeriesIds.length) {
    throw new Error('One or more selected series are unavailable.');
  }

  const existingItems = await tx.scrollSeriesItem.findMany({
    where: { scrollId },
    select: { id: true, seriesId: true }
  });
  const existingSeriesIds = uniqueStrings(existingItems.map((row: any) => row?.seriesId));
  const toDelete = existingSeriesIds.filter((seriesId) => !validSeriesIds.includes(seriesId));
  if (toDelete.length) {
    await tx.scrollSeriesItem.deleteMany({
      where: {
        scrollId,
        seriesId: { in: toDelete }
      }
    });
  }

  const missingSeriesIds = validSeriesIds.filter((seriesId) => !existingSeriesIds.includes(seriesId));
  if (!missingSeriesIds.length) return;

  const seriesItems = await tx.scrollSeriesItem.findMany({
    where: { seriesId: { in: missingSeriesIds } },
    select: { seriesId: true, position: true }
  });
  const nextPositions = new Map<string, number>();
  (seriesItems || []).forEach((row: any) => {
    const seriesId = String(row?.seriesId || '').trim();
    if (!seriesId) return;
    const current = Number(nextPositions.get(seriesId) || 0);
    const candidate = Number(row?.position || 0);
    if (candidate > current) nextPositions.set(seriesId, candidate);
  });

  if (missingSeriesIds.length) {
    await tx.scrollSeriesItem.createMany({
      data: missingSeriesIds.map((seriesId) => ({
        seriesId,
        scrollId,
        addedByUserId: actorUserId,
        position: Number(nextPositions.get(seriesId) || 0) + 1
      }))
    });
  }
};

const scrollCommentListSelect: any = {
  id: true,
  scrollId: true,
  parentId: true,
  authorId: true,
  content: true,
  status: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true
};

const fetchScrollPayload = async (
  req: Request,
  scroll: any,
  viewerId?: string | null,
  options?: { includeAdminFields?: boolean }
) => {
  const rows = await fetchScrollPayloadList(req, [scroll], viewerId, options);
  return rows[0] || null;
};

const fetchScrollPayloadList = async (
  req: Request,
  rows: any[],
  viewerId?: string | null,
  options?: { includeAdminFields?: boolean }
) => {
  const prismaAny = prisma as any;
  const scrolls = Array.isArray(rows) ? rows : [];
  if (!scrolls.length) return [];
  const includeAdminFields = options?.includeAdminFields === true;
  const authorIds = Array.from(new Set(scrolls.map((scroll) => String(scroll?.authorId || '').trim()).filter(Boolean)));
  const fileIds = Array.from(new Set(scrolls.map((scroll) => String(scroll?.fileId || '').trim()).filter(Boolean)));
  const scrollIds = Array.from(new Set(scrolls.map((scroll) => String(scroll?.id || '').trim()).filter(Boolean)));
  const [authors, mediaMap, tags, viewerLikes, viewerFeedbackRows, dashTotals, reportRows, activeRestrictionMap, sourceScrollMap, seriesMap] = await Promise.all([
    authorIds.length
      ? prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: {
            id: true,
            name: true,
            avatar: true,
            username: true,
            isVerified: true,
            email: true,
            role: true
          }
        })
      : Promise.resolve([]),
    buildScrollMediaMap(fileIds, req),
    scrollIds.length
      ? prismaAny.scrollTag.findMany({
          where: { scrollId: { in: scrollIds } },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            scrollId: true,
            taggedUserId: true,
            taggedPageId: true,
            createdAt: true
          }
        })
      : Promise.resolve([]),
    viewerId && scrollIds.length
      ? prismaAny.scrollEngagement.findMany({
          where: { scrollId: { in: scrollIds }, userId: viewerId, type: { in: ['like', 'impression'] } },
          select: { scrollId: true, type: true }
        })
      : Promise.resolve([]),
    viewerId && scrollIds.length
      ? prismaAny.scrollFeedback.findMany({
          where: { scrollId: { in: scrollIds }, userId: viewerId },
          select: { scrollId: true, signal: true, updatedAt: true }
        }).catch((error: any) => {
          if (isScrollSchemaMissingError(error)) return [];
          throw error;
        })
      : Promise.resolve([]),
    getScrollDashTotals(scrollIds),
    includeAdminFields && scrollIds.length
      ? prismaAny.scrollReport.findMany({
          where: { scrollId: { in: scrollIds } },
          select: { scrollId: true, status: true }
        })
      : Promise.resolve([]),
    includeAdminFields ? loadActiveScrollPostingRestrictions(authorIds) : Promise.resolve(new Map<string, any>()),
    buildSourceScrollSummaryMap(req, scrolls, viewerId),
    buildScrollSeriesSummaryMap(scrolls, viewerId, includeAdminFields)
  ]);
  const authorMap = new Map<string, any>((authors as any[]).map((author: any) => [String(author.id), author]));
  const tagsMap = new Map<string, any[]>();
  (tags || []).forEach((tag: any) => {
    const scrollId = String(tag?.scrollId || '').trim();
    if (!scrollId) return;
    if (!tagsMap.has(scrollId)) tagsMap.set(scrollId, []);
    tagsMap.get(scrollId)!.push(tag);
  });
  const viewerStateMap = new Map<string, Set<string>>();
  (viewerLikes || []).forEach((entry: any) => {
    const scrollId = String(entry?.scrollId || '').trim();
    const type = String(entry?.type || '').trim();
    if (!scrollId || !type) return;
    if (!viewerStateMap.has(scrollId)) viewerStateMap.set(scrollId, new Set<string>());
    viewerStateMap.get(scrollId)!.add(type);
  });
  const feedbackMap = new Map<string, { signal: string | null; updatedAt: string | null }>();
  (viewerFeedbackRows || []).forEach((row: any) => {
    const scrollId = String(row?.scrollId || '').trim();
    if (!scrollId) return;
    feedbackMap.set(scrollId, {
      signal: String(row?.signal || '').trim().toUpperCase() || null,
      updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null
    });
  });
  const reportSummaryMap = new Map<string, { total: number; pending: number }>();
  (reportRows || []).forEach((row: any) => {
    const scrollId = String(row?.scrollId || '').trim();
    if (!scrollId) return;
    const current = reportSummaryMap.get(scrollId) || { total: 0, pending: 0 };
    current.total += 1;
    if (String(row?.status || '').trim().toLowerCase() === 'pending') {
      current.pending += 1;
    }
    reportSummaryMap.set(scrollId, current);
  });

  return scrolls.map((scroll: any) => {
    const author = authorMap.get(String(scroll.authorId)) || null;
    const viewerState = viewerStateMap.get(String(scroll.id)) || new Set<string>();
    const feedback = feedbackMap.get(String(scroll.id)) || { signal: null, updatedAt: null };
    const reportSummary = reportSummaryMap.get(String(scroll.id)) || { total: 0, pending: 0 };
    const activePostingRestriction = activeRestrictionMap.get(String(scroll.authorId)) || null;
    return {
      id: scroll.id,
      authorId: scroll.authorId,
      sourceScrollId: scroll.sourceScrollId || null,
      responseMode: scroll.sourceScrollId ? normalizeResponseMode(scroll.responseMode) || 'remix' : null,
      author: {
        id: author?.id || scroll.authorId,
        name: author?.name || 'Community member',
        avatar: resolveDirectMediaUrl(author?.avatar, getBaseFileUrl(req)) || author?.avatar || null,
        username: author?.username || null,
        isVerified: Boolean(author?.isVerified),
        ...(includeAdminFields
          ? {
              email: author?.email || null,
              role: author?.role || null
            }
          : {})
      },
      title: scroll.title || null,
      description: scroll.description || null,
      location: scroll.location || null,
      visibility: scroll.visibility,
      graphicWarning: Boolean(scroll.graphicWarning),
      isAIEnhanced: Boolean(scroll.isAIEnhanced),
      dashGcoinTotal: dashTotals.get(String(scroll.id)) || 0,
      filterPreset: scroll.filterPreset || 'none',
      filterStrength: typeof scroll.filterStrength === 'number' ? scroll.filterStrength : null,
      videoIntegrityStatus: scroll.videoIntegrityStatus || 'clear',
      videoIntegrityMatchMethod: scroll.videoIntegrityMatchMethod || null,
      videoIntegrityMatchScore:
        typeof scroll.videoIntegrityMatchScore === 'number' ? scroll.videoIntegrityMatchScore : null,
      videoMonetizationBlocked: Boolean(scroll.videoMonetizationBlocked),
      media: mediaMap.get(String(scroll.fileId)) || null,
      sourceScroll: scroll.sourceScrollId ? sourceScrollMap.get(String(scroll.sourceScrollId)) || {
        id: String(scroll.sourceScrollId),
        unavailable: true
      } : null,
      series: seriesMap.get(String(scroll.id)) || [],
      offerTags: normalizeStoredContentOfferTags(scroll.offerTags),
      tags: tagsMap.get(String(scroll.id)) || [],
      status: scroll.status,
      metrics: {
        impressions: Number(scroll.impressions || 0),
        views3s: Number(scroll.views3s || 0),
        views10s: Number(scroll.views10s || 0),
        views25pct: Number(scroll.views25pct || 0),
        views50pct: Number(scroll.views50pct || 0),
        views95pct: Number(scroll.views95pct || 0),
        likes: Number(scroll.likesCount || 0),
        comments: Number(scroll.commentsCount || 0),
        reposts: Number(scroll.repostsCount || 0),
        shares: Number(scroll.sharesCount || 0),
        sends: Number(scroll.sendCount || 0),
        dashGcoinTotal: dashTotals.get(String(scroll.id)) || 0
      },
      viewer: {
        liked: viewerState.has('like'),
        impressed: viewerState.has('impression'),
        feedbackSignal: feedback.signal,
        feedbackUpdatedAt: feedback.updatedAt
      },
      canEdit:
        Boolean(viewerId) &&
        String(scroll.authorId || '').trim() === String(viewerId || '').trim() &&
        String(scroll.status || '').trim().toLowerCase() === 'active',
      canDelete:
        Boolean(viewerId) &&
        String(scroll.authorId || '').trim() === String(viewerId || '').trim() &&
        String(scroll.status || '').trim().toLowerCase() === 'active',
      ...(includeAdminFields
        ? {
            reportCount: reportSummary.total,
            pendingReportCount: reportSummary.pending,
            activePostingRestriction: buildRestrictionPayload(activePostingRestriction)
          }
        : {}),
      createdAt: scroll.createdAt,
      updatedAt: scroll.updatedAt
    };
  });
};

const countActiveScrollComments = (items: any[]) =>
  (Array.isArray(items) ? items : []).reduce((count, item) => {
    if (String(item?.status || '').toLowerCase() === 'deleted') return count;
    return count + 1;
  }, 0);

const loadScrollCommentReactionSummaryMap = async (commentIds: string[], viewerId?: string | null) => {
  const ids = Array.from(new Set((commentIds || []).map((value) => String(value || '').trim()).filter(Boolean)));
  if (!ids.length) return new Map<string, { counts: Record<string, number>; userReaction: string | null }>();

  const [grouped, mine] = await Promise.all([
    prisma.reaction.groupBy({
      by: ['targetId', 'reactionKey'],
      where: {
        targetType: 'COMMENT',
        targetId: { in: ids }
      },
      _count: { _all: true }
    }),
    viewerId
      ? prisma.reaction.findMany({
          where: { targetType: 'COMMENT', targetId: { in: ids }, userId: viewerId },
          select: { targetId: true, reactionKey: true }
        })
      : Promise.resolve([])
  ]);

  const map = new Map<string, { counts: Record<string, number>; userReaction: string | null }>();
  ids.forEach((id) => {
    map.set(id, { counts: {}, userReaction: null });
  });
  (grouped as Array<{ targetId: string; reactionKey: string; _count: { _all: number } }>).forEach((row) => {
    const current = map.get(row.targetId) || { counts: {}, userReaction: null };
    current.counts[row.reactionKey] = row._count._all;
    map.set(row.targetId, current);
  });
  (mine as Array<{ targetId: string; reactionKey: string }>).forEach((row) => {
    const current = map.get(row.targetId) || { counts: {}, userReaction: null };
    current.userReaction = row.reactionKey;
    map.set(row.targetId, current);
  });

  return map;
};

const buildScrollCommentPayload = (
  req: Request,
  comment: any,
  authorMap: Map<string, any>,
  reactionSummaryMap: Map<string, { counts: Record<string, number>; userReaction: string | null }>,
  viewerId?: string | null
) => {
  const author = authorMap.get(String(comment.authorId || '')) || null;
  const isDeleted = String(comment.status || '').toLowerCase() === 'deleted';
  return {
    id: comment.id,
    scrollId: comment.scrollId,
    parentId: comment.parentId || null,
    userId: comment.authorId,
    userName: author?.name || 'Community member',
    userUsername: author?.username || null,
    userAvatar: author?.avatar || null,
    content: isDeleted ? '' : String(comment.content || ''),
    status: comment.status,
    deletedAt: comment.deletedAt ? new Date(comment.deletedAt).toISOString() : null,
    createdAt: new Date(comment.createdAt).toISOString(),
    updatedAt: new Date(comment.updatedAt).toISOString(),
    canEdit: Boolean(viewerId) && (String(comment.authorId) === String(viewerId) || isPrivilegedUser((req as any)?.user)),
    canDelete: Boolean(viewerId) && (String(comment.authorId) === String(viewerId) || isPrivilegedUser((req as any)?.user)),
    reactionSummary: reactionSummaryMap.get(String(comment.id)) || { counts: {}, userReaction: null },
    replies: [] as any[]
  };
};

const loadScrollCommentsBundle = async (req: Request, scrollId: string, viewerId?: string | null) => {
  const prismaAny = prisma as any;
  const comments = await prismaAny.scrollComment.findMany({
    where: { scrollId },
    select: scrollCommentListSelect,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  });
  const authorIds = Array.from(
    new Set((comments || []).map((comment: any) => String(comment?.authorId || '').trim()).filter(Boolean))
  );
  const [authors, reactionSummaryMap] = await Promise.all([
    authorIds.length
      ? prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true, username: true, avatar: true }
        })
      : Promise.resolve([]),
    loadScrollCommentReactionSummaryMap(
      comments.map((comment: any) => String(comment.id)),
      viewerId
    )
  ]);
  const authorMap = new Map<string, any>((authors as any[]).map((author: any) => [String(author.id), author]));
  const payloadMap = new Map<string, any>();
  (comments || []).forEach((comment: any) => {
    payloadMap.set(
      String(comment.id),
      buildScrollCommentPayload(req, comment, authorMap, reactionSummaryMap, viewerId)
    );
  });
  const roots: any[] = [];
  (comments || []).forEach((comment: any) => {
    const payload = payloadMap.get(String(comment.id));
    if (!payload) return;
    const parentId = String(comment.parentId || '').trim();
    if (parentId && payloadMap.has(parentId)) {
      payloadMap.get(parentId).replies.push(payload);
      return;
    }
    roots.push(payload);
  });
  return {
    items: roots,
    count: countActiveScrollComments(comments)
  };
};

const buildSingleScrollCommentPayload = async (req: Request, comment: any, viewerId?: string | null) => {
  const authorIds = Array.from(new Set([String(comment?.authorId || '').trim()].filter(Boolean)));
  const [authors, reactionSummaryMap] = await Promise.all([
    authorIds.length
      ? prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true, username: true, avatar: true }
        })
      : Promise.resolve([]),
    loadScrollCommentReactionSummaryMap([String(comment.id)], viewerId)
  ]);
  const authorMap = new Map<string, any>((authors as any[]).map((author: any) => [String(author.id), author]));
  return buildScrollCommentPayload(req, comment, authorMap, reactionSummaryMap, viewerId);
};

const ensureScrollOwnership = (scroll: any, userId: string, isAdmin: boolean) => {
  if (!scroll) return { ok: false, status: 404, message: 'Scroll video not found' };
  if (scroll.authorId !== userId && !isAdmin) return { ok: false, status: 403, message: 'Forbidden' };
  return { ok: true, status: 200, message: 'ok' };
};

const mapTypeToCounterField = (type: string): string | null => {
  if (type === 'comment') return 'commentsCount';
  if (type === 'repost') return 'repostsCount';
  if (type === 'share') return 'sharesCount';
  if (type === 'send') return 'sendCount';
  if (type === 'view_3s') return 'views3s';
  if (type === 'view_10s') return 'views10s';
  if (type === 'view_25') return 'views25pct';
  if (type === 'view_50') return 'views50pct';
  if (type === 'view_95') return 'views95pct';
  return null;
};

export const createScroll = async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const config = await getOrCreateScrollConfig();
    if (config.enabled === false) {
      return res.status(403).json({ success: false, error: 'Scroll is disabled by admin.' });
    }
    const admin = isAdminRequest(req);
    if (!admin) {
      const activeRestriction = await getActiveScrollPostingRestriction(userId);
      if (activeRestriction?.id) {
        const endsAt = new Date(activeRestriction.endsAt);
        return res.status(403).json({
          success: false,
          error: `Your ability to publish Scroll posts is restricted until ${endsAt.toISOString()}.`,
          code: 'SCROLL_POSTING_RESTRICTED',
          data: {
            restriction: buildRestrictionPayload(activeRestriction)
          }
        });
      }
    }

    const fileId = String(req.body?.fileId || '').trim();
    if (!fileId) return res.status(400).json({ success: false, error: 'fileId is required.' });

    const media = await resolveScrollMedia(fileId, req);
    if (!media) return res.status(400).json({ success: false, error: 'Selected file was not found.' });
    if (!String(media.mimeType || '').startsWith('video/')) {
      return res.status(400).json({ success: false, error: 'Scroll only supports video uploads.' });
    }
    if (!admin && String(media.ownerId || '') !== userId) {
      return res.status(403).json({ success: false, error: 'You can only use your own uploaded files.' });
    }
    if (typeof media.duration === 'number' && media.duration > Number(config.maxDurationSeconds || 90)) {
      return res.status(400).json({
        success: false,
        error: `Video is too long. Max duration is ${Number(config.maxDurationSeconds || 90)} seconds.`
      });
    }

    const isAIEnhanced = Boolean(req.body?.isAIEnhanced);
    const graphicWarning = Boolean(req.body?.graphicWarning);
    if (config.aiLabelRequired && !isAIEnhanced) {
      return res.status(400).json({ success: false, error: 'AI label is required by admin settings.' });
    }

    const visibility = normalizeVisibility(req.body?.visibility, config.defaultVisibility || 'public');
    const filterPreset = normalizeFilterPreset(req.body?.filterPreset);
    const sourceScrollId = String(req.body?.sourceScrollId || '').trim() || null;
    const responseMode = sourceScrollId ? normalizeResponseMode(req.body?.responseMode) || 'remix' : null;
    const seriesIds = normalizeSeriesIds(req.body?.seriesIds);
    const filterStrength =
      req.body?.filterStrength === undefined || req.body?.filterStrength === null
        ? null
        : Number(req.body?.filterStrength);
    const tags = normalizeTagRows(req.body?.tags);
    const offerTags = await resolveSubmittedContentOfferTags(
      req.body?.offerTags ?? req.body?.offer_tags,
      {
        actorUserId: userId,
        actorRole: (req as any)?.user?.role,
        contentType: 'scroll'
      }
    );
    const videoIntegrity = await assessVideoIntegrityByFile(fileId, userId);

    const prismaAny = prisma as any;
    if (sourceScrollId) {
      const sourceScroll = await prismaAny.scrollVideo.findUnique({
        where: { id: sourceScrollId },
        select: scrollVideoListSelect
      });
      const sourceAccess = await canAccessScroll(sourceScroll, userId, admin);
      if (!sourceAccess.ok) {
        return res.status(sourceAccess.status).json({ success: false, error: sourceAccess.error || 'Source scroll not found.' });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const next = await (tx as any).scrollVideo.create({
        data: {
          authorId: userId,
          fileId,
          sourceScrollId,
          responseMode,
          title: String(req.body?.title || '').trim() || null,
          description: String(req.body?.description || '').trim() || null,
          offerTags: offerTags.length ? offerTags : null,
          location: String(req.body?.location || '').trim() || null,
          visibility,
          graphicWarning,
          isAIEnhanced,
          filterPreset,
          filterStrength: Number.isFinite(filterStrength as number) ? Number(filterStrength) : null,
          ...buildVideoIntegrityUpdate(videoIntegrity)
        }
      });

      if (tags.length > 0) {
        await (tx as any).scrollTag.createMany({
          data: tags.map((tag) => ({
            scrollId: next.id,
            taggedUserId: tag.taggedUserId,
            taggedPageId: tag.taggedPageId
          }))
        });
      }

      if (seriesIds.length) {
        await syncScrollSeriesMembership(tx as any, {
          scrollId: next.id,
          ownerUserId: userId,
          actorUserId: userId,
          seriesIds
        });
      }

      return next;
    });

    try {
      await addFileUsage({
        fileId,
        usageType: 'scroll_video',
        usageId: created.id,
        label: 'Scroll Video'
      });
    } catch {}

    const payload = await fetchScrollPayload(req, created, userId);
    emitScrollEvent(req, 'scroll:new', { scroll: payload });

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('createScroll error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to create scroll video.' });
  }
};

export const updateScroll = async (req: Request, res: Response) => {
  try {
    const scrollId = String(req.params.id || '').trim();
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const isAdmin = isAdminRequest(req);
    const prismaAny = prisma as any;
    const existing = await prismaAny.scrollVideo.findUnique({ where: { id: scrollId } });
    const ownership = ensureScrollOwnership(existing, userId, isAdmin);
    if (!ownership.ok) return res.status(ownership.status).json({ success: false, error: ownership.message });

    const config = await getOrCreateScrollConfig();
    const updateData: Record<string, any> = {};
    let nextSourceScrollId = String(existing?.sourceScrollId || '').trim() || null;
    let nextResponseMode = normalizeResponseMode(existing?.responseMode) || null;

    if (typeof req.body?.title !== 'undefined') {
      updateData.title = String(req.body?.title || '').trim() || null;
    }
    if (typeof req.body?.description !== 'undefined') {
      updateData.description = String(req.body?.description || '').trim() || null;
    }
    if (typeof req.body?.location !== 'undefined') {
      updateData.location = String(req.body?.location || '').trim() || null;
    }
    if (typeof req.body?.visibility !== 'undefined') {
      updateData.visibility = normalizeVisibility(req.body?.visibility, existing.visibility || config.defaultVisibility || 'public');
    }
    if (typeof req.body?.graphicWarning !== 'undefined') {
      updateData.graphicWarning = Boolean(req.body?.graphicWarning);
    }
    if (typeof req.body?.isAIEnhanced !== 'undefined') {
      updateData.isAIEnhanced = Boolean(req.body?.isAIEnhanced);
    }
    if (typeof req.body?.filterPreset !== 'undefined') {
      updateData.filterPreset = normalizeFilterPreset(req.body?.filterPreset);
    }
    if (typeof req.body?.filterStrength !== 'undefined') {
      const nextStrength = Number(req.body?.filterStrength);
      updateData.filterStrength = Number.isFinite(nextStrength) ? nextStrength : null;
    }
    if (typeof req.body?.offerTags !== 'undefined' || typeof req.body?.offer_tags !== 'undefined') {
      const offerTags = await resolveSubmittedContentOfferTags(
        req.body?.offerTags ?? req.body?.offer_tags,
        {
          actorUserId: userId,
          actorRole: (req as any)?.user?.role,
          contentType: 'scroll'
        }
      );
      updateData.offerTags = offerTags.length ? offerTags : null;
    }

    if (typeof req.body?.sourceScrollId !== 'undefined') {
      nextSourceScrollId = String(req.body?.sourceScrollId || '').trim() || null;
      if (nextSourceScrollId && nextSourceScrollId === scrollId) {
        return res.status(400).json({ success: false, error: 'A scroll cannot reference itself as a source.' });
      }
      if (nextSourceScrollId) {
        const sourceScroll = await prismaAny.scrollVideo.findUnique({
          where: { id: nextSourceScrollId },
          select: scrollVideoListSelect
        });
        const sourceAccess = await canAccessScroll(sourceScroll, userId, isAdmin);
        if (!sourceAccess.ok) {
          return res.status(sourceAccess.status).json({ success: false, error: sourceAccess.error || 'Source scroll not found.' });
        }
      }
      updateData.sourceScrollId = nextSourceScrollId;
      if (!nextSourceScrollId) {
        nextResponseMode = null;
        updateData.responseMode = null;
      }
    }

    if (typeof req.body?.responseMode !== 'undefined') {
      nextResponseMode = nextSourceScrollId ? normalizeResponseMode(req.body?.responseMode) || 'remix' : null;
      updateData.responseMode = nextResponseMode;
    } else if (typeof req.body?.sourceScrollId !== 'undefined' && nextSourceScrollId) {
      nextResponseMode = 'remix';
      updateData.responseMode = nextResponseMode;
    }

    if (typeof req.body?.fileId !== 'undefined') {
      const nextFileId = String(req.body?.fileId || '').trim();
      if (!nextFileId) {
        return res.status(400).json({ success: false, error: 'fileId cannot be empty.' });
      }
      const media = await resolveScrollMedia(nextFileId, req);
      if (!media) return res.status(400).json({ success: false, error: 'Selected file was not found.' });
      if (!String(media.mimeType || '').startsWith('video/')) {
        return res.status(400).json({ success: false, error: 'Scroll only supports video uploads.' });
      }
      if (!isAdmin && String(media.ownerId || '') !== userId) {
        return res.status(403).json({ success: false, error: 'You can only use your own uploaded files.' });
      }
      if (typeof media.duration === 'number' && media.duration > Number(config.maxDurationSeconds || 90)) {
        return res.status(400).json({
          success: false,
          error: `Video is too long. Max duration is ${Number(config.maxDurationSeconds || 90)} seconds.`
        });
      }
      updateData.fileId = nextFileId;
      Object.assign(updateData, buildVideoIntegrityUpdate(await assessVideoIntegrityByFile(nextFileId, userId)));
    }

    if (config.aiLabelRequired && updateData.isAIEnhanced === false) {
      return res.status(400).json({ success: false, error: 'AI label is required by admin settings.' });
    }

    const tags = Array.isArray(req.body?.tags) ? normalizeTagRows(req.body?.tags) : null;
    const seriesIds = Array.isArray(req.body?.seriesIds) ? normalizeSeriesIds(req.body?.seriesIds) : null;

    const updated = await prisma.$transaction(async (tx) => {
      const next = await (tx as any).scrollVideo.update({
        where: { id: scrollId },
        data: updateData
      });

      if (tags) {
        await (tx as any).scrollTag.deleteMany({ where: { scrollId } });
        if (tags.length > 0) {
          await (tx as any).scrollTag.createMany({
            data: tags.map((tag) => ({
              scrollId,
              taggedUserId: tag.taggedUserId,
              taggedPageId: tag.taggedPageId
            }))
          });
        }
      }

      if (seriesIds) {
        await syncScrollSeriesMembership(tx as any, {
          scrollId,
          ownerUserId: String(existing.authorId || '').trim(),
          actorUserId: userId,
          seriesIds
        });
      }

      return next;
    });

    if (updateData.fileId && updateData.fileId !== existing.fileId) {
      try {
        await removeUsage('scroll_video', scrollId);
      } catch {}
      try {
        await addFileUsage({
          fileId: updateData.fileId,
          usageType: 'scroll_video',
          usageId: scrollId,
          label: 'Scroll Video'
        });
      } catch {}
    }

    const payload = await fetchScrollPayload(req, updated, userId);
    emitScrollEvent(req, 'scroll:updated', { scroll: payload });
    return res.json({ success: true, data: payload });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('updateScroll error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to update scroll video.' });
  }
};

export const deleteScroll = async (req: Request, res: Response) => {
  try {
    const scrollId = String(req.params.id || '').trim();
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const isAdmin = isAdminRequest(req);
    const prismaAny = prisma as any;
    const existing = await prismaAny.scrollVideo.findUnique({ where: { id: scrollId } });
    const ownership = ensureScrollOwnership(existing, userId, isAdmin);
    if (!ownership.ok) return res.status(ownership.status).json({ success: false, error: ownership.message });

    await prismaAny.scrollVideo.delete({ where: { id: scrollId } });
    try {
      await removeUsage('scroll_video', scrollId);
    } catch {}

    emitScrollEvent(req, 'scroll:removed', { scrollId });
    return res.json({ success: true });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('deleteScroll error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to delete scroll video.' });
  }
};

export const getScrollFeed = async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '').trim() || null;
    const limit = Math.max(1, Math.min(60, toInt(req.query?.limit, 20)));
    const cursor = String(req.query?.cursor || '').trim();

    const config = await getOrCreateScrollConfig();
    if (config.enabled === false) {
      return res.json({ success: true, data: { items: [], nextCursor: null, config } });
    }

    const prismaAny = prisma as any;
    let cursorWhere: any = {};
    if (cursor) {
      const cursorRow = await prismaAny.scrollVideo.findUnique({
        where: { id: cursor },
        select: { id: true, createdAt: true }
      });
      if (cursorRow) {
        cursorWhere = {
          OR: [
            { createdAt: { lt: cursorRow.createdAt } },
            { createdAt: cursorRow.createdAt, id: { lt: cursorRow.id } }
          ]
        };
      }
    }

    const visibilityWhere = userId
      ? {
          OR: [{ visibility: { in: ['public', 'network', 'followers'] } }, { authorId: userId }]
        }
      : { visibility: { in: ['public'] } };
    const candidateTake = Math.min(Math.max(limit * 4, limit), 120);

    const rows = await prismaAny.scrollVideo.findMany({
      where: {
        status: 'active',
        ...visibilityWhere,
        ...cursorWhere
      },
      select: scrollVideoListSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: candidateTake + 1
    });

    const hasNext = rows.length > candidateTake;
    const slice = hasNext ? rows.slice(0, candidateTake) : rows;
    const hiddenRows =
      userId && slice.length
        ? await prismaAny.scrollHidden
            .findMany({
              where: { userId, scrollId: { in: slice.map((row: any) => String(row.id || '').trim()).filter(Boolean) } },
              select: { scrollId: true }
            })
            .catch((error: any) => {
              if (isScrollSchemaMissingError(error)) return [];
              throw error;
            })
        : [];
    const hiddenScrollIds = new Set((hiddenRows || []).map((row: any) => String(row?.scrollId || '').trim()));
    const visibleSlice = slice.filter((row: any) => !hiddenScrollIds.has(String(row?.id || '').trim()));
    const [baseItems, viewerProfile, feedContext] = await Promise.all([
      fetchScrollPayloadList(req, visibleSlice, userId),
      userId
        ? prisma.user.findUnique({
            where: { id: userId },
            select: {
              country: true,
              profile: {
                select: {
                  location: true
                }
              }
            }
          })
        : Promise.resolve(null),
      getViewerFeedContext(userId)
    ]);
    const viewerRegion = String(viewerProfile?.profile?.location || viewerProfile?.country || '').trim();
    const items = [...baseItems]
      .map((item: any) => {
        const seriesTitles = Array.isArray(item?.series) ? item.series.map((entry: any) => String(entry?.title || '').trim()) : [];
        const ranking = scoreScrollForMode({
          scroll: {
            id: item.id,
            title: item.title,
            description: item.description,
            location: item.location,
            seriesTitles,
            likesCount: item.metrics?.likes,
            commentsCount: item.metrics?.comments,
            repostsCount: item.metrics?.reposts,
            sharesCount: item.metrics?.shares,
            sendCount: item.metrics?.sends,
            views3s: item.metrics?.views3s,
            views10s: item.metrics?.views10s,
            views95pct: item.metrics?.views95pct,
            createdAt: item.createdAt
          },
          context: feedContext,
          viewerRegion
        });
        return {
          ...item,
          topicSummary: ranking.topicSummary,
          ranking: {
            mode: 'for_you',
            score: ranking.score,
            primaryReason: ranking.reasons[0] || 'Recommended from recent Scroll activity.',
            reasons: ranking.reasons
          }
        };
      })
      .sort((left: any, right: any) => {
        const scoreDelta = Number(right?.ranking?.score || 0) - Number(left?.ranking?.score || 0);
        if (scoreDelta !== 0) return scoreDelta;
        const rightCreatedAt = new Date(String(right?.createdAt || 0)).getTime();
        const leftCreatedAt = new Date(String(left?.createdAt || 0)).getTime();
        return rightCreatedAt - leftCreatedAt;
      })
      .slice(0, limit);

    return res.json({
      success: true,
      data: {
        items,
        nextCursor: hasNext ? String(slice[slice.length - 1]?.id || '') : null,
        config
      }
    });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('getScrollFeed error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load scroll feed.' });
  }
};

/**
 * Owner inventory — list active Scroll videos for the signed-in user.
 * GET /scroll/mine?limit=&cursor=
 */
export const getMyScrolls = async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const limit = Math.max(1, Math.min(100, toInt(req.query?.limit, 50)));
    const cursor = String(req.query?.cursor || '').trim();
    const prismaAny = prisma as any;

    let cursorWhere: any = {};
    if (cursor) {
      const cursorRow = await prismaAny.scrollVideo.findUnique({
        where: { id: cursor },
        select: { id: true, createdAt: true }
      });
      if (cursorRow) {
        cursorWhere = {
          OR: [
            { createdAt: { lt: cursorRow.createdAt } },
            { createdAt: cursorRow.createdAt, id: { lt: cursorRow.id } }
          ]
        };
      }
    }

    const rows = await prismaAny.scrollVideo.findMany({
      where: {
        authorId: userId,
        status: 'active',
        ...cursorWhere
      },
      select: scrollVideoListSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1
    });

    const hasNext = rows.length > limit;
    const slice = hasNext ? rows.slice(0, limit) : rows;
    const items = await fetchScrollPayloadList(req, slice, userId);
    const nextCursor = hasNext && slice.length ? String(slice[slice.length - 1]?.id || '') || null : null;

    return res.json({
      success: true,
      data: {
        items: Array.isArray(items) ? items : [],
        nextCursor
      }
    });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('getMyScrolls error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load your Scroll videos.' });
  }
};

/**
 * Phase 22.1B — resolve one Scroll video by id for deep links (recommendation cards).
 * GET /scroll/:id
 */
export const getScrollById = async (req: Request, res: Response) => {
  try {
    const scrollId = String(req.params.id || '').trim();
    const userId = String((req as any)?.user?.id || '').trim() || null;
    if (!scrollId) {
      return res.status(400).json({ success: false, error: 'Scroll id required', code: 'SCROLL_ID_REQUIRED' });
    }
    const prismaAny = prisma as any;
    const row = await prismaAny.scrollVideo.findUnique({
      where: { id: scrollId },
      select: scrollVideoListSelect
    });
    if (!row) {
      return res.status(404).json({
        success: false,
        error: 'This video is no longer available.',
        code: 'SCROLL_NOT_FOUND'
      });
    }
    const privileged = isPrivilegedUser((req as any)?.user);
    const access = await canAccessScroll(row, userId, privileged);
    if (!access.ok) {
      return res.status(access.status).json({
        success: false,
        error: access.error || 'This video is no longer available.',
        code: access.status === 403 ? 'SCROLL_FORBIDDEN' : 'SCROLL_UNAVAILABLE'
      });
    }
    const payload = await fetchScrollPayload(req, row, userId);
    if (!payload) {
      return res.status(404).json({
        success: false,
        error: 'This video is no longer available.',
        code: 'SCROLL_NOT_FOUND'
      });
    }
    return res.json({ success: true, data: payload });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('getScrollById error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load Scroll video.' });
  }
};

export const markScrollInterested = async (req: Request, res: Response) => {
  try {
    const scrollId = String(req.params.id || '').trim();
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const prismaAny = prisma as any;
    const scroll = await prismaAny.scrollVideo.findUnique({
      where: { id: scrollId },
      select: {
        id: true,
        authorId: true,
        title: true,
        description: true,
        location: true,
        visibility: true,
        responseMode: true,
        status: true
      }
    });
    const access = await canAccessScroll(scroll, userId, isPrivilegedUser((req as any)?.user));
    if (!access.ok) {
      return res.status(access.status).json({ success: false, error: access.error });
    }

    const seriesRows = await prismaAny.scrollSeriesItem.findMany({
      where: { scrollId },
      select: {
        series: {
          select: {
            title: true
          }
        }
      }
    });
    const seriesTitles = uniqueStrings(seriesRows.map((row: any) => row?.series?.title));
    const row = await prismaAny.scrollFeedback.upsert({
      where: { scrollId_userId: { scrollId, userId } },
      update: { signal: 'INTERESTED' },
      create: { scrollId, userId, signal: 'INTERESTED' }
    });

    await recordFeedIntentSignal({
      userId,
      entityType: 'SCROLL',
      entityId: scrollId,
      signal: 'INTERESTED',
      surface: String(req.body?.surface || 'scroll_interest_survey').trim() || 'scroll_interest_survey',
      weight: 1.25,
      meta: buildScrollIntentMeta(scroll, seriesTitles)
    }).catch(() => null);

    return res.json({
      success: true,
      message: 'Sounds good! Expect more Scrolls like this coming your way.',
      data: { signal: row.signal }
    });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('markScrollInterested error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to record Scroll feedback.' });
  }
};

export const markScrollNotInterested = async (req: Request, res: Response) => {
  try {
    const scrollId = String(req.params.id || '').trim();
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const prismaAny = prisma as any;
    const scroll = await prismaAny.scrollVideo.findUnique({
      where: { id: scrollId },
      select: {
        id: true,
        authorId: true,
        title: true,
        description: true,
        location: true,
        visibility: true,
        responseMode: true,
        status: true
      }
    });
    const access = await canAccessScroll(scroll, userId, isPrivilegedUser((req as any)?.user));
    if (!access.ok) {
      return res.status(access.status).json({ success: false, error: access.error });
    }

    const seriesRows = await prismaAny.scrollSeriesItem.findMany({
      where: { scrollId },
      select: {
        series: {
          select: {
            title: true
          }
        }
      }
    });
    const seriesTitles = uniqueStrings(seriesRows.map((row: any) => row?.series?.title));
    const row = await prismaAny.scrollFeedback.upsert({
      where: { scrollId_userId: { scrollId, userId } },
      update: { signal: 'NOT_INTERESTED' },
      create: { scrollId, userId, signal: 'NOT_INTERESTED' }
    });
    await prismaAny.scrollHidden.upsert({
      where: { scrollId_userId: { scrollId, userId } },
      update: {},
      create: { scrollId, userId }
    });

    await recordFeedIntentSignal({
      userId,
      entityType: 'SCROLL',
      entityId: scrollId,
      signal: 'NOT_INTERESTED',
      surface: String(req.body?.surface || 'scroll_interest_survey').trim() || 'scroll_interest_survey',
      weight: 1.5,
      meta: buildScrollIntentMeta(scroll, seriesTitles)
    }).catch(() => null);

    return res.json({
      success: true,
      message: "Sounds good! We'll show you fewer Scrolls like this for now.",
      data: { signal: row.signal, hidden: true }
    });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('markScrollNotInterested error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to record Scroll feedback.' });
  }
};

export const engageScroll = async (req: Request, res: Response) => {
  try {
    const scrollId = String(req.params.id || '').trim();
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const type = String(req.body?.type || '').trim().toLowerCase();
    if (!SCROLL_ENGAGEMENT_TYPES.has(type)) {
      return res.status(400).json({ success: false, error: 'Unsupported engagement type.' });
    }

    const prismaAny = prisma as any;
    const scroll = await prismaAny.scrollVideo.findUnique({ where: { id: scrollId } });
    if (!scroll || scroll.status !== 'active') {
      return res.status(404).json({ success: false, error: 'Scroll video not found.' });
    }

    const config = await getOrCreateScrollConfig();
    let created = false;
    let liked = false;
    const isLearning = SCROLL_LEARNING_TYPES.has(type);
    const watchedSeconds = Number(req.body?.watchedSeconds ?? req.body?.watchSeconds ?? 0);

    if (type === 'like') {
      const existingLike = await prismaAny.scrollEngagement.findFirst({
        where: { scrollId, userId, type: 'like' }
      });
      if (existingLike) {
        await prismaAny.scrollEngagement.delete({ where: { id: existingLike.id } });
        await prismaAny.scrollVideo.update({
          where: { id: scrollId },
          data: { likesCount: { decrement: 1 } }
        });
        created = false;
        liked = false;
      } else {
        await prismaAny.scrollEngagement.create({ data: { scrollId, userId, type: 'like' } });
        await prismaAny.scrollVideo.update({
          where: { id: scrollId },
          data: { likesCount: { increment: 1 } }
        });
        created = true;
        liked = true;
      }
    } else {
      if (type === 'impression') {
        const threshold = Number(config.impressionThresholdSeconds || 2);
        if (!Number.isFinite(watchedSeconds) || watchedSeconds < threshold) {
          return res.json({
            success: true,
            data: {
              applied: false,
              reason: 'threshold_not_met',
              thresholdSeconds: threshold
            }
          });
        }
      }
      try {
        await prismaAny.scrollEngagement.create({ data: { scrollId, userId, type } });
        created = true;
      } catch (error: any) {
        const code = String(error?.code || '').toUpperCase();
        if (code !== 'P2002') throw error;
        created = false;
      }

      // Public counters only for non-learning engagement types
      if (created && !isLearning) {
        if (type === 'impression') {
          await prismaAny.scrollVideo.update({
            where: { id: scrollId },
            data: { impressions: { increment: 1 }, lastImpressionIncrementAt: new Date() }
          });
        } else {
          const field = mapTypeToCounterField(type);
          if (field) {
            await prismaAny.scrollVideo.update({
              where: { id: scrollId },
              data: { [field]: { increment: 1 } }
            });
          }
        }
      }
    }

    // Phase 23 — feed intent learning for Scroll recommendations (not community feed identity)
    if (created || type === 'like') {
      try {
        if (type === 'view_95' || type === 'learn_complete' || type === 'learn_replay') {
          await recordFeedIntentSignal({
            userId,
            entityId: scrollId,
            entityType: 'SCROLL',
            signal: type === 'learn_replay' ? 'REPLAY' : 'COMPLETE',
            surface: 'scroll',
            weight: type === 'learn_replay' ? 1.4 : 1.8,
            meta: {
              engagementType: type,
              watchedSeconds: Number.isFinite(watchedSeconds) ? watchedSeconds : null,
              topics: extractInterestKeywords(scroll?.title, scroll?.description, scroll?.location)
            }
          });
        } else if (type === 'like' && liked) {
          await recordFeedIntentSignal({
            userId,
            entityId: scrollId,
            entityType: 'SCROLL',
            signal: 'LIKE',
            surface: 'scroll',
            weight: 1.5,
            meta: { engagementType: type }
          });
        } else if (type === 'share' || type === 'send' || type === 'repost') {
          await recordFeedIntentSignal({
            userId,
            entityId: scrollId,
            entityType: 'SCROLL',
            signal: type.toUpperCase(),
            surface: 'scroll',
            weight: 1.3,
            meta: { engagementType: type }
          });
        } else if (isLearning && (type === 'learn_watch' || type === 'learn_seek')) {
          await recordFeedIntentSignal({
            userId,
            entityId: scrollId,
            entityType: 'SCROLL',
            signal: 'WATCH',
            surface: 'scroll',
            weight: type === 'learn_watch' ? 0.6 : 0.35,
            meta: {
              engagementType: type,
              watchedSeconds: Number.isFinite(watchedSeconds) ? watchedSeconds : null
            }
          });
        }
      } catch {
        /* intent table optional / non-blocking */
      }
    }

    const updated = await prismaAny.scrollVideo.findUnique({ where: { id: scrollId } });
    const payload = {
      scrollId,
      type,
      userId,
      created,
      liked,
      learning: isLearning,
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

    // Learning events: self-only quiet ack (avoid peer metric spam)
    if (!isLearning) {
      const eventName = type === 'impression' ? 'scroll:impression_update' : 'scroll:engagement_update';
      emitScrollEvent(req, eventName, payload);
    }
    return res.json({ success: true, data: payload });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('engageScroll error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to update engagement.' });
  }
};

const getScrollSeriesAccess = (
  series: { id: string; creatorUserId: string; visibility?: string | null; status?: string | null } | null,
  viewerId?: string | null,
  privileged = false
) => {
  if (!series) {
    return { ok: false, status: 404, error: 'Scroll series not found.' };
  }
  const canEdit = Boolean(viewerId) && String(series.creatorUserId || '').trim() === String(viewerId || '').trim();
  const status = String(series.status || '').trim().toLowerCase();
  if (status === 'archived' && !canEdit && !privileged) {
    return { ok: false, status: 404, error: 'Scroll series not found.' };
  }
  const visibility = normalizeVisibility(series.visibility, 'public');
  if (visibility === 'private' && !canEdit && !privileged) {
    return { ok: false, status: 403, error: 'You are not allowed to access this series.' };
  }
  return { ok: true, status: 200, error: '', canEdit: canEdit || privileged };
};

const buildScrollSeriesPayload = async (
  req: Request,
  series: any,
  viewerId?: string | null,
  options?: { includeItems?: boolean }
) => {
  if (!series?.id) return null;
  const prismaAny = prisma as any;
  const creator = await prisma.user.findUnique({
    where: { id: String(series.creatorUserId) },
    select: {
      id: true,
      name: true,
      avatar: true,
      username: true,
      isVerified: true
    }
  });
  const itemRows = await prismaAny.scrollSeriesItem.findMany({
    where: {
      seriesId: series.id,
      scroll: {
        status: 'active'
      }
    },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: options?.includeItems
      ? {
          id: true,
          position: true,
          createdAt: true,
          scroll: {
            select: scrollVideoListSelect
          }
        }
      : {
          id: true,
          position: true,
          createdAt: true,
          scrollId: true
        }
  });
  const canEdit =
    Boolean(viewerId) && String(series.creatorUserId || '').trim() === String(viewerId || '').trim();

  let items: any[] = [];
  if (options?.includeItems) {
    const scrollRows = itemRows
      .map((row: any) => row?.scroll)
      .filter((row: any) => row?.id);
    const payloads = await fetchScrollPayloadList(req, scrollRows, viewerId);
    const payloadMap = new Map<string, any>(payloads.map((row: any) => [String(row.id), row]));
    items = itemRows
      .map((row: any) => ({
        id: row.id,
        position: Number(row.position || 0),
        createdAt: row.createdAt,
        scroll: payloadMap.get(String(row?.scroll?.id || '')) || null
      }))
      .filter((row: any) => row.scroll);
  }

  return {
    id: series.id,
    creatorUserId: series.creatorUserId,
    title: series.title,
    description: series.description || null,
    visibility: normalizeVisibility(series.visibility, 'public'),
    status: normalizeSeriesStatus(series.status, 'active'),
    itemCount: Number(itemRows.length || 0),
    canEdit,
    creator: {
      id: creator?.id || series.creatorUserId,
      name: creator?.name || 'Community member',
      avatar: resolveDirectMediaUrl(creator?.avatar, getBaseFileUrl(req)) || creator?.avatar || null,
      username: creator?.username || null,
      isVerified: Boolean(creator?.isVerified)
    },
    createdAt: series.createdAt,
    updatedAt: series.updatedAt,
    ...(options?.includeItems ? { items } : {})
  };
};

export const getDiscoverableScrollSeries = async (req: Request, res: Response) => {
  try {
    const viewerId = String((req as any)?.user?.id || '').trim() || null;
    const limit = Math.max(1, Math.min(12, toInt(req.query?.limit, 4)));
    const prismaAny = prisma as any;
    const rows = await prismaAny.scrollSeries.findMany({
      where: {
        status: 'active',
        visibility: 'public',
        items: {
          some: {
            scroll: {
              status: 'active'
            }
          }
        }
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit
    });
    const payloads = await Promise.all(
      rows.map((row: any) => buildScrollSeriesPayload(req, row, viewerId, { includeItems: true }))
    );
    const data = payloads
      .filter(Boolean)
      .map((row: any) => ({
        ...row,
        featuredScroll: row?.items?.[0]?.scroll || null,
        previewItems: Array.isArray(row?.items) ? row.items.slice(0, 3).map((entry: any) => entry.scroll).filter(Boolean) : []
      }));
    return res.json({ success: true, data });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('getDiscoverableScrollSeries error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load scroll series.' });
  }
};

export const getMyScrollSeries = async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const prismaAny = prisma as any;
    const rows = await prismaAny.scrollSeries.findMany({
      where: {
        creatorUserId: userId,
        status: { not: 'archived' }
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
    });
    const payloads = await Promise.all(rows.map((row: any) => buildScrollSeriesPayload(req, row, userId)));
    return res.json({ success: true, data: payloads.filter(Boolean) });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('getMyScrollSeries error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load scroll series.' });
  }
};

export const getScrollSeriesDetail = async (req: Request, res: Response) => {
  try {
    const seriesId = String(req.params.id || '').trim();
    const viewerId = String((req as any)?.user?.id || '').trim() || null;
    if (!seriesId) return res.status(400).json({ success: false, error: 'Series id is required.' });

    const prismaAny = prisma as any;
    const series = await prismaAny.scrollSeries.findUnique({ where: { id: seriesId } });
    const access = getScrollSeriesAccess(series, viewerId, isAdminRequest(req));
    if (!access.ok) return res.status(access.status).json({ success: false, error: access.error });

    const payload = await buildScrollSeriesPayload(req, series, viewerId, { includeItems: true });
    return res.json({ success: true, data: payload });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('getScrollSeriesDetail error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load scroll series.' });
  }
};

export const createScrollSeries = async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const title = sanitizeSeriesTitle(req.body?.title);
    if (!title) {
      return res.status(400).json({ success: false, error: 'Series title is required.' });
    }

    const prismaAny = prisma as any;
    const created = await prismaAny.scrollSeries.create({
      data: {
        creatorUserId: userId,
        title,
        description: sanitizeSeriesDescription(req.body?.description),
        visibility: normalizeVisibility(req.body?.visibility, 'public'),
        status: 'active'
      }
    });
    const payload = await buildScrollSeriesPayload(req, created, userId, { includeItems: true });
    return res.json({ success: true, data: payload });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('createScrollSeries error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to create scroll series.' });
  }
};

export const updateScrollSeries = async (req: Request, res: Response) => {
  try {
    const seriesId = String(req.params.id || '').trim();
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!seriesId) return res.status(400).json({ success: false, error: 'Series id is required.' });

    const prismaAny = prisma as any;
    const existing = await prismaAny.scrollSeries.findUnique({ where: { id: seriesId } });
    const access = getScrollSeriesAccess(existing, userId, isAdminRequest(req));
    if (!access.ok) return res.status(access.status).json({ success: false, error: access.error });
    if (!access.canEdit) return res.status(403).json({ success: false, error: 'Forbidden' });

    const updateData: Record<string, any> = {};
    if (typeof req.body?.title !== 'undefined') {
      const title = sanitizeSeriesTitle(req.body?.title);
      if (!title) {
        return res.status(400).json({ success: false, error: 'Series title cannot be empty.' });
      }
      updateData.title = title;
    }
    if (typeof req.body?.description !== 'undefined') {
      updateData.description = sanitizeSeriesDescription(req.body?.description);
    }
    if (typeof req.body?.visibility !== 'undefined') {
      updateData.visibility = normalizeVisibility(req.body?.visibility, existing.visibility || 'public');
    }
    if (typeof req.body?.status !== 'undefined') {
      updateData.status = normalizeSeriesStatus(req.body?.status, existing.status || 'active');
    }

    const updated = await prismaAny.scrollSeries.update({
      where: { id: seriesId },
      data: updateData
    });
    const payload = await buildScrollSeriesPayload(req, updated, userId, { includeItems: true });
    return res.json({ success: true, data: payload });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('updateScrollSeries error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to update scroll series.' });
  }
};

export const deleteScrollSeries = async (req: Request, res: Response) => {
  try {
    const seriesId = String(req.params.id || '').trim();
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!seriesId) return res.status(400).json({ success: false, error: 'Series id is required.' });

    const prismaAny = prisma as any;
    const existing = await prismaAny.scrollSeries.findUnique({ where: { id: seriesId } });
    const access = getScrollSeriesAccess(existing, userId, isAdminRequest(req));
    if (!access.ok) return res.status(access.status).json({ success: false, error: access.error });
    if (!access.canEdit) return res.status(403).json({ success: false, error: 'Forbidden' });

    await prismaAny.scrollSeries.delete({ where: { id: seriesId } });
    return res.json({ success: true });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('deleteScrollSeries error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to delete scroll series.' });
  }
};

export const getScrollComments = async (req: Request, res: Response) => {
  try {
    const scrollId = String(req.params.id || '').trim();
    const viewerId = String((req as any)?.user?.id || '').trim() || null;
    const privileged = isPrivilegedUser((req as any)?.user);
    const prismaAny = prisma as any;

    const scroll = await prismaAny.scrollVideo.findUnique({
      where: { id: scrollId },
      select: { id: true, authorId: true, visibility: true, status: true }
    });
    const access = await canAccessScroll(scroll, viewerId, privileged);
    if (!access.ok) return res.status(access.status).json({ success: false, error: access.error });

    const bundle = await loadScrollCommentsBundle(req, scrollId, viewerId);
    return res.json({ success: true, data: bundle });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll comment tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('getScrollComments error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load scroll comments.' });
  }
};

export const createScrollComment = async (req: Request, res: Response) => {
  try {
    const scrollId = String(req.params.id || '').trim();
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const content = String(req.body?.content || '').trim();
    const parentId = String(req.body?.parentId || '').trim() || null;
    if (!content) {
      return res.status(400).json({ success: false, error: 'Content required.' });
    }

    const privileged = isPrivilegedUser((req as any)?.user);
    const prismaAny = prisma as any;
    const scroll = await prismaAny.scrollVideo.findUnique({
      where: { id: scrollId },
      select: { id: true, authorId: true, visibility: true, status: true }
    });
    const access = await canAccessScroll(scroll, userId, privileged);
    if (!access.ok) return res.status(access.status).json({ success: false, error: access.error });

    let parentComment: any = null;
    if (parentId) {
      parentComment = await prismaAny.scrollComment.findUnique({
        where: { id: parentId },
        select: { id: true, scrollId: true, authorId: true, status: true }
      });
      if (!parentComment || String(parentComment.scrollId) !== scrollId) {
        return res.status(404).json({ success: false, error: 'Reply target not found.' });
      }
      if (String(parentComment.status || '').toLowerCase() === 'deleted') {
        return res.status(400).json({ success: false, error: 'Cannot reply to a deleted comment.' });
      }
      if (await hasUserBlockRelation(userId, parentComment.authorId)) {
        return res.status(403).json({ success: false, error: 'Interaction is not allowed for this comment.' });
      }
    }

    const [created, updatedScroll] = await prisma.$transaction([
      prismaAny.scrollComment.create({
        data: {
          scrollId,
          parentId,
          authorId: userId,
          content
        },
        select: scrollCommentListSelect
      }),
      prismaAny.scrollVideo.update({
        where: { id: scrollId },
        data: { commentsCount: { increment: 1 } },
        select: { commentsCount: true }
      })
    ]);

    const payload = await buildSingleScrollCommentPayload(req, created, userId);
    const metrics = { comments: Number(updatedScroll?.commentsCount || 0) };
    emitScrollEvent(req, 'scroll:comment_created', { scrollId, comment: payload, metrics });
    emitScrollEvent(req, 'scroll:engagement_update', { scrollId, type: 'comment', metrics });

    return res.json({ success: true, data: { comment: payload, metrics } });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll comment tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('createScrollComment error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to create scroll comment.' });
  }
};

export const updateScrollComment = async (req: Request, res: Response) => {
  try {
    const commentId = String(req.params.id || '').trim();
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const content = String(req.body?.content || '').trim();
    if (!content) {
      return res.status(400).json({ success: false, error: 'Content required.' });
    }

    const prismaAny = prisma as any;
    const existing = await prismaAny.scrollComment.findUnique({
      where: { id: commentId },
      select: scrollCommentListSelect
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Comment not found.' });
    if (String(existing.status || '').toLowerCase() === 'deleted') {
      return res.status(400).json({ success: false, error: 'Cannot edit a deleted comment.' });
    }
    if (String(existing.authorId) !== userId && !isPrivilegedUser((req as any)?.user)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const updated = await prismaAny.scrollComment.update({
      where: { id: commentId },
      data: { content },
      select: scrollCommentListSelect
    });
    const payload = await buildSingleScrollCommentPayload(req, updated, userId);
    emitScrollEvent(req, 'scroll:comment_updated', { scrollId: updated.scrollId, comment: payload });

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll comment tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('updateScrollComment error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to update scroll comment.' });
  }
};

export const deleteScrollComment = async (req: Request, res: Response) => {
  try {
    const commentId = String(req.params.id || '').trim();
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const prismaAny = prisma as any;
    const existing = await prismaAny.scrollComment.findUnique({
      where: { id: commentId },
      select: scrollCommentListSelect
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Comment not found.' });
    if (String(existing.authorId) !== userId && !isPrivilegedUser((req as any)?.user)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    if (String(existing.status || '').toLowerCase() === 'deleted') {
      return res.json({ success: true });
    }

    const [, updatedScroll] = await prisma.$transaction([
      prismaAny.scrollComment.update({
        where: { id: commentId },
        data: {
          status: 'deleted',
          deletedAt: new Date(),
          content: ''
        }
      }),
      prismaAny.scrollVideo.update({
        where: { id: existing.scrollId },
        data: { commentsCount: { decrement: 1 } },
        select: { commentsCount: true }
      })
    ]);

    const metrics = { comments: Math.max(0, Number(updatedScroll?.commentsCount || 0)) };
    emitScrollEvent(req, 'scroll:comment_deleted', {
      scrollId: existing.scrollId,
      commentId: existing.id,
      parentId: existing.parentId || null,
      metrics
    });
    emitScrollEvent(req, 'scroll:engagement_update', {
      scrollId: existing.scrollId,
      type: 'comment',
      metrics
    });

    return res.json({ success: true });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll comment tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('deleteScrollComment error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to delete scroll comment.' });
  }
};

export const reportScroll = async (req: Request, res: Response) => {
  try {
    const scrollId = String(req.params.id || '').trim();
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, error: 'Reason is required.' });

    const prismaAny = prisma as any;
    const existing = await prismaAny.scrollVideo.findUnique({ where: { id: scrollId } });
    if (!existing) return res.status(404).json({ success: false, error: 'Scroll video not found.' });

    const report = await prismaAny.scrollReport.create({
      data: {
        scrollId,
        reportedById: userId,
        reason,
        status: 'pending'
      }
    });

    const config = await getOrCreateScrollConfig();
    if (config.autoModeration) {
      await prismaAny.scrollVideo.update({
        where: { id: scrollId },
        data: { status: 'flagged' }
      });
      emitScrollEvent(req, 'scroll:removed', { scrollId, reason: 'auto_moderation' });
    }

    try {
      realtime.emitToRoom('community:admin', 'scroll:engagement_update', {
        scrollId,
        type: 'report',
        reportId: report.id,
        status: report.status
      });
    } catch {}

    return res.json({ success: true, data: report });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('reportScroll error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to report scroll video.' });
  }
};

export const getScrollAdminConfig = async (_req: Request, res: Response) => {
  try {
    const config = await getOrCreateScrollConfig();
    return res.json({
      success: true,
      data: config,
      ...(config?._schemaMissing
        ? {
            message: 'Scroll module tables are not ready. Run the latest backend migration.'
          }
        : {})
    });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load scroll config.' });
  }
};

export const updateScrollAdminConfig = async (req: Request, res: Response) => {
  try {
    const actorId = String((req as any)?.user?.id || '').trim() || null;
    const config = await updateScrollConfig(req.body || {}, actorId);
    return res.json({ success: true, data: config, message: 'Scroll config saved.' });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    return res.status(500).json({ success: false, error: error?.message || 'Failed to save scroll config.' });
  }
};

export const getScrollAdminVideos = async (req: Request, res: Response) => {
  try {
    const prismaAny = prisma as any;
    const limit = Math.max(1, Math.min(100, toInt(req.query?.limit, 50)));
    const statusFilter = String(req.query?.status || '').trim().toLowerCase();
    const where: any = {};
    if (statusFilter) where.status = statusFilter;

    const rows = await prismaAny.scrollVideo.findMany({
      where,
      select: scrollVideoListSelect,
      orderBy: [{ createdAt: 'desc' }],
      take: limit
    });
    const payload = await fetchScrollPayloadList(req, rows, null, { includeAdminFields: true });
    return res.json({ success: true, data: payload });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load videos.' });
  }
};

export const removeScrollAdmin = async (req: Request, res: Response) => {
  try {
    const scrollId = String(req.params.id || '').trim();
    const reason = String(req.body?.reason || '').trim() || 'Removed by admin';
    const actorId = String((req as any)?.user?.id || '').trim() || null;

    const prismaAny = prisma as any;
    const existing = await prismaAny.scrollVideo.findUnique({ where: { id: scrollId } });
    if (!existing) return res.status(404).json({ success: false, error: 'Scroll video not found.' });

    const updated = await prismaAny.scrollVideo.update({
      where: { id: scrollId },
      data: { status: 'removed' }
    });

    try {
      await prismaAny.scrollReport.create({
        data: {
          scrollId,
          reportedById: actorId || existing.authorId,
          reason,
          status: 'resolved',
          reviewedAt: new Date(),
          reviewedById: actorId,
          reviewNote: reason
        }
      });
    } catch {}

    emitScrollEvent(req, 'scroll:removed', { scrollId, reason });
    return res.json({ success: true, data: updated });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    return res.status(500).json({ success: false, error: error?.message || 'Failed to remove video.' });
  }
};

export const getScrollAdminReports = async (req: Request, res: Response) => {
  try {
    const prismaAny = prisma as any;
    const status = String(req.query?.status || '').trim().toLowerCase();
    const where: any = {};
    if (status) where.status = status;

    const rows = await prismaAny.scrollReport.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: Math.max(1, Math.min(200, toInt(req.query?.limit, 100)))
    });

    const scrollIds = Array.from(new Set(rows.map((row: any) => String(row.scrollId || '')).filter(Boolean)));
    const reporterIds = Array.from(new Set(rows.map((row: any) => String(row.reportedById || '')).filter(Boolean)));
    const videos = scrollIds.length
      ? await prismaAny.scrollVideo.findMany({
          where: { id: { in: scrollIds } },
          select: scrollVideoListSelect
        })
      : [];
    const payloadVideos = await fetchScrollPayloadList(req, videos, null, { includeAdminFields: true });
    const map = new Map((payloadVideos || []).map((video: any) => [video.id, video]));
    const reporters = reporterIds.length
      ? await prisma.user.findMany({
          where: { id: { in: reporterIds } },
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
            avatar: true,
            role: true
          }
        })
      : [];
    const reporterMap = new Map((reporters || []).map((reporter: any) => [reporter.id, reporter]));

    return res.json({
      success: true,
      data: rows.map((row: any) => ({
        ...row,
        scroll: map.get(row.scrollId) || null,
        reporter: reporterMap.get(row.reportedById) || null
      }))
    });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load reports.' });
  }
};

export const reviewScrollReportAdmin = async (req: Request, res: Response) => {
  try {
    const reportId = String(req.params.id || '').trim();
    const actorId = String((req as any)?.user?.id || '').trim() || null;
    const action = String(req.body?.action || req.body?.status || '').trim().toLowerCase();
    const note = String(req.body?.note || req.body?.reviewNote || '').trim();
    if (!reportId) {
      return res.status(400).json({ success: false, error: 'Report id is required.' });
    }
    if (!['resolve', 'resolved', 'dismiss', 'dismissed', 'remove'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Unsupported review action.' });
    }

    const prismaAny = prisma as any;
    const existing = await prismaAny.scrollReport.findUnique({ where: { id: reportId } });
    if (!existing?.id) {
      return res.status(404).json({ success: false, error: 'Report not found.' });
    }

    const nextStatus = action === 'dismiss' || action === 'dismissed' ? 'dismissed' : 'resolved';
    const reviewedAt = new Date();
    const updatedReport = await prismaAny.scrollReport.update({
      where: { id: reportId },
      data: {
        status: nextStatus,
        reviewedAt,
        reviewedById: actorId,
        reviewNote: note || (action === 'remove' ? 'Video removed by admin after report review.' : null)
      }
    });

    let scrollPayload: any = null;
    if (action === 'remove') {
      const updatedScroll = await prismaAny.scrollVideo.update({
        where: { id: existing.scrollId },
        data: { status: 'removed' },
        select: scrollVideoListSelect
      });
      scrollPayload = await fetchScrollPayload(req, updatedScroll, null, { includeAdminFields: true });
      emitScrollEvent(req, 'scroll:removed', {
        scrollId: existing.scrollId,
        reason: note || 'Removed after report review.'
      });
      try {
        await prisma.accountViolation.create({
          data: {
            userId: updatedScroll.authorId,
            type: 'scroll_removed',
            severity: 'moderate',
            reason: note || 'Scroll removed after admin review.',
            metadata: {
              scrollId: updatedScroll.id,
              reportId,
              reviewedById: actorId
            }
          }
        });
      } catch {}
      await createRuntimeNotification({
        userId: updatedScroll.authorId,
        actorId,
        type: 'scroll_removed',
        title: 'Scroll removed',
        body: note || 'One of your Scroll videos was removed after admin review.',
        actionUrl: '/support',
        meta: {
          scrollId: updatedScroll.id,
          reportId
        }
      });
    } else {
      const currentScroll = await prismaAny.scrollVideo.findUnique({
        where: { id: existing.scrollId },
        select: scrollVideoListSelect
      });
      if (currentScroll?.id) {
        scrollPayload = await fetchScrollPayload(req, currentScroll, null, { includeAdminFields: true });
      }
    }

    return res.json({
      success: true,
      data: {
        ...updatedReport,
        scroll: scrollPayload
      }
    });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    return res.status(500).json({ success: false, error: error?.message || 'Failed to review report.' });
  }
};

export const sendScrollOwnerMessageAdmin = async (req: Request, res: Response) => {
  try {
    const scrollId = String(req.params.id || '').trim();
    const actorId = String((req as any)?.user?.id || '').trim();
    const text = String(req.body?.message || req.body?.text || '').trim();
    if (!actorId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!scrollId || !text) {
      return res.status(400).json({ success: false, error: 'Scroll id and message are required.' });
    }

    const prismaAny = prisma as any;
    const scroll = await prismaAny.scrollVideo.findUnique({
      where: { id: scrollId },
      select: { id: true, title: true, authorId: true }
    });
    if (!scroll?.id) {
      return res.status(404).json({ success: false, error: 'Scroll video not found.' });
    }

    const delivery = await createAdminConversationMessage(req, {
      senderId: actorId,
      targetUserId: scroll.authorId,
      scrollId,
      text,
      kind: 'message'
    });

    return res.json({
      success: true,
      data: {
        scrollId,
        ...delivery
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to send admin message.' });
  }
};

export const sendScrollOwnerWarningAdmin = async (req: Request, res: Response) => {
  try {
    const scrollId = String(req.params.id || '').trim();
    const actorId = String((req as any)?.user?.id || '').trim();
    const text = String(req.body?.message || req.body?.text || req.body?.reason || '').trim();
    if (!actorId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!scrollId || !text) {
      return res.status(400).json({ success: false, error: 'Scroll id and warning message are required.' });
    }

    const prismaAny = prisma as any;
    const scroll = await prismaAny.scrollVideo.findUnique({
      where: { id: scrollId },
      select: { id: true, title: true, authorId: true }
    });
    if (!scroll?.id) {
      return res.status(404).json({ success: false, error: 'Scroll video not found.' });
    }

    const warningText = `Scrolith admin warning about your Scroll${scroll.title ? ` "${scroll.title}"` : ''}: ${text}`;
    const delivery = await createAdminConversationMessage(req, {
      senderId: actorId,
      targetUserId: scroll.authorId,
      scrollId,
      text: warningText,
      kind: 'warning'
    });

    try {
      await prisma.accountViolation.create({
        data: {
          userId: scroll.authorId,
          type: 'scroll_warning',
          severity: 'warning',
          reason: text,
          metadata: {
            scrollId,
            conversationId: delivery.conversationId,
            messageId: delivery.messageId,
            warnedById: actorId
          }
        }
      });
    } catch {}

    await createRuntimeNotification({
      userId: scroll.authorId,
      actorId,
      type: 'scroll_warning',
      title: 'Scroll warning',
      body: text,
      actionUrl: `/messages/${encodeURIComponent(delivery.conversationId)}`,
      meta: {
        scrollId,
        conversationId: delivery.conversationId,
        messageId: delivery.messageId
      }
    });

    return res.json({
      success: true,
      data: {
        scrollId,
        ...delivery
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to send warning.' });
  }
};

export const restrictScrollOwnerAdmin = async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId || '').trim();
    const actorId = String((req as any)?.user?.id || '').trim();
    const reason = String(req.body?.reason || '').trim();
    const note = String(req.body?.note || '').trim() || null;
    const durationHours = Math.max(1, Math.min(24 * 365, toInt(req.body?.durationHours, 72)));
    if (!actorId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!userId || !reason) {
      return res.status(400).json({ success: false, error: 'User and reason are required.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true }
    });
    if (!user?.id) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const prismaAny = prisma as any;
    const now = new Date();
    const endsAt = req.body?.endsAt ? new Date(req.body.endsAt) : new Date(now.getTime() + durationHours * 60 * 60 * 1000);
    if (!(endsAt instanceof Date) || Number.isNaN(endsAt.getTime()) || endsAt <= now) {
      return res.status(400).json({ success: false, error: 'Restriction end time must be in the future.' });
    }

    await prismaAny.scrollPostingRestriction.updateMany({
      where: {
        userId,
        liftedAt: null,
        endsAt: { gt: now }
      },
      data: {
        liftedAt: now,
        liftedByAdminId: actorId
      }
    });

    const restriction = await prismaAny.scrollPostingRestriction.create({
      data: {
        userId,
        reason,
        note,
        startsAt: now,
        endsAt,
        createdByAdminId: actorId
      }
    });

    try {
      await prisma.accountViolation.create({
        data: {
          userId,
          type: 'scroll_post_restriction',
          severity: 'moderate',
          reason,
          metadata: {
            restrictionId: restriction.id,
            endsAt: endsAt.toISOString(),
            note,
            imposedById: actorId
          }
        }
      });
    } catch {}

    await createRuntimeNotification({
      userId,
      actorId,
      type: 'scroll_post_restriction',
      title: 'Scroll posting restricted',
      body: `Your ability to publish Scroll videos is restricted until ${endsAt.toISOString()}.`,
      actionUrl: '/scroll',
      meta: {
        restrictionId: restriction.id,
        reason,
        endsAt: endsAt.toISOString()
      }
    });

    return res.json({
      success: true,
      data: buildRestrictionPayload(restriction)
    });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    return res.status(500).json({ success: false, error: error?.message || 'Failed to restrict posting.' });
  }
};

export const liftScrollOwnerRestrictionAdmin = async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId || '').trim();
    const restrictionId = String(req.params.restrictionId || '').trim();
    const actorId = String((req as any)?.user?.id || '').trim();
    if (!actorId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!userId || !restrictionId) {
      return res.status(400).json({ success: false, error: 'User and restriction id are required.' });
    }

    const prismaAny = prisma as any;
    const existing = await prismaAny.scrollPostingRestriction.findUnique({
      where: { id: restrictionId }
    });
    if (!existing?.id || String(existing.userId) !== userId) {
      return res.status(404).json({ success: false, error: 'Restriction not found.' });
    }

    const updated =
      existing.liftedAt
        ? existing
        : await prismaAny.scrollPostingRestriction.update({
            where: { id: restrictionId },
            data: {
              liftedAt: new Date(),
              liftedByAdminId: actorId
            }
          });

    await createRuntimeNotification({
      userId,
      actorId,
      type: 'scroll_post_restriction_lifted',
      title: 'Scroll posting restored',
      body: 'Your Scroll posting access has been restored.',
      actionUrl: '/scroll',
      meta: {
        restrictionId,
        liftedAt: updated.liftedAt ? new Date(updated.liftedAt).toISOString() : null
      }
    });

    return res.json({
      success: true,
      data: buildRestrictionPayload(updated)
    });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    return res.status(500).json({ success: false, error: error?.message || 'Failed to lift restriction.' });
  }
};
