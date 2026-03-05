import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import gcoinService from '../services/gcoinService';
import {
  getLiveConfigFallback,
  getOrCreateLiveConfig,
  isLiveSchemaMissingError,
  resolveLiveParticipantLimit,
  updateLiveConfig
} from '../services/live.service';

const LIVE_VISIBILITIES = new Set(['public', 'network', 'followers', 'private']);
const LIVE_REACTION_TYPES = new Set(['like', 'love']);

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
    metadata: session.metadata || {},
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

    const config = await ensureLiveSchema();
    if (!config.enabled) {
      return fail(res, 403, 'Livestreaming is disabled by admin.', 'LIVE_DISABLED');
    }

    const visibility = normalizeVisibility(req.body?.visibility, config.defaultVisibility || 'public');
    const title = String(req.body?.title || '').trim() || null;
    const description = String(req.body?.description || '').trim() || null;
    const roomName = String(req.body?.roomName || '').trim() || `live-${Date.now()}`;

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
        metadata: req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {}
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

    const payload = await buildSessionPayload(await fetchSessionById(sessionId), userId);
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

export const inviteLiveParticipant = async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    const inviterId = resolveUserId(req);
    const role = resolveRole(req);
    if (!inviterId) return fail(res, 401, 'Unauthorized', 'UNAUTHORIZED');
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
