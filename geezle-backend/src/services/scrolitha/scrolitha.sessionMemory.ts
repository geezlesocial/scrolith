/**
 * Short-lived conversational memory for Scrolitha intelligence.
 * Uses SessionStore abstraction (in-process by default; swappable for distributed).
 * Session-scoped only — never permanent. Automatically discarded via TTL.
 * Permission-aware: keys always include userId.
 */
import { createHash } from 'crypto';
import { sessionStore, type SessionRecord, type SessionTurn } from './scrolitha.sessionStore';

export type SessionMemoryTurn = SessionTurn;

export type SessionMemoryBag = SessionRecord;

const MEMORY_TTL_MS = 30 * 60_000;
const MAX_TURNS = 12;
const MAX_TURN_CHARS = 600;

const text = (v: unknown) => String(v || '').trim();

const truncate = (value: string, max: number) => {
  const s = String(value || '');
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
};

export const buildSessionKey = (input: {
  userId: string;
  sessionId?: string | null;
  surface?: string | null;
  entityId?: string | null;
}) => {
  const userId = text(input.userId);
  const sessionId = text(input.sessionId) || 'default';
  const surface = text(input.surface) || 'global';
  const entityId = text(input.entityId) || '';
  const raw = `${userId}|${sessionId}|${surface}|${entityId}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 40);
};

export const getSessionMemory = (sessionKey: string): SessionMemoryBag | null => {
  const key = text(sessionKey);
  if (!key) return null;
  const value = sessionStore.get(key);
  // Support sync adapter (current) — distributed adapters may be async later.
  if (value && typeof (value as any).then === 'function') {
    return null;
  }
  return (value as SessionMemoryBag | null) || null;
};

export const ensureSessionMemory = (input: {
  userId: string;
  sessionKey?: string | null;
  sessionId?: string | null;
  surface?: string | null;
  entityId?: string | null;
}): SessionMemoryBag => {
  const userId = text(input.userId);
  const sessionKey =
    text(input.sessionKey) ||
    buildSessionKey({
      userId,
      sessionId: input.sessionId,
      surface: input.surface,
      entityId: input.entityId
    });
  const existing = getSessionMemory(sessionKey);
  if (existing && existing.userId === userId) {
    sessionStore.set(existing, MEMORY_TTL_MS);
    return existing;
  }
  const bag: SessionMemoryBag = {
    sessionKey,
    userId,
    turns: [],
    dismissedSuggestionKeys: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  sessionStore.set(bag, MEMORY_TTL_MS);
  return bag;
};

export const appendSessionTurn = (input: {
  userId: string;
  sessionKey: string;
  turn: Omit<SessionMemoryTurn, 'at'> & { at?: number };
}): SessionMemoryBag | null => {
  const bag = ensureSessionMemory({ userId: input.userId, sessionKey: input.sessionKey });
  if (bag.userId !== text(input.userId)) return null;

  const turn: SessionMemoryTurn = {
    role: input.turn.role,
    text: truncate(input.turn.text, MAX_TURN_CHARS),
    at: input.turn.at || Date.now(),
    surface: input.turn.surface,
    entityType: input.turn.entityType,
    entityId: input.turn.entityId,
    classification: input.turn.classification || null,
    sources: Array.isArray(input.turn.sources) ? input.turn.sources.slice(0, 8) : undefined,
    confidenceBand: input.turn.confidenceBand || null
  };
  if (!turn.text) return bag;

  bag.turns = [...bag.turns, turn].slice(-MAX_TURNS);
  if (turn.surface) bag.lastSurface = turn.surface;
  bag.updatedAt = Date.now();
  sessionStore.set(bag, MEMORY_TTL_MS);
  return bag;
};

export const dismissSessionSuggestion = (input: {
  userId: string;
  sessionKey: string;
  suggestionKey: string;
}) => {
  const bag = ensureSessionMemory({ userId: input.userId, sessionKey: input.sessionKey });
  if (bag.userId !== text(input.userId)) return bag;
  const key = text(input.suggestionKey).toLowerCase();
  if (!key) return bag;
  if (!bag.dismissedSuggestionKeys.includes(key)) {
    bag.dismissedSuggestionKeys = [...bag.dismissedSuggestionKeys, key].slice(-40);
  }
  bag.updatedAt = Date.now();
  sessionStore.set(bag, MEMORY_TTL_MS);
  return bag;
};

export const isSuggestionDismissedInSession = (sessionKey: string, suggestionKey: string) => {
  const bag = getSessionMemory(sessionKey);
  if (!bag) return false;
  return bag.dismissedSuggestionKeys.includes(text(suggestionKey).toLowerCase());
};

export const clearSessionMemory = (sessionKey: string) => {
  sessionStore.delete(text(sessionKey));
};

export const formatSessionMemoryForPrompt = (sessionKey: string, maxTurns = 6): string => {
  const bag = getSessionMemory(sessionKey);
  if (!bag?.turns?.length) return '';
  const turns = bag.turns.slice(-Math.max(1, maxTurns));
  return turns
    .map((t) => `${t.role === 'user' ? 'User' : 'Scrolitha'}: ${t.text}`)
    .join('\n');
};

export const getRecentSessionClassifications = (sessionKey: string): string[] => {
  const bag = getSessionMemory(sessionKey);
  if (!bag) return [];
  return bag.turns
    .map((t) => t.classification)
    .filter((c): c is string => Boolean(c))
    .slice(-6);
};

export const getSessionStoreInfo = () => ({
  adapter: sessionStore.adapterName(),
  ttlMs: MEMORY_TTL_MS,
  maxTurns: MAX_TURNS
});
