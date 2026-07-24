
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type { Conversation, Message, UploadedFile } from '../types';
import {
  MessagingService,
  messageMatchesConversation,
  normalizeMessageReactions
} from '../services/messaging';
import { getConversationMergeKey, mergeDirectConversations } from '../services/messagingMerge';
import {
  applyIncomingPreviewUpdate,
  clearConversationDraft,
  dedupeMessagesById,
  filterConversationsForTab,
  getConversationDraft,
  getConversationUnreadCount,
  getMessagePreviewText,
  localSearchConversations,
  MESSAGING_PREVIEW_LIMIT,
  MESSAGING_SEARCH_DEBOUNCE_MS,
  type MessagingInboxTab,
  type OpenChatWindowState,
  reconcileOptimisticMessage,
  setConversationDraft,
  setConversationUnreadLocal,
  sortConversationsByRecent,
  sumConversationUnread,
  upsertOpenChatWindows
} from '../services/messagingSurfaces';
import {
  applyLocalReactionToggle,
  buildClientSendId,
  DEFAULT_MAX_VOICE_NOTE_SECONDS,
  markMessageDeletedEveryone,
  mergeEditResponseIntoMessage,
  pendingToAttachmentIds,
  type PendingComposerAttachment,
  uploadedFileToPending,
  revokePendingObjectUrls
} from '../services/messagingComposer';
import { FileService } from '../services/files';
import { getRecoverableActionMessage, isOfflineLikeError } from '../mobile/runtime/requestRecovery';
import {
  bindMessagingSocketHealth,
  broadcastMultiTabMessaging,
  decideMessagingFallbackPolling,
  DEFAULT_THREAD_CACHE_MAX,
  evictThreadCacheEntries,
  getSocketHealthSnapshot,
  globalMessagingSeenIds,
  listRetryableOutgoing,
  markOutgoingState,
  MESSAGING_POLL_GRACE_MS,
  publishMessagingEvent,
  resetMessagingEngineSession,
  subscribeMultiTabMessaging,
  touchThreadCacheEntry,
  trackOutgoingMessage,
  listDurableOutboxFlushOrder
} from '../services/messagingEngine';
import {
  applyPendingInboxItems,
  isolateInboxSoftRefresh
} from '../services/messagingSessionStability';
import { useNetworkStatus } from './NetworkStatusContext';
import { useUser } from './UserContext';
import { useSocket } from './SocketContext';

type ThreadCacheEntry = {
  messages: Message[];
  loading: boolean;
  error: string | null;
  loadedAt: number | null;
};

interface MessageContextType {
  unreadCount: number;
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
  syncState: 'idle' | 'loading' | 'ready' | 'offline' | 'error' | 'retrying';
  lastSyncedAt: number | null;
  refreshMessages: (options?: { force?: boolean }) => Promise<void>;

  // Desktop surface state
  dockExpanded: boolean;
  setDockExpanded: (expanded: boolean) => void;
  openChatWindows: OpenChatWindowState[];
  openConversationInDock: (conversationId: string, options?: { expandDock?: boolean }) => void;
  closeConversationWindow: (conversationId: string) => void;
  minimizeConversationWindow: (conversationId: string) => void;
  restoreConversationWindow: (conversationId: string) => void;

  // Visibility / read ownership
  registerVisibleConversation: (conversationId: string) => void;
  unregisterVisibleConversation: (conversationId: string) => void;
  markConversationRead: (conversationId: string) => Promise<void>;

  // Threads + compose for inline windows
  getThreadState: (conversationId: string) => ThreadCacheEntry;
  ensureThreadLoaded: (conversationId: string, options?: { force?: boolean }) => Promise<void>;
  sendInlineMessage: (
    conversationId: string,
    text: string,
    options?: {
      replyToMessageId?: string | null;
      attachmentIds?: string[];
      optimisticId?: string | null;
    }
  ) => Promise<Message | null>;
  sendInlineVoiceNote: (
    conversationId: string,
    payload: { blob: Blob; durationMs: number }
  ) => Promise<Message | null>;
  retryFailedMessage: (conversationId: string, messageId: string) => Promise<Message | null>;
  getDraft: (conversationId: string) => string;
  setDraft: (conversationId: string, text: string) => void;
  getReplyTo: (conversationId: string) => Message | null;
  setReplyTo: (conversationId: string, message: Message | null) => void;
  getPendingAttachments: (conversationId: string) => PendingComposerAttachment[];
  addPendingAttachments: (conversationId: string, files: UploadedFile[]) => void;
  removePendingAttachment: (conversationId: string, attachmentId: string) => void;
  clearPendingAttachments: (conversationId: string) => void;
  typingByConversation: Record<string, string | null>;
  emitTyping: (conversationId: string, isTyping: boolean) => void;

  // Message actions (dock parity with /messages)
  toggleReaction: (conversationId: string, messageId: string, emoji: string) => Promise<void>;
  editMessage: (conversationId: string, messageId: string, text: string) => Promise<void>;
  deleteMessage: (
    conversationId: string,
    messageId: string,
    scope: 'me' | 'everyone'
  ) => Promise<void>;
  copyMessage: (conversationId: string, message: Message) => Promise<void>;
  voiceRuntimeConfig: {
    enabledVoiceNotes: boolean;
    maxVoiceNoteDurationSeconds: number;
    blockedForCurrentUser: boolean;
  };

  // Shared list helpers
  getPreviewConversations: (tab: MessagingInboxTab, limit?: number) => Conversation[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: Conversation[];
  searchLoading: boolean;
  searchError: string | null;
  sendingConversationIds: Record<string, boolean>;
}

const EMPTY_THREAD: ThreadCacheEntry = {
  messages: [],
  loading: false,
  error: null,
  loadedAt: null
};

const DEFAULT_MESSAGE_CONTEXT: MessageContextType = {
  unreadCount: 0,
  conversations: [],
  loading: false,
  error: null,
  syncState: 'idle',
  lastSyncedAt: null,
  refreshMessages: async () => {},
  dockExpanded: false,
  setDockExpanded: () => {},
  openChatWindows: [],
  openConversationInDock: () => {},
  closeConversationWindow: () => {},
  minimizeConversationWindow: () => {},
  restoreConversationWindow: () => {},
  registerVisibleConversation: () => {},
  unregisterVisibleConversation: () => {},
  markConversationRead: async () => {},
  getThreadState: () => EMPTY_THREAD,
  ensureThreadLoaded: async () => {},
  sendInlineMessage: async () => null,
  sendInlineVoiceNote: async () => null,
  retryFailedMessage: async () => null,
  getDraft: () => '',
  setDraft: () => {},
  getReplyTo: () => null,
  setReplyTo: () => {},
  getPendingAttachments: () => [],
  addPendingAttachments: () => {},
  removePendingAttachment: () => {},
  clearPendingAttachments: () => {},
  typingByConversation: {},
  emitTyping: () => {},
  toggleReaction: async () => {},
  editMessage: async () => {},
  deleteMessage: async () => {},
  copyMessage: async () => {},
  voiceRuntimeConfig: {
    enabledVoiceNotes: true,
    maxVoiceNoteDurationSeconds: DEFAULT_MAX_VOICE_NOTE_SECONDS,
    blockedForCurrentUser: false
  },
  getPreviewConversations: () => [],
  searchQuery: '',
  setSearchQuery: () => {},
  searchResults: [],
  searchLoading: false,
  searchError: null,
  sendingConversationIds: {}
};

const MessageContext = createContext<MessageContextType>(DEFAULT_MESSAGE_CONTEXT);

const safeId = (value: unknown) => String(value || '').trim();

const normalizeSocketMessage = (payload: any): Message | null => {
  if (!payload) return null;
  const raw = payload?.message && typeof payload.message === 'object' ? payload.message : payload;
  const conversationId = safeId(
    raw?.conversationId ?? raw?.conversation_id ?? payload?.conversationId ?? payload?.conversation_id
  );
  if (!conversationId && !raw?.id) return null;
  const senderId = safeId(raw?.senderId ?? raw?.sender_id);
  const receiverId = safeId(raw?.receiverId ?? raw?.receiver_id);
  const timestamp = safeId(
    raw?.timestamp ?? raw?.createdAt ?? raw?.created_at ?? new Date().toISOString()
  );
  const isRead = Boolean(raw?.isRead ?? raw?.is_read ?? false);
  return {
    id: safeId(raw?.id ?? `socket-${conversationId}-${timestamp}`),
    conversation_id: conversationId,
    conversationId,
    sender_id: senderId,
    senderId,
    receiver_id: receiverId,
    receiverId,
    text: String(raw?.text ?? raw?.body ?? ''),
    timestamp,
    is_read: isRead,
    isRead,
    message_type: String(raw?.message_type ?? raw?.messageType ?? 'text').toLowerCase(),
    messageType: String(raw?.messageType ?? raw?.message_type ?? 'text').toLowerCase(),
    metadata: raw?.metadata ?? null,
    attachments: Array.isArray(raw?.attachments) ? raw.attachments : [],
    reactions: Array.isArray(raw?.reactions) ? raw.reactions : [],
    reply_to_message_id: raw?.reply_to_message_id ?? raw?.replyToMessageId ?? null,
    replyToMessageId: raw?.replyToMessageId ?? raw?.reply_to_message_id ?? null
  } as Message;
};

export const MessageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useUser();
  const { socket, isConnected, connectionHealth } = useSocket();
  const { isOnline, recoveryTick } = useNetworkStatus();

  const [unreadCount, setUnreadCount] = useState(0);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<MessageContextType['syncState']>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const [dockExpanded, setDockExpanded] = useState(false);
  const [openChatWindows, setOpenChatWindows] = useState<OpenChatWindowState[]>([]);
  const [threadCache, setThreadCache] = useState<Record<string, ThreadCacheEntry>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replyToByConversation, setReplyToByConversation] = useState<Record<string, Message | null>>({});
  const [pendingAttachmentsByConversation, setPendingAttachmentsByConversation] = useState<
    Record<string, PendingComposerAttachment[]>
  >({});
  const [typingByConversation, setTypingByConversation] = useState<Record<string, string | null>>({});
  const [sendingConversationIds, setSendingConversationIds] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQueryState] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Conversation[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [voiceRuntimeConfig, setVoiceRuntimeConfig] = useState({
    enabledVoiceNotes: true,
    maxVoiceNoteDurationSeconds: DEFAULT_MAX_VOICE_NOTE_SECONDS,
    blockedForCurrentUser: false
  });

  const inFlightRefreshRef = useRef<Promise<void> | null>(null);
  const lastRefreshAtRef = useRef(0);
  const lastSyncedAtRef = useRef<number | null>(null);
  const outboxFlushInFlightRef = useRef(false);
  const visibleConversationIdsRef = useRef<Set<string>>(new Set());
  const conversationsRef = useRef<Conversation[]>([]);
  const userIdRef = useRef<string>('');
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchRequestSeqRef = useRef(0);
  const typingEmitRef = useRef<Record<string, boolean>>({});
  const typingStopTimersRef = useRef<Record<string, number>>({});
  const typingClearTimersRef = useRef<Record<string, number>>({});
  const threadInFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  const threadMetaRef = useRef<Record<string, { loadedAt: number | null; loading: boolean }>>({});
  const sendingIdsRef = useRef<Set<string>>(new Set());
  const softRefreshTimerRef = useRef<number | null>(null);

  const REFRESH_MIN_INTERVAL_MS = 15_000;

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    userIdRef.current = safeId(user?.id);
  }, [user?.id]);

  const recomputeUnread = useCallback((list: Conversation[]) => {
    const nextUnread = sumConversationUnread(list);
    setUnreadCount(nextUnread);
    publishMessagingEvent(
      'UNREAD_CHANGED',
      { unreadCount: nextUnread },
      { source: 'local' }
    );
  }, []);

  const scheduleSoftRefresh = useCallback(() => {
    if (softRefreshTimerRef.current) return;
    softRefreshTimerRef.current = window.setTimeout(() => {
      softRefreshTimerRef.current = null;
      void refreshMessagesRef.current?.({ force: false });
    }, 2_500);
  }, []);

  const refreshMessagesRef = useRef<MessageContextType['refreshMessages'] | null>(null);

  const refreshMessages = useCallback(
    async (options?: { force?: boolean }) => {
      if (!user?.id) {
        setUnreadCount(0);
        setConversations([]);
        setError(null);
        setSyncState('idle');
        setLastSyncedAt(null);
        return;
      }

      if (!isOnline && !options?.force) {
        setLoading(false);
        setError('Messages are paused while you are offline.');
        setSyncState('offline');
        return;
      }

      if (!options?.force && Date.now() - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) {
        return;
      }

      if (inFlightRefreshRef.current) {
        return inFlightRefreshRef.current;
      }

      const request = (async () => {
        setLoading(true);
        setError(null);
        setSyncState(options?.force ? 'retrying' : 'loading');
        try {
          // Phase 20.7: ensure official Scrolitha assistant DM once per force refresh path.
          let ensured = false;
          try {
            await MessagingService.ensureScrolithaConversation();
            ensured = true;
          } catch {
            // Rollout / network — continue with normal inbox load
          }
          // Phase 22.1 — delta reconnect when we have a prior sync clock (soft refresh).
          const updatedSince =
            !options?.force && lastSyncedAtRef.current
              ? new Date(lastSyncedAtRef.current).toISOString()
              : null;
          const convos = await MessagingService.getAllConversations(user.id, user.role, {
            // Force reload only when ensure may have created/updated the assistant row.
            force: Boolean(options?.force || ensured),
            updatedSince: options?.force ? null : updatedSince
          });
          const incoming = sortConversationsByRecent(Array.isArray(convos) ? convos : []).sort(
            (a, b) => {
              const aAi = Number(Boolean((a as any).isScrolitha ?? (a as any).is_scrolitha));
              const bAi = Number(Boolean((b as any).isScrolitha ?? (b as any).is_scrolitha));
              if (aAi !== bAi) return bAi - aAi;
              return 0;
            }
          );
          // Phase 22.1 — soft refresh isolates new rows; force replace still allowed.
          // Always re-merge DIRECT participant pairs so delta soft-refresh cannot reintroduce
          // a legacy duplicate conversation id that was previously collapsed.
          let sorted = mergeDirectConversations(incoming);
          if (!options?.force && conversationsRef.current.length > 0 && updatedSince) {
            const isolated = isolateInboxSoftRefresh(conversationsRef.current, incoming);
            // Auto-apply pending for messaging (unlike feed) so users see new DMs,
            // but preserve relative order of existing sessions (no full reorder thrash).
            sorted = mergeDirectConversations(
              sortConversationsByRecent(
                applyPendingInboxItems(isolated.sessionItems, isolated.pendingNewItems)
              )
            );
          }
          setConversations(sorted);
          recomputeUnread(sorted);
          const refreshedAt = Date.now();
          lastRefreshAtRef.current = refreshedAt;
          lastSyncedAtRef.current = refreshedAt;
          setLastSyncedAt(refreshedAt);
          setSyncState('ready');
          publishMessagingEvent(
            'SYNC_STATE',
            { state: 'ready', conversationCount: sorted.length, at: refreshedAt },
            { source: options?.force ? 'recovery' : 'api' }
          );
          broadcastMultiTabMessaging('UNREAD_CHANGED', {
            unreadCount: sumConversationUnread(sorted)
          });
        } catch (e: any) {
          setError(getRecoverableActionMessage('Message sync', e));
          setSyncState(isOfflineLikeError(e) ? 'offline' : 'error');
          publishMessagingEvent(
            'SYNC_STATE',
            { state: isOfflineLikeError(e) ? 'offline' : 'error' },
            { source: 'api' }
          );
        } finally {
          setLoading(false);
        }
      })();

      inFlightRefreshRef.current = request.finally(() => {
        inFlightRefreshRef.current = null;
      });

      return inFlightRefreshRef.current;
    },
    [user?.id, user?.role, isOnline, recomputeUnread]
  );

  useEffect(() => {
    refreshMessagesRef.current = refreshMessages;
  }, [refreshMessages]);

  const getPreviewConversations = useCallback(
    (tab: MessagingInboxTab, limit = MESSAGING_PREVIEW_LIMIT) => {
      const source =
        debouncedSearch.trim().length >= 2 && searchResults.length > 0
          ? searchResults
          : debouncedSearch.trim().length >= 1
            ? localSearchConversations(conversations, debouncedSearch, user?.id)
            : conversations;
      return filterConversationsForTab(source, tab, limit);
    },
    [conversations, debouncedSearch, searchResults, user?.id]
  );

  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query);
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, MESSAGING_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [searchQuery]);

  useEffect(() => {
    const query = debouncedSearch.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(null);
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
        searchAbortRef.current = null;
      }
      return;
    }

    const seq = ++searchRequestSeqRef.current;
    if (searchAbortRef.current) searchAbortRef.current.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearchLoading(true);
    setSearchError(null);

    void MessagingService.searchConversations(query, {
      limit: MESSAGING_PREVIEW_LIMIT,
      signal: controller.signal
    })
      .then((result) => {
        if (seq !== searchRequestSeqRef.current) return;
        const mapped = (result.results || []).map((entry) => entry.conversation).filter(Boolean);
        setSearchResults(sortConversationsByRecent(mapped as Conversation[]));
        setSearchLoading(false);
      })
      .catch((err: any) => {
        if (controller.signal.aborted || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
          return;
        }
        if (seq !== searchRequestSeqRef.current) return;
        // Fall back to local filter without wiping prior remote results aggressively
        setSearchResults(localSearchConversations(conversationsRef.current, query, userIdRef.current));
        setSearchError(getRecoverableActionMessage('Message search', err));
        setSearchLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [debouncedSearch]);

  const registerVisibleConversation = useCallback((conversationId: string) => {
    const id = safeId(conversationId);
    if (!id) return;
    visibleConversationIdsRef.current.add(id);
  }, []);

  const unregisterVisibleConversation = useCallback((conversationId: string) => {
    const id = safeId(conversationId);
    if (!id) return;
    visibleConversationIdsRef.current.delete(id);
  }, []);

  const markConversationRead = useCallback(
    async (conversationId: string) => {
      const id = safeId(conversationId);
      if (!id || !user?.id) return;

      const previous = conversationsRef.current;
      const previousUnread = getConversationUnreadCount(previous.find((c) => c.id === id));
      const optimistic = setConversationUnreadLocal(previous, id, 0);
      setConversations(optimistic);
      recomputeUnread(optimistic);

      try {
        await MessagingService.markAsRead(id, user.id);
      } catch {
        // Restore previous unread if mark-read fails
        const restored = setConversationUnreadLocal(conversationsRef.current, id, previousUnread);
        setConversations(restored);
        recomputeUnread(restored);
      }
    },
    [user?.id, recomputeUnread]
  );

  const openConversationInDock = useCallback(
    (conversationId: string, options?: { expandDock?: boolean }) => {
      const id = safeId(conversationId);
      if (!id) return;
      const width = typeof window !== 'undefined' ? window.innerWidth : MESSAGING_PREVIEW_LIMIT * 100;
      setOpenChatWindows((current) => upsertOpenChatWindows(current, id, width));
      if (options?.expandDock !== false) {
        setDockExpanded(true);
      }
      void ensureThreadLoadedRef.current?.(id);
      // Opening a visible chat marks read under existing app rules
      registerVisibleConversation(id);
      void markConversationRead(id);
    },
    [markConversationRead, registerVisibleConversation]
  );

  const closeConversationWindow = useCallback(
    (conversationId: string) => {
      const id = safeId(conversationId);
      if (!id) return;
      setOpenChatWindows((current) => current.filter((entry) => entry.conversationId !== id));
      unregisterVisibleConversation(id);
      // Keep per-conversation drafts/attachments for reopen in-session; do not leak across ids.
    },
    [unregisterVisibleConversation]
  );

  const minimizeConversationWindow = useCallback((conversationId: string) => {
    const id = safeId(conversationId);
    if (!id) return;
    setOpenChatWindows((current) =>
      current.map((entry) =>
        entry.conversationId === id ? { ...entry, minimized: true } : entry
      )
    );
    // Minimized windows are not considered fully visible for auto-read
    unregisterVisibleConversation(id);
  }, [unregisterVisibleConversation]);

  const restoreConversationWindow = useCallback(
    (conversationId: string) => {
      const id = safeId(conversationId);
      if (!id) return;
      setOpenChatWindows((current) =>
        current.map((entry) =>
          entry.conversationId === id ? { ...entry, minimized: false } : entry
        )
      );
      registerVisibleConversation(id);
      void markConversationRead(id);
    },
    [markConversationRead, registerVisibleConversation]
  );

  const ensureThreadLoadedRef = useRef<
    ((conversationId: string, options?: { force?: boolean }) => Promise<void>) | null
  >(null);

  const ensureThreadLoaded = useCallback(
    async (conversationId: string, options?: { force?: boolean }) => {
      const id = safeId(conversationId);
      if (!id) return;

      const meta = threadMetaRef.current[id];
      if (!options?.force && meta?.loadedAt && !meta.loading) {
        return;
      }

      const inFlight = threadInFlightRef.current.get(id);
      if (inFlight) return inFlight;

      threadMetaRef.current[id] = {
        loadedAt: meta?.loadedAt ?? null,
        loading: true
      };
      setThreadCache((prev) => ({
        ...prev,
        [id]: {
          messages: prev[id]?.messages || [],
          loading: true,
          error: null,
          loadedAt: prev[id]?.loadedAt ?? null
        }
      }));

      const request = (async () => {
        try {
          const full = await MessagingService.getConversationById(id);
          const messages = dedupeMessagesById(Array.isArray(full?.messages) ? full!.messages : []);
          const loadedAt = Date.now();
          threadMetaRef.current[id] = { loadedAt, loading: false };
          setThreadCache((prev) => ({
            ...prev,
            [id]: {
              messages,
              loading: false,
              error: null,
              loadedAt
            }
          }));
          if (full) {
            setConversations((prev) => {
              const mergeKey = getConversationMergeKey(full);
              const without = prev.filter((entry) => {
                if (entry.id === full.id) return false;
                if (mergeKey && getConversationMergeKey(entry) === mergeKey) return false;
                return true;
              });
              return mergeDirectConversations(sortConversationsByRecent([full, ...without]));
            });
          }
        } catch (e: any) {
          threadMetaRef.current[id] = {
            loadedAt: threadMetaRef.current[id]?.loadedAt ?? null,
            loading: false
          };
          setThreadCache((prev) => ({
            ...prev,
            [id]: {
              messages: prev[id]?.messages || [],
              loading: false,
              error: getRecoverableActionMessage('Conversation load', e),
              loadedAt: prev[id]?.loadedAt ?? null
            }
          }));
        } finally {
          threadInFlightRef.current.delete(id);
        }
      })();

      threadInFlightRef.current.set(id, request);
      return request;
    },
    []
  );

  useEffect(() => {
    ensureThreadLoadedRef.current = ensureThreadLoaded;
  }, [ensureThreadLoaded]);

  const getThreadState = useCallback(
    (conversationId: string): ThreadCacheEntry => {
      const id = safeId(conversationId);
      if (!id) return EMPTY_THREAD;
      return threadCache[id] || EMPTY_THREAD;
    },
    [threadCache]
  );

  const getDraft = useCallback(
    (conversationId: string) => getConversationDraft(drafts, conversationId),
    [drafts]
  );

  const setDraft = useCallback((conversationId: string, text: string) => {
    const id = safeId(conversationId);
    if (!id) return;
    setDrafts((prev) => setConversationDraft(prev, id, text));
  }, []);

  const getReplyTo = useCallback(
    (conversationId: string) => replyToByConversation[safeId(conversationId)] || null,
    [replyToByConversation]
  );

  const setReplyTo = useCallback((conversationId: string, message: Message | null) => {
    const id = safeId(conversationId);
    if (!id) return;
    setReplyToByConversation((prev) => ({ ...prev, [id]: message }));
  }, []);

  const getPendingAttachments = useCallback(
    (conversationId: string) => pendingAttachmentsByConversation[safeId(conversationId)] || [],
    [pendingAttachmentsByConversation]
  );

  const addPendingAttachments = useCallback((conversationId: string, files: UploadedFile[]) => {
    const id = safeId(conversationId);
    if (!id) return;
    const mapped = (Array.isArray(files) ? files : []).map(uploadedFileToPending).filter((item) => item.id);
    if (!mapped.length) return;
    setPendingAttachmentsByConversation((prev) => {
      const existing = prev[id] || [];
      const known = new Set(existing.map((item) => item.id));
      const unique = mapped.filter((item) => !known.has(item.id));
      return { ...prev, [id]: [...existing, ...unique] };
    });
  }, []);

  const removePendingAttachment = useCallback((conversationId: string, attachmentId: string) => {
    const id = safeId(conversationId);
    const attachmentKey = safeId(attachmentId);
    if (!id || !attachmentKey) return;
    setPendingAttachmentsByConversation((prev) => {
      const existing = prev[id] || [];
      const next = existing.filter((item) => item.id !== attachmentKey);
      const removed = existing.filter((item) => item.id === attachmentKey);
      revokePendingObjectUrls(removed);
      return { ...prev, [id]: next };
    });
  }, []);

  const clearPendingAttachments = useCallback((conversationId: string) => {
    const id = safeId(conversationId);
    if (!id) return;
    setPendingAttachmentsByConversation((prev) => {
      const existing = prev[id] || [];
      revokePendingObjectUrls(existing);
      return { ...prev, [id]: [] };
    });
  }, []);

  const updateThreadMessages = useCallback(
    (conversationId: string, updater: (messages: Message[]) => Message[]) => {
      const id = safeId(conversationId);
      if (!id) return;
      setThreadCache((prev) => {
        const current = prev[id] || EMPTY_THREAD;
        return {
          ...prev,
          [id]: {
            ...current,
            messages: dedupeMessagesById(updater(current.messages || []))
          }
        };
      });
    },
    []
  );

  useEffect(() => {
    if (!user?.id) return;
    void MessagingService.getVoiceRuntimeConfig()
      .then((config) => {
        setVoiceRuntimeConfig({
          enabledVoiceNotes: Boolean(config?.enabledVoiceNotes ?? true),
          maxVoiceNoteDurationSeconds: Number(
            config?.maxVoiceNoteDurationSeconds ?? DEFAULT_MAX_VOICE_NOTE_SECONDS
          ),
          blockedForCurrentUser: Boolean((config as any)?.blockedForCurrentUser ?? false)
        });
      })
      .catch(() => {
        // keep defaults
      });
  }, [user?.id]);

  const emitTyping = useCallback(
    (conversationId: string, isTyping: boolean) => {
      const id = safeId(conversationId);
      if (!id || !socket || !user?.id) return;
      const previous = typingEmitRef.current[id] === true;
      if (previous === isTyping) return;
      typingEmitRef.current[id] = isTyping;
      try {
        socket.emit('messages:typing', {
          conversationId: id,
          userId: user.id,
          name: user.name || user.username || 'Someone',
          isTyping
        });
      } catch {
        // ignore ephemeral typing failures
      }
      if (typingStopTimersRef.current[id]) {
        window.clearTimeout(typingStopTimersRef.current[id]);
        delete typingStopTimersRef.current[id];
      }
      if (isTyping) {
        typingStopTimersRef.current[id] = window.setTimeout(() => {
          typingEmitRef.current[id] = false;
          try {
            socket.emit('messages:typing', {
              conversationId: id,
              userId: user.id,
              name: user.name || user.username || 'Someone',
              isTyping: false
            });
          } catch {
            // ignore
          }
        }, 1800);
      }
    },
    [socket, user?.id, user?.name, user?.username]
  );

  const sendInlineMessage = useCallback(
    async (
      conversationId: string,
      text: string,
      options?: {
        replyToMessageId?: string | null;
        attachmentIds?: string[];
        optimisticId?: string | null;
        scrolitha?: boolean;
      }
    ): Promise<Message | null> => {
      const id = safeId(conversationId);
      const trimmed = String(text || '').trim();
      const attachmentIds = Array.isArray(options?.attachmentIds)
        ? options!.attachmentIds.map((entry) => safeId(entry)).filter(Boolean)
        : pendingToAttachmentIds(pendingAttachmentsByConversation[id] || []);
      if (!id || !user?.id) return null;
      if (!trimmed && attachmentIds.length === 0) return null;
      if (sendingIdsRef.current.has(id)) return null;
      const isScrolithaSend = Boolean(options?.scrolitha);

      sendingIdsRef.current.add(id);
      setSendingConversationIds((prev) => ({ ...prev, [id]: true }));
      const optimisticId = safeId(options?.optimisticId) || buildClientSendId(id, Date.now());
      const replyToMessageId = options?.replyToMessageId || replyToByConversation[id]?.id || null;
      const optimistic: Message = {
        id: optimisticId,
        conversationId: id,
        conversation_id: id,
        senderId: user.id,
        sender_id: user.id,
        text: trimmed,
        timestamp: new Date().toISOString(),
        is_read: true,
        isRead: true,
        message_type: attachmentIds.length ? 'file' : 'text',
        messageType: attachmentIds.length ? 'file' : 'text',
        attachments: attachmentIds,
        replyToMessageId,
        reply_to_message_id: replyToMessageId,
        metadata: { clientSendId: optimisticId }
      } as Message;

      trackOutgoingMessage({
        clientSendId: optimisticId,
        conversationId: id,
        text: trimmed,
        attachmentIds,
        replyToMessageId,
        state: 'sending'
      });
      publishMessagingEvent(
        'MESSAGE_CREATED',
        optimistic,
        { conversationId: id, messageId: optimisticId, clientSendId: optimisticId, source: 'local' }
      );

      setThreadCache((prev) => {
        const current = prev[id] || EMPTY_THREAD;
        const withoutRetry = current.messages.filter((entry) => entry.id !== optimisticId);
        const nextEntry = touchThreadCacheEntry({
          ...current,
          messages: dedupeMessagesById([...withoutRetry, optimistic])
        });
        return evictThreadCacheEntries(
          { ...prev, [id]: nextEntry },
          {
            maxEntries: DEFAULT_THREAD_CACHE_MAX,
            protectIds: visibleConversationIdsRef.current
          }
        );
      });

      setConversations((prev) => {
        const next = applyIncomingPreviewUpdate(prev, optimistic, {
          currentUserId: user.id,
          activeConversationIds: visibleConversationIdsRef.current
        });
        recomputeUnread(next);
        return next;
      });

      try {
        const serverMessage = await MessagingService.sendMessage(
          id,
          user.id,
          trimmed,
          user.role,
          attachmentIds,
          replyToMessageId,
          {
            scrolitha: isScrolithaSend,
            // Phase 22.1 — always send clientMessageId for idempotent retries (incl. Scrolitha).
            clientMessageId: optimisticId,
            clientRequestId: optimisticId,
            timeoutMs: isScrolithaSend ? 95_000 : undefined
          }
        );
        const serverId = safeId(serverMessage.id);
        seenMessageIdsRef.current.add(serverId);
        globalMessagingSeenIds.remember(serverId);
        globalMessagingSeenIds.remember(optimisticId);
        const reconciledServer = {
          ...serverMessage,
          metadata: {
            ...(serverMessage as any).metadata,
            clientSendId: optimisticId
          }
        } as Message;
        markOutgoingState(optimisticId, 'sent', { serverMessageId: serverId });
        publishMessagingEvent(
          'MESSAGE_DELIVERED',
          reconciledServer,
          {
            conversationId: id,
            messageId: serverId,
            clientSendId: optimisticId,
            source: 'api'
          }
        );
        broadcastMultiTabMessaging('MESSAGE_CREATED', {
          conversationId: id,
          message: reconciledServer
        });
        setThreadCache((prev) => {
          const current = prev[id] || EMPTY_THREAD;
          return {
            ...prev,
            [id]: touchThreadCacheEntry({
              ...current,
              messages: reconcileOptimisticMessage(current.messages, reconciledServer)
            })
          };
        });
        setConversations((prev) => {
          const next = applyIncomingPreviewUpdate(prev, reconciledServer, {
            currentUserId: user.id,
            activeConversationIds: visibleConversationIdsRef.current
          });
          recomputeUnread(next);
          return next;
        });

        // Phase 20.7.2 — inject assistant from HTTP envelope (do not rely only on socket).
        const scrolithaTurn = (serverMessage as any)?.scrolithaTurn;
        const assistantRaw = scrolithaTurn?.assistantMessage;
        if (assistantRaw?.id) {
          const assistant = {
            ...assistantRaw,
            conversationId: id,
            conversation_id: id
          } as Message;
          const assistantId = safeId(assistant.id);
          if (assistantId && !seenMessageIdsRef.current.has(assistantId)) {
            seenMessageIdsRef.current.add(assistantId);
            globalMessagingSeenIds.add(assistantId);
          }
          setThreadCache((prev) => {
            const current = prev[id] || EMPTY_THREAD;
            return {
              ...prev,
              [id]: touchThreadCacheEntry({
                ...current,
                messages: reconcileOptimisticMessage(current.messages, assistant)
              })
            };
          });
          setConversations((prev) => {
            const next = applyIncomingPreviewUpdate(prev, assistant, {
              currentUserId: user.id,
              activeConversationIds: visibleConversationIdsRef.current
            });
            recomputeUnread(next);
            return next;
          });
          publishMessagingEvent('MESSAGE_CREATED', assistant, {
            conversationId: id,
            messageId: assistantId,
            source: 'api'
          });
        } else if (isScrolithaSend && scrolithaTurn?.status && scrolithaTurn.status !== 'ok') {
          publishMessagingEvent(
            'MESSAGE_FAILED',
            {
              conversationId: id,
              error: String(scrolithaTurn.reason || 'scrolitha_no_reply'),
              scrolithaTurn
            },
            { conversationId: id, source: 'api' }
          );
        }

        setDrafts((prev) => clearConversationDraft(prev, id));
        setReplyToByConversation((prev) => ({ ...prev, [id]: null }));
        setPendingAttachmentsByConversation((prev) => {
          revokePendingObjectUrls(prev[id] || []);
          return { ...prev, [id]: [] };
        });
        emitTyping(id, false);
        scheduleSoftRefresh();
        return reconciledServer;
      } catch (e) {
        markOutgoingState(optimisticId, 'failed', {
          error: getRecoverableActionMessage('Message send', e)
        });
        publishMessagingEvent(
          'MESSAGE_FAILED',
          { clientSendId: optimisticId, conversationId: id, error: String((e as any)?.message || e) },
          { conversationId: id, clientSendId: optimisticId, source: 'api' }
        );
        setThreadCache((prev) => {
          const current = prev[id] || EMPTY_THREAD;
          return {
            ...prev,
            [id]: {
              ...current,
              messages: current.messages.map((entry) =>
                entry.id === optimisticId
                  ? {
                      ...entry,
                      metadata: {
                        ...(entry.metadata || {}),
                        sendFailed: true,
                        clientSendId: optimisticId,
                        failedText: trimmed,
                        failedAttachmentIds: attachmentIds,
                        failedReplyToMessageId: replyToMessageId
                      }
                    }
                  : entry
              ),
              error: getRecoverableActionMessage('Message send', e)
            }
          };
        });
        throw e;
      } finally {
        sendingIdsRef.current.delete(id);
        setSendingConversationIds((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [
      user?.id,
      user?.role,
      recomputeUnread,
      emitTyping,
      scheduleSoftRefresh,
      pendingAttachmentsByConversation,
      replyToByConversation
    ]
  );

  const sendInlineVoiceNote = useCallback(
    async (
      conversationId: string,
      payload: { blob: Blob; durationMs: number }
    ): Promise<Message | null> => {
      const id = safeId(conversationId);
      if (!id || !user?.id) return null;
      if (!voiceRuntimeConfig.enabledVoiceNotes || voiceRuntimeConfig.blockedForCurrentUser) {
        throw new Error('Voice notes are disabled for this account.');
      }
      if (sendingIdsRef.current.has(id)) return null;
      sendingIdsRef.current.add(id);
      setSendingConversationIds((prev) => ({ ...prev, [id]: true }));
      try {
        if (!payload.blob || Number(payload.blob.size || 0) < 32) {
          throw new Error('Recording was empty or too short. Try again and speak for a moment.');
        }
        const mime = String(payload.blob.type || 'audio/webm').split(';')[0] || 'audio/webm';
        const extension = mime.includes('ogg')
          ? 'ogg'
          : mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')
            ? 'm4a'
            : mime.includes('mpeg') || mime.includes('mp3')
              ? 'mp3'
              : 'webm';
        const file = new File([payload.blob], `voice-note-${Date.now()}.${extension}`, {
          type: mime
        });
        // Prefer audio-capable category mapping; document remains valid backend fallback.
        const uploaded = await FileService.uploadFile(file, 'document', {
          role: user.role,
          userId: user.id,
          visibility: 'private'
        });
        const fileId = String(uploaded.id || uploaded.fileId || '').trim();
        if (!fileId) {
          throw new Error('Voice upload did not return a file id. Please retry.');
        }
        const message = await MessagingService.sendVoiceNote(id, {
          fileId,
          durationMs: Math.max(1, Math.trunc(payload.durationMs || 0))
        });
        seenMessageIdsRef.current.add(safeId(message.id));
        updateThreadMessages(id, (messages) => dedupeMessagesById([...messages, message]));
        setConversations((prev) => {
          const next = applyIncomingPreviewUpdate(prev, message, {
            currentUserId: user.id,
            activeConversationIds: visibleConversationIdsRef.current
          });
          recomputeUnread(next);
          return next;
        });
        scheduleSoftRefresh();
        return message;
      } finally {
        sendingIdsRef.current.delete(id);
        setSendingConversationIds((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [
      user?.id,
      user?.role,
      voiceRuntimeConfig.enabledVoiceNotes,
      voiceRuntimeConfig.blockedForCurrentUser,
      updateThreadMessages,
      recomputeUnread,
      scheduleSoftRefresh
    ]
  );

  const retryFailedMessage = useCallback(
    async (conversationId: string, messageId: string): Promise<Message | null> => {
      const id = safeId(conversationId);
      const mid = safeId(messageId);
      if (!id || !mid) return null;
      const thread = threadCache[id];
      const failed = (thread?.messages || []).find((entry) => entry.id === mid);
      if (!failed) return null;
      const meta = (failed.metadata || {}) as any;
      const text = String(meta.failedText ?? failed.text ?? '').trim();
      const attachmentIds = Array.isArray(meta.failedAttachmentIds)
        ? meta.failedAttachmentIds.map((entry: any) => String(entry || '').trim()).filter(Boolean)
        : [];
      return sendInlineMessage(id, text, {
        attachmentIds,
        replyToMessageId: meta.failedReplyToMessageId || null,
        optimisticId: mid
      });
    },
    [threadCache, sendInlineMessage]
  );

  const toggleReaction = useCallback(
    async (conversationId: string, messageId: string, emoji: string) => {
      const id = safeId(conversationId);
      const mid = safeId(messageId);
      if (!id || !mid || !user?.id) return;
      let snapshot: Message | null = null;
      setThreadCache((prev) => {
        const current = prev[id] || EMPTY_THREAD;
        snapshot = (current.messages || []).find((entry) => entry.id === mid) || null;
        return {
          ...prev,
          [id]: {
            ...current,
            messages: (current.messages || []).map((entry) =>
              entry.id === mid ? applyLocalReactionToggle(entry, user.id, emoji) : entry
            )
          }
        };
      });
      try {
        const updated = await MessagingService.toggleReaction(id, mid, user.id, emoji);
        if (updated?.messageId) {
          const nextReactions = Array.isArray(updated.reactions)
            ? normalizeMessageReactions(updated.reactions)
            : null;
          const nextSummary =
            updated.reactionSummary ||
            (nextReactions
              ? nextReactions.reduce((acc: Record<string, number>, reaction: any) => {
                  const key = String(reaction?.emoji || '').trim();
                  if (!key) return acc;
                  acc[key] = (acc[key] || 0) + 1;
                  return acc;
                }, {})
              : undefined);
          updateThreadMessages(id, (messages) =>
            messages.map((entry) =>
              entry.id === updated.messageId
                ? {
                    ...entry,
                    reactions: nextReactions !== null ? nextReactions : entry.reactions,
                    reactionSummary:
                      nextSummary !== undefined ? nextSummary : (entry as any).reactionSummary
                  }
                : entry
            )
          );
        }
      } catch (error) {
        // Rollback optimistic reaction without full-thread refetch thrash.
        if (snapshot) {
          const previous = snapshot;
          updateThreadMessages(id, (messages) =>
            messages.map((entry) => (entry.id === mid ? previous : entry))
          );
        } else {
          await ensureThreadLoaded(id, { force: true });
        }
        throw error;
      }
    },
    [user?.id, updateThreadMessages, ensureThreadLoaded]
  );

  const editMessage = useCallback(
    async (conversationId: string, messageId: string, text: string) => {
      const id = safeId(conversationId);
      const mid = safeId(messageId);
      const nextText = String(text || '').trim();
      if (!id || !mid || !nextText) return;
      const updated = await MessagingService.editMessage(id, mid, nextText);
      updateThreadMessages(id, (messages) =>
        messages.map((entry) =>
          entry.id === mid ? mergeEditResponseIntoMessage(entry, updated as any) : entry
        )
      );
      scheduleSoftRefresh();
    },
    [updateThreadMessages, scheduleSoftRefresh]
  );

  const deleteMessage = useCallback(
    async (conversationId: string, messageId: string, scope: 'me' | 'everyone') => {
      const id = safeId(conversationId);
      const mid = safeId(messageId);
      if (!id || !mid) return;
      // Capture attachment keys before local removal so private blobs can be revoked.
      const existing = (threadCache[id]?.messages || []).find((entry) => entry.id === mid);
      const result = await MessagingService.deleteMessage(id, mid, scope);
      const deletedForMe = Boolean(result?.deletedForMe ?? result?.deleted_for_me ?? scope === 'me');
      if (existing) {
        void import('../services/messagingMedia')
          .then((mod) => {
            mod.revokeMessageAttachmentMediaUrls(existing);
          })
          .catch(() => {
            // best-effort
          });
      }
      if (deletedForMe) {
        updateThreadMessages(id, (messages) => messages.filter((entry) => entry.id !== mid));
      } else {
        updateThreadMessages(id, (messages) =>
          messages.map((entry) => (entry.id === mid ? markMessageDeletedEveryone(entry) : entry))
        );
      }
      if (replyToByConversation[id]?.id === mid) {
        setReplyToByConversation((prev) => ({ ...prev, [id]: null }));
      }
      scheduleSoftRefresh();
    },
    [updateThreadMessages, replyToByConversation, scheduleSoftRefresh, threadCache]
  );

  const copyMessage = useCallback(
    async (conversationId: string, message: Message) => {
      const id = safeId(conversationId);
      const mid = safeId(message?.id);
      if (!id || !mid) return;
      const text = String(message.text || '');
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.focus();
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      }
      await MessagingService.copyMessage(id, mid);
    },
    []
  );

  const disconnectedSinceRef = useRef<number | null>(null);

  // Initial load + bounded polling fallback (never while healthy; grace before poll).
  useEffect(() => {
    if (!user?.id) {
      setUnreadCount(0);
      setConversations([]);
      setError(null);
      setOpenChatWindows([]);
      setThreadCache({});
      setDrafts({});
      setReplyToByConversation({});
      setPendingAttachmentsByConversation((prev) => {
        Object.values(prev).forEach((items) => revokePendingObjectUrls(items || []));
        return {};
      });
      setTypingByConversation({});
      seenMessageIdsRef.current.clear();
      visibleConversationIdsRef.current.clear();
      disconnectedSinceRef.current = null;
      resetMessagingEngineSession();
      // Session cleared / logout: revoke all private messaging media object URLs.
      void import('../services/messagingMedia')
        .then((mod) => {
          mod.revokeAllAuthenticatedMediaUrls();
        })
        .catch(() => {
          // best-effort
        });
      return;
    }
    void refreshMessages();

    if (isConnected) {
      disconnectedSinceRef.current = null;
      return undefined;
    }
    if (!disconnectedSinceRef.current) {
      disconnectedSinceRef.current = Date.now();
    }

    let intervalId: number | null = null;
    const armPolling = () => {
      const decision = decideMessagingFallbackPolling({
        health: connectionHealth || (isOnline ? 'disconnected' : 'offline'),
        isOnline,
        disconnectedSince: disconnectedSinceRef.current,
        tabHidden: typeof document !== 'undefined' && document.visibilityState === 'hidden'
      });
      if (!decision.shouldPoll) {
        if (intervalId) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
        return;
      }
      if (intervalId) return;
      intervalId = window.setInterval(() => {
        void refreshMessages();
      }, decision.intervalMs);
    };

    // Grace period before any fallback poll starts.
    const graceTimer = window.setTimeout(() => {
      armPolling();
    }, MESSAGING_POLL_GRACE_MS + 200);

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !isConnected && isOnline) {
        void refreshMessages({ force: true });
      }
      armPolling();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearTimeout(graceTimer);
      if (intervalId) window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user?.id, isConnected, connectionHealth, refreshMessages, isOnline]);

  useEffect(() => {
    if (!user?.id || !isOnline || recoveryTick <= 0) return;
    publishMessagingEvent(
      'MISSED_EVENTS_RECOVERY',
      { reason: 'network_recovery', tick: recoveryTick },
      { source: 'recovery' }
    );
    void refreshMessages({ force: true });
  }, [user?.id, isOnline, recoveryTick, refreshMessages]);

  // Observe shared Socket.IO connection health (no second websocket).
  useEffect(() => {
    bindMessagingSocketHealth(socket);
    return () => {
      bindMessagingSocketHealth(null);
    };
  }, [socket]);

  // Multi-tab: unread / conversation soft-sync without extra sockets.
  useEffect(() => {
    if (!user?.id) return;
    return subscribeMultiTabMessaging((envelope) => {
      if (envelope.type === 'UNREAD_CHANGED') {
        const remoteUnread = Number((envelope.payload as any)?.unreadCount);
        if (Number.isFinite(remoteUnread) && remoteUnread >= 0) {
          // Soft recovery — never blindly trust remote without list reconcile.
          scheduleSoftRefresh();
        }
        return;
      }
      if (
        envelope.type === 'MESSAGE_CREATED' ||
        envelope.type === 'MESSAGE_UPDATED' ||
        envelope.type === 'CONVERSATION_UPDATED' ||
        envelope.type === 'CONVERSATION_DELETED'
      ) {
        scheduleSoftRefresh();
      }
    });
  }, [user?.id, scheduleSoftRefresh]);

  // Phase 22.1 — flush durable outbox fairly on reconnect (FIFO per conversation).
  const flushDurableOutbox = useCallback(async () => {
    if (!user?.id || outboxFlushInFlightRef.current) return;
    const pending = listDurableOutboxFlushOrder();
    const retryable = listRetryableOutgoing();
    const combinedIds = new Set<string>();
    const work = [
      ...pending.map((p) => ({
        clientMessageId: p.clientMessageId,
        conversationId: p.conversationId,
        text: p.text,
        attachmentIds: p.attachmentIds,
        replyToMessageId: p.replyToMessageId,
        scrolitha: p.scrolitha
      })),
      ...retryable.map((r) => ({
        clientMessageId: r.clientSendId,
        conversationId: r.conversationId,
        text: r.text,
        attachmentIds: r.attachmentIds,
        replyToMessageId: r.replyToMessageId,
        scrolitha: false
      }))
    ].filter((item) => {
      if (combinedIds.has(item.clientMessageId)) return false;
      combinedIds.add(item.clientMessageId);
      return Boolean(item.conversationId && item.clientMessageId);
    });
    if (!work.length) return;
    outboxFlushInFlightRef.current = true;
    try {
      for (const item of work) {
        try {
          markOutgoingState(item.clientMessageId, 'retry');
          await sendInlineMessage(item.conversationId, item.text, {
            attachmentIds: item.attachmentIds,
            replyToMessageId: item.replyToMessageId,
            optimisticId: item.clientMessageId,
            scrolitha: item.scrolitha
          });
        } catch {
          // Leave failed item for next flush; sendInlineMessage marks failed.
        }
      }
    } finally {
      outboxFlushInFlightRef.current = false;
    }
  }, [user?.id, sendInlineMessage]);

  // Reconnect path: delta inbox + outbox replay after an actual disconnect.
  const wasConnectedRef = useRef(false);
  const hadDisconnectRef = useRef(false);
  useEffect(() => {
    if (!user?.id) {
      wasConnectedRef.current = false;
      hadDisconnectRef.current = false;
      return;
    }
    if (!isConnected && wasConnectedRef.current) {
      hadDisconnectRef.current = true;
    }
    if (isConnected && !wasConnectedRef.current && hadDisconnectRef.current) {
      publishMessagingEvent(
        'MISSED_EVENTS_RECOVERY',
        {
          reason: 'socket_reconnect',
          health: getSocketHealthSnapshot()
        },
        { source: 'recovery' }
      );
      // Soft delta refresh preferred; force only if we have no prior clock.
      void refreshMessages({ force: !lastSyncedAtRef.current }).then(() => flushDurableOutbox());
      hadDisconnectRef.current = false;
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected, user?.id, refreshMessages, flushDurableOutbox]);

  // Centralized socket reconciliation for shared surfaces
  // Single shared-surface listener registration per provider mount / socket instance.
  // Cleanup removes the exact handler functions so reconnect/provider replacement cannot stack.
  useEffect(() => {
    if (!socket || !user?.id) return;

    const handleIncoming = (payload: any) => {
      const message = normalizeSocketMessage(payload);
      if (!message) {
        scheduleSoftRefresh();
        return;
      }
      const messageId = safeId(message.id);
      const clientSendId = safeId(
        (message as any)?.metadata?.clientSendId ||
          (message as any)?.metadata?.client_send_id ||
          (payload as any)?.clientSendId
      );
      // Session-local + engine-level dedupe: never inflate unread twice.
      const isNew = Boolean(messageId) && !seenMessageIdsRef.current.has(messageId);
      if (messageId) {
        seenMessageIdsRef.current.add(messageId);
        if (isNew) globalMessagingSeenIds.add(messageId);
        else globalMessagingSeenIds.remember(messageId);
        if (seenMessageIdsRef.current.size > 800) {
          const trimmed = Array.from(seenMessageIdsRef.current).slice(-400);
          seenMessageIdsRef.current = new Set(trimmed);
        }
      }
      if (clientSendId) {
        globalMessagingSeenIds.remember(clientSendId);
        markOutgoingState(clientSendId, 'delivered', { serverMessageId: messageId || undefined });
      }

      const conversationId = safeId(message.conversationId || message.conversation_id);
      publishMessagingEvent(
        'MESSAGE_CREATED',
        message,
        {
          conversationId,
          messageId,
          clientSendId: clientSendId || undefined,
          source: 'socket'
        }
      );
      if (isNew) {
        broadcastMultiTabMessaging('MESSAGE_CREATED', { conversationId, messageId });
      }

      // Shared conversation list + unread badge: single authoritative path (this handler).
      // applyIncomingPreviewUpdate is idempotent for already-present message ids.
      setConversations((prev) => {
        const hasConversation = prev.some(
          (entry) =>
            entry.id === conversationId || messageMatchesConversation(message as any, entry)
        );
        if (!hasConversation) {
          if (!isNew) return prev;
          scheduleSoftRefresh();
          void MessagingService.getConversationById(conversationId)
            .then((full) => {
              if (!full) return;
              setConversations((current) => {
                const mergeKey = getConversationMergeKey(full);
                const without = current.filter((entry) => {
                  if (entry.id === full.id) return false;
                  if (mergeKey && getConversationMergeKey(entry) === mergeKey) return false;
                  return true;
                });
                // Prefer server unread for newly discovered conversations to avoid local double-count.
                const next = mergeDirectConversations(
                  sortConversationsByRecent([full, ...without])
                );
                recomputeUnread(next);
                return next;
              });
            })
            .catch(() => {
              scheduleSoftRefresh();
            });
          return prev;
        }

        const next = applyIncomingPreviewUpdate(prev, message, {
          currentUserId: userIdRef.current,
          activeConversationIds: visibleConversationIdsRef.current
        });
        recomputeUnread(next);
        return next;
      });

      if (conversationId) {
        // Phase 22.3 — delivery watermark when we receive someone else's message
        const senderId = safeId((message as any).senderId || (message as any).sender_id);
        if (
          isNew &&
          messageId &&
          senderId &&
          senderId !== userIdRef.current
        ) {
          void MessagingService.postConversationReceipts(conversationId, {
            deliveredUpToMessageId: messageId,
            deliveredAt: new Date().toISOString()
          }).catch(() => null);
        }

        // Inline dock threads only — full /messages keeps its own presentation state.
        setThreadCache((prev) => {
          const current = prev[conversationId];
          if (!current) return prev;
          return {
            ...prev,
            [conversationId]: {
              ...current,
              messages: reconcileOptimisticMessage(current.messages, message)
            }
          };
        });

        if (
          isNew &&
          visibleConversationIdsRef.current.has(conversationId) &&
          safeId(message.senderId || message.sender_id) !== userIdRef.current
        ) {
          void markConversationRead(conversationId);
        }
      }
    };
    // Note: isNew gates badge inflation & mark-read; thread merge remains idempotent.

    const handleRead = (payload: any) => {
      const conversationId = safeId(payload?.conversationId ?? payload?.conversation_id);
      if (!conversationId) return;
      publishMessagingEvent(
        'MESSAGE_READ',
        payload,
        { conversationId, source: 'socket' }
      );
      broadcastMultiTabMessaging('MESSAGE_READ', { conversationId });
      setConversations((prev) => {
        const next = setConversationUnreadLocal(prev, conversationId, 0);
        recomputeUnread(next);
        return next;
      });
    };

    // Phase 22.3 — peer watermark receipts → update outgoing tick state
    const handleReceipts = (payload: any) => {
      const conversationId = safeId(payload?.conversationId ?? payload?.conversation_id);
      const peerUserId = safeId(payload?.userId ?? payload?.user_id);
      if (!conversationId || !peerUserId) return;
      if (peerUserId === userIdRef.current) {
        // Self multi-tab read watermark
        setConversations((prev) => {
          const next = setConversationUnreadLocal(prev, conversationId, 0);
          recomputeUnread(next);
          return next;
        });
        return;
      }
      const lastReadAt = payload?.lastReadAt ? new Date(payload.lastReadAt).getTime() : 0;
      const lastDeliveredAt = payload?.lastDeliveredAt
        ? new Date(payload.lastDeliveredAt).getTime()
        : lastReadAt;
      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          const messages = (conversation.messages || []).map((message: any) => {
            if (String(message.senderId || message.sender_id) !== String(userIdRef.current || '')) {
              return message;
            }
            const created = new Date(message.timestamp || 0).getTime();
            if (!created) return message;
            let deliveryStatus = message.deliveryStatus || message.delivery_status || 'sent';
            if (lastReadAt && created <= lastReadAt) deliveryStatus = 'read';
            else if (lastDeliveredAt && created <= lastDeliveredAt) {
              if (deliveryStatus !== 'read') deliveryStatus = 'delivered';
            }
            return {
              ...message,
              deliveryStatus,
              delivery_status: deliveryStatus,
              is_read: deliveryStatus === 'read',
              isRead: deliveryStatus === 'read',
              is_delivered: deliveryStatus === 'delivered' || deliveryStatus === 'read',
              isDelivered: deliveryStatus === 'delivered' || deliveryStatus === 'read'
            };
          });
          return { ...conversation, messages };
        })
      );
    };

    const handleTyping = (payload: any) => {
      const conversationId = safeId(payload?.conversationId ?? payload?.conversation_id);
      const typingUserId = safeId(payload?.userId ?? payload?.user_id);
      if (!conversationId || !typingUserId || typingUserId === userIdRef.current) return;
      if (!payload?.isTyping) {
        setTypingByConversation((prev) => ({ ...prev, [conversationId]: null }));
        publishMessagingEvent(
          'USER_STOPPED_TYPING',
          { conversationId, userId: typingUserId },
          { conversationId, source: 'socket' }
        );
        return;
      }
      const name = safeId(payload?.name) || 'Someone';
      setTypingByConversation((prev) => ({ ...prev, [conversationId]: name }));
      publishMessagingEvent(
        'USER_TYPING',
        { conversationId, userId: typingUserId, name },
        { conversationId, source: 'socket' }
      );
      if (typingClearTimersRef.current[conversationId]) {
        window.clearTimeout(typingClearTimersRef.current[conversationId]);
      }
      typingClearTimersRef.current[conversationId] = window.setTimeout(() => {
        setTypingByConversation((prev) => ({ ...prev, [conversationId]: null }));
        publishMessagingEvent(
          'USER_STOPPED_TYPING',
          { conversationId, userId: typingUserId },
          { conversationId, source: 'local' }
        );
      }, 2200);
    };

    const handlePresence = (payload: any) => {
      const presenceUserId = safeId(payload?.userId ?? payload?.user_id);
      if (!presenceUserId) return;
      const state = String(payload?.state || '').toLowerCase();
      const isOnlineUser =
        state === 'online' || state === 'away'
          ? true
          : Boolean(payload?.isOnline ?? payload?.is_online);
      const lastSeenAt = payload?.lastSeenAt ?? payload?.last_seen_at;
      publishMessagingEvent(
        isOnlineUser ? 'USER_ONLINE' : 'USER_OFFLINE',
        { userId: presenceUserId, lastSeenAt, state: state || (isOnlineUser ? 'online' : 'offline') },
        { source: 'socket' }
      );
      setConversations((prev) =>
        prev.map((conversation) => ({
          ...conversation,
          participants: conversation.participants.map((participant) =>
            participant.id === presenceUserId
              ? {
                  ...participant,
                  isOnline: isOnlineUser,
                  is_online: isOnlineUser,
                  presenceState: state || (isOnlineUser ? 'online' : 'offline'),
                  lastSeenAt,
                  last_seen_at: lastSeenAt
                }
              : participant
          )
        }))
      );
    };

    const handleRecording = (payload: any) => {
      const conversationId = safeId(payload?.conversationId ?? payload?.conversation_id);
      const recordingUserId = safeId(payload?.userId ?? payload?.user_id);
      if (!conversationId || !recordingUserId || recordingUserId === userIdRef.current) return;
      if (!payload?.isRecording) {
        setTypingByConversation((prev) => {
          if (prev[conversationId]?.startsWith('recording:')) {
            return { ...prev, [conversationId]: null };
          }
          return prev;
        });
        return;
      }
      const name = String(payload?.name || 'Someone');
      setTypingByConversation((prev) => ({
        ...prev,
        [conversationId]: `recording:${name}`
      }));
    };

    const handleMessageUpdated = (payload: any) => {
      const conversationId = safeId(payload?.conversationId ?? payload?.conversation_id);
      const messageId = safeId(payload?.messageId ?? payload?.id);
      if (!conversationId || !messageId) return;
      const deletedForMe = Boolean(payload?.deletedForMe ?? payload?.deleted_for_me);
      const deletedEveryone = Boolean(payload?.isDeleted ?? payload?.is_deleted);
      const isReactionUpdate =
        payload?.updateKind === 'reaction' ||
        Array.isArray(payload?.reactions) ||
        Boolean(payload?.reactionSummary || payload?.reaction_summary);
      const hasReactions = Array.isArray(payload?.reactions);
      const nextReactions = hasReactions ? normalizeMessageReactions(payload.reactions) : null;
      const nextReactionSummary =
        payload?.reactionSummary ??
        payload?.reaction_summary ??
        (nextReactions
          ? nextReactions.reduce((acc: Record<string, number>, reaction: any) => {
              const key = String(reaction?.emoji || '').trim();
              if (!key) return acc;
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            }, {})
          : undefined);

      setThreadCache((prev) => {
        const current = prev[conversationId];
        if (!current) return prev;
        const nextMessages = deletedForMe
          ? current.messages.filter((entry) => entry.id !== messageId)
          : current.messages.map((entry) => {
              if (entry.id !== messageId) return entry;
              if (deletedEveryone) {
                return markMessageDeletedEveryone({
                  ...entry,
                  text: payload?.text ?? '[Message deleted]',
                  attachments: Array.isArray(payload?.attachments) ? payload.attachments : []
                });
              }
              return {
                ...entry,
                // Reaction-only events omit text/attachments — preserve existing body.
                text: isReactionUpdate
                  ? entry.text
                  : payload?.text !== undefined
                    ? payload.text
                    : entry.text,
                isDeleted: Boolean(payload?.isDeleted ?? payload?.is_deleted ?? entry.isDeleted),
                is_deleted: Boolean(payload?.is_deleted ?? payload?.isDeleted ?? entry.is_deleted),
                editedAt: isReactionUpdate
                  ? entry.editedAt
                  : payload?.editedAt ?? payload?.edited_at ?? entry.editedAt,
                edited_at: isReactionUpdate
                  ? entry.edited_at
                  : payload?.edited_at ?? payload?.editedAt ?? entry.edited_at,
                deletedAt: payload?.deletedAt ?? payload?.deleted_at ?? entry.deletedAt,
                deleted_at: payload?.deleted_at ?? payload?.deletedAt ?? entry.deleted_at,
                reactions: nextReactions !== null ? nextReactions : entry.reactions,
                reactionSummary:
                  nextReactionSummary !== undefined
                    ? nextReactionSummary
                    : (entry as any).reactionSummary,
                attachments:
                  isReactionUpdate || !Array.isArray(payload?.attachments)
                    ? entry.attachments
                    : payload.attachments
              };
            });
        return {
          ...prev,
          [conversationId]: { ...current, messages: nextMessages }
        };
      });

      setConversations((prev) => {
        const next = prev.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
          const nextMessages = deletedForMe
            ? messages.filter((entry) => entry.id !== messageId)
            : messages.map((entry) => {
                if (entry.id !== messageId) return entry;
                if (deletedEveryone) {
                  return markMessageDeletedEveryone({
                    ...entry,
                    text: payload?.text ?? '[Message deleted]'
                  });
                }
                return {
                  ...entry,
                  text: isReactionUpdate
                    ? entry.text
                    : payload?.text !== undefined
                      ? payload.text
                      : entry.text,
                  isDeleted: Boolean(payload?.isDeleted ?? payload?.is_deleted ?? entry.isDeleted),
                  is_deleted: Boolean(payload?.is_deleted ?? payload?.isDeleted ?? entry.is_deleted),
                  editedAt: isReactionUpdate
                    ? entry.editedAt
                    : payload?.editedAt ?? payload?.edited_at ?? entry.editedAt,
                  edited_at: isReactionUpdate
                    ? entry.edited_at
                    : payload?.edited_at ?? payload?.editedAt ?? entry.edited_at,
                  reactions: nextReactions !== null ? nextReactions : entry.reactions,
                  reactionSummary:
                    nextReactionSummary !== undefined
                      ? nextReactionSummary
                      : (entry as any).reactionSummary
                };
              });
          // Reaction updates should not reshuffle inbox preview/order.
          if (isReactionUpdate && !deletedForMe && !deletedEveryone) {
            return {
              ...conversation,
              messages: nextMessages
            } as Conversation;
          }
          const last = nextMessages[nextMessages.length - 1];
          const preview =
            payload?.lastMessage ??
            payload?.last_message ??
            getMessagePreviewText(last) ??
            conversation.lastMessage;
          const lastAt =
            payload?.lastMessageAt ??
            payload?.last_message_at ??
            last?.timestamp ??
            conversation.lastMessageAt ??
            conversation.last_message_at;
          return {
            ...conversation,
            messages: nextMessages,
            lastMessage: preview,
            last_message: preview,
            lastMessageAt: lastAt,
            last_message_at: lastAt
          } as Conversation;
        });
        return isReactionUpdate && !deletedForMe && !deletedEveryone
          ? next
          : sortConversationsByRecent(next);
      });
    };

    const handleConversationUpdated = (payload: any) => {
      const conversationId = safeId(payload?.conversationId ?? payload?.conversation_id);
      if (!conversationId) return;
      setConversations((prev) => {
        const next = prev.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          return {
            ...conversation,
            ...(payload?.label !== undefined ? { label: payload.label } : {}),
            ...(payload?.isStarred !== undefined
              ? { isStarred: Boolean(payload.isStarred), is_starred: Boolean(payload.isStarred) }
              : {}),
            ...(payload?.isMuted !== undefined
              ? { isMuted: Boolean(payload.isMuted), is_muted: Boolean(payload.isMuted) }
              : {}),
            ...(payload?.isArchived !== undefined
              ? { isArchived: Boolean(payload.isArchived), is_archived: Boolean(payload.isArchived) }
              : {}),
            ...(payload?.unread_count !== undefined || payload?.unreadCount !== undefined
              ? {
                  unreadCount: Number(payload?.unreadCount ?? payload?.unread_count ?? 0),
                  unread_count: Number(payload?.unread_count ?? payload?.unreadCount ?? 0)
                }
              : {}),
            ...(payload?.lastMessage !== undefined || payload?.last_message !== undefined
              ? {
                  lastMessage: payload?.lastMessage ?? payload?.last_message,
                  last_message: payload?.last_message ?? payload?.lastMessage
                }
              : {}),
            ...(payload?.lastMessageAt !== undefined || payload?.last_message_at !== undefined
              ? {
                  lastMessageAt: payload?.lastMessageAt ?? payload?.last_message_at,
                  last_message_at: payload?.last_message_at ?? payload?.lastMessageAt
                }
              : {})
          } as Conversation;
        });
        recomputeUnread(next);
        return sortConversationsByRecent(next);
      });
    };

    const handleConversationDeleted = (payload: any) => {
      const conversationId = safeId(payload?.conversationId ?? payload?.conversation_id);
      if (!conversationId) return;
      setConversations((prev) => {
        const target = prev.find((entry) => entry.id === conversationId);
        const mergeKey = target ? getConversationMergeKey(target) : '';
        const next = prev.filter((entry) => {
          if (entry.id === conversationId) return false;
          if (mergeKey && getConversationMergeKey(entry) === mergeKey) return false;
          return true;
        });
        recomputeUnread(next);
        return next;
      });
      setOpenChatWindows((prev) => prev.filter((entry) => entry.conversationId !== conversationId));
      setThreadCache((prev) => {
        if (!prev[conversationId]) return prev;
        const next = { ...prev };
        delete next[conversationId];
        return next;
      });
    };

    socket.on('messages:new', handleIncoming);
    socket.on('messages:sent', handleIncoming);
    socket.on('messages:read', handleRead);
    socket.on('messages:receipts', handleReceipts);
    socket.on('messages:typing', handleTyping);
    socket.on('messages:recording', handleRecording);
    socket.on('presence:update', handlePresence);
    socket.on('presence:updated', handlePresence);
    socket.on('messages:updated', handleMessageUpdated);
    socket.on('messages:reaction', handleMessageUpdated);
    socket.on('messages:conversation_updated', handleConversationUpdated);
    socket.on('messages:conversation_deleted', handleConversationDeleted);

    // Phase 22.3 — presence heartbeat (~30s) + socket pulse
    const heartbeat = () => {
      try {
        socket.emit('presence:heartbeat', { state: 'online' });
      } catch {
        /* ignore */
      }
      void MessagingService.presenceHeartbeat('online').catch(() => null);
    };
    heartbeat();
    const heartbeatTimer = window.setInterval(heartbeat, 30_000);

    return () => {
      window.clearInterval(heartbeatTimer);
      socket.off('messages:new', handleIncoming);
      socket.off('messages:sent', handleIncoming);
      socket.off('messages:read', handleRead);
      socket.off('messages:receipts', handleReceipts);
      socket.off('messages:typing', handleTyping);
      socket.off('messages:recording', handleRecording);
      socket.off('presence:update', handlePresence);
      socket.off('presence:updated', handlePresence);
      socket.off('messages:updated', handleMessageUpdated);
      socket.off('messages:reaction', handleMessageUpdated);
      socket.off('messages:conversation_updated', handleConversationUpdated);
      socket.off('messages:conversation_deleted', handleConversationDeleted);
      Object.values(typingClearTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      typingClearTimersRef.current = {};
      Object.values(typingStopTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      typingStopTimersRef.current = {};
      if (softRefreshTimerRef.current) {
        window.clearTimeout(softRefreshTimerRef.current);
        softRefreshTimerRef.current = null;
      }
    };
  }, [socket, user?.id, recomputeUnread, scheduleSoftRefresh, markConversationRead]);

  const value = useMemo<MessageContextType>(
    () => ({
      unreadCount,
      conversations,
      loading,
      error,
      syncState,
      lastSyncedAt,
      refreshMessages,
      dockExpanded,
      setDockExpanded,
      openChatWindows,
      openConversationInDock,
      closeConversationWindow,
      minimizeConversationWindow,
      restoreConversationWindow,
      registerVisibleConversation,
      unregisterVisibleConversation,
      markConversationRead,
      getThreadState,
      ensureThreadLoaded,
      sendInlineMessage,
      sendInlineVoiceNote,
      retryFailedMessage,
      getDraft,
      setDraft,
      getReplyTo,
      setReplyTo,
      getPendingAttachments,
      addPendingAttachments,
      removePendingAttachment,
      clearPendingAttachments,
      typingByConversation,
      emitTyping,
      toggleReaction,
      editMessage,
      deleteMessage,
      copyMessage,
      voiceRuntimeConfig,
      getPreviewConversations,
      searchQuery,
      setSearchQuery,
      searchResults,
      searchLoading,
      searchError,
      sendingConversationIds
    }),
    [
      unreadCount,
      conversations,
      loading,
      error,
      syncState,
      lastSyncedAt,
      refreshMessages,
      dockExpanded,
      openChatWindows,
      openConversationInDock,
      closeConversationWindow,
      minimizeConversationWindow,
      restoreConversationWindow,
      registerVisibleConversation,
      unregisterVisibleConversation,
      markConversationRead,
      getThreadState,
      ensureThreadLoaded,
      sendInlineMessage,
      sendInlineVoiceNote,
      retryFailedMessage,
      getDraft,
      setDraft,
      getReplyTo,
      setReplyTo,
      getPendingAttachments,
      addPendingAttachments,
      removePendingAttachment,
      clearPendingAttachments,
      typingByConversation,
      emitTyping,
      toggleReaction,
      editMessage,
      deleteMessage,
      copyMessage,
      voiceRuntimeConfig,
      getPreviewConversations,
      searchQuery,
      setSearchQuery,
      searchResults,
      searchLoading,
      searchError,
      sendingConversationIds
    ]
  );

  return <MessageContext.Provider value={value}>{children}</MessageContext.Provider>;
};

export const useMessages = () => {
  return useContext(MessageContext);
};
