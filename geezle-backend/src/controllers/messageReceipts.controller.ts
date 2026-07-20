/**
 * Phase 22.3 — batch delivery/read receipt watermarks.
 */
import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { advanceWatermark, toEpoch } from '../services/messaging/receiptPolicy';

const resolveUserId = (req: Request) => {
  const id = req.user?.id;
  return typeof id === 'string' && id.length ? id : '';
};

const emitToUser = (req: Request, userId: string, event: string, payload: any) => {
  try {
    const io = (req as any).app?.get?.('io') || (global as any).io;
    if (!io || !userId) return;
    const communityNs = typeof io.of === 'function' ? io.of('/community') : null;
    if (communityNs) {
      communityNs.to(`community:user:${userId}`).emit(event, payload);
    }
    io.to?.(`user:${userId}`)?.emit?.(event, payload);
  } catch {
    /* best-effort realtime */
  }
};

/**
 * POST /messages/conversations/:id/receipts
 * body: {
 *   deliveredAt?: ISO,
 *   readAt?: ISO,
 *   deliveredUpToMessageId?: string,
 *   readUpToMessageId?: string
 * }
 */
export const postConversationReceipts = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    if (!conversationId) return res.status(400).json({ success: false, error: 'conversationId required' });

    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } }
    });
    if (!participant || participant.deletedAt) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    let deliveredCandidate: Date | null = null;
    let readCandidate: Date | null = null;

    if (req.body?.deliveredAt) deliveredCandidate = new Date(String(req.body.deliveredAt));
    if (req.body?.readAt) readCandidate = new Date(String(req.body.readAt));

    const deliveredMsgId = String(req.body?.deliveredUpToMessageId || '').trim();
    const readMsgId = String(req.body?.readUpToMessageId || '').trim();
    if (deliveredMsgId || readMsgId) {
      const ids = [deliveredMsgId, readMsgId].filter(Boolean);
      const messages = await prisma.directMessage.findMany({
        where: { id: { in: ids }, conversationId },
        select: { id: true, createdAt: true }
      });
      const byId = new Map(messages.map((m) => [m.id, m.createdAt]));
      if (deliveredMsgId && byId.has(deliveredMsgId)) {
        deliveredCandidate = byId.get(deliveredMsgId) || deliveredCandidate;
      }
      if (readMsgId && byId.has(readMsgId)) {
        readCandidate = byId.get(readMsgId) || readCandidate;
      }
    }

    // Read implies delivered
    if (readCandidate && (!deliveredCandidate || readCandidate.getTime() > deliveredCandidate.getTime())) {
      deliveredCandidate = readCandidate;
    }

    const nextDelivered = advanceWatermark((participant as any).lastDeliveredAt, deliveredCandidate);
    const nextRead = advanceWatermark(participant.lastReadAt, readCandidate);

    const data: any = {};
    if (nextDelivered) {
      const cur = toEpoch((participant as any).lastDeliveredAt);
      if (cur == null || nextDelivered.getTime() > cur) data.lastDeliveredAt = nextDelivered;
    }
    if (nextRead) {
      const cur = toEpoch(participant.lastReadAt);
      if (cur == null || nextRead.getTime() > cur) data.lastReadAt = nextRead;
    }

    if (!Object.keys(data).length) {
      return res.json({
        success: true,
        data: {
          conversationId,
          lastDeliveredAt: (participant as any).lastDeliveredAt || null,
          lastReadAt: participant.lastReadAt || null,
          unchanged: true
        }
      });
    }

    let updated: any;
    try {
      updated = await prisma.conversationParticipant.update({
        where: { id: participant.id },
        data
      });
    } catch {
      // lastDeliveredAt column may not exist yet — fall back to lastReadAt only
      if (data.lastReadAt) {
        updated = await prisma.conversationParticipant.update({
          where: { id: participant.id },
          data: { lastReadAt: data.lastReadAt }
        });
      } else {
        return res.json({ success: true, data: { conversationId, unchanged: true, schemaPending: true } });
      }
    }

    // Fan-out to other participants (throttled payload, watermark only)
    const others = await prisma.conversationParticipant.findMany({
      where: { conversationId, deletedAt: null, userId: { not: userId } },
      select: { userId: true }
    });
    const payload = {
      conversationId,
      userId,
      lastDeliveredAt: (updated as any).lastDeliveredAt
        ? new Date((updated as any).lastDeliveredAt).toISOString()
        : null,
      lastReadAt: updated.lastReadAt ? new Date(updated.lastReadAt).toISOString() : null,
      version: '22.3'
    };

    // Phase 22.3B — do not disclose read watermark to peers when user disabled read receipts
    let discloseRead = true;
    try {
      const { getMessagingPrivacySettings } = await import('../services/messaging/messagingPrivacyPolicy');
      const privacy = await getMessagingPrivacySettings(userId);
      discloseRead = privacy.readReceiptsEnabled !== false;
    } catch {
      discloseRead = true;
    }
    const peerPayload = discloseRead
      ? payload
      : {
          ...payload,
          lastReadAt: null,
          readHidden: true
        };

    others.forEach((row) => {
      emitToUser(req, row.userId, 'messages:receipts', peerPayload);
    });
    // Self multi-tab sync always gets full watermarks
    emitToUser(req, userId, 'messages:receipts', payload);

    return res.json({ success: true, data: payload });
  } catch (e: any) {
    console.error('postConversationReceipts', e);
    return res.status(500).json({ success: false, error: e?.message || 'Failed to update receipts' });
  }
};
