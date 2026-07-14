/**
 * Shared messaging fallback polling policy.
 * Healthy sockets never start routine conversation polling.
 */
import type { SocketConnectionHealth } from '../../context/SocketContext';

export const MESSAGING_POLL_GRACE_MS = 8_000;
export const MESSAGING_POLL_INTERVAL_MS = 30_000;
export const MESSAGING_POLL_INTERVAL_DEGRADED_MS = 45_000;

export type MessagingPollingDecision = {
  shouldPoll: boolean;
  intervalMs: number;
  reason: string;
};

/**
 * Decide whether bounded fallback polling should run.
 * - Do not use socket === null alone.
 * - Brief reconnects (reconnecting within grace) must not poll.
 * - Offline: never poll.
 * - Connected: never routine poll.
 */
export const decideMessagingFallbackPolling = (input: {
  health: SocketConnectionHealth | string;
  isOnline: boolean;
  disconnectedSince: number | null;
  now?: number;
  tabHidden?: boolean;
}): MessagingPollingDecision => {
  const now = Number(input.now || Date.now());
  if (!input.isOnline || input.health === 'offline') {
    return { shouldPoll: false, intervalMs: 0, reason: 'offline' };
  }
  if (input.health === 'connected') {
    return { shouldPoll: false, intervalMs: 0, reason: 'healthy_socket' };
  }
  if (input.tabHidden) {
    return { shouldPoll: false, intervalMs: 0, reason: 'tab_hidden' };
  }

  const since = Number(input.disconnectedSince || 0);
  const elapsed = since > 0 ? now - since : Number.POSITIVE_INFINITY;

  if (input.health === 'connecting' || input.health === 'reconnecting') {
    if (elapsed < MESSAGING_POLL_GRACE_MS) {
      return { shouldPoll: false, intervalMs: 0, reason: 'grace_period' };
    }
    return {
      shouldPoll: true,
      intervalMs: MESSAGING_POLL_INTERVAL_MS,
      reason: 'reconnect_timeout'
    };
  }

  if (input.health === 'degraded') {
    if (elapsed < MESSAGING_POLL_GRACE_MS) {
      return { shouldPoll: false, intervalMs: 0, reason: 'grace_period' };
    }
    return {
      shouldPoll: true,
      intervalMs: MESSAGING_POLL_INTERVAL_DEGRADED_MS,
      reason: 'degraded'
    };
  }

  // disconnected
  if (elapsed < MESSAGING_POLL_GRACE_MS) {
    return { shouldPoll: false, intervalMs: 0, reason: 'grace_period' };
  }
  return {
    shouldPoll: true,
    intervalMs: MESSAGING_POLL_INTERVAL_MS,
    reason: 'disconnected'
  };
};
