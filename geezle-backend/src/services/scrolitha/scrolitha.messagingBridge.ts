/**
 * Phase 20.7 — Bridge Scrolitha orchestration into official 1:1 messaging conversations.
 * Additive only: reuses platform identity, scrolithaChat, and DirectMessage persistence.
 */
import prisma from '../../utils/prismaClient';
import {
  ensureScrolithaPlatformUser,
  SCROLITHA_DISCLOSURE,
  SCROLITHA_PLATFORM_DISPLAY_NAME,
  SCROLITHA_PLATFORM_USERNAME,
  SCROLITHA_SYSTEM_LABEL,
  type ScrolithaPlatformUser
} from './scrolitha.platformIdentity';
import type { ScrolithaActor } from './scrolitha.types';
import { isCapabilityEnabled } from './scrolitha.rollout';
import { recordAiReply, recordLatencyMs, recordOpsCounter } from './scrolitha.opsMetrics';

const WELCOME_TEXT =
  "Hi! I'm **Scrolitha**, Scrolith's official AI platform assistant. I can help you find jobs, improve your profile, draft posts and proposals, navigate marketplace and communities, and complete professional tasks — always within your permissions.\n\n" +
  SCROLITHA_DISCLOSURE;

export type EnsureScrolithaMessagingResult = {
  conversationId: string;
  platformUser: ScrolithaPlatformUser;
  created: boolean;
  welcomeSeeded: boolean;
  messagingAssistantEnabled: boolean;
};

const participantPairKey = (a: string, b: string) => [a, b].sort().join(':');

export const isMessagingAssistantEnabled = async (actor?: {
  id?: string | null;
  role?: string | null;
  email?: string | null;
  isAdmin?: boolean;
} | null): Promise<boolean> => {
  // Strict staged control: require messagingAssistant capability (env/config/internal defaults).
  // Does NOT auto-enable merely because master or other AI surfaces are on.
  try {
    return await isCapabilityEnabled('messagingAssistant', actor);
  } catch {
    return false;
  }
};

/**
 * Exactly one DIRECT conversation between the user and the Scrolitha platform account.
 */
export const ensureScrolithaDirectConversation = async (
  userId: string,
  options?: { seedWelcome?: boolean }
): Promise<EnsureScrolithaMessagingResult> => {
  const uid = String(userId || '').trim();
  if (!uid) throw Object.assign(new Error('userId is required'), { statusCode: 400 });

  const platformUser = await ensureScrolithaPlatformUser();
  if (platformUser.id === uid) {
    throw Object.assign(new Error('Scrolitha cannot open a conversation with itself'), { statusCode: 400 });
  }

  // Actor may be passed later; use id for capability check (internal allowlist uses id/email).
  const messagingAssistantEnabled = await isMessagingAssistantEnabled({ id: uid });

  const uniqueIds = [uid, platformUser.id];
  const canonicalKey = participantPairKey(uid, platformUser.id);

  const candidates = await prisma.conversation.findMany({
    where: {
      type: 'DIRECT',
      participants: { some: { userId: { in: uniqueIds } } }
    },
    include: { participants: true },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
  });

  let existing =
    candidates.find((c) => {
      const ids = (c.participants || [])
        .map((p) => String(p.userId || '').trim())
        .filter(Boolean);
      return participantPairKey(ids[0] || '', ids[1] || '') === canonicalKey && ids.length === 2;
    }) || null;

  // Prefer exact two-participant match
  if (!existing) {
    existing =
      candidates.find((c) => {
        const ids = Array.from(
          new Set((c.participants || []).map((p) => String(p.userId || '').trim()).filter(Boolean))
        );
        return ids.length === 2 && ids.includes(uid) && ids.includes(platformUser.id);
      }) || null;
  }

  // When rollout is off: return existing conversation if any; do not create/spam new ones.
  if (!messagingAssistantEnabled) {
    if (!existing) {
      throw Object.assign(new Error('Scrolitha messaging assistant is currently disabled'), {
        statusCode: 403,
        code: 'SCROLITHA_MESSAGING_DISABLED'
      });
    }
    return {
      conversationId: existing.id,
      platformUser,
      created: false,
      welcomeSeeded: false,
      messagingAssistantEnabled: false
    };
  }

  let created = false;
  let conversationId = existing?.id || '';

  if (existing) {
    await prisma.conversationParticipant.updateMany({
      where: {
        conversationId: existing.id,
        userId: { in: uniqueIds }
      },
      data: {
        deletedAt: null,
        isArchived: false
      }
    });
    // System-pin for the human participant
    await prisma.conversationParticipant.updateMany({
      where: { conversationId: existing.id, userId: uid },
      data: { isStarred: true, label: 'scrolitha' }
    });
    conversationId = existing.id;
  } else {
    const createdRow = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        lastMessageText: 'Scrolitha · AI assistant',
        lastMessageAt: new Date(),
        lastMessageSenderId: platformUser.id,
        participants: {
          create: [
            { userId: uid, isStarred: true, label: 'scrolitha' },
            { userId: platformUser.id, label: 'system' }
          ]
        }
      }
    });
    conversationId = createdRow.id;
    created = true;
  }

  let welcomeSeeded = false;
  if (options?.seedWelcome !== false) {
    const messageCount = await prisma.directMessage.count({
      where: { conversationId, deletedAt: null }
    });
    if (messageCount === 0) {
      await prisma.directMessage.create({
        data: {
          conversationId,
          senderId: platformUser.id,
          text: WELCOME_TEXT,
          isSystem: true,
          metadata: {
            scrolitha: true,
            kind: 'welcome',
            systemLabel: SCROLITHA_SYSTEM_LABEL,
            disclosure: SCROLITHA_DISCLOSURE
          }
        }
      });
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageText: "Hi! I'm Scrolitha, Scrolith's official AI assistant.",
          lastMessageAt: new Date(),
          lastMessageSenderId: platformUser.id
        }
      });
      welcomeSeeded = true;
    }
  }

  return {
    conversationId,
    platformUser,
    created,
    welcomeSeeded,
    messagingAssistantEnabled
  };
};

export type ScrolithaMessagingTurnResult = {
  skipped?: boolean;
  reason?: string;
  assistantMessageId?: string;
  scrolithaConversationId?: string | null;
  reply?: string;
  suggestedActions?: any[];
  followUpPrompts?: string[];
};

/**
 * Generate and persist an assistant reply for a user message in the Scrolitha DM.
 */
export const processScrolithaMessagingTurn = async (input: {
  userId: string;
  conversationId: string;
  userText: string;
  actor: ScrolithaActor;
  app?: any;
  emitToUser?: (userId: string, event: string, payload: any) => void;
}): Promise<ScrolithaMessagingTurnResult> => {
  const started = Date.now();
  const userId = String(input.userId || '').trim();
  const conversationId = String(input.conversationId || '').trim();
  const userText = String(input.userText || '').trim();
  if (!userId || !conversationId || !userText) {
    return { skipped: true, reason: 'missing_input' };
  }

  const enabled = await isMessagingAssistantEnabled(input.actor);
  if (!enabled) {
    return { skipped: true, reason: 'messaging_assistant_disabled' };
  }

  const platformUser = await ensureScrolithaPlatformUser();
  if (userId === platformUser.id) {
    return { skipped: true, reason: 'bot_loop' };
  }

  // Confirm conversation is the official Scrolitha DM
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: true }
  });
  if (!conversation || conversation.type !== 'DIRECT') {
    return { skipped: true, reason: 'not_direct' };
  }
  const participantIds = (conversation.participants || []).map((p) => String(p.userId));
  if (!participantIds.includes(userId) || !participantIds.includes(platformUser.id)) {
    return { skipped: true, reason: 'not_scrolitha_dm' };
  }

  // Never answer if the "user" message was actually from Scrolitha
  // (safety for any mis-routed traffic)
  try {
    recordOpsCounter('requests');
  } catch {
    // optional metrics
  }

  const { scrolithaChat } = await import('./scrolitha.orchestrator');
  let chatResult: any;
  try {
    chatResult = await scrolithaChat(
      {
        message: userText,
        context: {
          page: '/messages',
          route: `/messages?conversation=${conversationId}`,
          surface: 'messaging',
          source: 'messaging_bridge',
          accountType: input.actor.role,
          userRole: input.actor.role,
          userId
        } as any
      },
      input.actor,
      input.app
    );
  } catch (error: any) {
    const fallback =
      'I could not complete that request right now. Please try again in a moment, or rephrase your question.';
    const failed = await prisma.directMessage.create({
      data: {
        conversationId,
        senderId: platformUser.id,
        text: fallback,
        metadata: {
          scrolitha: true,
          kind: 'error_fallback',
          error: String(error?.code || error?.message || 'chat_failed').slice(0, 200),
          retryable: true
        }
      }
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageText: fallback.slice(0, 240),
        lastMessageAt: failed.createdAt,
        lastMessageSenderId: platformUser.id
      }
    });
    const payload = formatAssistantMessagePayload(failed, conversationId, userId, platformUser);
    input.emitToUser?.(userId, 'messages:new', payload);
    try {
      recordOpsCounter('failures');
      recordLatencyMs(Date.now() - started);
    } catch {
      // ignore
    }
    return {
      assistantMessageId: failed.id,
      reply: fallback,
      scrolithaConversationId: null,
      suggestedActions: [],
      followUpPrompts: []
    };
  }

  const replyText = String(chatResult?.reply || '').trim() || 'Done. How else can I help on Scrolith?';
  const suggestedActions = Array.isArray(chatResult?.suggestedActions) ? chatResult.suggestedActions : [];
  const followUpPrompts = Array.isArray(chatResult?.followUpPrompts) ? chatResult.followUpPrompts : [];
  const scrolithaConversationId = chatResult?.conversationId || null;

  const assistantMessage = await prisma.directMessage.create({
    data: {
      conversationId,
      senderId: platformUser.id,
      text: replyText,
      metadata: {
        scrolitha: true,
        kind: 'assistant_reply',
        scrolithaConversationId,
        suggestedActions: suggestedActions.slice(0, 12),
        followUpPrompts: followUpPrompts.slice(0, 12),
        responseMode: chatResult?.responseMode || null,
        systemLabel: SCROLITHA_SYSTEM_LABEL,
        displayName: SCROLITHA_PLATFORM_DISPLAY_NAME,
        username: SCROLITHA_PLATFORM_USERNAME
      }
    }
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      lastMessageText: replyText.slice(0, 240),
      lastMessageAt: assistantMessage.createdAt,
      lastMessageSenderId: platformUser.id
    }
  });

  const payload = formatAssistantMessagePayload(assistantMessage, conversationId, userId, platformUser);
  // Attach cards for clients that understand them
  (payload as any).scrolitha = {
    suggestedActions,
    followUpPrompts,
    scrolithaConversationId,
    disclosure: SCROLITHA_DISCLOSURE
  };
  input.emitToUser?.(userId, 'messages:new', payload);
  input.emitToUser?.(userId, 'scrolitha:messaging_reply', {
    conversationId,
    messageId: assistantMessage.id,
    scrolithaConversationId
  });

  try {
    recordOpsCounter('successes');
    recordAiReply();
    recordLatencyMs(Date.now() - started);
  } catch {
    // ignore
  }

  return {
    assistantMessageId: assistantMessage.id,
    scrolithaConversationId,
    reply: replyText,
    suggestedActions,
    followUpPrompts
  };
};

const formatAssistantMessagePayload = (
  message: { id: string; text: string; createdAt: Date; metadata?: any },
  conversationId: string,
  receiverId: string,
  platformUser: ScrolithaPlatformUser
) => ({
  id: message.id,
  conversation_id: conversationId,
  conversationId,
  sender_id: platformUser.id,
  senderId: platformUser.id,
  receiver_id: receiverId,
  receiverId,
  text: message.text,
  timestamp: message.createdAt.toISOString(),
  is_read: false,
  is_deleted: false,
  isDeleted: false,
  deleted_at: null,
  deletedAt: null,
  edited_at: null,
  editedAt: null,
  reactions: [],
  attachments: [],
  attachment_ids: [],
  is_scrolitha: true,
  isScrolitha: true,
  system_label: SCROLITHA_SYSTEM_LABEL,
  metadata: message.metadata || null
});

/** True if conversation includes Scrolitha platform user. */
export const conversationIncludesScrolitha = async (conversationId: string): Promise<boolean> => {
  const platformId = (await ensureScrolithaPlatformUser()).id;
  const row = await prisma.conversationParticipant.findFirst({
    where: { conversationId, userId: platformId, deletedAt: null },
    select: { id: true }
  });
  return Boolean(row);
};

export const getDefaultScrolithaPromptChips = () => [
  'Find jobs for me',
  'Improve my resume',
  'Review my profile',
  'Find freelancers',
  'Create a proposal draft',
  'Write a post',
  'Search marketplace',
  'Find communities',
  'Show my growth plan',
  'Explain my wallet summary'
];
