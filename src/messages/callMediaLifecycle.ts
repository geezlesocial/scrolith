/**
 * Pure helpers for call media lifecycle (C-03) + stale-operation tokens (R-04).
 * Authorization-first order: authorize → acquire → join → cleanup on any failure.
 */

export type MediaLifecyclePhase =
  | 'idle'
  | 'authorizing'
  | 'acquiring_media'
  | 'joining'
  | 'active'
  | 'failed'
  | 'ended';

export const nextLifecyclePhase = (
  current: MediaLifecyclePhase,
  event:
    | 'begin_authorize'
    | 'authorize_ok'
    | 'authorize_fail'
    | 'media_ok'
    | 'media_fail'
    | 'join_ok'
    | 'join_fail'
    | 'end'
): MediaLifecyclePhase => {
  if (event === 'end') return 'ended';
  if (event === 'authorize_fail' || event === 'media_fail' || event === 'join_fail') return 'failed';
  if (event === 'begin_authorize') return 'authorizing';
  if (event === 'authorize_ok') return 'acquiring_media';
  if (event === 'media_ok') return 'joining';
  if (event === 'join_ok') return 'active';
  return current;
};

/** Failure paths that must release mic/camera/tracks/peer connections. */
export const FAILURE_CLEANUP_REASONS = [
  'reject',
  'timeout',
  'disconnect',
  'network_loss',
  'signaling_failure',
  'permission_denial',
  'authorize_fail',
  'join_fail',
  'cancel',
  'busy',
  'error'
] as const;

export type FailureCleanupReason = (typeof FAILURE_CLEANUP_REASONS)[number];

export const shouldReleaseMediaOnFailure = (reason: string): boolean => {
  const r = String(reason || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return (FAILURE_CLEANUP_REASONS as readonly string[]).includes(r) || r === 'failed' || r === 'ended';
};

/**
 * Order of startCall / acceptCall steps (documented contract for tests).
 * Authorize (server) must complete successfully before getUserMedia.
 */
export const CALL_MEDIA_ORDER = ['authorize', 'acquire_media', 'join_or_active', 'cleanup_on_fail'] as const;

// ---------------------------------------------------------------------------
// R-04 — Call-scoped asynchronous operation generation tokens
// ---------------------------------------------------------------------------

export type CallOpToken = {
  /** Monotonic generation for this provider instance */
  generation: number;
  /** Bound call id once known (empty string until initiate/accept returns) */
  callId: string;
};

export type CallOpTracker = {
  /** Begin a new operation (invalidates all previous tokens). */
  begin: (callId?: string | null) => CallOpToken;
  /** Bind callId onto a still-current token (e.g. after initiate ack). */
  bindCallId: (token: CallOpToken, callId: string) => boolean;
  /** True if token is still the latest generation for its call. */
  isCurrent: (token: CallOpToken) => boolean;
  /** Invalidate everything (end call / unmount). */
  invalidate: () => void;
  /** Current generation (tests). */
  getGeneration: () => number;
  getActiveCallId: () => string;
};

export const createCallOpTracker = (): CallOpTracker => {
  let generation = 0;
  let activeCallId = '';

  return {
    begin(callId?: string | null) {
      generation += 1;
      activeCallId = String(callId || '').trim();
      return { generation, callId: activeCallId };
    },
    bindCallId(token: CallOpToken, callId: string) {
      if (token.generation !== generation) return false;
      const id = String(callId || '').trim();
      if (!id) return false;
      activeCallId = id;
      // Mutate token so later checks include callId
      (token as CallOpToken).callId = id;
      return true;
    },
    isCurrent(token: CallOpToken) {
      if (!token || token.generation !== generation) return false;
      const tokenCall = String(token.callId || '').trim();
      // Before bind: generation match is enough.
      if (!tokenCall) return true;
      // After bind: must match active call (prevents A finishing after B started).
      return tokenCall === activeCallId;
    },
    invalidate() {
      generation += 1;
      activeCallId = '';
    },
    getGeneration: () => generation,
    getActiveCallId: () => activeCallId
  };
};
