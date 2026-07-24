/**
 * Join-request lifecycle for REQUEST / ADMIN_APPROVAL group call modes.
 * Persisted in VoiceCall.metadata.joinRequests (no schema migration).
 */

import { randomUUID } from 'crypto';

export type JoinRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'call_ended'
  | 'ineligible'
  | 'limit_reached';

export type VoiceJoinRequest = {
  requestId: string;
  callId: string;
  conversationId: string;
  requesterId: string;
  status: JoinRequestStatus;
  requestedAt: string;
  resolvedAt?: string | null;
  resolverId?: string | null;
  expiresAt: string;
  reason?: string | null;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export const listJoinRequests = (metadata: any): VoiceJoinRequest[] => {
  const raw = metadata?.joinRequests;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => ({
      requestId: String(entry?.requestId || '').trim(),
      callId: String(entry?.callId || '').trim(),
      conversationId: String(entry?.conversationId || '').trim(),
      requesterId: String(entry?.requesterId || '').trim(),
      status: String(entry?.status || 'pending').toLowerCase() as JoinRequestStatus,
      requestedAt: String(entry?.requestedAt || ''),
      resolvedAt: entry?.resolvedAt ? String(entry.resolvedAt) : null,
      resolverId: entry?.resolverId ? String(entry.resolverId) : null,
      expiresAt: String(entry?.expiresAt || ''),
      reason: entry?.reason ? String(entry.reason) : null
    }))
    .filter((entry) => entry.requestId && entry.requesterId);
};

export const expireStaleJoinRequests = (
  requests: VoiceJoinRequest[],
  now = Date.now()
): VoiceJoinRequest[] =>
  requests.map((entry) => {
    if (entry.status !== 'pending') return entry;
    const exp = new Date(entry.expiresAt).getTime();
    if (Number.isFinite(exp) && exp <= now) {
      return {
        ...entry,
        status: 'expired' as const,
        resolvedAt: new Date(now).toISOString(),
        reason: entry.reason || 'expired'
      };
    }
    return entry;
  });

export const findPendingRequest = (requests: VoiceJoinRequest[], requesterId: string) =>
  requests.find(
    (entry) =>
      entry.requesterId === requesterId &&
      entry.status === 'pending'
  );

export const findApprovedRequest = (requests: VoiceJoinRequest[], requesterId: string) =>
  requests.find(
    (entry) => entry.requesterId === requesterId && entry.status === 'approved'
  );

export const createJoinRequest = (params: {
  callId: string;
  conversationId: string;
  requesterId: string;
  ttlMs?: number;
}): VoiceJoinRequest => {
  const now = Date.now();
  const ttl = Math.max(60_000, Math.min(30 * 60_000, Number(params.ttlMs || DEFAULT_TTL_MS) || DEFAULT_TTL_MS));
  return {
    requestId: randomUUID(),
    callId: params.callId,
    conversationId: params.conversationId,
    requesterId: params.requesterId,
    status: 'pending',
    requestedAt: new Date(now).toISOString(),
    resolvedAt: null,
    resolverId: null,
    expiresAt: new Date(now + ttl).toISOString(),
    reason: null
  };
};

export const upsertJoinRequestsInMetadata = (
  metadata: any,
  requests: VoiceJoinRequest[]
): Record<string, any> => {
  const base = metadata && typeof metadata === 'object' ? { ...metadata } : {};
  base.joinRequests = requests;
  return base;
};

export const resolveJoinRequest = (
  requests: VoiceJoinRequest[],
  requestId: string,
  status: Extract<JoinRequestStatus, 'approved' | 'rejected' | 'cancelled'>,
  resolverId: string,
  reason?: string | null
): { next: VoiceJoinRequest[]; resolved: VoiceJoinRequest | null } => {
  let resolved: VoiceJoinRequest | null = null;
  const next = requests.map((entry) => {
    if (entry.requestId !== requestId) return entry;
    if (entry.status !== 'pending') return entry;
    resolved = {
      ...entry,
      status,
      resolvedAt: new Date().toISOString(),
      resolverId,
      reason: reason || null
    };
    return resolved;
  });
  return { next, resolved };
};
