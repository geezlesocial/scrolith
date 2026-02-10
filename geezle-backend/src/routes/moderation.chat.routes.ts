import express, { Request } from 'express';
import prisma from '../utils/prismaClient';
import { authMiddleware } from '../middleware/auth.middleware';
import { requirePermission, resolveStaffContext, staffOnlyMiddleware } from '../middleware/rbac.middleware';
import { ensureAdminStaffProfile, isAdminRole } from '../services/rbac.service';

const router = express.Router();

const messageRateWindowMs = 60_000;
const messageRateMax = 10;
const messageRateMap = new Map<string, number[]>();
const MESSAGE_RECORDS_POLICY_SCOPE = 'message_records_policy';

const normalizeText = (value: unknown) => String(value || '').trim();
const isReplyFeatureUnsupportedError = (error: any) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  const normalized = message.replace(/\s+/g, ' ').toLowerCase();
  return (
    code === 'P2022' ||
    message.includes('Unknown field `replyToMessage`') ||
    message.includes('Unknown argument `replyToMessage`') ||
    message.includes('Unknown argument `replyToMessageId`') ||
    message.includes('Unknown field `replyToMessageId`') ||
    (normalized.includes('replytomessage') &&
      (normalized.includes('unknown field') || normalized.includes('unknown argument'))) ||
    (normalized.includes('replytomessageid') &&
      (normalized.includes('unknown field') || normalized.includes('unknown argument') || normalized.includes('does not exist')))
  );
};

const normalizeRetentionMonths = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 72;
  return Math.max(6, Math.min(240, Math.round(parsed)));
};

const getRetentionPolicy = async () => {
  const fallback = { retentionMonths: 72, retentionYears: 6, updatedAt: null as string | null };
  try {
    const row = await prisma.appSetting.findUnique({ where: { scope: MESSAGE_RECORDS_POLICY_SCOPE } });
    if (!row || typeof row.data !== 'object' || row.data === null) return fallback;
    const data = row.data as any;
    const retentionMonths = normalizeRetentionMonths(data.retentionMonths ?? data.retention_months ?? 72);
    return {
      retentionMonths,
      retentionYears: Number((retentionMonths / 12).toFixed(2)),
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null
    };
  } catch {
    return fallback;
  }
};

const buildRecordsWhere = (params: {
  conversationId?: string;
  action?: string;
  actorId?: string;
  from?: string;
  to?: string;
  search?: string;
}) => {
  const where: any = {};
  if (params.conversationId) where.conversationId = params.conversationId;
  if (params.action) where.action = params.action.toUpperCase();
  if (params.actorId) where.actorUserId = params.actorId;
  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) where.createdAt.gte = new Date(params.from);
    if (params.to) where.createdAt.lte = new Date(params.to);
  }
  if (params.search) {
    const q = params.search;
    where.OR = [
      { beforeText: { contains: q, mode: 'insensitive' as const } },
      { afterText: { contains: q, mode: 'insensitive' as const } },
      { action: { contains: q, mode: 'insensitive' as const } }
    ];
  }
  return where;
};

const emitToUser = (req: Request, userId: string, event: string, payload: any) => {
  try {
    const ns = req.app.get('communityNs');
    if (ns && typeof ns.to === 'function') {
      ns.to(`community:user:${userId}`).emit(event, payload);
    }
  } catch (error) {
    console.warn('[moderation-chat] emit failed', error);
  }
};

const enforceMessageRateLimit = (bucketId: string) => {
  const now = Date.now();
  const timestamps = (messageRateMap.get(bucketId) || []).filter((entry) => now - entry <= messageRateWindowMs);
  if (timestamps.length >= messageRateMax) return false;
  timestamps.push(now);
  messageRateMap.set(bucketId, timestamps);
  return true;
};

const writeAuditLog = async (
  req: Request,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata?: Record<string, any>
) => {
  try {
    const context = await resolveStaffContext(req);
    let staffId = context?.staffId;
    if (!staffId && isAdminRole(req.user?.role)) {
      staffId = await ensureAdminStaffProfile(String(req.user?.id || ''));
    }
    if (!staffId) return;
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    await prisma.moderationAuditLog.create({
      data: {
        staffId,
        action,
        targetType,
        targetId: targetId || null,
        metadata: metadata || null,
        ipAddress: forwarded || req.ip || null,
        userAgent: String(req.headers['user-agent'] || '')
      }
    });
  } catch (error) {
    console.warn('[moderation-chat] audit log failed', error);
  }
};

router.use(authMiddleware, staffOnlyMiddleware);

router.get('/conversations', requirePermission('chat.read_any'), async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const skip = (page - 1) * limit;
    const search = normalizeText(req.query.search).toLowerCase();

    const where = search
      ? {
          participants: {
            some: {
              user: {
                OR: [
                  { name: { contains: search, mode: 'insensitive' as const } },
                  { email: { contains: search, mode: 'insensitive' as const } },
                  { username: { contains: search, mode: 'insensitive' as const } }
                ]
              }
            }
          }
        }
      : undefined;

    const [total, conversations] = await Promise.all([
      prisma.conversation.count({ where }),
      prisma.conversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  username: true,
                  avatar: true,
                  role: true
                }
              }
            }
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      })
    ]);

    const items = conversations.map((conversation) => ({
      id: conversation.id,
      type: conversation.type,
      updatedAt: conversation.updatedAt,
      lastMessageAt: conversation.lastMessageAt || conversation.updatedAt,
      lastMessageText: conversation.lastMessageText || conversation.messages[0]?.text || '',
      participants: conversation.participants.map((participant) => ({
        userId: participant.userId,
        name: participant.user?.name || participant.user?.email || 'User',
        email: participant.user?.email || '',
        username: participant.user?.username || '',
        avatar: participant.user?.avatar || '',
        role: participant.user?.role || 'USER'
      }))
    }));

    await writeAuditLog(req, 'CHAT_LIST_VIEWED', 'conversation', null, { page, limit, search, total });

    return res.json({
      success: true,
      data: {
        items,
        page,
        limit,
        total,
        hasMore: skip + items.length < total
      }
    });
  } catch (error) {
    console.error('[moderation-chat] list conversations failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load conversations', code: 'ERR_INTERNAL' });
  }
});

router.get('/conversations/:id/messages', requirePermission('chat.read_any'), async (req, res) => {
  try {
    const conversationId = req.params.id;
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 200), 1), 500);
    const skip = (page - 1) * limit;
    let conversation: any = null;
    try {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  username: true,
                  avatar: true,
                  role: true
                }
              }
            }
          },
          messages: {
            orderBy: { createdAt: 'asc' },
            skip,
            take: limit,
            include: {
              reactions: true,
              replyToMessage: {
                select: {
                  id: true,
                  senderId: true,
                  text: true,
                  deletedAt: true
                }
              },
              sender: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  username: true,
                  avatar: true
                }
              }
            }
          }
        }
      });
    } catch (error: any) {
      if (!isReplyFeatureUnsupportedError(error)) throw error;
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  username: true,
                  avatar: true,
                  role: true
                }
              }
            }
          },
          messages: {
            orderBy: { createdAt: 'asc' },
            skip,
            take: limit,
            include: {
              reactions: true,
              sender: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  username: true,
                  avatar: true
                }
              }
            }
          }
        }
      });
    }

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found', code: 'NOT_FOUND' });
    }

    const total = await prisma.directMessage.count({
      where: { conversationId }
    });

    const messageItems = conversation.messages.map((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      sender: {
        id: message.sender?.id || message.senderId,
        name: message.sender?.name || message.sender?.email || 'User',
        email: message.sender?.email || '',
        username: message.sender?.username || '',
        avatar: message.sender?.avatar || ''
      },
      text: message.text,
      attachments: Array.isArray(message.attachments) ? message.attachments : [],
      createdAt: message.createdAt.toISOString(),
      isSystem: Boolean(message.isSystem),
      replyToMessageId: message.replyToMessageId || null,
      replyToMessage: message.replyToMessage
        ? {
            id: message.replyToMessage.id,
            senderId: message.replyToMessage.senderId,
            text: message.replyToMessage.deletedAt ? 'Message unavailable' : message.replyToMessage.text
          }
        : null,
      reactions: message.reactions.map((reaction) => ({
        userId: reaction.userId,
        emoji: reaction.emoji,
        createdAt: reaction.createdAt.toISOString()
      }))
    }));

    await writeAuditLog(req, 'CHAT_VIEWED', 'conversation', conversationId, {
      messageCount: messageItems.length,
      page,
      limit
    });

    return res.json({
      success: true,
      data: {
        id: conversation.id,
        type: conversation.type,
        participants: conversation.participants.map((participant) => ({
          userId: participant.userId,
          name: participant.user?.name || participant.user?.email || 'User',
          email: participant.user?.email || '',
          username: participant.user?.username || '',
          avatar: participant.user?.avatar || '',
          role: participant.user?.role || 'USER'
        })),
        messages: messageItems,
        items: messageItems,
        page,
        limit,
        total,
        hasMore: skip + messageItems.length < total
      }
    });
  } catch (error) {
    console.error('[moderation-chat] read conversation failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load conversation', code: 'ERR_INTERNAL' });
  }
});

router.post('/conversations/:id/message', requirePermission('chat.message_any'), async (req, res) => {
  try {
    const senderId = req.user?.id;
    if (!senderId) {
      return res.status(401).json({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const context = await resolveStaffContext(req);
    const bucketId = context?.staffId || senderId;
    if (!enforceMessageRateLimit(bucketId)) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded for moderator messages',
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }

    const conversationId = req.params.id;
    const messageType = normalizeText(req.body?.type || 'MODERATOR_WARNING').toUpperCase();
    const rawMessage = normalizeText(req.body?.message);
    if (!rawMessage) {
      return res.status(400).json({ success: false, error: 'Message is required', code: 'VALIDATION_ERROR' });
    }

    const canWarn = Boolean(context?.isAdmin || context?.permissions.has('chat.warn_user'));
    if (messageType === 'MODERATOR_WARNING' && !canWarn) {
      return res.status(403).json({ success: false, error: 'Missing permission: chat.warn_user', code: 'FORBIDDEN' });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: true
      }
    });
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found', code: 'NOT_FOUND' });
    }

    const messageText =
      messageType === 'MODERATOR_WARNING' ? `[Moderator Warning] ${rawMessage}` : `[Moderator] ${rawMessage}`;

    const message = await prisma.directMessage.create({
      data: {
        conversationId,
        senderId,
        text: messageText,
        isSystem: true
      }
    });

    try {
      const repo = (prisma as any).directMessageRecord;
      if (repo?.create) {
        await repo.create({
          data: {
            messageId: message.id,
            conversationId,
            action: 'CREATED',
            actorUserId: senderId,
            targetUserId: null,
            beforeText: null,
            afterText: messageText,
            beforeAttachments: [],
            afterAttachments: [],
            metadata: { source: 'moderator_console', messageType }
          }
        });
      }
    } catch (error) {
      console.warn('[moderation-chat] failed to record moderator message audit row', error);
    }

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageText: message.text,
        lastMessageAt: message.createdAt,
        lastMessageSenderId: senderId,
        updatedAt: new Date()
      }
    });

    const payload = {
      id: message.id,
      conversation_id: conversationId,
      conversationId,
      sender_id: senderId,
      senderId,
      text: message.text,
      timestamp: message.createdAt.toISOString(),
      is_read: false,
      isRead: false,
      is_system: true,
      isSystem: true,
      message_type: messageType,
      messageType,
      sender_role: req.user?.role || 'moderator',
      senderRole: req.user?.role || 'moderator'
    };

    const participantIds = conversation.participants.map((participant) => participant.userId);
    participantIds.forEach((userId) => emitToUser(req, userId, 'messages:new', payload));

    await writeAuditLog(req, 'CHAT_MESSAGE_SENT', 'conversation', conversationId, {
      messageId: message.id,
      messageType,
      participantIds
    });

    return res.status(201).json({ success: true, data: payload });
  } catch (error) {
    console.error('[moderation-chat] send message failed', error);
    return res.status(500).json({ success: false, error: 'Failed to send moderator message', code: 'ERR_INTERNAL' });
  }
});

router.get('/audit', requirePermission('chat.audit.read'), async (req, res) => {
  try {
    const conversationId = normalizeText(req.query.conversationId);
    const staffId = normalizeText(req.query.staffId);
    const dateFrom = normalizeText(req.query.dateFrom);
    const dateTo = normalizeText(req.query.dateTo);
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const skip = (page - 1) * limit;

    const where: any = {
      targetType: 'conversation'
    };
    if (conversationId) where.targetId = conversationId;
    if (staffId) where.staffId = staffId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [total, rows] = await Promise.all([
      prisma.moderationAuditLog.count({ where }),
      prisma.moderationAuditLog.findMany({
        where,
        include: {
          staff: {
            include: {
              role: { select: { id: true, name: true } },
              user: { select: { id: true, name: true, email: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      })
    ]);

    return res.json({
      success: true,
      data: {
        items: rows.map((row) => ({
          id: row.id,
          action: row.action,
          targetType: row.targetType,
          targetId: row.targetId,
          metadata: row.metadata || null,
          ipAddress: row.ipAddress || null,
          userAgent: row.userAgent || null,
          createdAt: row.createdAt.toISOString(),
          staff: {
            id: row.staffId,
            roleId: row.staff.roleId,
            roleName: row.staff.role?.name || '',
            userId: row.staff.userId,
            name: row.staff.user?.name || row.staff.fullName,
            email: row.staff.user?.email || row.staff.email
          }
        })),
        page,
        limit,
        total,
        hasMore: skip + rows.length < total
      }
    });
  } catch (error) {
    console.error('[moderation-chat] audit list failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load audit logs', code: 'ERR_INTERNAL' });
  }
});

router.get('/records', requirePermission('chat.records.read'), async (req, res) => {
  try {
    const conversationId = normalizeText(req.query.conversationId);
    const action = normalizeText(req.query.action);
    const actorId = normalizeText(req.query.actorId);
    const from = normalizeText(req.query.dateFrom);
    const to = normalizeText(req.query.dateTo);
    const search = normalizeText(req.query.search);
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const skip = (page - 1) * limit;

    const where = buildRecordsWhere({ conversationId, action, actorId, from, to, search });

    const repo = (prisma as any).directMessageRecord;
    if (!repo) {
      return res.json({ success: true, data: { items: [], page, limit, total: 0, hasMore: false } });
    }

    const [total, rows] = await Promise.all([
      repo.count({ where }),
      repo.findMany({
        where,
        include: {
          actorUser: { select: { id: true, name: true, email: true, username: true, avatar: true } },
          targetUser: { select: { id: true, name: true, email: true, username: true, avatar: true } },
          message: {
            select: {
              id: true,
              senderId: true,
              text: true,
              createdAt: true,
              editedAt: true,
              deletedAt: true
            }
          },
          conversation: {
            select: {
              id: true,
              type: true,
              participants: {
                include: {
                  user: { select: { id: true, name: true, email: true, username: true, avatar: true, role: true } }
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      })
    ]);

    await writeAuditLog(req, 'CHAT_RECORDS_VIEWED', 'conversation', conversationId || null, {
      action: action || null,
      actorId: actorId || null,
      page,
      limit,
      total
    });

    return res.json({
      success: true,
      data: {
        items: rows.map((row: any) => ({
          id: row.id,
          action: row.action,
          conversationId: row.conversationId,
          messageId: row.messageId,
          beforeText: row.beforeText || '',
          afterText: row.afterText || '',
          beforeAttachments: Array.isArray(row.beforeAttachments) ? row.beforeAttachments : [],
          afterAttachments: Array.isArray(row.afterAttachments) ? row.afterAttachments : [],
          metadata: row.metadata || null,
          createdAt: row.createdAt ? row.createdAt.toISOString() : null,
          actorUser: row.actorUser
            ? {
                id: row.actorUser.id,
                name: row.actorUser.name || row.actorUser.email || 'User',
                email: row.actorUser.email || '',
                username: row.actorUser.username || '',
                avatar: row.actorUser.avatar || ''
              }
            : null,
          targetUser: row.targetUser
            ? {
                id: row.targetUser.id,
                name: row.targetUser.name || row.targetUser.email || 'User',
                email: row.targetUser.email || '',
                username: row.targetUser.username || '',
                avatar: row.targetUser.avatar || ''
              }
            : null,
          message: row.message
            ? {
                id: row.message.id,
                senderId: row.message.senderId,
                text: row.message.text,
                createdAt: row.message.createdAt ? row.message.createdAt.toISOString() : null,
                editedAt: row.message.editedAt ? row.message.editedAt.toISOString() : null,
                deletedAt: row.message.deletedAt ? row.message.deletedAt.toISOString() : null
              }
            : null,
          conversation: {
            id: row.conversation?.id,
            type: row.conversation?.type,
            participants: Array.isArray(row.conversation?.participants)
              ? row.conversation.participants.map((participant: any) => ({
                  userId: participant.userId,
                  name: participant.user?.name || participant.user?.email || 'User',
                  email: participant.user?.email || '',
                  username: participant.user?.username || '',
                  avatar: participant.user?.avatar || '',
                  role: participant.user?.role || 'USER'
                }))
              : []
          }
        })),
        page,
        limit,
        total,
        hasMore: skip + rows.length < total
      }
    });
  } catch (error) {
    console.error('[moderation-chat] message records list failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load message records', code: 'ERR_INTERNAL' });
  }
});

router.get('/records/export', requirePermission('chat.records.export'), async (req, res) => {
  try {
    const conversationId = normalizeText(req.query.conversationId);
    const action = normalizeText(req.query.action);
    const actorId = normalizeText(req.query.actorId);
    const from = normalizeText(req.query.dateFrom);
    const to = normalizeText(req.query.dateTo);
    const search = normalizeText(req.query.search);
    const format = normalizeText(req.query.format).toLowerCase() === 'json' ? 'json' : 'csv';

    const where = buildRecordsWhere({ conversationId, action, actorId, from, to, search });
    const repo = (prisma as any).directMessageRecord;
    if (!repo) {
      return res.status(200).send(format === 'json' ? '[]' : 'id,action,conversationId,messageId,createdAt\n');
    }

    const rows = await repo.findMany({
      where,
      include: {
        actorUser: { select: { id: true, name: true, email: true, username: true } },
        targetUser: { select: { id: true, name: true, email: true, username: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 5000
    });

    await writeAuditLog(req, 'CHAT_RECORDS_EXPORTED', 'conversation', conversationId || null, {
      action: action || null,
      actorId: actorId || null,
      format,
      total: rows.length
    });

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=\"message-records-${Date.now()}.json\"`);
      return res.status(200).send(
        JSON.stringify(
          rows.map((row: any) => ({
            id: row.id,
            action: row.action,
            conversationId: row.conversationId,
            messageId: row.messageId,
            beforeText: row.beforeText || '',
            afterText: row.afterText || '',
            metadata: row.metadata || null,
            createdAt: row.createdAt ? row.createdAt.toISOString() : null,
            actorUser: row.actorUser || null,
            targetUser: row.targetUser || null
          })),
          null,
          2
        )
      );
    }

    const escapeCsv = (value: any) => {
      const text = String(value ?? '');
      if (text.includes('"') || text.includes(',') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const header = [
      'id',
      'action',
      'conversationId',
      'messageId',
      'actorName',
      'actorEmail',
      'targetName',
      'targetEmail',
      'beforeText',
      'afterText',
      'createdAt'
    ].join(',');

    const lines = rows.map((row: any) =>
      [
        row.id,
        row.action,
        row.conversationId,
        row.messageId || '',
        row.actorUser?.name || row.actorUser?.username || '',
        row.actorUser?.email || '',
        row.targetUser?.name || row.targetUser?.username || '',
        row.targetUser?.email || '',
        row.beforeText || '',
        row.afterText || '',
        row.createdAt ? row.createdAt.toISOString() : ''
      ]
        .map(escapeCsv)
        .join(',')
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=\"message-records-${Date.now()}.csv\"`);
    return res.status(200).send([header, ...lines].join('\n'));
  } catch (error) {
    console.error('[moderation-chat] message records export failed', error);
    return res.status(500).json({ success: false, error: 'Failed to export message records', code: 'ERR_INTERNAL' });
  }
});

router.get('/records/retention', requirePermission('chat.records.read'), async (_req, res) => {
  const policy = await getRetentionPolicy();
  return res.json({ success: true, data: policy });
});

router.put('/records/retention', requirePermission('chat.retention.manage'), async (req, res) => {
  try {
    const retentionMonths = normalizeRetentionMonths(req.body?.retentionMonths ?? req.body?.retention_months);
    const retentionYears = Number((retentionMonths / 12).toFixed(2));
    await prisma.appSetting.upsert({
      where: { scope: MESSAGE_RECORDS_POLICY_SCOPE },
      create: {
        scope: MESSAGE_RECORDS_POLICY_SCOPE,
        data: {
          retentionMonths,
          retentionYears
        }
      },
      update: {
        data: {
          retentionMonths,
          retentionYears
        }
      }
    });

    await writeAuditLog(req, 'CHAT_RETENTION_UPDATED', 'settings', MESSAGE_RECORDS_POLICY_SCOPE, {
      retentionMonths,
      retentionYears
    });

    return res.json({
      success: true,
      data: {
        retentionMonths,
        retentionYears
      }
    });
  } catch (error) {
    console.error('[moderation-chat] message retention update failed', error);
    return res.status(500).json({ success: false, error: 'Failed to update message retention policy', code: 'ERR_INTERNAL' });
  }
});

export default router;
