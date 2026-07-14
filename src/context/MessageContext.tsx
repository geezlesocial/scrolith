
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type { Conversation, Message } from '../types';
import { MessagingService, messageMatchesConversation } from '../services/messaging';
import { getConversationMergeKey } from '../services/messagingMerge';
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
import { getRecoverableActionMessage, isOfflineLikeError } from '../mobile/runtime/requestRecovery';
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
    options?: { replyToMessageId?: string | null }
  ) => Promise<Message | null>;
  getDraft: (conversationId: string) => string;
  setDraft: (conversationId: string, text: string) => void;
  typingByConversation: Record<string, string | null>;
  emitTyping: (conversationId: string, isTyping: boolean) => void;

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
  getDraft: () => '',
  setDraft: () => {},
  typingByConversation: {},
  emitTyping: () => {},
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
  const { socket, isConnected } = useSocket();
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
  const [typingByConversation, setTypingByConversation] = useState<Record<string, string | null>>({});
  const [sendingConversationIds, setSendingConversationIds] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQueryState] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Conversation[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const inFlightRefreshRef = useRef<Promise<void> | null>(null);
  const lastRefreshAtRef = useRef(0);
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
    setUnreadCount(sumConversationUnread(list));
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
          const convos = await MessagingService.getAllConversations(user.id, user.role, {
            force: Boolean(options?.force)
          });
          const sorted = sortConversationsByRecent(Array.isArray(convos) ? convos : []);
          setConversations(sorted);
          recomputeUnread(sorted);
          const refreshedAt = Date.now();
          lastRefreshAtRef.current = refreshedAt;
          setLastSyncedAt(refreshedAt);
          setSyncState('ready');
        } catch (e: any) {
          setError(getRecoverableActionMessage('Message sync', e));
          setSyncState(isOfflineLikeError(e) ? 'offline' : 'error');
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
              return sortConversationsByRecent([full, ...without]);
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
      options?: { replyToMessageId?: string | null }
    ): Promise<Message | null> => {
      const id = safeId(conversationId);
      const trimmed = String(text || '').trim();
      if (!id || !trimmed || !user?.id) return null;
      if (sendingIdsRef.current.has(id)) return null;

      sendingIdsRef.current.add(id);
      setSendingConversationIds((prev) => ({ ...prev, [id]: true }));
      const optimisticId = `optimistic-${id}-${Date.now()}`;
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
        message_type: 'text',
        messageType: 'text',
        replyToMessageId: options?.replyToMessageId || null,
        reply_to_message_id: options?.replyToMessageId || null
      } as Message;

      setThreadCache((prev) => {
        const current = prev[id] || EMPTY_THREAD;
        return {
          ...prev,
          [id]: {
            ...current,
            messages: dedupeMessagesById([...current.messages, optimistic])
          }
        };
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
          [],
          options?.replyToMessageId || null
        );
        seenMessageIdsRef.current.add(safeId(serverMessage.id));
        setThreadCache((prev) => {
          const current = prev[id] || EMPTY_THREAD;
          return {
            ...prev,
            [id]: {
              ...current,
              messages: reconcileOptimisticMessage(current.messages, serverMessage)
            }
          };
        });
        setConversations((prev) => {
          const next = applyIncomingPreviewUpdate(prev, serverMessage, {
            currentUserId: user.id,
            activeConversationIds: visibleConversationIdsRef.current
          });
          recomputeUnread(next);
          return next;
        });
        setDrafts((prev) => clearConversationDraft(prev, id));
        emitTyping(id, false);
        scheduleSoftRefresh();
        return serverMessage;
      } catch (e) {
        // Keep draft and optimistic failure state
        setThreadCache((prev) => {
          const current = prev[id] || EMPTY_THREAD;
          return {
            ...prev,
            [id]: {
              ...current,
              messages: current.messages.map((entry) =>
                entry.id === optimisticId
                  ? { ...entry, metadata: { ...(entry.metadata || {}), sendFailed: true } }
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
    [user?.id, user?.role, recomputeUnread, emitTyping, scheduleSoftRefresh]
  );

  // Initial load + polling fallback when socket is down
  useEffect(() => {
    if (!user?.id) {
      setUnreadCount(0);
      setConversations([]);
      setError(null);
      setOpenChatWindows([]);
      setThreadCache({});
      setDrafts({});
      setTypingByConversation({});
      seenMessageIdsRef.current.clear();
      visibleConversationIdsRef.current.clear();
      return;
    }
    void refreshMessages();
    if (!isOnline) return;

    if (!socket || !isConnected) {
      const interval = window.setInterval(() => {
        void refreshMessages();
      }, 30_000);
      return () => window.clearInterval(interval);
    }

    return undefined;
  }, [user?.id, socket, isConnected, refreshMessages, isOnline]);

  useEffect(() => {
    if (!user?.id || !isOnline || recoveryTick <= 0) return;
    void refreshMessages({ force: true });
  }, [user?.id, isOnline, recoveryTick, refreshMessages]);

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
      const alreadySeen = Boolean(messageId && seenMessageIdsRef.current.has(messageId));
      if (messageId && !alreadySeen) {
        seenMessageIdsRef.current.add(messageId);
        if (seenMessageIdsRef.current.size > 800) {
          const trimmed = Array.from(seenMessageIdsRef.current).slice(-400);
          seenMessageIdsRef.current = new Set(trimmed);
        }
      }

      const conversationId = safeId(message.conversationId || message.conversation_id);

      // Shared conversation list + unread badge: single authoritative path (this handler).
      // applyIncomingPreviewUpdate is idempotent for already-present message ids.
      setConversations((prev) => {
        const hasConversation = prev.some(
          (entry) =>
            entry.id === conversationId || messageMatchesConversation(message as any, entry)
        );
        if (!hasConversation) {
          if (alreadySeen) return prev;
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
                const next = sortConversationsByRecent([full, ...without]);
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
          !alreadySeen &&
          visibleConversationIdsRef.current.has(conversationId) &&
          safeId(message.senderId || message.sender_id) !== userIdRef.current
        ) {
          void markConversationRead(conversationId);
        }
      }
    };

    const handleRead = (payload: any) => {
      const conversationId = safeId(payload?.conversationId ?? payload?.conversation_id);
      if (!conversationId) return;
      setConversations((prev) => {
        const next = setConversationUnreadLocal(prev, conversationId, 0);
        recomputeUnread(next);
        return next;
      });
    };

    const handleTyping = (payload: any) => {
      const conversationId = safeId(payload?.conversationId ?? payload?.conversation_id);
      const typingUserId = safeId(payload?.userId ?? payload?.user_id);
      if (!conversationId || !typingUserId || typingUserId === userIdRef.current) return;
      if (!payload?.isTyping) {
        setTypingByConversation((prev) => ({ ...prev, [conversationId]: null }));
        return;
      }
      const name = safeId(payload?.name) || 'Someone';
      setTypingByConversation((prev) => ({ ...prev, [conversationId]: name }));
      if (typingClearTimersRef.current[conversationId]) {
        window.clearTimeout(typingClearTimersRef.current[conversationId]);
      }
      typingClearTimersRef.current[conversationId] = window.setTimeout(() => {
        setTypingByConversation((prev) => ({ ...prev, [conversationId]: null }));
      }, 2200);
    };

    const handlePresence = (payload: any) => {
      const presenceUserId = safeId(payload?.userId ?? payload?.user_id);
      if (!presenceUserId) return;
      const isOnlineUser = Boolean(payload?.isOnline ?? payload?.is_online);
      const lastSeenAt = payload?.lastSeenAt ?? payload?.last_seen_at;
      setConversations((prev) =>
        prev.map((conversation) => ({
          ...conversation,
          participants: conversation.participants.map((participant) =>
            participant.id === presenceUserId
              ? {
                  ...participant,
                  isOnline: isOnlineUser,
                  is_online: isOnlineUser,
                  lastSeenAt,
                  last_seen_at: lastSeenAt
                }
              : participant
          )
        }))
      );
    };

    const handleMessageUpdated = (payload: any) => {
      const conversationId = safeId(payload?.conversationId ?? payload?.conversation_id);
      const messageId = safeId(payload?.messageId ?? payload?.id);
      if (!conversationId || !messageId) return;
      const deletedForMe = Boolean(payload?.deletedForMe ?? payload?.deleted_for_me);

      setThreadCache((prev) => {
        const current = prev[conversationId];
        if (!current) return prev;
        const nextMessages = deletedForMe
          ? current.messages.filter((entry) => entry.id !== messageId)
          : current.messages.map((entry) =>
              entry.id === messageId
                ? {
                    ...entry,
                    text: payload?.text ?? entry.text,
                    isDeleted: Boolean(payload?.isDeleted ?? payload?.is_deleted ?? entry.isDeleted),
                    is_deleted: Boolean(payload?.is_deleted ?? payload?.isDeleted ?? entry.is_deleted),
                    editedAt: payload?.editedAt ?? payload?.edited_at ?? entry.editedAt,
                    reactions: Array.isArray(payload?.reactions) ? payload.reactions : entry.reactions
                  }
                : entry
            );
        return {
          ...prev,
          [conversationId]: { ...current, messages: nextMessages }
        };
      });

      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
          const nextMessages = deletedForMe
            ? messages.filter((entry) => entry.id !== messageId)
            : messages.map((entry) =>
                entry.id === messageId ? { ...entry, text: payload?.text ?? entry.text } : entry
              );
          const last = nextMessages[nextMessages.length - 1];
          const preview =
            payload?.lastMessage ??
            payload?.last_message ??
            getMessagePreviewText(last) ??
            conversation.lastMessage;
          return {
            ...conversation,
            messages: nextMessages,
            lastMessage: preview,
            last_message: preview
          } as Conversation;
        })
      );
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
    socket.on('messages:typing', handleTyping);
    socket.on('presence:update', handlePresence);
    socket.on('presence:updated', handlePresence);
    socket.on('messages:updated', handleMessageUpdated);
    socket.on('messages:conversation_updated', handleConversationUpdated);
    socket.on('messages:conversation_deleted', handleConversationDeleted);

    return () => {
      socket.off('messages:new', handleIncoming);
      socket.off('messages:sent', handleIncoming);
      socket.off('messages:read', handleRead);
      socket.off('messages:typing', handleTyping);
      socket.off('presence:update', handlePresence);
      socket.off('presence:updated', handlePresence);
      socket.off('messages:updated', handleMessageUpdated);
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
      getDraft,
      setDraft,
      typingByConversation,
      emitTyping,
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
      getDraft,
      setDraft,
      typingByConversation,
      emitTyping,
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
