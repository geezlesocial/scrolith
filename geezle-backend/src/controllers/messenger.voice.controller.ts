import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { syncFileUsages } from '../utils/fileUsage';
import { dispatchMessageReceiptNotifications } from '../services/messageNotifications';
import {
  getOrCreateMessengerVoiceConfig,
  isVoiceBlockedForUser,
  isMessengerVoiceSchemaMissingError
} from '../services/messengerVoice.service';
import { getMessengerIceClientPayload } from '../services/messaging/messengerCallIce.service';
import {
  mergeCallPolicyIntoPolicyJson,
  resolveGroupCallPolicy
} from '../services/messaging/messengerCallPolicy.service';

const nowIso = () => new Date().toISOString();

const resolveUserId = (req: Request) => {
  const userId = (req as any)?.user?.id;
  if (typeof userId === 'string' && userId.trim()) return userId.trim();
  return String(req.body?.userId || req.query?.userId || '').trim();
};

const resolveRole = (req: Request) => {
  const role = (req as any)?.user?.role;
  if (typeof role === 'string' && role.trim()) return role.trim().toLowerCase();
  return String(req.body?.role || req.query?.role || '').trim().toLowerCase();
};

const isAdminRole = (role: string) => role.includes('admin') || role.includes('moderator') || role.includes('superadmin');

const emitToUser = (req: Request, userId: string, event: string, payload: any) => {
  try {
    const ns = req.app.get('communityNs');
    if (ns && typeof ns.to === 'function') {
      ns.to(`community:user:${userId}`).emit(event, payload);
    }
  } catch (error) {
    console.warn('[messenger-voice] emit failed', error);
  }
};

const toDurationMs = (value: any) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
};

const buildAttachmentFromFile = (file: any) => {
  const mimeType = String(file?.mimeType || '').toLowerCase();
  const type = mimeType.startsWith('audio/') ? 'audio' : mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('image/') ? 'image' : 'document';
  return {
    id: file.id,
    url: file.url,
    name: file.originalName || file.filename || 'Voice note',
    mimeType: file.mimeType,
    type,
    size: Number(file.size || 0)
  };
};

const ensureConversationMember = async (conversationId: string, userId: string) => {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: true
    }
  });

  if (!conversation) return { conversation: null, participantIds: [] as string[] };

  const participantIds = Array.isArray(conversation.participants)
    ? conversation.participants.map((entry: any) => String(entry.userId || '')).filter(Boolean)
    : [];

  const isMember = participantIds.includes(userId);
  if (!isMember) return { conversation: null, participantIds: [] as string[] };

  return { conversation, participantIds };
};

export const postVoiceNoteMessage = async (req: Request, res: Response) => {
  try {
    const conversationId = String(req.params.id || '').trim();
    const senderId = resolveUserId(req);
    const role = resolveRole(req);
    const fileId = String(req.body?.fileId || req.body?.file_id || '').trim();
    const durationMs = toDurationMs(req.body?.durationMs ?? req.body?.duration_ms ?? req.body?.duration ?? 0);

    if (!conversationId) return res.status(400).json({ success: false, error: 'Conversation ID is required.' });
    if (!senderId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!fileId) return res.status(400).json({ success: false, error: 'Voice note fileId is required.' });

    const config = await getOrCreateMessengerVoiceConfig();
    if (!config.enabledVoiceNotes) {
      return res.status(403).json({ success: false, error: 'Voice notes are disabled by admin.' });
    }
    if (isVoiceBlockedForUser(config, senderId)) {
      return res.status(403).json({ success: false, error: 'Voice features are blocked for this account.' });
    }

    const maxDurationMs = Math.max(1000, Number(config.maxVoiceNoteDurationSeconds || 180) * 1000);
    if (!durationMs || durationMs > maxDurationMs) {
      return res.status(400).json({
        success: false,
        error: `Voice note duration must be between 1ms and ${maxDurationMs}ms.`
      });
    }

    const { conversation, participantIds } = await ensureConversationMember(conversationId, senderId);
    if (!conversation) {
      return res.status(403).json({ success: false, error: 'Conversation not found or access denied.' });
    }

    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file) {
      return res.status(404).json({ success: false, error: 'Voice note file not found in uploaded files.' });
    }

    if (file.ownerId && file.ownerId !== senderId && !isAdminRole(role)) {
      return res.status(403).json({ success: false, error: 'You can only send voice notes from your uploaded files.' });
    }

    const messageText = String(req.body?.text || '').trim() || 'Voice note';

    const message = await prisma.directMessage.create({
      data: {
        conversationId,
        senderId,
        text: messageText,
        messageType: 'VOICE_NOTE' as any,
        metadata: {
          voiceNote: {
            fileId,
            durationMs,
            mimeType: file.mimeType || null
          }
        },
        attachments: [fileId]
      },
      include: { reactions: true }
    });

    const voiceNote = await (prisma as any).voiceNote.create({
      data: {
        senderId,
        conversationId,
        messageId: message.id,
        fileId,
        durationMs
      }
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageText: 'Voice note',
        lastMessageAt: new Date(),
        lastMessageSenderId: senderId
      }
    });

    try {
      await Promise.all([
        syncFileUsages('voice_note', String(voiceNote.id || ''), [fileId], 'Voice Note'),
        syncFileUsages('direct_message', String(message.id || ''), [fileId], 'Direct Message Attachment')
      ]);
    } catch (error) {
      console.warn('[messenger-voice] syncFileUsages failed:', (error as any)?.message || error);
    }

    const receiverId = conversation.type === 'DIRECT'
      ? participantIds.find((id) => id !== senderId) || ''
      : '';

    const payload = {
      id: message.id,
      conversation_id: conversationId,
      conversationId,
      sender_id: senderId,
      senderId,
      receiver_id: receiverId,
      receiverId,
      text: messageText,
      timestamp: message.createdAt ? message.createdAt.toISOString() : nowIso(),
      is_read: false,
      isRead: false,
      message_type: 'voice_note',
      messageType: 'voice_note',
      metadata: message.metadata || null,
      voice_note: {
        id: String(voiceNote.id),
        fileId,
        durationMs,
        url: file.url
      },
      voiceNote: {
        id: String(voiceNote.id),
        fileId,
        durationMs,
        url: file.url
      },
      attachments: [buildAttachmentFromFile(file)],
      attachment_ids: [fileId],
      reactions: []
    };

    participantIds
      .filter((id) => id !== senderId)
      .forEach((userId) => emitToUser(req, userId, 'messages:new', payload));

    emitToUser(req, senderId, 'messages:sent', payload);

    void dispatchMessageReceiptNotifications({
      receiverIds: participantIds,
      senderId,
      conversationId,
      messageId: message.id,
      preview: messageText,
      fallbackPreview: 'Sent a voice note',
      messageType: 'voice_note'
    }).catch((notifyError) => {
      console.warn('[messenger-voice] failed to send message notifications', notifyError);
    });

    participantIds.forEach((userId) => {
      emitToUser(req, userId, 'messenger:voice_note_created', {
        callId: null,
        conversationId,
        messageId: message.id,
        voiceNoteId: String(voiceNote.id),
        senderId,
        createdAt: payload.timestamp
      });
    });

    return res.status(201).json({ success: true, data: payload });
  } catch (error: any) {
    if (isMessengerVoiceSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Messenger voice tables are not ready. Run the latest backend migration for voice calls/notes.',
        code: 'MESSENGER_VOICE_SCHEMA_MISSING'
      });
    }
    console.error('postVoiceNoteMessage error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to send voice note.' });
  }
};

export const getVoiceRuntimeConfig = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    const config = await getOrCreateMessengerVoiceConfig();
    const blocked = userId ? isVoiceBlockedForUser(config, userId) : false;
    const ice = getMessengerIceClientPayload({ userId });
    return res.json({
      success: true,
      data: {
        enabledVoiceCalls: Boolean(config.enabledVoiceCalls),
        enabledConferenceCalls: Boolean(config.enabledConferenceCalls),
        enabledVoiceNotes: Boolean(config.enabledVoiceNotes),
        maxParticipants: Number(config.maxParticipants || 20),
        maxVoiceNoteDurationSeconds: Number(config.maxVoiceNoteDurationSeconds || 180),
        blockedForCurrentUser: blocked,
        // ICE/TURN for WebRTC — clients must not hardcode STUN-only.
        iceServers: ice.iceServers,
        iceTransportPolicy: ice.iceTransportPolicy,
        hasTurn: ice.hasTurn,
        turnCredentialMode: ice.turnCredentialMode,
        turnExpiresAt: ice.turnExpiresAt || null
      }
    });
  } catch (error: any) {
    if (isMessengerVoiceSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Messenger voice tables are not ready. Run the latest backend migration for voice calls/notes.',
        code: 'MESSENGER_VOICE_SCHEMA_MISSING'
      });
    }
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load voice runtime config.' });
  }
};

/** Dedicated ICE payload (same data as runtime config.iceServers). Auth required. */
export const getVoiceIceServers = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const ice = getMessengerIceClientPayload({ userId });
    return res.json({ success: true, data: ice });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load ICE servers.' });
  }
};

/**
 * GET group call policy for a conversation (from ConversationSettings.policyJson.callPolicy).
 */
export const getConversationCallPolicy = async (req: Request, res: Response) => {
  try {
    const conversationId = String(req.params.id || '').trim();
    const userId = resolveUserId(req);
    if (!conversationId) return res.status(400).json({ success: false, error: 'Conversation ID is required.' });
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { conversation } = await ensureConversationMember(conversationId, userId);
    if (!conversation) {
      return res.status(403).json({ success: false, error: 'Conversation not found or access denied.' });
    }

    const settings = await (prisma as any).conversationSettings
      .findUnique({ where: { conversationId } })
      .catch(() => null);
    const policy = resolveGroupCallPolicy({
      allowVoice: settings?.allowVoice,
      policyJson: settings?.policyJson,
      permissionOverrides: (conversation as any)?.permissionOverrides
    });
    return res.json({
      success: true,
      data: {
        conversationId,
        conversationType: conversation.type,
        policy
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load call policy.' });
  }
};

/**
 * PATCH group call policy — owner/admin only. Stored in policyJson.callPolicy (no schema break).
 */
export const patchConversationCallPolicy = async (req: Request, res: Response) => {
  try {
    const conversationId = String(req.params.id || '').trim();
    const userId = resolveUserId(req);
    const role = resolveRole(req);
    if (!conversationId) return res.status(400).json({ success: false, error: 'Conversation ID is required.' });
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: true, groupSettings: true }
    });
    if (!conversation) return res.status(404).json({ success: false, error: 'Conversation not found.' });

    const actor = (conversation.participants || []).find(
      (entry: any) => String(entry.userId || '') === userId && !entry.deletedAt
    );
    const actorRole = String((actor as any)?.role || '').toUpperCase();
    const canManage =
      isAdminRole(role) || actorRole === 'OWNER' || actorRole === 'ADMIN';
    if (!canManage) {
      return res.status(403).json({
        success: false,
        error: 'Only group owners and administrators can change call privacy settings.'
      });
    }

    const existing = (conversation as any).groupSettings || null;
    const nextPolicyJson = mergeCallPolicyIntoPolicyJson(existing?.policyJson, req.body?.callPolicy || req.body || {});
    const settings = await (prisma as any).conversationSettings.upsert({
      where: { conversationId },
      create: {
        conversationId,
        policyJson: nextPolicyJson
      },
      update: {
        policyJson: nextPolicyJson
      }
    });

    const policy = resolveGroupCallPolicy({
      allowVoice: settings?.allowVoice,
      policyJson: settings?.policyJson
    });
    return res.json({ success: true, data: { conversationId, policy } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to update call policy.' });
  }
};

export const listVoiceCalls = async (req: Request, res: Response) => {
  try {
    const conversationId = String(req.params.id || '').trim();
    const userId = resolveUserId(req);
    if (!conversationId) return res.status(400).json({ success: false, error: 'Conversation ID is required.' });
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { conversation } = await ensureConversationMember(conversationId, userId);
    if (!conversation) return res.status(403).json({ success: false, error: 'Conversation not found or access denied.' });

    const calls = await (prisma as any).voiceCall.findMany({
      where: { conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, name: true, avatar: true, username: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    const normalized = (calls || []).map((call: any) => {
      const startedAt = call?.startedAt ? new Date(call.startedAt).getTime() : 0;
      const endedAt = call?.endedAt ? new Date(call.endedAt).getTime() : 0;
      const createdAt = call?.createdAt ? new Date(call.createdAt).getTime() : 0;
      const baseline = startedAt || createdAt;
      const durationMs = baseline && endedAt && endedAt > baseline ? Math.max(0, endedAt - baseline) : 0;
      return {
        ...call,
        durationMs
      };
    });

    return res.json({ success: true, data: normalized });
  } catch (error: any) {
    if (isMessengerVoiceSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Messenger voice tables are not ready. Run the latest backend migration for voice calls/notes.',
        code: 'MESSENGER_VOICE_SCHEMA_MISSING'
      });
    }
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load voice call history.' });
  }
};
