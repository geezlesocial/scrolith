import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildThreadTimeline,
  countUnreadIncoming,
  findFirstUnreadIndex,
  formatDaySeparatorLabel,
  isNearBottom,
  preserveScrollTopAfterGrowth,
  toDayKey
} from '../../src/services/messagingEngine/messagingExperience';
import {
  __resetMessagingTelemetryForTests,
  computeCacheHitRatio,
  getMessagingTelemetrySnapshot,
  incrementMessagingCounter,
  recordMessagingMetric
} from '../../src/services/messagingEngine/messagingTelemetry';
import {
  groupNotificationsForDisplay,
  isNotificationMuted,
  muteConversationNotifications,
  scoreNotificationPriority,
  unmuteConversationNotifications
} from '../../src/utils/notificationExcellence';
import { describeDocumentPreview } from '../../src/services/messagingEngine/mediaProgressive';
import { getDeviceMediaConditions } from '../../src/services/messagingEngine/deviceMediaConditions';

test('day keys and separator labels', () => {
  const now = Date.parse('2026-07-18T12:00:00.000Z');
  const today = Date.parse('2026-07-18T08:00:00.000Z');
  const yesterday = Date.parse('2026-07-17T08:00:00.000Z');
  assert.equal(toDayKey(today), '2026-07-18');
  assert.equal(formatDaySeparatorLabel(today, now), 'Today');
  assert.equal(formatDaySeparatorLabel(yesterday, now), 'Yesterday');
});

test('first unread index ignores own messages', () => {
  const messages = [
    { id: '1', senderId: 'me', isRead: true, timestamp: '2026-07-18T10:00:00.000Z' },
    { id: '2', senderId: 'them', isRead: true, timestamp: '2026-07-18T10:01:00.000Z' },
    { id: '3', senderId: 'them', isRead: false, timestamp: '2026-07-18T10:02:00.000Z' },
    { id: '4', senderId: 'me', isRead: false, timestamp: '2026-07-18T10:03:00.000Z' }
  ];
  assert.equal(findFirstUnreadIndex(messages, 'me'), 2);
  assert.equal(countUnreadIncoming(messages, 'me'), 1);
});

test('timeline inserts date + unread dividers and clustering flags', () => {
  const messages = [
    { id: '1', senderId: 'a', isRead: true, timestamp: '2026-07-17T10:00:00.000Z' },
    { id: '2', senderId: 'a', isRead: false, timestamp: '2026-07-18T10:00:00.000Z' },
    { id: '3', senderId: 'b', isRead: false, timestamp: '2026-07-18T10:01:00.000Z' }
  ];
  const timeline = buildThreadTimeline(messages, { viewerId: 'viewer', nowMs: Date.parse('2026-07-18T12:00:00.000Z') });
  assert.ok(timeline.some((item) => item.kind === 'date'));
  assert.ok(timeline.some((item) => item.kind === 'unread'));
  const messageItems = timeline.filter((item) => item.kind === 'message') as any[];
  assert.equal(messageItems.length, 3);
  assert.equal(messageItems[0].isClusterStart, true);
});

test('scroll preservation keeps offset when not stuck to bottom', () => {
  const next = preserveScrollTopAfterGrowth({
    previousScrollHeight: 1000,
    previousScrollTop: 400,
    nextScrollHeight: 1300,
    stickToBottom: false,
    clientHeight: 500
  });
  assert.equal(next, 700);
  const bottom = preserveScrollTopAfterGrowth({
    previousScrollHeight: 1000,
    previousScrollTop: 900,
    nextScrollHeight: 1300,
    stickToBottom: true,
    clientHeight: 500
  });
  assert.equal(bottom, 800);
  assert.equal(isNearBottom(900, 1000, 90, 120), true);
});

test('telemetry records metrics and counters without content', () => {
  __resetMessagingTelemetryForTests();
  recordMessagingMetric('conversation_open_ms', 120);
  recordMessagingMetric('conversation_open_ms', 80);
  recordMessagingMetric('cache_hit', 1);
  recordMessagingMetric('cache_hit', 1);
  recordMessagingMetric('cache_miss', 1);
  incrementMessagingCounter('upload_retry', 2);
  const snap = getMessagingTelemetrySnapshot();
  assert.equal(snap.metrics.conversation_open_ms.count, 2);
  assert.equal(snap.metrics.conversation_open_ms.avg, 100);
  assert.ok(computeCacheHitRatio() > 0.6);
  assert.equal(snap.counters.upload_retry, 2);
});

test('notification grouping and mute', () => {
  // Use memory localStorage polyfill for node
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k)
  };

  muteConversationNotifications('c1', 60_000);
  assert.equal(
    isNotificationMuted({ type: 'message', metadata: { conversationId: 'c1' } }),
    true
  );
  unmuteConversationNotifications('c1');
  assert.equal(
    isNotificationMuted({ type: 'message', metadata: { conversationId: 'c1' } }),
    false
  );

  const grouped = groupNotificationsForDisplay([
    { id: '1', type: 'message', conversationId: 'c9', title: 'A', timestamp: '2026-07-18T10:00:00.000Z' },
    { id: '2', type: 'message', conversationId: 'c9', title: 'B', timestamp: '2026-07-18T11:00:00.000Z' },
    { id: '3', type: 'comment_on_post', title: 'C', timestamp: '2026-07-18T09:00:00.000Z' }
  ]);
  assert.equal(grouped.length, 2);
  const msgGroup = grouped.find((g) => g.groupKey.includes('c9'));
  assert.equal(msgGroup?.count, 2);
  assert.ok(scoreNotificationPriority({ type: 'security_alert' }) > scoreNotificationPriority({ type: 'system' }));
});

test('document preview metadata and device conditions are available', () => {
  const doc = describeDocumentPreview({ name: 'brief.pdf', size: 2048, type: 'application/pdf' });
  assert.equal(doc.extension, 'PDF');
  assert.ok(doc.sizeLabel.includes('KB'));
  const conditions = getDeviceMediaConditions();
  assert.equal(typeof conditions.online, 'boolean');
  assert.equal(typeof conditions.allowPreload, 'boolean');
});
