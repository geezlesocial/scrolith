/**
 * Phase 29.1 — in-process rate limits for group messaging.
 * Durable multi-instance limits can dual-write to Redis later; memory is correct default.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const touch = (key: string, windowMs: number, limit: number, now = Date.now()): { allowed: boolean; retryAfterMs: number } => {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (existing.count >= limit) {
    return { allowed: false, retryAfterMs: Math.max(0, existing.resetAt - now) };
  }
  existing.count += 1;
  return { allowed: true, retryAfterMs: 0 };
};

export const GROUP_SEND_RATE_PER_MINUTE = Math.max(
  5,
  Number(process.env.MESSAGING_GROUP_SEND_RATE_PER_MIN || 60)
);

export const GROUP_INVITE_CREATE_PER_HOUR = Math.max(
  1,
  Number(process.env.MESSAGING_GROUP_INVITE_RATE_PER_HOUR || 30)
);

export const checkGroupSendRate = (userId: string, conversationId: string, now = Date.now()) =>
  touch(`send:${conversationId}:${userId}`, 60_000, GROUP_SEND_RATE_PER_MINUTE, now);

export const checkGroupInviteCreateRate = (userId: string, now = Date.now()) =>
  touch(`invite:${userId}`, 3_600_000, GROUP_INVITE_CREATE_PER_HOUR, now);

export const clearGroupRateLimitForTests = () => buckets.clear();

export const GROUP_RATE_LIMIT_VERSION = '29.1';
