/**
 * Phase 29.2 — lightweight in-process metrics for group realtime.
 * No private message bodies in logs.
 */

type CounterMap = Map<string, number>;
type LatencySample = { count: number; sumMs: number };

const counters: CounterMap = new Map();
const latency: Map<string, LatencySample> = new Map();

const bump = (name: string, n = 1) => {
  counters.set(name, (counters.get(name) || 0) + n);
};

export const groupMetrics = {
  socketJoin: () => bump('group_socket_join_total'),
  socketJoinDenied: () => bump('group_socket_join_denied_total'),
  messageSend: () => bump('group_message_send_total'),
  messageSendRejected: () => bump('group_message_send_rejected_total'),
  messageDuplicate: () => bump('group_message_duplicate_total'),
  typingEvent: () => bump('group_typing_event_total'),
  typingRateLimited: () => bump('group_typing_rate_limited_total'),
  reconnectCatchup: () => bump('group_reconnect_catchup_total'),
  pin: () => bump('group_pin_total'),
  reaction: () => bump('group_reaction_total'),
  membershipEvent: () => bump('group_membership_event_total'),
  roomLeakDetected: () => bump('group_socket_room_leak_detected_total'),
  deliveryLatency: (ms: number) => {
    const key = 'group_event_delivery_latency_ms';
    const row = latency.get(key) || { count: 0, sumMs: 0 };
    row.count += 1;
    row.sumMs += Math.max(0, ms);
    latency.set(key, row);
  },
  snapshot: () => {
    const out: Record<string, number> = {};
    counters.forEach((v, k) => {
      out[k] = v;
    });
    latency.forEach((v, k) => {
      out[`${k}_count`] = v.count;
      out[`${k}_avg`] = v.count ? Math.round(v.sumMs / v.count) : 0;
    });
    return out;
  },
  resetForTests: () => {
    counters.clear();
    latency.clear();
  }
};

export const logGroupRealtime = (
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown>
) => {
  // Structured, no message bodies / invite codes / tokens
  const safe: Record<string, unknown> = { event, phase: '29.2', ...fields };
  delete safe.text;
  delete safe.body;
  delete safe.message;
  delete safe.code;
  delete safe.inviteCode;
  delete safe.token;
  const line = JSON.stringify(safe);
  if (level === 'error') console.error('[group-realtime]', line);
  else if (level === 'warn') console.warn('[group-realtime]', line);
  else console.info('[group-realtime]', line);
};

export const GROUP_METRICS_VERSION = '29.2';
