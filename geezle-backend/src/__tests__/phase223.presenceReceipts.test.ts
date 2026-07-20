/**
 * Phase 22.3 — presence store + receipt policy unit tests.
 */
import {
  advanceWatermark,
  resolveOutgoingDeliveryStatus,
  SMALL_GROUP_RECEIPT_MEMBER_CAP
} from '../services/messaging/receiptPolicy';
import {
  filterPresenceForViewer,
  presenceStore,
  PRESENCE_STORE_VERSION
} from '../services/messaging/presenceStore';

describe('Phase 22.3 presence & receipts', () => {
  test('presence store connect/disconnect connection counting', () => {
    const id = 'user-presence-1';
    presenceStore.delete(id);
    const a = presenceStore.markConnect(id);
    expect(a.isOnline).toBe(true);
    expect(a.connectionCount).toBe(1);
    const b = presenceStore.markConnect(id);
    expect(b.connectionCount).toBe(2);
    const c = presenceStore.markDisconnect(id);
    expect(c.connectionCount).toBe(1);
    expect(c.isOnline).toBe(true);
    const d = presenceStore.markDisconnect(id);
    expect(d.connectionCount).toBe(0);
    expect(d.state).toBe('offline');
  });

  test('presence privacy NOBODY hides online state from others', () => {
    const id = 'user-private-1';
    presenceStore.set(id, {
      userId: id,
      isOnline: true,
      state: 'online',
      lastSeenAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      visibility: 'NOBODY',
      connectionCount: 1
    });
    const filtered = filterPresenceForViewer(presenceStore.get(id), 'viewer-2', true);
    expect(filtered?.isOnline).toBe(false);
    expect(filtered?.lastSeenAt).toBeNull();
  });

  test('receipt watermark advance is monotonic', () => {
    const t1 = new Date('2026-07-20T10:00:00.000Z');
    const t2 = new Date('2026-07-20T11:00:00.000Z');
    expect(advanceWatermark(t2, t1)?.toISOString()).toBe(t2.toISOString());
    expect(advanceWatermark(t1, t2)?.toISOString()).toBe(t2.toISOString());
  });

  test('outgoing delivery: sent → delivered → read for DM peers', () => {
    const created = new Date('2026-07-20T12:00:00.000Z').getTime();
    const peers = [
      {
        userId: 'peer',
        lastReadAt: null as number | null,
        lastDeliveredAt: null as number | null
      }
    ];
    expect(
      resolveOutgoingDeliveryStatus({
        messageCreatedAt: created,
        peers,
        isGroup: false,
        memberCount: 2
      })
    ).toBe('sent');

    peers[0].lastDeliveredAt = created;
    expect(
      resolveOutgoingDeliveryStatus({
        messageCreatedAt: created,
        peers,
        isGroup: false,
        memberCount: 2
      })
    ).toBe('delivered');

    peers[0].lastReadAt = created;
    expect(
      resolveOutgoingDeliveryStatus({
        messageCreatedAt: created,
        peers,
        isGroup: false,
        memberCount: 2
      })
    ).toBe('read');
  });

  test('large group uses any-peer watermark semantics', () => {
    const created = Date.now();
    const peers = Array.from({ length: SMALL_GROUP_RECEIPT_MEMBER_CAP + 3 }).map((_, i) => ({
      userId: `u${i}`,
      lastReadAt: i === 0 ? created : null,
      lastDeliveredAt: null as number | null
    }));
    expect(
      resolveOutgoingDeliveryStatus({
        messageCreatedAt: created,
        peers,
        isGroup: true,
        memberCount: peers.length + 1
      })
    ).toBe('read');
  });

  test('store version', () => {
    expect(PRESENCE_STORE_VERSION).toBe('22.3');
  });
});
