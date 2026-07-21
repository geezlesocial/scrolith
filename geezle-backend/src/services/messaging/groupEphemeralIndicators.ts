/**
 * Phase 29.2 — multi-typer + recording indicators (memory only, never DB).
 */

export type EphemeralMemberState = {
  userId: string;
  name: string;
  startedAt: number;
  expiresAt: number;
};

export type ConversationEphemeralSnapshot = {
  conversationId: string;
  typing: Array<{ userId: string; name: string; startedAt: string }>;
  recording: Array<{ userId: string; name: string; startedAt: string }>;
  at: string;
};

const TYPING_TTL_MS = Math.max(3_000, Number(process.env.MESSAGING_TYPING_TTL_MS || 6_000));
const RECORDING_TTL_MS = Math.max(5_000, Number(process.env.MESSAGING_RECORDING_TTL_MS || 15_000));
const TYPING_RATE_PER_10S = Math.max(3, Number(process.env.MESSAGING_TYPING_RATE_PER_10S || 20));

type ConvBucket = {
  typing: Map<string, EphemeralMemberState>;
  recording: Map<string, EphemeralMemberState>;
};

const byConversation = new Map<string, ConvBucket>();
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

const getBucket = (conversationId: string): ConvBucket => {
  let b = byConversation.get(conversationId);
  if (!b) {
    b = { typing: new Map(), recording: new Map() };
    byConversation.set(conversationId, b);
  }
  return b;
};

const pruneMap = (map: Map<string, EphemeralMemberState>, now: number) => {
  for (const [id, row] of map) {
    if (row.expiresAt <= now) map.delete(id);
  }
};

export const checkTypingRate = (conversationId: string, userId: string, now = Date.now()) => {
  const key = `${conversationId}:${userId}`;
  const existing = rateBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + 10_000 });
    return { allowed: true };
  }
  if (existing.count >= TYPING_RATE_PER_10S) return { allowed: false };
  existing.count += 1;
  return { allowed: true };
};

export const setTypingState = (input: {
  conversationId: string;
  userId: string;
  name?: string;
  isTyping: boolean;
  now?: number;
}): ConversationEphemeralSnapshot => {
  const now = input.now || Date.now();
  const bucket = getBucket(input.conversationId);
  pruneMap(bucket.typing, now);
  pruneMap(bucket.recording, now);
  if (!input.isTyping) {
    bucket.typing.delete(input.userId);
  } else {
    bucket.typing.set(input.userId, {
      userId: input.userId,
      name: String(input.name || 'Someone').slice(0, 80),
      startedAt: now,
      expiresAt: now + TYPING_TTL_MS
    });
  }
  return snapshotEphemeral(input.conversationId, now);
};

export const setRecordingState = (input: {
  conversationId: string;
  userId: string;
  name?: string;
  isRecording: boolean;
  now?: number;
}): ConversationEphemeralSnapshot => {
  const now = input.now || Date.now();
  const bucket = getBucket(input.conversationId);
  pruneMap(bucket.typing, now);
  pruneMap(bucket.recording, now);
  if (!input.isRecording) {
    bucket.recording.delete(input.userId);
  } else {
    bucket.recording.set(input.userId, {
      userId: input.userId,
      name: String(input.name || 'Someone').slice(0, 80),
      startedAt: now,
      expiresAt: now + RECORDING_TTL_MS
    });
  }
  return snapshotEphemeral(input.conversationId, now);
};

export const clearUserEphemeral = (conversationId: string, userId: string, now = Date.now()) => {
  const bucket = byConversation.get(conversationId);
  if (!bucket) return snapshotEphemeral(conversationId, now);
  bucket.typing.delete(userId);
  bucket.recording.delete(userId);
  return snapshotEphemeral(conversationId, now);
};

export const clearUserEphemeralEverywhere = (userId: string) => {
  const affected: string[] = [];
  byConversation.forEach((bucket, conversationId) => {
    if (bucket.typing.has(userId) || bucket.recording.has(userId)) {
      bucket.typing.delete(userId);
      bucket.recording.delete(userId);
      affected.push(conversationId);
    }
  });
  return affected;
};

export const snapshotEphemeral = (conversationId: string, now = Date.now()): ConversationEphemeralSnapshot => {
  const bucket = getBucket(conversationId);
  pruneMap(bucket.typing, now);
  pruneMap(bucket.recording, now);
  return {
    conversationId,
    typing: Array.from(bucket.typing.values()).map((r) => ({
      userId: r.userId,
      name: r.name,
      startedAt: new Date(r.startedAt).toISOString()
    })),
    recording: Array.from(bucket.recording.values()).map((r) => ({
      userId: r.userId,
      name: r.name,
      startedAt: new Date(r.startedAt).toISOString()
    })),
    at: new Date(now).toISOString()
  };
};

export const clearEphemeralForTests = () => {
  byConversation.clear();
  rateBuckets.clear();
};

export const EPHEMERAL_INDICATORS_VERSION = '29.2';
export const EPHEMERAL_TTLS = { TYPING_TTL_MS, RECORDING_TTL_MS };
