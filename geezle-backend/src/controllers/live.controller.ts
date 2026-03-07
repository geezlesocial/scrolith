import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import gcoinService from '../services/gcoinService';
import { addFileUsage, removeUsage } from '../utils/fileUsage';
import { notifyUser } from '../utils/notify';
import {
  getLiveConfigFallback,
  getOrCreateLiveConfig,
  isLiveSchemaMissingError,
  resolveLiveParticipantLimit,
  updateLiveConfig
} from '../services/live.service';

const LIVE_VISIBILITIES = new Set(['public', 'network', 'followers', 'private']);
const LIVE_REACTION_TYPES = new Set(['like', 'love']);
const LIVE_RESTRICTION_TYPES = new Set(['LIVE_BAN', 'LIVE_SUSPEND']);
const LIVE_FILTER_PRESETS = new Set(['none', 'vibrant', 'cinematic', 'bw', 'sepia', 'warm', 'cool', 'contrast']);
const LIVE_COMMENT_MAX = 200;

const resolveUserId = (req: Request) => String((req as any)?.user?.id || '').trim();
const resolveRole = (req: Request) => String((req as any)?.user?.role || '').trim().toLowerCase();
const isAdminRole = (role: string) =>
  role.includes('admin') || role.includes('superadmin') || role.includes('moderator');

const nowIso = () => new Date().toISOString();
const ok = (res: Response, data: any) => res.json({ success: true, data, timestamp: nowIso() });
const fail = (res: Response, status: number, message: string, code?: string) =>
  res.status(status).json({ success: false, error: message, code, timestamp: nowIso() });

const toInt = (value: any, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
};

const normalizeVisibility = (value: any, fallback = 'public') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (LIVE_VISIBILITIES.has(normalized)) return normalized;
  return fallback;
};

const toUniqueIds = (value: any): string[] => {
  if (!value) return [];
  const source = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(
      source
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    )
  );
};

const parseDateValue = (value: any): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toUniqueTextList = (value: any, opts?: { stripAt?: boolean }) => {
  const source = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(
      source
        .flatMap((entry) => String(entry || '').split(/[,\n\s]+/g))
        .map((entry) => String(entry || '').trim())
        .map((entry) => (opts?.stripAt && entry.startsWith('@') ? entry.slice(1).trim() : entry))
        .filter(Boolean)
    )
  ).slice(0, 30);
};

const clampLiveFilterStrength = (value: any) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 70;
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

const normalizeLiveFilterPreset = (value: any) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (LIVE_FILTER_PRESETS.has(normalized)) return normalized;
  return 'none';
};

const parseLiveFilterPayload = (value: any) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { preset: 'none', strength: 70 };
  }
  return {
    preset: normalizeLiveFilterPreset((value as any)?.preset),
    strength: clampLiveFilterStrength((value as any)?.strength)
  };
};

const resolveMentionedUsers = async (value: any) => {
  const refs = toUniqueTextList(value, { stripAt: true });
  if (!refs.length) return [];
  const rows = await prisma.user.findMany({
    where: {
      OR: refs.map((ref) => ({
        username: { equals: ref, mode: 'insensitive' as const }
      }))
    },
    select: {
      id: true,
      name: true,
      username: true,
      avatar: true,
      isVerified: true
    },
    take: refs.length
  });
  const byUsername = new Map(rows.map((row) => [String(row.username || '').toLowerCase(), row]));
  const ordered = refs
    .map((ref) => byUsername.get(String(ref).toLowerCase()))
    .filter(Boolean)
    .map((row: any) => ({
      id: String(row.id || ''),
      userId: String(row.id || ''),
      name: String(row.name || row.username || 'Scrolith user'),
      username: String(row.username || '').trim() || null,
      avatar: String(row.avatar || '').trim() || null,
      isVerified: Boolean(row.isVerified)
    }));
  return Array.from(new Map(ordered.map((row: any) => [row.id, row])).values());
};

const resolveTaggedPages = async (value: any) => {
  const refs = toUniqueTextList(value, { stripAt: true });
  if (!refs.length) return [];
  const rows = await (prisma as any).communityBusinessPage.findMany({
    where: {
      OR: refs.flatMap((ref) => [
        { id: ref },
        { slug: { equals: ref, mode: 'insensitive' } },
        { handle: { equals: ref, mode: 'insensitive' } },
        { name: { equals: ref, mode: 'insensitive' } }
      ])
    },
    select: {
      id: true,
      ownerId: true,
      name: true,
      slug: true,
      handle: true
    },
    take: refs.length
  });
  const rowsByRef = new Map<string, any>();
  rows.forEach((row: any) => {
    rowsByRef.set(String(row.id || '').toLowerCase(), row);
    rowsByRef.set(String(row.slug || '').toLowerCase(), row);
    rowsByRef.set(String(row.handle || '').toLowerCase(), row);
    rowsByRef.set(String(row.name || '').toLowerCase(), row);
  });
  const ordered = refs
    .map((ref) => rowsByRef.get(String(ref).toLowerCase()))
    .filter(Boolean)
    .map((row: any) => ({
      id: String(row.id || ''),
      pageId: String(row.id || ''),
      ownerId: String(row.ownerId || ''),
      name: String(row.name || '').trim() || 'Page',
      slug: String(row.slug || '').trim() || null,
      handle: String(row.handle || '').trim() || null
    }));
  return Array.from(new Map(ordered.map((row: any) => [row.id, row])).values());
};

const normalizeLiveMetadata = async (value: any) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, any>) } : {};
  const mentionUsernames = toUniqueTextList(source.mentionUsernames || source.mentions, { stripAt: true });
  const taggedPageRefs = toUniqueTextList(source.taggedPageRefs || source.taggedPages, { stripAt: true });
  const mentionedUsers = await resolveMentionedUsers(mentionUsernames);
  const taggedPages = await resolveTaggedPages(taggedPageRefs);
  const liveFilter = parseLiveFilterPayload(source.liveFilter || source.filter || null);
  return {
    ...source,
    mentionUsernames,
    taggedPageRefs,
    mentionedUsers,
    taggedPages,
    notifyFollowersOnLive: Boolean(source.notifyFollowersOnLive),
    notifyNetworkOnLive: Boolean(source.notifyNetworkOnLive),
    liveFilter
  };
};

const notifyLiveStartRecipients = async (req: Request, session: any) => {
  const metadata = getSessionMetadata(session);
  const visible = String(session?.visibility || 'public').toLowerCase() !== 'private';
  const hostUserId = String(session?.hostUserId || '').trim();
  if (!hostUserId) return;

  const hostUser = await prisma.user.findUnique({
    where: { id: hostUserId },
    select: { id: true, name: true, username: true }
  });
  const hostLabel = String(hostUser?.name || hostUser?.username || 'Someone');
  const title = String(session?.title || '').trim() || `${hostLabel} is live`;
  const body = `${hostLabel} started a live stream${session?.title ? `: ${session.title}` : '.'}`;
  const actionUrl = `/live/${encodeURIComponent(String(session.id || ''))}`;

  const recipientIds = new Set<string>();
  if (visible && metadata.notifyFollowersOnLive) {
    const followers = await prisma.userFollow.findMany({
      where: { followeeId: hostUserId },
      select: { followerId: true }
    });
    followers.forEach((row) => recipientIds.add(String(row.followerId || '').trim()));
  }
  if (visible && metadata.notifyNetworkOnLive) {
    const network = await prisma.userFollow.findMany({
      where: {
        OR: [{ followeeId: hostUserId }, { followerId: hostUserId }]
      },
      select: { followerId: true, followeeId: true }
    });
    network.forEach((row) => {
      const followerId = String(row.followerId || '').trim();
      const followeeId = String(row.followeeId || '').trim();
      if (followerId && followerId !== hostUserId) recipientIds.add(followerId);
      if (followeeId && followeeId !== hostUserId) recipientIds.add(followeeId);
    });
  }

  const mentionedUsers = Array.isArray(metadata.mentionedUsers) ? metadata.mentionedUsers : [];
  mentionedUsers.forEach((entry: any) => {
    const userId = String(entry?.id || entry?.userId || '').trim();
    if (userId && userId !== hostUserId) recipientIds.add(userId);
  });

  const taggedPages = Array.isArray(metadata.taggedPages) ? metadata.taggedPages : [];
  const pageOwnerIds = taggedPages.map((entry: any) => String(entry?.ownerId || '').trim()).filter(Boolean);
  pageOwnerIds.forEach((userId: string) => {
    if (userId !== hostUserId) recipientIds.add(userId);
  });

  const recipients = Array.from(recipientIds).filter(Boolean);
  if (!recipients.length) return;

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      actorId: hostUserId,
      type: 'live_started',
      title,
      body,
      isRead: false,
      meta: {
        sessionId: String(session.id || ''),
        hostUserId,
        actionUrl,
        action_url: actionUrl,
        visibility: String(session.visibility || 'public').toLowerCase()
      } as any
    }))
  });

  recipients.forEach((userId) => {
    notifyUser(userId, {
      type: 'live_started',
      title,
      body,
      actionUrl,
      meta: {
        sessionId: String(session.id || ''),
        hostUserId,
        visibility: String(session.visibility || 'public').toLowerCase()
      }
    });
  });
};

const getSessionMetadata = (session: any): Record<string, any> => {
  if (session?.metadata && typeof session.metadata === 'object' && !Array.isArray(session.metadata)) {
    return { ...(session.metadata as Record<string, any>) };
  }
  return {};
};

const getLiveCommentsFromMetadata = (metadata: Record<string, any>) => {
  const source = metadata?.comments;
  if (!Array.isArray(source)) return [];
  return source
    .map((entry: any) => ({
      id: String(entry?.id || '').trim(),
      userId: String(entry?.userId || '').trim(),
      message: String(entry?.message || '').trim(),
      createdAt: entry?.createdAt || null,
      user: {
        id: String(entry?.user?.id || entry?.userId || '').trim(),
        name: String(entry?.user?.name || '').trim() || 'Scrolith user',
        username: String(entry?.user?.username || '').trim() || null,
        avatar: String(entry?.user?.avatar || '').trim() || null,
        isVerified: Boolean(entry?.user?.isVerified)
      }
    }))
    .filter((entry: any) => entry.id && entry.userId && entry.message && entry.createdAt)
    .slice(-LIVE_COMMENT_MAX);
};

const getRecordingStateFromMetadata = (metadata: Record<string, any>) => {
  const raw = metadata?.recording;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return { ...(raw as Record<string, any>) };
};

const readRestrictionExpiresAt = (violation: any): Date | null => {
  const metadata = violation?.metadata && typeof violation.metadata === 'object' ? violation.metadata : {};
  return parseDateValue((metadata as any)?.expiresAt);
};

const resolveActiveLiveRestriction = async (userId: string) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return null;
  const rows = await (prisma as any).accountViolation.findMany({
    where: {
      userId: normalizedUserId,
      resolvedAt: null,
      type: { in: Array.from(LIVE_RESTRICTION_TYPES) }
    },
    orderBy: { createdAt: 'desc' },
    take: 12
  });
  const now = Date.now();
  for (const row of rows) {
    const type = String(row?.type || '').trim().toUpperCase();
    const expiresAt = readRestrictionExpiresAt(row);
    if (type === 'LIVE_SUSPEND' && expiresAt && expiresAt.getTime() <= now) {
      try {
        await (prisma as any).accountViolation.update({
          where: { id: row.id },
          data: { resolvedAt: new Date() }
        });
      } catch {}
      continue;
    }
    return {
      id: String(row?.id || ''),
      type,
      reason: String(row?.reason || '').trim() || null,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      createdAt: row?.createdAt || null
    };
  }
  return null;
};

const enforceLivePrivileges = async (res: Response, userId: string) => {
  const restriction = await resolveActiveLiveRestriction(userId);
  if (!restriction) return true;
  const isBan = restriction.type === 'LIVE_BAN';
  const suffix = restriction.expiresAt ? ` Restriction ends at ${restriction.expiresAt}.` : '';
  const reason = restriction.reason ? ` Reason: ${restriction.reason}.` : '';
  fail(
    res,
    403,
    isBan
      ? `Livestream privileges are suspended by admin.${reason}`
      : `Livestream access is temporarily restricted by admin.${reason}${suffix}`,
    isBan ? 'LIVE_BANNED' : 'LIVE_RESTRICTED'
  );
  return false;
};

const hasRelayParticipant = (session: any, excludeUserId: string) => {
  const rows = Array.isArray(session?.participants) ? session.participants : [];
  return rows.some((entry: any) => {
    const status = String(entry?.status || '').toUpperCase();
    const userId = String(entry?.userId || '').trim();
    if (!userId || userId === excludeUserId) return false;
    return status === 'JOINED';
  });
};

const emitLiveEvent = (req: Request, event: string, payload: any, opts?: { sessionId?: string; userIds?: string[] }) => {
  const io = req.app.get('io');
  const communityIo = req.app.get('communityIo') || req.app.get('communityNs');
  try {
    io?.emit(event, payload);
  } catch {}
  try {
    communityIo?.emit(event, payload);
  } catch {}

  const sessionId = String(opts?.sessionId || payload?.sessionId || '').trim();
  if (sessionId) {
    try {
      communityIo?.to(`live:session:${sessionId}`).emit(event, payload);
    } catch {}
  }
  const userIds = Array.isArray(opts?.userIds) ? opts?.userIds : [];
  userIds.forEach((userId) => {
    const normalized = String(userId || '').trim();
    if (!normalized) return;
    try {
      communityIo?.to(`community:user:${normalized}`).emit(event, payload);
    } catch {}
  });
};

const fetchUsers = async (userIds: string[]): Promise<Map<string, any>> => {
  const ids = Array.from(new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean)));
  if (!ids.length) return new Map<string, any>();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      username: true,
      avatar: true,
      isVerified: true
    }
  });
  return new Map<string, any>(users.map((user) => [user.id, user]));
};

const mapUserPreview = (userMap: Map<string, any>, userId: string) => {
  const user = userMap.get(userId);
  return {
    id: userId,
    name: user?.name || user?.username || 'Scrolith user',
    username: user?.username || null,
    avatar: user?.avatar || null,
    isVerified: Boolean(user?.isVerified)
  };
};

const fetchSessionById = async (sessionId: string) =>
  (prisma as any).liveSession.findUnique({
    where: { id: sessionId },
    include: {
      participants: { orderBy: { createdAt: 'asc' } },
      invites: { orderBy: { createdAt: 'desc' }, take: 100 },
      gifts: { orderBy: { createdAt: 'desc' }, take: 40 }
    }
  });

const buildSessionPayload = async (session: any, viewerId?: string | null) => {
  if (!session) return null;
  const participantRows = Array.isArray(session.participants) ? session.participants : [];
  const inviteRows = Array.isArray(session.invites) ? session.invites : [];
  const giftRows = Array.isArray(session.gifts) ? session.gifts : [];
  const metadata = getSessionMetadata(session);
  const recording = getRecordingStateFromMetadata(metadata);
  const comments = getLiveCommentsFromMetadata(metadata);

  const userIds = [
    String(session.hostUserId || ''),
    ...participantRows.map((entry: any) => String(entry.userId || '')),
    ...inviteRows.map((entry: any) => String(entry.inviteeId || '')),
    ...inviteRows.map((entry: any) => String(entry.inviterId || '')),
    ...giftRows.map((entry: any) => String(entry.fromUserId || '')),
    ...giftRows.map((entry: any) => String(entry.toUserId || ''))
  ];
  const userMap: Map<string, any> = await fetchUsers(userIds);

  const viewerParticipant = viewerId
    ? participantRows.find((entry: any) => String(entry.userId || '') === String(viewerId))
    : null;

  return {
    id: session.id,
    hostUserId: String(session.hostUserId || ''),
    host: mapUserPreview(userMap, String(session.hostUserId || '')),
    title: session.title || null,
    description: session.description || null,
    visibility: session.visibility || 'public',
    status: String(session.status || 'scheduled').toLowerCase(),
    roomName: session.roomName || `live-${session.id}`,
    streamUrl: session.streamUrl || null,
    hlsUrl: session.hlsUrl || null,
    recordingFileId: session.recordingFileId || null,
    viewerCount: Number(session.viewerCount || 0),
    peakViewerCount: Number(session.peakViewerCount || 0),
    likesCount: Number(session.likesCount || 0),
    lovesCount: Number(session.lovesCount || 0),
    startedAt: session.startedAt || null,
    endedAt: session.endedAt || null,
    metadata,
    recording: {
      fileId: session.recordingFileId || String(recording.fileId || '').trim() || null,
      title: String(recording.title || session.title || '').trim() || null,
      description: String(recording.description || session.description || '').trim() || null,
      thumbnailFileId: String(recording.thumbnailFileId || '').trim() || null,
      published: Boolean(recording.published),
      publishTarget: String(recording.publishTarget || '').trim() || null,
      postId: String(recording.postId || '').trim() || null,
      scrollId: String(recording.scrollId || '').trim() || null,
      downloadUrl:
        session.recordingFileId || recording.fileId
          ? `/api/files/content/${encodeURIComponent(String(session.recordingFileId || recording.fileId))}`
          : null
    },
    commentsCount: comments.length,
    participants: participantRows.map((entry: any) => ({
      id: String(entry.id || ''),
      userId: String(entry.userId || ''),
      role: String(entry.role || 'viewer').toLowerCase(),
      micState: Boolean(entry.micState),
      cameraState: Boolean(entry.cameraState),
      status: String(entry.status || 'invited').toLowerCase(),
      joinedAt: entry.joinedAt || null,
      leftAt: entry.leftAt || null,
      user: mapUserPreview(userMap, String(entry.userId || ''))
    })),
    invites: inviteRows.map((entry: any) => ({
      id: String(entry.id || ''),
      inviterId: String(entry.inviterId || ''),
      inviteeId: String(entry.inviteeId || ''),
      status: String(entry.status || 'pending').toLowerCase(),
      createdAt: entry.createdAt,
      respondedAt: entry.respondedAt || null,
      inviter: mapUserPreview(userMap, String(entry.inviterId || '')),
      invitee: mapUserPreview(userMap, String(entry.inviteeId || ''))
    })),
    gifts: giftRows.map((entry: any) => ({
      id: String(entry.id || ''),
      fromUserId: String(entry.fromUserId || ''),
      toUserId: String(entry.toUserId || ''),
      amountGcoin: Number(entry.amountGcoin || 0),
      message: entry.message || null,
      createdAt: entry.createdAt,
      fromUser: mapUserPreview(userMap, String(entry.fromUserId || '')),
      toUser: mapUserPreview(userMap, String(entry.toUserId || ''))
    })),
    viewer: {
      userId: viewerId || null,
      role: viewerParticipant ? String(viewerParticipant.role || 'viewer').toLowerCase() : null,
      status: viewerParticipant ? String(viewerParticipant.status || 'invited').toLowerCase() : null,
      isHost: viewerId ? String(viewerId) === String(session.hostUserId || '') : false
    },
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
};

const ensureLiveSchema = async () => {
  const config = await getOrCreateLiveConfig();
  if ((config as any)?._schemaMissing) {
    const error: any = new Error('Live tables are not ready. Run the latest backend migration.');
    error.code = 'LIVE_SCHEMA_MISSING';
    throw error;
  }
  return config;
};

const ensureSessionAccess = (session: any, userId: string, role: string) => {
  if (!session) return { ok: false, status: 404, message: 'Livestream session not found.' };
  if (isAdminRole(role)) return { ok: true, status: 200, message: 'ok' };
  if (String(session.hostUserId || '') === userId) return { ok: true, status: 200, message: 'ok' };
  const participantRows = Array.isArray(session.participants) ? session.participants : [];
  const isParticipant = participantRows.some((entry: any) => String(entry.userId || '') === userId);
  if (isParticipant) return { ok: true, status: 200, message: 'ok' };
  if (String(session.visibility || 'public').toLowerCase() !== 'private') {
    return { ok: true, status: 200, message: 'ok' };
  }
  return { ok: false, status: 403, message: 'Session is private.' };
};

export const createLiveSession = async (req: Request, res: Response) => {
  try {
    const hostUserId = resolveUserId(req);
    if (!hostUserId) return fail(res, 401, 'Unauthorized', 'UNAUTHORIZED');
    if (!(await enforceLivePrivileges(res, hostUserId))) return res;

    const config = await ensureLiveSchema();
    if (!config.enabled) {
      return fail(res, 403, 'Livestreaming is disabled by admin.', 'LIVE_DISABLED');
    }

    const visibility = normalizeVisibility(req.body?.visibility, config.defaultVisibility || 'public');
    const title = String(req.body?.title || '').trim() || null;
    const description = String(req.body?.description || '').trim() || null;
    const roomName = String(req.body?.roomName || '').trim() || `live-${Date.now()}`;
    const metadata = await normalizeLiveMetadata(req.body?.metadata);

    const session = await (prisma as any).liveSession.create({
      data: {
        hostUserId,
        title,
        description,
        visibility,
        status: 'SCHEDULED',
        roomName,
        streamUrl: String(req.body?.streamUrl || '').trim() || null,
        hlsUrl: String(req.body?.hlsUrl || '').trim() || null,
        metadata
      }
    });

    await (prisma as any).liveParticipant.upsert({
      where: { sessionId_userId: { sessionId: session.id, userId: hostUserId } },
      update: {
        role: 'HOST',
        status: 'JOINED',
        micState: true,
        cameraState: true,
        joinedAt: new Date(),
        leftAt: null
      },
      create: {
        sessionId: session.id,
        userId: hostUserId,
        role: 'HOST',
        status: 'JOINED',
        micState: true,
        cameraState: true,
        joinedAt: new Date()
      }
    });

    const payload = await buildSessionPayload(await fetchSessionById(session.id), hostUserId);
    emitLiveEvent(req, 'live:session_created', { session: payload }, { sessionId: session.id });
    return res.status(201).json({ success: true, data: payload, timestamp: nowIso() });
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('createLiveSession error:', error);
    return fail(res, 500, error?.message || 'Failed to create livestream session.');
  }
};

export const startLiveSession = async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    const userId = resolveUserId(req);
    const role = resolveRole(req);
    if (!userId) return fail(res, 401, 'Unauthorized', 'UNAUTHORIZED');
    if (!isAdminRole(role) && !(await enforceLivePrivileges(res, userId))) return res;
    if (!sessionId) return fail(res, 400, 'Session ID is required.');

    await ensureLiveSchema();
    const session = await fetchSessionById(sessionId);
    const access = ensureSessionAccess(session, userId, role);
    if (!access.ok) return fail(res, access.status, access.message);
    if (!isAdminRole(role) && String(session.hostUserId || '') !== userId) {
      return fail(res, 403, 'Only host can start this livestream.', 'HOST_REQUIRED');
    }
    if (String(session.status || '').toUpperCase() === 'ENDED') {
      return fail(res, 400, 'This livestream has already ended.', 'LIVE_ALREADY_ENDED');
    }

    await (prisma as any).liveSession.update({
      where: { id: sessionId },
      data: {
        status: 'LIVE',
        startedAt: session.startedAt || new Date(),
        endedAt: null
      }
    });

    await (prisma as any).liveParticipant.upsert({
      where: { sessionId_userId: { sessionId, userId: session.hostUserId } },
      update: {
        role: 'HOST',
        status: 'JOINED',
        joinedAt: session.startedAt || new Date(),
        leftAt: null
      },
      create: {
        sessionId,
        userId: session.hostUserId,
        role: 'HOST',
        status: 'JOINED',
        joinedAt: session.startedAt || new Date(),
        micState: true,
        cameraState: true
      }
    });

    const startedSession = await fetchSessionById(sessionId);
    await notifyLiveStartRecipients(req, startedSession);

    const payload = await buildSessionPayload(startedSession, userId);
    emitLiveEvent(
      req,
      'live:started',
      { session: payload, sessionId },
      {
        sessionId,
        userIds: [String(session.hostUserId || '')]
      }
    );
    return ok(res, payload);
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('startLiveSession error:', error);
    return fail(res, 500, error?.message || 'Failed to start livestream.');
  }
};

export const setLiveSessionFilter = async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    const userId = resolveUserId(req);
    const role = resolveRole(req);
    if (!userId) return fail(res, 401, 'Unauthorized', 'UNAUTHORIZED');
    if (!sessionId) return fail(res, 400, 'Session ID is required.');

    await ensureLiveSchema();
    const session = await fetchSessionById(sessionId);
    const access = ensureSessionAccess(session, userId, role);
    if (!access.ok) return fail(res, access.status, access.message);
    if (!isAdminRole(role) && String(session.hostUserId || '') !== userId) {
      return fail(res, 403, 'Only host can update live filters.', 'HOST_REQUIRED');
    }

    const filter = parseLiveFilterPayload(req.body || {});
    const metadata = getSessionMetadata(session);
    const nextMetadata = {
      ...metadata,
      liveFilter: {
        preset: filter.preset,
        strength: filter.strength,
        updatedAt: nowIso(),
        updatedById: userId
      }
    };

    await (prisma as any).liveSession.update({
      where: { id: sessionId },
      data: { metadata: nextMetadata }
    });

    const payload = {
      sessionId,
      filter: {
        preset: filter.preset,
        strength: filter.strength
      },
      emittedAt: nowIso()
    };
    emitLiveEvent(req, 'live:filter_updated', payload, { sessionId });
    return ok(res, payload);
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    return fail(res, 500, error?.message || 'Failed to update live filter.');
  }
};

export const endLiveSession = async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    const userId = resolveUserId(req);
    const role = resolveRole(req);
    if (!userId) return fail(res, 401, 'Unauthorized', 'UNAUTHORIZED');
    if (!sessionId) return fail(res, 400, 'Session ID is required.');

    await ensureLiveSchema();
    const session = await fetchSessionById(sessionId);
    const access = ensureSessionAccess(session, userId, role);
    if (!access.ok) return fail(res, access.status, access.message);
    if (!isAdminRole(role) && String(session.hostUserId || '') !== userId) {
      return fail(res, 403, 'Only host can end this livestream.', 'HOST_REQUIRED');
    }

    const endedAt = new Date();
    await (prisma as any).liveSession.update({
      where: { id: sessionId },
      data: {
        status: 'ENDED',
        endedAt
      }
    });
    await (prisma as any).liveParticipant.updateMany({
      where: {
        sessionId,
        OR: [{ leftAt: null }, { status: { in: ['INVITED', 'JOINED'] } }]
      },
      data: {
        status: 'LEFT',
        leftAt: endedAt
      }
    });

    const payload = await buildSessionPayload(await fetchSessionById(sessionId), userId);
    emitLiveEvent(req, 'live:ended', { session: payload, sessionId }, { sessionId });
    return ok(res, payload);
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('endLiveSession error:', error);
    return fail(res, 500, error?.message || 'Failed to end livestream.');
  }
};

export const leaveLiveSession = async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    const userId = resolveUserId(req);
    const role = resolveRole(req);
    if (!userId) return fail(res, 401, 'Unauthorized', 'UNAUTHORIZED');
    if (!sessionId) return fail(res, 400, 'Session ID is required.');

    await ensureLiveSchema();
    const session = await fetchSessionById(sessionId);
    const access = ensureSessionAccess(session, userId, role);
    if (!access.ok) return fail(res, access.status, access.message);

    const isHost = String(session.hostUserId || '') === userId;
    const isLive = String(session.status || '').toUpperCase() === 'LIVE';
    if (isHost && isLive && !isAdminRole(role) && !hasRelayParticipant(session, userId)) {
      return fail(
        res,
        400,
        'Host cannot leave while no other active participant is present. End the livestream instead.',
        'HOST_EXIT_REQUIRES_RELAY'
      );
    }

    const leftAt = new Date();
    const existingParticipant = Array.isArray(session.participants)
      ? session.participants.find((entry: any) => String(entry.userId || '') === userId)
      : null;

    await (prisma as any).liveParticipant.upsert({
      where: { sessionId_userId: { sessionId, userId } },
      update: {
        status: 'LEFT',
        leftAt
      },
      create: {
        sessionId,
        userId,
        role: existingParticipant?.role || (isHost ? 'HOST' : 'VIEWER'),
        status: 'LEFT',
        joinedAt: existingParticipant?.joinedAt || null,
        leftAt,
        micState: Boolean(existingParticipant?.micState),
        cameraState: Boolean(existingParticipant?.cameraState)
      }
    });

    const joinedCount = await (prisma as any).liveParticipant.count({
      where: { sessionId, status: 'JOINED', leftAt: null }
    });

    const currentMetadata = getSessionMetadata(session);
    const nextMetadata = isHost
      ? {
          ...currentMetadata,
          hostLeftAt: leftAt.toISOString(),
          hostLeftById: userId
        }
      : currentMetadata;

    await (prisma as any).liveSession.update({
      where: { id: sessionId },
      data: {
        viewerCount: Number(joinedCount || 0),
        peakViewerCount: Math.max(Number(session.peakViewerCount || 0), Number(joinedCount || 0)),
        metadata: nextMetadata
      }
    });

    const payload = await buildSessionPayload(await fetchSessionById(sessionId), userId);
    const leavePayload = {
      sessionId,
      userId,
      role: String(existingParticipant?.role || (isHost ? 'HOST' : 'VIEWER')).toLowerCase(),
      leftAt: leftAt.toISOString(),
      viewerCount: Number(joinedCount || 0)
    };
    emitLiveEvent(req, 'live:participant_left', leavePayload, { sessionId });
    emitLiveEvent(
      req,
      'live:viewer_count_updated',
      {
        sessionId,
        viewerCount: Number(joinedCount || 0),
        peakViewerCount: Math.max(Number(session.peakViewerCount || 0), Number(joinedCount || 0))
      },
      { sessionId }
    );
    return ok(res, payload);
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('leaveLiveSession error:', error);
    return fail(res, 500, error?.message || 'Failed to leave livestream.');
  }
};

export const getLiveActiveSessions = async (req: Request, res: Response) => {
  try {
    await ensureLiveSchema();
    const viewerId = resolveUserId(req) || null;
    const role = resolveRole(req);
    const limit = Math.max(1, Math.min(60, toInt(req.query?.limit, 20)));
    const rows = await (prisma as any).liveSession.findMany({
      where: { status: 'LIVE' },
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: {
        participants: true,
        invites: true,
        gifts: true
      }
    });
    const visibleRows = rows.filter((session: any) => ensureSessionAccess(session, viewerId || '', role).ok);
    const payload = await Promise.all(visibleRows.map((session: any) => buildSessionPayload(session, viewerId)));
    return ok(res, {
      items: payload.filter(Boolean),
      count: payload.filter(Boolean).length,
      limit
    });
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('getLiveActiveSessions error:', error);
    return fail(res, 500, error?.message || 'Failed to load active livestreams.');
  }
};

export const getLiveSessionComments = async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    const userId = resolveUserId(req);
    const role = resolveRole(req);
    if (!userId) return fail(res, 401, 'Unauthorized', 'UNAUTHORIZED');
    if (!sessionId) return fail(res, 400, 'Session ID is required.');

    await ensureLiveSchema();
    const session = await fetchSessionById(sessionId);
    const access = ensureSessionAccess(session, userId, role);
    if (!access.ok) return fail(res, access.status, access.message);
    const metadata = getSessionMetadata(session);
    const comments = getLiveCommentsFromMetadata(metadata);
    return ok(res, comments);
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('getLiveSessionComments error:', error);
    return fail(res, 500, error?.message || 'Failed to load live comments.');
  }
};

export const addLiveSessionComment = async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    const userId = resolveUserId(req);
    const role = resolveRole(req);
    if (!userId) return fail(res, 401, 'Unauthorized', 'UNAUTHORIZED');
    if (!sessionId) return fail(res, 400, 'Session ID is required.');
    const message = String(req.body?.message || '').trim();
    if (!message) return fail(res, 400, 'Comment message is required.', 'LIVE_COMMENT_REQUIRED');
    if (message.length > 500) return fail(res, 400, 'Comment is too long (max 500 chars).', 'LIVE_COMMENT_TOO_LONG');

    await ensureLiveSchema();
    const session = await fetchSessionById(sessionId);
    const access = ensureSessionAccess(session, userId, role);
    if (!access.ok) return fail(res, access.status, access.message);

    const userMap = await fetchUsers([userId]);
    const comment = {
      id: `lc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      message,
      createdAt: nowIso(),
      user: mapUserPreview(userMap, userId)
    };
    const metadata = getSessionMetadata(session);
    const comments = [...getLiveCommentsFromMetadata(metadata), comment].slice(-LIVE_COMMENT_MAX);
    const nextMetadata = {
      ...metadata,
      comments
    };
    await (prisma as any).liveSession.update({
      where: { id: sessionId },
      data: { metadata: nextMetadata }
    });

    emitLiveEvent(
      req,
      'live:comment',
      {
        sessionId,
        comment,
        commentsCount: comments.length
      },
      { sessionId }
    );
    return ok(res, {
      comment,
      commentsCount: comments.length
    });
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('addLiveSessionComment error:', error);
    return fail(res, 500, error?.message || 'Failed to send comment.');
  }
};

export const saveLiveRecording = async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    const actorUserId = resolveUserId(req);
    const role = resolveRole(req);
    if (!actorUserId) return fail(res, 401, 'Unauthorized', 'UNAUTHORIZED');
    if (!sessionId) return fail(res, 400, 'Session ID is required.');

    await ensureLiveSchema();
    const session = await fetchSessionById(sessionId);
    const access = ensureSessionAccess(session, actorUserId, role);
    if (!access.ok) return fail(res, access.status, access.message);
    if (!isAdminRole(role) && String(session.hostUserId || '') !== actorUserId) {
      return fail(res, 403, 'Only host can manage stream recording.', 'HOST_REQUIRED');
    }

    const inputFileId = String(req.body?.recordingFileId || req.body?.fileId || '').trim() || null;
    const previousRecordingFileId = String(session.recordingFileId || '').trim() || null;
    const recordingFileId = inputFileId || previousRecordingFileId;
    if (!recordingFileId) {
      return fail(res, 400, 'Recording file ID is required.', 'LIVE_RECORDING_FILE_REQUIRED');
    }

    const file = await (prisma as any).file.findUnique({
      where: { id: recordingFileId },
      select: { id: true, ownerId: true, mimeType: true }
    });
    if (!file) return fail(res, 404, 'Recording file was not found.', 'LIVE_RECORDING_FILE_NOT_FOUND');
    if (!String(file.mimeType || '').toLowerCase().startsWith('video/')) {
      return fail(res, 400, 'Recording file must be a video.', 'LIVE_RECORDING_INVALID_FILE');
    }
    if (!isAdminRole(role) && String(file.ownerId || '') !== actorUserId && String(file.ownerId || '') !== String(session.hostUserId || '')) {
      return fail(res, 403, 'You can only attach your own uploaded recording.', 'LIVE_RECORDING_OWNERSHIP');
    }

    const metadata = getSessionMetadata(session);
    const previousRecording = getRecordingStateFromMetadata(metadata);
    const nextRecording = {
      ...previousRecording,
      fileId: recordingFileId,
      title: String(req.body?.title ?? previousRecording.title ?? session.title ?? '').trim() || null,
      description: String(req.body?.description ?? previousRecording.description ?? session.description ?? '').trim() || null,
      thumbnailFileId: String(req.body?.thumbnailFileId ?? previousRecording.thumbnailFileId ?? '').trim() || null,
      updatedAt: nowIso()
    };
    const nextMetadata = {
      ...metadata,
      recording: nextRecording
    };

    await (prisma as any).liveSession.update({
      where: { id: sessionId },
      data: {
        recordingFileId,
        metadata: nextMetadata
      }
    });

    if (previousRecordingFileId && previousRecordingFileId !== recordingFileId) {
      try {
        await removeUsage('live_recording', sessionId);
      } catch {}
    }
    try {
      await addFileUsage({
        fileId: recordingFileId,
        usageType: 'live_recording',
        usageId: sessionId,
        label: 'Live Stream Recording'
      });
    } catch {}

    const payload = await buildSessionPayload(await fetchSessionById(sessionId), actorUserId);
    emitLiveEvent(req, 'live:recording_updated', { sessionId, recording: payload?.recording || null }, { sessionId });
    return ok(res, payload);
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('saveLiveRecording error:', error);
    return fail(res, 500, error?.message || 'Failed to save live recording.');
  }
};

export const getLiveRecording = async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    const userId = resolveUserId(req);
    const role = resolveRole(req);
    if (!userId) return fail(res, 401, 'Unauthorized', 'UNAUTHORIZED');
    if (!sessionId) return fail(res, 400, 'Session ID is required.');

    await ensureLiveSchema();
    const session = await fetchSessionById(sessionId);
    const access = ensureSessionAccess(session, userId, role);
    if (!access.ok) return fail(res, access.status, access.message);
    const payload = await buildSessionPayload(session, userId);
    return ok(res, payload?.recording || null);
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('getLiveRecording error:', error);
    return fail(res, 500, error?.message || 'Failed to load recording details.');
  }
};

export const publishLiveRecording = async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    const actorUserId = resolveUserId(req);
    const role = resolveRole(req);
    if (!actorUserId) return fail(res, 401, 'Unauthorized', 'UNAUTHORIZED');
    if (!sessionId) return fail(res, 400, 'Session ID is required.');

    await ensureLiveSchema();
    const session = await fetchSessionById(sessionId);
    const access = ensureSessionAccess(session, actorUserId, role);
    if (!access.ok) return fail(res, access.status, access.message);
    if (!isAdminRole(role) && String(session.hostUserId || '') !== actorUserId) {
      return fail(res, 403, 'Only host can publish this recording.', 'HOST_REQUIRED');
    }

    const metadata = getSessionMetadata(session);
    const recording = getRecordingStateFromMetadata(metadata);
    const recordingFileId = String(session.recordingFileId || recording.fileId || '').trim();
    if (!recordingFileId) return fail(res, 400, 'No recording is attached yet.', 'LIVE_RECORDING_MISSING');

    const publishTarget = String(req.body?.target || recording.publishTarget || 'post').trim().toLowerCase();
    const publishVisibility = normalizeVisibility(req.body?.visibility, session.visibility || 'public');
    const title = String(req.body?.title || recording.title || session.title || 'Livestream replay').trim();
    const description = String(req.body?.description || recording.description || session.description || '').trim();

    let postId: string | null = null;
    let scrollId: string | null = null;
    if (publishTarget === 'scroll') {
      const createdScroll = await (prisma as any).scrollVideo.create({
        data: {
          authorId: String(session.hostUserId || actorUserId),
          fileId: recordingFileId,
          title: title || null,
          description: description || null,
          visibility: publishVisibility,
          status: 'active'
        }
      });
      scrollId = String(createdScroll.id);
      try {
        await addFileUsage({
          fileId: recordingFileId,
          usageType: 'live_recording_scroll',
          usageId: scrollId,
          label: 'Live Recording Scroll Publish'
        });
      } catch {}
    } else {
      const createdPost = await (prisma as any).communityPost.create({
        data: {
          authorId: String(session.hostUserId || actorUserId),
          title: title || null,
          content: description || `Livestream replay: ${title || 'Untitled stream'}`,
          attachments: [recordingFileId],
          visibility: publishVisibility,
          status: 'active'
        }
      });
      postId = String(createdPost.id);
      try {
        await addFileUsage({
          fileId: recordingFileId,
          usageType: 'live_recording_post',
          usageId: postId,
          label: 'Live Recording Post Publish'
        });
      } catch {}
    }

    const nextRecording = {
      ...recording,
      fileId: recordingFileId,
      title: title || null,
      description: description || null,
      published: true,
      publishTarget: publishTarget === 'scroll' ? 'scroll' : 'post',
      postId,
      scrollId,
      publishedAt: nowIso(),
      updatedAt: nowIso()
    };
    const nextMetadata = {
      ...metadata,
      recording: nextRecording
    };

    await (prisma as any).liveSession.update({
      where: { id: sessionId },
      data: {
        metadata: nextMetadata
      }
    });

    const payload = await buildSessionPayload(await fetchSessionById(sessionId), actorUserId);
    emitLiveEvent(
      req,
      'live:recording_published',
      {
        sessionId,
        postId,
        scrollId,
        publishTarget: nextRecording.publishTarget
      },
      { sessionId, userIds: [String(session.hostUserId || '')] }
    );
    return ok(res, payload);
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('publishLiveRecording error:', error);
    return fail(res, 500, error?.message || 'Failed to publish livestream recording.');
  }
};

export const unpublishLiveRecording = async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    const actorUserId = resolveUserId(req);
    const role = resolveRole(req);
    if (!actorUserId) return fail(res, 401, 'Unauthorized', 'UNAUTHORIZED');
    if (!sessionId) return fail(res, 400, 'Session ID is required.');

    await ensureLiveSchema();
    const session = await fetchSessionById(sessionId);
    const access = ensureSessionAccess(session, actorUserId, role);
    if (!access.ok) return fail(res, access.status, access.message);
    if (!isAdminRole(role) && String(session.hostUserId || '') !== actorUserId) {
      return fail(res, 403, 'Only host can unpublish this recording.', 'HOST_REQUIRED');
    }

    const metadata = getSessionMetadata(session);
    const recording = getRecordingStateFromMetadata(metadata);
    const target = String(req.body?.target || recording.publishTarget || '').trim().toLowerCase();
    const postId = String(req.body?.postId || recording.postId || '').trim();
    const scrollId = String(req.body?.scrollId || recording.scrollId || '').trim();

    if (target === 'post' && postId) {
      try {
        await (prisma as any).communityPost.updateMany({
          where: {
            id: postId,
            ...(isAdminRole(role) ? {} : { authorId: String(session.hostUserId || actorUserId) })
          },
          data: { status: 'draft' }
        });
      } catch {}
    }
    if (target === 'scroll' && scrollId) {
      try {
        await (prisma as any).scrollVideo.updateMany({
          where: {
            id: scrollId,
            ...(isAdminRole(role) ? {} : { authorId: String(session.hostUserId || actorUserId) })
          },
          data: { status: 'removed' }
        });
      } catch {}
    }

    const nextMetadata = {
      ...metadata,
      recording: {
        ...recording,
        published: false,
        publishTarget: null,
        unpublishedAt: nowIso(),
        updatedAt: nowIso()
      }
    };
    await (prisma as any).liveSession.update({
      where: { id: sessionId },
      data: { metadata: nextMetadata }
    });
    const payload = await buildSessionPayload(await fetchSessionById(sessionId), actorUserId);
    emitLiveEvent(req, 'live:recording_unpublished', { sessionId }, { sessionId });
    return ok(res, payload);
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('unpublishLiveRecording error:', error);
    return fail(res, 500, error?.message || 'Failed to unpublish livestream recording.');
  }
};

export const deleteLiveRecording = async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    const actorUserId = resolveUserId(req);
    const role = resolveRole(req);
    if (!actorUserId) return fail(res, 401, 'Unauthorized', 'UNAUTHORIZED');
    if (!sessionId) return fail(res, 400, 'Session ID is required.');

    await ensureLiveSchema();
    const session = await fetchSessionById(sessionId);
    const access = ensureSessionAccess(session, actorUserId, role);
    if (!access.ok) return fail(res, access.status, access.message);
    if (!isAdminRole(role) && String(session.hostUserId || '') !== actorUserId) {
      return fail(res, 403, 'Only host can delete this recording.', 'HOST_REQUIRED');
    }

    const metadata = getSessionMetadata(session);
    const recording = getRecordingStateFromMetadata(metadata);
    const recordingFileId = String(session.recordingFileId || recording.fileId || '').trim();
    if (!recordingFileId) {
      return fail(res, 404, 'Recording is not attached to this session.', 'LIVE_RECORDING_NOT_FOUND');
    }

    try {
      await removeUsage('live_recording', sessionId);
    } catch {}

    const nextMetadata = {
      ...metadata,
      recording: {
        ...recording,
        fileId: null,
        published: false,
        publishTarget: null,
        postId: null,
        scrollId: null,
        deletedAt: nowIso(),
        updatedAt: nowIso()
      }
    };

    await (prisma as any).liveSession.update({
      where: { id: sessionId },
      data: {
        recordingFileId: null,
        metadata: nextMetadata
      }
    });
    const payload = await buildSessionPayload(await fetchSessionById(sessionId), actorUserId);
    emitLiveEvent(req, 'live:recording_deleted', { sessionId }, { sessionId });
    return ok(res, payload);
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('deleteLiveRecording error:', error);
    return fail(res, 500, error?.message || 'Failed to delete livestream recording.');
  }
};

export const inviteLiveParticipant = async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    const inviterId = resolveUserId(req);
    const role = resolveRole(req);
    if (!inviterId) return fail(res, 401, 'Unauthorized', 'UNAUTHORIZED');
    if (!isAdminRole(role) && !(await enforceLivePrivileges(res, inviterId))) return res;
    if (!sessionId) return fail(res, 400, 'Session ID is required.');

    const config = await ensureLiveSchema();
    const session = await fetchSessionById(sessionId);
    const access = ensureSessionAccess(session, inviterId, role);
    if (!access.ok) return fail(res, access.status, access.message);

    const inviterParticipant = Array.isArray(session.participants)
      ? session.participants.find((entry: any) => String(entry.userId || '') === inviterId)
      : null;
    const inviterCanInvite =
      isAdminRole(role) ||
      String(session.hostUserId || '') === inviterId ||
      ['HOST', 'COHOST', 'MODERATOR'].includes(String(inviterParticipant?.role || '').toUpperCase());
    if (!inviterCanInvite) {
      return fail(res, 403, 'Only host/co-host can invite participants.', 'INVITE_FORBIDDEN');
    }

    const inviteeIds = toUniqueIds(req.body?.inviteeIds ?? req.body?.inviteeId).filter((id) => id !== inviterId);
    if (!inviteeIds.length) return fail(res, 400, 'At least one invitee is required.', 'INVITEE_REQUIRED');

    const participantLimit = resolveLiveParticipantLimit(config);
    const activeParticipantIds = Array.from(
      new Set(
        (Array.isArray(session.participants) ? session.participants : [])
          .filter((entry: any) => ['INVITED', 'JOINED'].includes(String(entry.status || '').toUpperCase()))
          .map((entry: any) => String(entry.userId || '').trim())
          .filter(Boolean)
      )
    );
    const projectedCount = new Set([...activeParticipantIds, ...inviteeIds]).size;
    if (projectedCount > participantLimit) {
      return fail(res, 400, `Maximum ${participantLimit} participants allowed.`, 'MAX_PARTICIPANTS_EXCEEDED');
    }

    const invited: any[] = [];
    for (const inviteeId of inviteeIds) {
      const invite = await (prisma as any).liveInvite.upsert({
        where: { sessionId_inviteeId: { sessionId, inviteeId } },
        update: {
          inviterId,
          status: 'PENDING',
          respondedAt: null
        },
        create: {
          sessionId,
          inviterId,
          inviteeId,
          status: 'PENDING'
        }
      });
      await (prisma as any).liveParticipant.upsert({
        where: { sessionId_userId: { sessionId, userId: inviteeId } },
        update: {
          status: 'INVITED',
          role: 'GUEST',
          leftAt: null
        },
        create: {
          sessionId,
          userId: inviteeId,
          status: 'INVITED',
          role: 'GUEST',
          micState: true,
          cameraState: true
        }
      });
      invited.push(invite);
    }

    const payload = {
      sessionId,
      inviterId,
      inviteeIds,
      invites: invited,
      emittedAt: nowIso()
    };
    emitLiveEvent(req, 'live:participant_invited', payload, { sessionId, userIds: inviteeIds });
    return ok(res, payload);
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('inviteLiveParticipant error:', error);
    return fail(res, 500, error?.message || 'Failed to invite participant.');
  }
};

export const acceptLiveInvite = async (req: Request, res: Response) => {
  try {
    const inviteId = String(req.params.inviteId || '').trim();
    const userId = resolveUserId(req);
    if (!userId) return fail(res, 401, 'Unauthorized', 'UNAUTHORIZED');
    if (!(await enforceLivePrivileges(res, userId))) return res;
    if (!inviteId) return fail(res, 400, 'Invite ID is required.');

    await ensureLiveSchema();
    const invite = await (prisma as any).liveInvite.findUnique({ where: { id: inviteId } });
    if (!invite) return fail(res, 404, 'Live invite not found.');
    if (String(invite.inviteeId || '') !== userId) {
      return fail(res, 403, 'This invite does not belong to the current user.');
    }

    await (prisma as any).liveInvite.update({
      where: { id: inviteId },
      data: {
        status: 'ACCEPTED',
        respondedAt: new Date()
      }
    });

    await (prisma as any).liveParticipant.upsert({
      where: { sessionId_userId: { sessionId: invite.sessionId, userId } },
      update: {
        status: 'JOINED',
        joinedAt: new Date(),
        leftAt: null
      },
      create: {
        sessionId: invite.sessionId,
        userId,
        role: 'GUEST',
        status: 'JOINED',
        joinedAt: new Date(),
        micState: true,
        cameraState: true
      }
    });

    const payload = await buildSessionPayload(await fetchSessionById(invite.sessionId), userId);
    emitLiveEvent(
      req,
      'live:participant_joined',
      {
        sessionId: invite.sessionId,
        userId,
        role: 'guest',
        joinedAt: nowIso()
      },
      { sessionId: invite.sessionId }
    );
    return ok(res, payload);
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('acceptLiveInvite error:', error);
    return fail(res, 500, error?.message || 'Failed to accept invite.');
  }
};

export const reactLiveSession = async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    const userId = resolveUserId(req);
    if (!userId) return fail(res, 401, 'Unauthorized', 'UNAUTHORIZED');
    if (!sessionId) return fail(res, 400, 'Session ID is required.');

    await ensureLiveSchema();
    const reactionType = String(req.body?.type || '').trim().toLowerCase();
    if (!LIVE_REACTION_TYPES.has(reactionType)) {
      return fail(res, 400, 'Reaction type must be like or love.', 'REACTION_INVALID');
    }

    const session = await fetchSessionById(sessionId);
    if (!session) return fail(res, 404, 'Livestream session not found.');
    if (String(session.status || '').toUpperCase() === 'ENDED') {
      return fail(res, 400, 'This livestream has ended.', 'LIVE_ENDED');
    }

    await (prisma as any).liveReactionCounter.create({
      data: {
        sessionId,
        userId,
        reactionType,
        count: 1
      }
    });

    const updateData = reactionType === 'love' ? { lovesCount: { increment: 1 } } : { likesCount: { increment: 1 } };
    const updated = await (prisma as any).liveSession.update({
      where: { id: sessionId },
      data: updateData,
      select: {
        id: true,
        likesCount: true,
        lovesCount: true
      }
    });

    const payload = {
      sessionId,
      userId,
      type: reactionType,
      likesCount: Number(updated.likesCount || 0),
      lovesCount: Number(updated.lovesCount || 0),
      emittedAt: nowIso()
    };
    emitLiveEvent(req, 'live:reaction', payload, { sessionId });
    return ok(res, payload);
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('reactLiveSession error:', error);
    return fail(res, 500, error?.message || 'Failed to send livestream reaction.');
  }
};

export const sendLiveGift = async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    const fromUserId = resolveUserId(req);
    if (!fromUserId) return fail(res, 401, 'Unauthorized', 'UNAUTHORIZED');
    if (!sessionId) return fail(res, 400, 'Session ID is required.');

    const config = await ensureLiveSchema();
    if (!config.enableGifts) {
      return fail(res, 403, 'Gifting is disabled by admin.', 'LIVE_GIFTS_DISABLED');
    }

    const session = await fetchSessionById(sessionId);
    if (!session) return fail(res, 404, 'Livestream session not found.');
    if (String(session.status || '').toUpperCase() !== 'LIVE') {
      return fail(res, 400, 'Livestream is not currently live.', 'LIVE_NOT_ACTIVE');
    }

    const amountGcoin = toInt(req.body?.amountGcoin ?? req.body?.amount, 0);
    if (amountGcoin < Number(config.minGiftGcoin || 1) || amountGcoin > Number(config.maxGiftGcoin || 50000)) {
      return fail(
        res,
        400,
        `Gift amount must be between ${config.minGiftGcoin} and ${config.maxGiftGcoin} Gcoin.`,
        'LIVE_GIFT_AMOUNT_INVALID'
      );
    }

    const toUserId = String(req.body?.toUserId || session.hostUserId || '').trim();
    if (!toUserId) return fail(res, 400, 'Gift recipient is required.');
    if (toUserId === fromUserId) return fail(res, 400, 'You cannot send a gift to yourself.');

    await gcoinService.ensureWalletForUser(fromUserId);
    const recipientWallet = await gcoinService.ensureWalletForUser(toUserId);
    const transferResult = await gcoinService.transfer(fromUserId, {
      toRecipientId: String(recipientWallet.recipientId || ''),
      amount: amountGcoin,
      note: String(req.body?.message || 'Live gift').trim() || 'Live gift',
      reference: { type: 'live_gift', id: sessionId }
    });

    const gift = await (prisma as any).liveGift.create({
      data: {
        sessionId,
        fromUserId,
        toUserId,
        amountGcoin,
        message: String(req.body?.message || '').trim() || null
      }
    });

    const payload = {
      sessionId,
      gift: {
        id: gift.id,
        fromUserId,
        toUserId,
        amountGcoin,
        message: gift.message || null,
        createdAt: gift.createdAt
      },
      transfer: {
        transactionId: transferResult.transactionId
      },
      emittedAt: nowIso()
    };
    emitLiveEvent(req, 'live:gift_sent', payload, { sessionId, userIds: [toUserId, fromUserId] });
    return ok(res, payload);
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('sendLiveGift error:', error);
    const message = String(error?.message || 'Failed to send live gift.');
    if (message.includes('INSUFFICIENT_FUNDS')) {
      return fail(res, 400, 'Insufficient Gcoin balance.', 'INSUFFICIENT_GCOIN');
    }
    return fail(res, 500, message);
  }
};

export const getLiveSession = async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    const userId = resolveUserId(req);
    const role = resolveRole(req);
    if (!sessionId) return fail(res, 400, 'Session ID is required.');

    await ensureLiveSchema();
    const session = await fetchSessionById(sessionId);
    const access = ensureSessionAccess(session, userId, role);
    if (!access.ok) return fail(res, access.status, access.message);

    const payload = await buildSessionPayload(session, userId || null);
    return ok(res, payload);
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('getLiveSession error:', error);
    return fail(res, 500, error?.message || 'Failed to load livestream session.');
  }
};

export const getMyLiveSessions = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return fail(res, 401, 'Unauthorized', 'UNAUTHORIZED');

    await ensureLiveSchema();

    const [hostedRows, participantRows, invites] = await Promise.all([
      (prisma as any).liveSession.findMany({
        where: { hostUserId: userId },
        orderBy: { createdAt: 'desc' },
        take: 50
      }),
      (prisma as any).liveParticipant.findMany({
        where: {
          userId,
          status: { in: ['INVITED', 'JOINED'] }
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        include: {
          session: true
        }
      }),
      (prisma as any).liveInvite.findMany({
        where: { inviteeId: userId },
        orderBy: { createdAt: 'desc' },
        take: 100
      })
    ]);

    const hosted = await Promise.all(
      hostedRows.map(async (session: any) => buildSessionPayload(await fetchSessionById(session.id), userId))
    );
    const participating = await Promise.all(
      participantRows
        .map((entry: any) => entry?.session)
        .filter(Boolean)
        .map(async (session: any) => buildSessionPayload(await fetchSessionById(session.id), userId))
    );

    return ok(res, {
      hosted: hosted.filter(Boolean),
      participating: participating.filter(Boolean),
      invites
    });
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('getMyLiveSessions error:', error);
    return fail(res, 500, error?.message || 'Failed to load livestream sessions.');
  }
};

export const reportLiveSession = async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    const userId = resolveUserId(req);
    if (!userId) return fail(res, 401, 'Unauthorized', 'UNAUTHORIZED');
    if (!sessionId) return fail(res, 400, 'Session ID is required.');
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return fail(res, 400, 'Report reason is required.');

    await ensureLiveSchema();
    const session = await (prisma as any).liveSession.findUnique({ where: { id: sessionId } });
    if (!session) return fail(res, 404, 'Livestream session not found.');

    const report = await (prisma as any).liveReport.create({
      data: {
        sessionId,
        reportedById: userId,
        reason,
        status: 'PENDING'
      }
    });
    emitLiveEvent(
      req,
      'live:reported',
      {
        sessionId,
        reportId: report.id,
        reportedById: userId,
        status: 'pending'
      },
      { sessionId }
    );
    return ok(res, report);
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('reportLiveSession error:', error);
    return fail(res, 500, error?.message || 'Failed to submit report.');
  }
};

export const getLiveAdminConfig = async (_req: Request, res: Response) => {
  try {
    const config = await getOrCreateLiveConfig();
    return ok(res, config);
  } catch (error: any) {
    if (isLiveSchemaMissingError(error)) {
      return ok(res, getLiveConfigFallback());
    }
    return fail(res, 500, error?.message || 'Failed to load live config.');
  }
};

export const updateLiveAdminConfig = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req) || null;
    const config = await updateLiveConfig(req.body, userId);
    emitLiveEvent(req, 'live:config_updated', { config });
    return ok(res, config);
  } catch (error: any) {
    if (isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    return fail(res, 500, error?.message || 'Failed to update live config.');
  }
};

export const getLiveAdminSessions = async (req: Request, res: Response) => {
  try {
    await ensureLiveSchema();
    const status = String(req.query?.status || '').trim().toUpperCase();
    const limit = Math.max(1, Math.min(200, toInt(req.query?.limit, 100)));

    const where: any = {};
    if (status) where.status = status;

    const sessions = await (prisma as any).liveSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        participants: true,
        invites: true,
        gifts: true
      }
    });

    const payload = await Promise.all(sessions.map((session: any) => buildSessionPayload(session, null)));
    return ok(res, payload.filter(Boolean));
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    return fail(res, 500, error?.message || 'Failed to load live sessions.');
  }
};

export const endLiveAdminSession = async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    if (!sessionId) return fail(res, 400, 'Session ID is required.');

    await ensureLiveSchema();
    const session = await fetchSessionById(sessionId);
    if (!session) return fail(res, 404, 'Livestream session not found.');

    const endedAt = new Date();
    await (prisma as any).liveSession.update({
      where: { id: sessionId },
      data: { status: 'ENDED', endedAt }
    });
    await (prisma as any).liveParticipant.updateMany({
      where: {
        sessionId,
        OR: [{ leftAt: null }, { status: { in: ['INVITED', 'JOINED'] } }]
      },
      data: {
        status: 'LEFT',
        leftAt: endedAt
      }
    });
    const payload = await buildSessionPayload(await fetchSessionById(sessionId), null);
    emitLiveEvent(req, 'live:ended', { session: payload, sessionId }, { sessionId });
    return ok(res, payload);
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    return fail(res, 500, error?.message || 'Failed to force-end livestream.');
  }
};

export const getLiveAdminReports = async (req: Request, res: Response) => {
  try {
    await ensureLiveSchema();
    const status = String(req.query?.status || '').trim().toUpperCase();
    const limit = Math.max(1, Math.min(300, toInt(req.query?.limit, 120)));

    const where: any = {};
    if (status) where.status = status;

    const reports = await (prisma as any).liveReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    return ok(res, reports);
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    return fail(res, 500, error?.message || 'Failed to load live reports.');
  }
};

export const resolveLiveAdminReport = async (req: Request, res: Response) => {
  try {
    const reportId = String(req.params.id || '').trim();
    const statusRaw = String(req.body?.status || 'RESOLVED').trim().toUpperCase();
    const reviewedById = resolveUserId(req) || null;
    if (!reportId) return fail(res, 400, 'Report ID is required.');

    await ensureLiveSchema();
    const report = await (prisma as any).liveReport.update({
      where: { id: reportId },
      data: {
        status: statusRaw || 'RESOLVED',
        reviewedById,
        reviewedAt: new Date(),
        note: String(req.body?.note || '').trim() || null
      }
    });
    return ok(res, report);
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    return fail(res, 500, error?.message || 'Failed to resolve report.');
  }
};

const parseRestrictionType = (value: any): 'LIVE_SUSPEND' | 'LIVE_BAN' | null => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'LIVE_BAN') return 'LIVE_BAN';
  if (normalized === 'LIVE_SUSPEND') return 'LIVE_SUSPEND';
  return null;
};

const sanitizeRestrictionReason = (value: any) => {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.slice(0, 1000);
};

const sanitizeRestrictionDurationMinutes = (value: any) => {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 60;
  return Math.max(5, Math.min(60 * 24 * 30, Math.trunc(raw)));
};

export const getLiveAdminRestrictions = async (req: Request, res: Response) => {
  try {
    await ensureLiveSchema();
    const userId = String(req.query?.userId || '').trim();
    const status = String(req.query?.status || 'active').trim().toLowerCase();
    const type = parseRestrictionType(req.query?.type);
    const limit = Math.max(1, Math.min(300, toInt(req.query?.limit, 120)));

    const where: any = {
      type: { in: Array.from(LIVE_RESTRICTION_TYPES) }
    };
    if (userId) where.userId = userId;
    if (type) where.type = type;
    if (status === 'resolved') {
      where.resolvedAt = { not: null };
    } else if (status !== 'all') {
      where.resolvedAt = null;
    }

    const rows = await (prisma as any).accountViolation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    const userMap = await fetchUsers(rows.map((row: any) => String(row?.userId || '')));
    const payload = rows.map((row: any) => ({
      id: String(row?.id || ''),
      userId: String(row?.userId || ''),
      type: String(row?.type || '').toUpperCase(),
      reason: String(row?.reason || '').trim() || null,
      metadata: row?.metadata || {},
      createdAt: row?.createdAt || null,
      resolvedAt: row?.resolvedAt || null,
      user: mapUserPreview(userMap, String(row?.userId || ''))
    }));
    return ok(res, payload);
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('getLiveAdminRestrictions error:', error);
    return fail(res, 500, error?.message || 'Failed to load live restrictions.');
  }
};

export const restrictLiveAdminUser = async (req: Request, res: Response) => {
  try {
    await ensureLiveSchema();
    const targetUserId = String(req.params.id || req.body?.userId || '').trim();
    if (!targetUserId) return fail(res, 400, 'Target user ID is required.', 'LIVE_USER_REQUIRED');

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true }
    });
    if (!targetUser) return fail(res, 404, 'Target user was not found.', 'LIVE_USER_NOT_FOUND');

    const actorUserId = resolveUserId(req) || null;
    const reason = sanitizeRestrictionReason(req.body?.reason);
    const minutes = sanitizeRestrictionDurationMinutes(req.body?.minutes ?? req.body?.durationMinutes);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + minutes * 60 * 1000);

    await (prisma as any).accountViolation.updateMany({
      where: {
        userId: targetUserId,
        type: 'LIVE_SUSPEND',
        resolvedAt: null
      },
      data: {
        resolvedAt: now
      }
    });

    const created = await (prisma as any).accountViolation.create({
      data: {
        userId: targetUserId,
        type: 'LIVE_SUSPEND',
        severity: 'high',
        reason,
        metadata: {
          expiresAt: expiresAt.toISOString(),
          issuedBy: actorUserId,
          issuedAt: now.toISOString()
        }
      }
    });

    emitLiveEvent(req, 'live:restriction_updated', {
      userId: targetUserId,
      restriction: {
        id: String(created?.id || ''),
        type: 'LIVE_SUSPEND',
        reason: reason || null,
        expiresAt: expiresAt.toISOString(),
        resolvedAt: null
      }
    }, { userIds: [targetUserId] });

    return ok(res, {
      id: String(created?.id || ''),
      userId: targetUserId,
      type: 'LIVE_SUSPEND',
      reason: reason || null,
      expiresAt: expiresAt.toISOString(),
      resolvedAt: null
    });
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('restrictLiveAdminUser error:', error);
    return fail(res, 500, error?.message || 'Failed to restrict livestream privileges.');
  }
};

export const banLiveAdminUser = async (req: Request, res: Response) => {
  try {
    await ensureLiveSchema();
    const targetUserId = String(req.params.id || req.body?.userId || '').trim();
    if (!targetUserId) return fail(res, 400, 'Target user ID is required.', 'LIVE_USER_REQUIRED');

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true }
    });
    if (!targetUser) return fail(res, 404, 'Target user was not found.', 'LIVE_USER_NOT_FOUND');

    const actorUserId = resolveUserId(req) || null;
    const reason = sanitizeRestrictionReason(req.body?.reason);
    const now = new Date();

    await (prisma as any).accountViolation.updateMany({
      where: {
        userId: targetUserId,
        type: { in: ['LIVE_SUSPEND', 'LIVE_BAN'] },
        resolvedAt: null
      },
      data: {
        resolvedAt: now
      }
    });

    const created = await (prisma as any).accountViolation.create({
      data: {
        userId: targetUserId,
        type: 'LIVE_BAN',
        severity: 'critical',
        reason,
        metadata: {
          issuedBy: actorUserId,
          issuedAt: now.toISOString()
        }
      }
    });

    emitLiveEvent(req, 'live:restriction_updated', {
      userId: targetUserId,
      restriction: {
        id: String(created?.id || ''),
        type: 'LIVE_BAN',
        reason: reason || null,
        expiresAt: null,
        resolvedAt: null
      }
    }, { userIds: [targetUserId] });

    return ok(res, {
      id: String(created?.id || ''),
      userId: targetUserId,
      type: 'LIVE_BAN',
      reason: reason || null,
      resolvedAt: null
    });
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('banLiveAdminUser error:', error);
    return fail(res, 500, error?.message || 'Failed to ban livestream privileges.');
  }
};

export const clearLiveAdminRestriction = async (req: Request, res: Response) => {
  try {
    await ensureLiveSchema();
    const targetUserId = String(req.params.id || req.body?.userId || '').trim();
    if (!targetUserId) return fail(res, 400, 'Target user ID is required.', 'LIVE_USER_REQUIRED');
    const type = parseRestrictionType(req.body?.type);
    const now = new Date();

    const where: any = {
      userId: targetUserId,
      resolvedAt: null,
      type: { in: Array.from(LIVE_RESTRICTION_TYPES) }
    };
    if (type) where.type = type;

    const result = await (prisma as any).accountViolation.updateMany({
      where,
      data: {
        resolvedAt: now
      }
    });

    emitLiveEvent(req, 'live:restriction_updated', {
      userId: targetUserId,
      restriction: {
        type: type || 'ALL',
        resolvedAt: now.toISOString()
      }
    }, { userIds: [targetUserId] });

    return ok(res, {
      userId: targetUserId,
      type: type || 'ALL',
      resolvedCount: Number(result?.count || 0),
      resolvedAt: now.toISOString()
    });
  } catch (error: any) {
    if (error?.code === 'LIVE_SCHEMA_MISSING' || isLiveSchemaMissingError(error)) {
      return fail(
        res,
        503,
        'Livestream module tables are not ready. Run the latest backend migration.',
        'LIVE_SCHEMA_MISSING'
      );
    }
    console.error('clearLiveAdminRestriction error:', error);
    return fail(res, 500, error?.message || 'Failed to clear livestream restriction.');
  }
};
