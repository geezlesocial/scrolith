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

const isExactScrolithaDm = (
  conversation: { type?: string | null; participants?: Array<{ userId?: string | null }> | null },
  userId: string,
  platformUserId: string
) => {
  if (String(conversation?.type || '').toUpperCase() !== 'DIRECT') return false;
  const ids = Array.from(
    new Set(
      (conversation.participants || [])
        .map((p) => String(p.userId || '').trim())
        .filter(Boolean)
    )
  );
  return ids.length === 2 && ids.includes(userId) && ids.includes(platformUserId);
};

/**
 * Phase 20.7.5 — Find all DIRECT conversations that are exactly user↔Scrolitha.
 * Participant order independent. Includes soft-deleted human membership.
 */
export const findAllScrolithaDirectConversations = async (userId: string, platformUserId: string) => {
  const uid = String(userId || '').trim();
  const pid = String(platformUserId || '').trim();
  if (!uid || !pid) return [];

  const candidates = await prisma.conversation.findMany({
    where: {
      type: 'DIRECT',
      AND: [
        { participants: { some: { userId: uid } } },
        { participants: { some: { userId: pid } } }
      ]
    },
    include: {
      participants: true,
      _count: { select: { messages: true } }
    },
    orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'asc' }]
  });

  return candidates.filter((c) => isExactScrolithaDm(c, uid, pid));
};

/**
 * Consolidate duplicate Scrolitha DMs into one survivor.
 * Moves messages by reassigning conversationId (skipDuplicates on id not needed — ids unique).
 * Soft-archives losers for the human participant (deletedAt) rather than hard-delete.
 */
export const consolidateScrolithaDirectConversations = async (
  userId: string,
  platformUserId: string,
  matches: Array<{
    id: string;
    createdAt?: Date | null;
    lastMessageAt?: Date | null;
    updatedAt?: Date | null;
    _count?: { messages?: number };
  }>
): Promise<{ survivorId: string; mergedFrom: string[]; messagesMoved: number }> => {
  const ordered = [...matches].sort((a, b) => {
    const aCount = Number(a._count?.messages || 0);
    const bCount = Number(b._count?.messages || 0);
    if (aCount !== bCount) return bCount - aCount;
    const aAct = new Date(a.lastMessageAt || a.updatedAt || 0).getTime();
    const bAct = new Date(b.lastMessageAt || b.updatedAt || 0).getTime();
    if (aAct !== bAct) return bAct - aAct;
    const aCreated = new Date(a.createdAt || 0).getTime();
    const bCreated = new Date(b.createdAt || 0).getTime();
    return aCreated - bCreated;
  });

  const survivor = ordered[0];
  const losers = ordered.slice(1);
  if (!survivor || !losers.length) {
    return { survivorId: survivor?.id || '', mergedFrom: [], messagesMoved: 0 };
  }

  let messagesMoved = 0;
  for (const loser of losers) {
    try {
      const moved = await prisma.directMessage.updateMany({
        where: { conversationId: loser.id },
        data: { conversationId: survivor.id }
      });
      messagesMoved += moved.count || 0;

      // Soft-remove loser from human inbox; keep platform participant row for audit.
      await prisma.conversationParticipant.updateMany({
        where: { conversationId: loser.id, userId },
        data: {
          deletedAt: new Date(),
          isArchived: true,
          isStarred: false,
          label: 'scrolitha_duplicate_merged'
        }
      });
      await prisma.conversation.update({
        where: { id: loser.id },
        data: {
          lastMessageText: `[merged into ${survivor.id}]`,
          updatedAt: new Date()
        }
      });
    } catch (error) {
      console.warn('[scrolitha] consolidate merge failed', {
        survivorId: survivor.id,
        loserId: loser.id,
        error: String((error as any)?.message || error)
      });
    }
  }

  console.info('[scrolitha] consolidated duplicate DMs', {
    userId,
    survivorId: survivor.id,
    mergedFrom: losers.map((l) => l.id),
    messagesMoved
  });

  return {
    survivorId: survivor.id,
    mergedFrom: losers.map((l) => l.id),
    messagesMoved
  };
};

/**
 * Exactly one DIRECT conversation between the user and the Scrolitha platform account.
 * Phase 20.7.5: concurrency-safe create + automatic duplicate consolidation.
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

  // Resolve all exact pair matches (participant-order independent).
  let matches = await findAllScrolithaDirectConversations(uid, platformUser.id);

  // Consolidate any historical duplicates before proceeding.
  if (matches.length > 1) {
    const { survivorId } = await consolidateScrolithaDirectConversations(
      uid,
      platformUser.id,
      matches as any
    );
    matches = await findAllScrolithaDirectConversations(uid, platformUser.id);
    // Prefer survivor if still present
    if (survivorId) {
      matches = [
        ...matches.filter((m) => m.id === survivorId),
        ...matches.filter((m) => m.id !== survivorId)
      ];
    }
  }

  let existing = matches[0] || null;

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
    // Concurrency-safe create: re-check inside transaction after create race.
    conversationId = await prisma.$transaction(async (tx) => {
      const again = await tx.conversation.findMany({
        where: {
          type: 'DIRECT',
          AND: [
            { participants: { some: { userId: uid } } },
            { participants: { some: { userId: platformUser.id } } }
          ]
        },
        include: { participants: true },
        orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'asc' }]
      });
      const hit = again.find((c) => isExactScrolithaDm(c, uid, platformUser.id));
      if (hit) return hit.id;

      const createdRow = await tx.conversation.create({
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
      return createdRow.id;
    });

    // Detect whether we created or raced into an existing row.
    const postCreateMatches = await findAllScrolithaDirectConversations(uid, platformUser.id);
    if (postCreateMatches.length > 1) {
      const { survivorId } = await consolidateScrolithaDirectConversations(
        uid,
        platformUser.id,
        postCreateMatches as any
      );
      conversationId = survivorId || conversationId;
      created = false;
    } else {
      created = postCreateMatches[0]?.id === conversationId;
      // If race: another request created first and we returned that id from txn
      if (!created && postCreateMatches[0]) {
        conversationId = postCreateMatches[0].id;
      } else {
        created = true;
      }
    }

    await prisma.conversationParticipant.updateMany({
      where: { conversationId, userId: { in: uniqueIds } },
      data: { deletedAt: null, isArchived: false }
    });
    await prisma.conversationParticipant.updateMany({
      where: { conversationId, userId: uid },
      data: { isStarred: true, label: 'scrolitha' }
    });
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
  userMessageId?: string;
  scrolithaConversationId?: string | null;
  reply?: string;
  suggestedActions?: any[];
  followUpPrompts?: string[];
  cards?: any[];
  clientRequestId?: string | null;
  streamingMode?: 'token' | 'chunk_fallback' | 'none' | null;
};

export type ScrolithaStreamChunkHandler = (event: {
  type: 'start' | 'chunk' | 'done' | 'error' | 'cancelled';
  requestId: string;
  text?: string;
  index?: number;
  messageId?: string;
  streamingMode?: string;
}) => void | Promise<void>;

/**
 * Generate and persist an assistant reply for a user message in the Scrolitha DM.
 * Phase 20.7.1: rich cards, optional stream events, file understanding context, request ids.
 */
export const processScrolithaMessagingTurn = async (input: {
  userId: string;
  conversationId: string;
  userText: string;
  actor: ScrolithaActor;
  app?: any;
  emitToUser?: (userId: string, event: string, payload: any) => void;
  /** Client-generated idempotency / stream correlation id */
  clientRequestId?: string | null;
  attachmentFileIds?: string[];
  /** When set, emits provider-independent stream events (socket or SSE adapter) */
  onStreamEvent?: ScrolithaStreamChunkHandler;
  preferStream?: boolean;
  /** Phase 20.7.2 — optional abort for request budget */
  signal?: AbortSignal;
}): Promise<ScrolithaMessagingTurnResult> => {
  const started = Date.now();
  const userId = String(input.userId || '').trim();
  const conversationId = String(input.conversationId || '').trim();
  const userText = String(input.userText || '').trim();
  const clientRequestId = String(input.clientRequestId || '').trim() || null;
  const isAborted = () => Boolean(input.signal?.aborted);
  if (!userId || !conversationId || !userText) {
    return { skipped: true, reason: 'missing_input' };
  }
  if (isAborted()) {
    return { skipped: true, reason: 'turn_budget_exceeded' };
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

  // Idempotency: if the same clientRequestId already produced an assistant reply, return it.
  if (clientRequestId) {
    const existing = await prisma.directMessage.findFirst({
      where: {
        conversationId,
        senderId: platformUser.id,
        metadata: {
          path: ['clientRequestId'],
          equals: clientRequestId
        } as any
      },
      orderBy: { createdAt: 'desc' }
    });
    if (existing) {
      return {
        assistantMessageId: existing.id,
        reply: existing.text,
        scrolithaConversationId: (existing.metadata as any)?.scrolithaConversationId || null,
        suggestedActions: (existing.metadata as any)?.suggestedActions || [],
        followUpPrompts: (existing.metadata as any)?.followUpPrompts || [],
        cards: (existing.metadata as any)?.cards || [],
        clientRequestId,
        streamingMode: 'none'
      };
    }
  }

  try {
    recordOpsCounter('requests');
  } catch {
    // optional metrics
  }

  const { isCapabilityEnabled } = await import('./scrolitha.rollout');
  const streamEnabled =
    Boolean(input.preferStream) && (await isCapabilityEnabled('messagingStream', input.actor));
  const cardsEnabled = await isCapabilityEnabled('richEntityCards', input.actor);
  const fileUnderstandingEnabled = await isCapabilityEnabled('fileUnderstanding', input.actor);
  const confirmTokensEnabled = await isCapabilityEnabled('confirmationTokens', input.actor);

  let messageForModel = userText;
  if (fileUnderstandingEnabled && Array.isArray(input.attachmentFileIds) && input.attachmentFileIds.length) {
    try {
      const { understandOwnedAttachments, formatFileUnderstandingContext } = await import(
        './scrolitha.fileUnderstanding'
      );
      const snippets = await understandOwnedAttachments({
        actorId: userId,
        fileIds: input.attachmentFileIds,
        isAdmin: Boolean(input.actor.isAdmin)
      });
      const block = formatFileUnderstandingContext(snippets);
      if (block) {
        messageForModel = `${userText}\n\n${block}`;
      }
    } catch {
      // file understanding is best-effort
    }
  }

  const requestId = clientRequestId || `msg_${conversationId}_${Date.now()}`;
  if (streamEnabled && input.onStreamEvent) {
    await input.onStreamEvent({
      type: 'start',
      requestId,
      streamingMode: 'chunk_fallback'
    });
    input.emitToUser?.(userId, 'scrolitha:stream', {
      type: 'start',
      requestId,
      conversationId,
      streamingMode: 'chunk_fallback'
    });
  }

  if (isAborted()) {
    return { skipped: true, reason: 'turn_budget_exceeded', clientRequestId };
  }

  const { scrolithaChat } = await import('./scrolitha.orchestrator');
  let chatResult: any;
  try {
    chatResult = await scrolithaChat(
      {
        message: messageForModel,
        context: {
          page: '/messages',
          route: `/messages?conversation=${conversationId}`,
          surface: 'messaging',
          source: 'messaging_bridge',
          accountType: input.actor.role,
          userRole: input.actor.role,
          userId,
          clientRequestId,
          attachmentFileIds: input.attachmentFileIds || []
        } as any
      },
      input.actor,
      input.app
    );
    if (isAborted()) {
      // Prefer returning a coherent answer if generation already finished.
      // Only skip when we truly have no reply to persist.
      if (!String(chatResult?.reply || '').trim()) {
        return { skipped: true, reason: 'turn_budget_exceeded', clientRequestId };
      }
    }
  } catch (error: any) {
    if (isAborted()) {
      return { skipped: true, reason: 'turn_budget_exceeded', clientRequestId };
    }
    const fallback =
      'I could not complete that request right now. Please try again in a moment, or rephrase your question.';
    let errorCards: any[] = [];
    if (cardsEnabled) {
      const { buildErrorCard } = await import('./scrolitha.cards');
      errorCards = [buildErrorCard({ summary: fallback, retryable: true })];
    }
    const failed = await prisma.directMessage.create({
      data: {
        conversationId,
        senderId: platformUser.id,
        text: fallback,
        metadata: {
          scrolitha: true,
          kind: 'error_fallback',
          error: String(error?.code || error?.message || 'chat_failed').slice(0, 200),
          retryable: true,
          clientRequestId,
          cards: errorCards
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
    if (streamEnabled) {
      await input.onStreamEvent?.({ type: 'error', requestId, text: fallback });
      input.emitToUser?.(userId, 'scrolitha:stream', {
        type: 'error',
        requestId,
        conversationId,
        text: fallback
      });
    }
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
      followUpPrompts: [],
      cards: errorCards,
      clientRequestId,
      streamingMode: streamEnabled ? 'chunk_fallback' : 'none'
    };
  }

  const replyText = String(chatResult?.reply || '').trim() || 'Done. How else can I help on Scrolith?';
  const suggestedActions = Array.isArray(chatResult?.suggestedActions) ? chatResult.suggestedActions : [];
  const followUpPrompts = Array.isArray(chatResult?.followUpPrompts) ? chatResult.followUpPrompts : [];
  const scrolithaConversationId = chatResult?.conversationId || null;

  // Optional chunk_fallback stream of final answer (provider-independent; not private CoT)
  let streamingMode: 'token' | 'chunk_fallback' | 'none' = 'none';
  if (streamEnabled && (input.onStreamEvent || input.emitToUser)) {
    streamingMode = 'chunk_fallback';
    try {
      const { chunkAnswerForIncrementalRender } = await import('./scrolitha.os');
      const chunks = chunkAnswerForIncrementalRender(replyText);
      for (let i = 0; i < chunks.length; i += 1) {
        const evt = {
          type: 'chunk' as const,
          requestId,
          text: chunks[i],
          index: i,
          streamingMode: 'chunk_fallback' as const
        };
        await input.onStreamEvent?.(evt);
        input.emitToUser?.(userId, 'scrolitha:stream', {
          ...evt,
          conversationId
        });
      }
    } catch {
      // streaming is best-effort
    }
  }

  // Confirmation tokens + rich cards
  const confirmationTokens: Record<string, string> = {};
  if (confirmTokensEnabled) {
    const { mintConfirmationToken } = await import('./scrolitha.confirmationTokens');
    for (const action of suggestedActions) {
      if (action?.requiresConfirmation && action?.actionId) {
        const minted = mintConfirmationToken({
          userId,
          toolKey: String(action.toolKey || ''),
          actionId: String(action.actionId),
          payload: action.paramsPreview || {}
        });
        confirmationTokens[String(action.actionId)] = minted.token;
        action.confirmationToken = minted.token;
      }
    }
  }

  let cards: any[] = [];
  if (cardsEnabled) {
    const { buildCardsFromSuggestedActions } = await import('./scrolitha.cards');
    cards = buildCardsFromSuggestedActions(suggestedActions, { confirmationTokens });
  }

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
        cards: cards.slice(0, 8),
        responseMode: chatResult?.responseMode || null,
        systemLabel: SCROLITHA_SYSTEM_LABEL,
        displayName: SCROLITHA_PLATFORM_DISPLAY_NAME,
        username: SCROLITHA_PLATFORM_USERNAME,
        clientRequestId,
        streamingMode
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
  (payload as any).scrolitha = {
    suggestedActions,
    followUpPrompts,
    cards,
    scrolithaConversationId,
    disclosure: SCROLITHA_DISCLOSURE,
    clientRequestId,
    streamingMode
  };
  input.emitToUser?.(userId, 'messages:new', payload);
  input.emitToUser?.(userId, 'scrolitha:messaging_reply', {
    conversationId,
    messageId: assistantMessage.id,
    scrolithaConversationId,
    clientRequestId,
    cards
  });

  if (streamEnabled) {
    await input.onStreamEvent?.({
      type: 'done',
      requestId,
      text: replyText,
      messageId: assistantMessage.id,
      streamingMode
    });
    input.emitToUser?.(userId, 'scrolitha:stream', {
      type: 'done',
      requestId,
      conversationId,
      text: replyText,
      messageId: assistantMessage.id,
      streamingMode
    });
  }

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
    followUpPrompts,
    cards,
    clientRequestId,
    streamingMode
  };
};

/**
 * Phase 20.7.1 — Unified turn for SupportWidget / Messages / Dock:
 * ensure DM, persist user message, run assistant, return both sides.
 */
export const processScrolithaUnifiedTurn = async (input: {
  userId: string;
  userText: string;
  actor: ScrolithaActor;
  app?: any;
  emitToUser?: (userId: string, event: string, payload: any) => void;
  clientRequestId?: string | null;
  attachmentFileIds?: string[];
  source?: string;
  onStreamEvent?: ScrolithaStreamChunkHandler;
  preferStream?: boolean;
}): Promise<
  ScrolithaMessagingTurnResult & {
    conversationId?: string;
    userMessageId?: string;
    messagingAssistantEnabled?: boolean;
  }
> => {
  const { isCapabilityEnabled } = await import('./scrolitha.rollout');
  const unificationOn = await isCapabilityEnabled('conversationUnification', input.actor);
  // Unification is preferred; if flag off but messaging assistant on, still persist for Messages path.
  const messagingOn = await isMessagingAssistantEnabled(input.actor);
  if (!messagingOn) {
    return { skipped: true, reason: 'messaging_assistant_disabled', messagingAssistantEnabled: false };
  }

  const ensured = await ensureScrolithaDirectConversation(input.userId, { seedWelcome: true });
  const platformUser = ensured.platformUser;
  const conversationId = ensured.conversationId;
  const userText = String(input.userText || '').trim();
  if (!userText) {
    return { skipped: true, reason: 'missing_input', conversationId, messagingAssistantEnabled: true };
  }

  // Persist user turn into canonical DirectMessage conversation
  const userMessage = await prisma.directMessage.create({
    data: {
      conversationId,
      senderId: input.userId,
      text: userText,
      metadata: {
        scrolithaSurface: input.source || 'unified',
        clientRequestId: input.clientRequestId || null,
        conversationUnification: unificationOn,
        attachmentFileIds: Array.isArray(input.attachmentFileIds) ? input.attachmentFileIds.slice(0, 5) : []
      }
    }
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      lastMessageText: userText.slice(0, 240),
      lastMessageAt: userMessage.createdAt,
      lastMessageSenderId: input.userId
    }
  });

  input.emitToUser?.(input.userId, 'messages:new', {
    id: userMessage.id,
    conversation_id: conversationId,
    conversationId,
    sender_id: input.userId,
    senderId: input.userId,
    text: userText,
    timestamp: userMessage.createdAt.toISOString(),
    is_scrolitha: false,
    isScrolitha: false,
    metadata: userMessage.metadata
  });

  const turn = await processScrolithaMessagingTurn({
    userId: input.userId,
    conversationId,
    userText,
    actor: input.actor,
    app: input.app,
    emitToUser: input.emitToUser,
    clientRequestId: input.clientRequestId,
    attachmentFileIds: input.attachmentFileIds,
    onStreamEvent: input.onStreamEvent,
    preferStream: input.preferStream
  });

  return {
    ...turn,
    conversationId,
    userMessageId: userMessage.id,
    messagingAssistantEnabled: true
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
