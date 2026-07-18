/**
 * Phase 20.7.1 — Scoped, short-lived, single-use confirmation tokens for write tools.
 * Tokens are bound to user, tool, and payload hash. Frontend confirmation alone is insufficient.
 */
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { enterpriseCache } from './scrolitha.enterpriseCache';

const TOKEN_TTL_MS = 5 * 60_000;
const TOKEN_PREFIX = 'sct_';

export type ConfirmationTokenPayload = {
  tokenId: string;
  userId: string;
  toolKey: string;
  actionId: string;
  payloadHash: string;
  issuedAt: number;
  expiresAt: number;
  usedAt: number | null;
};

const cacheKey = (tokenId: string) => `confirm:${tokenId}`;

export const hashConfirmationPayload = (payload: unknown): string => {
  const normalized = JSON.stringify(payload ?? {}, Object.keys((payload as any) || {}).sort());
  return createHash('sha256').update(normalized).digest('hex');
};

export const mintConfirmationToken = (input: {
  userId: string;
  toolKey: string;
  actionId: string;
  payload?: unknown;
  ttlMs?: number;
}): { token: string; payload: ConfirmationTokenPayload } => {
  const tokenId = randomBytes(18).toString('base64url');
  const issuedAt = Date.now();
  const ttl = Math.max(30_000, Math.min(15 * 60_000, input.ttlMs || TOKEN_TTL_MS));
  const payload: ConfirmationTokenPayload = {
    tokenId,
    userId: String(input.userId || '').trim(),
    toolKey: String(input.toolKey || '').trim().toUpperCase(),
    actionId: String(input.actionId || '').trim(),
    payloadHash: hashConfirmationPayload(input.payload ?? {}),
    issuedAt,
    expiresAt: issuedAt + ttl,
    usedAt: null
  };
  enterpriseCache.set('streaming', cacheKey(tokenId), payload, ttl);
  return {
    token: `${TOKEN_PREFIX}${tokenId}`,
    payload
  };
};

const parseTokenId = (token: string): string | null => {
  const raw = String(token || '').trim();
  if (!raw.startsWith(TOKEN_PREFIX)) return null;
  const id = raw.slice(TOKEN_PREFIX.length);
  return id || null;
};

export type ConfirmTokenResult =
  | { ok: true; payload: ConfirmationTokenPayload }
  | { ok: false; code: string; message: string };

/**
 * Validate and consume a confirmation token (single-use).
 */
export const consumeConfirmationToken = (input: {
  token: string;
  userId: string;
  toolKey?: string;
  actionId?: string;
  payload?: unknown;
}): ConfirmTokenResult => {
  const tokenId = parseTokenId(input.token);
  if (!tokenId) {
    return { ok: false, code: 'INVALID_TOKEN', message: 'Confirmation token is invalid.' };
  }

  const stored = enterpriseCache.get<ConfirmationTokenPayload>('streaming', cacheKey(tokenId));
  if (!stored) {
    return { ok: false, code: 'TOKEN_EXPIRED', message: 'Confirmation token expired or already used.' };
  }

  if (stored.usedAt) {
    return { ok: false, code: 'TOKEN_USED', message: 'Confirmation token already used.' };
  }

  if (Date.now() > stored.expiresAt) {
    enterpriseCache.delete?.('streaming', cacheKey(tokenId));
    return { ok: false, code: 'TOKEN_EXPIRED', message: 'Confirmation token expired.' };
  }

  if (stored.userId !== String(input.userId || '').trim()) {
    return { ok: false, code: 'TOKEN_USER_MISMATCH', message: 'Confirmation token is not valid for this user.' };
  }

  if (input.toolKey && stored.toolKey !== String(input.toolKey || '').trim().toUpperCase()) {
    return { ok: false, code: 'TOKEN_TOOL_MISMATCH', message: 'Confirmation token tool mismatch.' };
  }

  if (input.actionId && stored.actionId !== String(input.actionId || '').trim()) {
    return { ok: false, code: 'TOKEN_ACTION_MISMATCH', message: 'Confirmation token action mismatch.' };
  }

  if (input.payload !== undefined) {
    const expected = stored.payloadHash;
    const actual = hashConfirmationPayload(input.payload);
    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(actual, 'hex');
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return { ok: false, code: 'TOKEN_PAYLOAD_MISMATCH', message: 'Confirmation payload changed.' };
      }
    } catch {
      return { ok: false, code: 'TOKEN_PAYLOAD_MISMATCH', message: 'Confirmation payload changed.' };
    }
  }

  const used: ConfirmationTokenPayload = { ...stored, usedAt: Date.now() };
  // Keep briefly for audit; prevent reuse
  enterpriseCache.set('streaming', cacheKey(tokenId), used, 60_000);

  return { ok: true, payload: used };
};

export const peekConfirmationToken = (token: string): ConfirmationTokenPayload | null => {
  const tokenId = parseTokenId(token);
  if (!tokenId) return null;
  return enterpriseCache.get<ConfirmationTokenPayload>('streaming', cacheKey(tokenId)) || null;
};
