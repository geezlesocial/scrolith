/**
 * Phase 22.3 — delivery/read receipt policy (watermark-first).
 *
 * DIRECT / small groups: derive per-message status from peer watermarks.
 * Large groups: watermark model only (no per-member fan-out ticks).
 */

export type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read';

export const SMALL_GROUP_RECEIPT_MEMBER_CAP = Math.max(
  3,
  Number(process.env.MESSAGING_SMALL_GROUP_RECEIPT_CAP || 12)
);

export type PeerWatermark = {
  userId: string;
  lastReadAt: number | null;
  lastDeliveredAt: number | null;
};

/** Compare ISO or Date-like values → epoch ms or null */
export const toEpoch = (value: unknown): number | null => {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const t = new Date(String(value)).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * For a message the current user sent, compute delivery status from other participants' watermarks.
 * - read: every other peer lastReadAt >= messageCreatedAt (or any peer for DM semantics — all others)
 * - delivered: every other peer lastDeliveredAt or lastReadAt >= messageCreatedAt
 * - sent: server persisted
 */
export const resolveOutgoingDeliveryStatus = (params: {
  messageCreatedAt: number;
  peers: PeerWatermark[];
  isGroup: boolean;
  memberCount: number;
  /** Phase 22.3B — only peers who disclose read receipts count toward "read" */
  readDisclosurePeerIds?: string[] | null;
}): MessageDeliveryStatus => {
  const createdAt = Number(params.messageCreatedAt || 0);
  if (!createdAt) return 'sent';
  const peers = (params.peers || []).filter((p) => p && p.userId);
  if (!peers.length) return 'sent';

  const disclosure = Array.isArray(params.readDisclosurePeerIds)
    ? new Set(params.readDisclosurePeerIds)
    : null;
  const peersForRead = disclosure
    ? peers.filter((p) => disclosure.has(p.userId))
    : peers;

  // Large groups/channels: only coarse watermark (delivered if any peer delivered, read if any read)
  if (params.isGroup && params.memberCount > SMALL_GROUP_RECEIPT_MEMBER_CAP) {
    const anyRead = peersForRead.some((p) => (p.lastReadAt || 0) >= createdAt);
    if (anyRead) return 'read';
    const anyDelivered = peers.some(
      (p) => (p.lastDeliveredAt || 0) >= createdAt || (p.lastReadAt || 0) >= createdAt
    );
    return anyDelivered ? 'delivered' : 'sent';
  }

  // Read: only among peers who allow receipt disclosure (if set empty → never show read)
  if (peersForRead.length > 0) {
    const allRead = peersForRead.every((p) => (p.lastReadAt || 0) >= createdAt);
    if (allRead) return 'read';
  }

  const allDelivered = peers.every(
    (p) => (p.lastDeliveredAt || 0) >= createdAt || (p.lastReadAt || 0) >= createdAt
  );
  if (allDelivered) return 'delivered';

  return 'sent';
};

/** Max of current watermark and candidate (monotonic). */
export const advanceWatermark = (current: unknown, candidate: unknown): Date | null => {
  const cur = toEpoch(current);
  const next = toEpoch(candidate);
  if (next == null) return cur != null ? new Date(cur) : null;
  if (cur == null || next > cur) return new Date(next);
  return new Date(cur);
};

export const RECEIPT_POLICY_VERSION = '22.3';
