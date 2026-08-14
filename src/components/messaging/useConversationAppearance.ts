import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { useSocket } from '../../context/SocketContext';
import { MessagingService } from '../../services/messaging';
import type { AppearanceInput } from '../../services/messaging/chatTextColorEngine';

const EMPTY_APPEARANCE: AppearanceInput = { kind: 'none' };
const MAX_APPEARANCE_CACHE_ENTRIES = 120;

type AppearanceSubscriber = {
  userId: string;
  conversationId: string;
  onUpdate: (appearance: AppearanceInput) => void;
};

type SocketAppearanceRegistry = {
  subscribers: Map<string, Set<AppearanceSubscriber>>;
  handler: (payload: any) => void;
};

// Appearance is private state. Keep it memory-only and scope every entry to
// the authenticated user and conversation so surfaces cannot leak styles.
const appearanceCache = new Map<string, AppearanceInput>();
const appearanceRequests = new Map<string, Promise<AppearanceInput>>();
const socketRegistries = new WeakMap<Socket, SocketAppearanceRegistry>();

const normalizeAppearance = (value: unknown): AppearanceInput => {
  if (!value || typeof value !== 'object') return { ...EMPTY_APPEARANCE };
  const raw = value as AppearanceInput;
  return { ...raw, kind: String(raw.kind || 'none') };
};

const cacheAppearance = (key: string, appearance: AppearanceInput) => {
  appearanceCache.delete(key);
  appearanceCache.set(key, appearance);
  while (appearanceCache.size > MAX_APPEARANCE_CACHE_ENTRIES) {
    const oldest = appearanceCache.keys().next().value;
    if (!oldest) break;
    appearanceCache.delete(oldest);
  }
};

const onSubscriberUpdate = (subscriber: AppearanceSubscriber, appearance: AppearanceInput) => {
  cacheAppearance(`${subscriber.userId}:${subscriber.conversationId}`, appearance);
  subscriber.onUpdate(appearance);
};

const loadAppearance = (key: string, conversationId: string): Promise<AppearanceInput> => {
  const cached = appearanceCache.get(key);
  if (cached) return Promise.resolve(cached);

  const pending = appearanceRequests.get(key);
  if (pending) return pending;

  const request = MessagingService.getChatAppearance(conversationId)
    .then((value) => {
      const next = normalizeAppearance(value);
      cacheAppearance(key, next);
      return next;
    })
    .catch(() => {
      const next = { ...EMPTY_APPEARANCE };
      cacheAppearance(key, next);
      return next;
    })
    .finally(() => {
      appearanceRequests.delete(key);
    });

  appearanceRequests.set(key, request);
  return request;
};

const subscribeToAppearance = (
  socket: Socket,
  conversationId: string,
  userId: string,
  onUpdate: (appearance: AppearanceInput) => void
) => {
  let registry = socketRegistries.get(socket);
  if (!registry) {
    registry = {
      subscribers: new Map(),
      handler: () => undefined
    };
    registry.handler = (payload: any) => {
      const id = String(payload?.conversationId || payload?.conversation_id || '').trim();
      if (!id) return;
      const subscribers = registry?.subscribers.get(id);
      if (!subscribers) return;
      const appearance = normalizeAppearance(payload?.appearance);
      const actorId = String(payload?.userId || payload?.participantId || '').trim();
      subscribers.forEach((subscriber) => {
        if (actorId && subscriber.userId && actorId !== subscriber.userId) return;
        onSubscriberUpdate(subscriber, appearance);
      });
    };
    socketRegistries.set(socket, registry);
    socket.on('messages:appearance_updated', registry.handler);
  }

  const subscribers = registry.subscribers.get(conversationId) || new Set<AppearanceSubscriber>();
  const subscriber = { userId, conversationId, onUpdate };
  subscribers.add(subscriber);
  registry.subscribers.set(conversationId, subscribers);

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size > 0) return;
    registry?.subscribers.delete(conversationId);
    if (registry?.subscribers.size === 0) {
      socket.off('messages:appearance_updated', registry.handler);
      socketRegistries.delete(socket);
    }
  };
};

type UseConversationAppearanceOptions = {
  conversationId?: string | null;
  userId?: string | null;
  participants?: readonly any[] | null;
};

export const useConversationAppearance = ({
  conversationId,
  userId,
  participants
}: UseConversationAppearanceOptions) => {
  const { socket } = useSocket();
  const id = String(conversationId || '').trim();
  const viewerId = String(userId || '').trim();
  const cacheKey = `${viewerId || 'anonymous'}:${id}`;
  const membership = useMemo(() => {
    const parts = Array.isArray(participants) ? participants : [];
    if (!viewerId || parts.length === 0) return 'unknown';
    return parts.some((participant: any) => {
      const participantId = String(participant?.id || participant?.userId || '').trim();
      return (
        participantId === viewerId &&
        !participant?.deletedAt &&
        !participant?.deleted_at
      );
    })
      ? 'member'
      : 'not-member';
  }, [participants, viewerId]);
  const [appearance, setAppearanceState] = useState<AppearanceInput>(EMPTY_APPEARANCE);
  const [loading, setLoading] = useState(false);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const setAppearance = useCallback(
    (value: AppearanceInput | null | undefined) => {
      const next = normalizeAppearance(value);
      if (id) cacheAppearance(cacheKey, next);
      setAppearanceState(next);
    },
    [cacheKey, id]
  );

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    let cancelled = false;
    const current = () => !cancelled && generationRef.current === generation;

    if (!id || membership === 'not-member') {
      setLoading(false);
      setAppearanceState({ ...EMPTY_APPEARANCE });
      return () => {
        cancelled = true;
      };
    }

    const cached = appearanceCache.get(cacheKey);
    if (cached) {
      setLoading(false);
      setAppearanceState(cached);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setAppearanceState({ ...EMPTY_APPEARANCE });
    void loadAppearance(cacheKey, id).then((next) => {
      if (!current()) return;
      setAppearanceState(next);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, id, membership]);

  useEffect(() => {
    if (!socket || !id || !viewerId || membership === 'not-member') return undefined;
    return subscribeToAppearance(socket, id, viewerId, (next) => {
      if (!mountedRef.current) return;
      setAppearanceState(next);
    });
  }, [id, membership, socket, viewerId]);

  const refresh = useCallback(() => {
    if (!id || membership === 'not-member') return Promise.resolve({ ...EMPTY_APPEARANCE });
    appearanceCache.delete(cacheKey);
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setLoading(true);
    return loadAppearance(cacheKey, id).then((next) => {
      if (!mountedRef.current || generationRef.current !== generation) return next;
      setAppearanceState(next);
      setLoading(false);
      return next;
    });
  }, [cacheKey, id, membership]);

  return { appearance, loading, setAppearance, refresh };
};

export const __resetConversationAppearanceForTests = () => {
  appearanceCache.clear();
  appearanceRequests.clear();
};
