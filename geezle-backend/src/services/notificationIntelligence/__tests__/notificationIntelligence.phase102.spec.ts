/**
 * Phase 10.2 — Notification Intelligence dark foundation tests.
 */
import {
  DEFAULT_NOTIF_INTEL_FLAGS,
  invalidateNotificationIntelRolloutCache,
  resolveNotificationIntelRolloutFlags,
  notificationIntelligenceService,
  resetNotifIntelMetricsForTests,
  getNotifIntelMetricsSnapshot,
  toApiNotification
} from '../index';

const mockFindMany = jest.fn();
const mockUpdateMany = jest.fn();

jest.mock('../../../utils/prismaClient', () => ({
  __esModule: true,
  default: {
    notification: {
      findMany: (...args: any[]) => mockFindMany(...args),
      updateMany: (...args: any[]) => mockUpdateMany(...args)
    }
  }
}));

jest.mock('../../notificationActionUrl.service', () => ({
  normalizeNotificationActionUrl: (v: any) => (v ? String(v) : null),
  buildNotificationActionUrl: () => null
}));

describe('Notification Intelligence rollout', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
    invalidateNotificationIntelRolloutCache();
  });

  test('defaults master OFF and diagnostics ON', () => {
    delete process.env.NOTIF_INTEL_MASTER;
    delete process.env.NOTIF_INTEL_WRITE;
    delete process.env.NOTIF_INTEL_DIAGNOSTICS;
    invalidateNotificationIntelRolloutCache();
    const flags = resolveNotificationIntelRolloutFlags({ ...process.env });
    expect(flags.master).toBe(false);
    expect(flags.write).toBe(false);
    expect(flags.priorityList).toBe(false);
    expect(flags.diagnostics).toBe(true);
    expect(DEFAULT_NOTIF_INTEL_FLAGS.master).toBe(false);
  });

  test('master OFF forces user-facing flags OFF even if env sets them', () => {
    const flags = resolveNotificationIntelRolloutFlags({
      NOTIF_INTEL_MASTER: 'false',
      NOTIF_INTEL_WRITE: 'true',
      NOTIF_INTEL_PRIORITY_LIST: 'true',
      NOTIF_INTEL_DIGEST: 'true'
    } as any);
    expect(flags.master).toBe(false);
    expect(flags.write).toBe(false);
    expect(flags.priorityList).toBe(false);
    expect(flags.digest).toBe(false);
  });

  test('master ON enables sub-flags when set', () => {
    const flags = resolveNotificationIntelRolloutFlags({
      NOTIF_INTEL_MASTER: 'true',
      NOTIF_INTEL_WRITE: 'true',
      NOTIF_INTEL_PRIORITY_LIST: '1'
    } as any);
    expect(flags.master).toBe(true);
    expect(flags.write).toBe(true);
    expect(flags.priorityList).toBe(true);
  });
});

describe('Notification Intelligence façade (legacy-compatible)', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockUpdateMany.mockReset();
    resetNotifIntelMetricsForTests();
    invalidateNotificationIntelRolloutCache();
  });

  test('listForViewer maps rows to API shape and pagination', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'n1',
        type: 'comment_on_post',
        title: 'New comment',
        body: 'Hello',
        actorId: 'a1',
        meta: { actorName: 'Ada', actionUrl: '/post/1' },
        isRead: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z')
      }
    ]);

    const result = await notificationIntelligenceService.listForViewer({
      viewerId: 'u1',
      limit: 50
    });

    expect(mockFindMany).toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('n1');
    expect(result.items[0].message).toBe('Hello');
    expect(result.items[0].isRead).toBe(false);
    expect(result.items[0].actorName).toBe('Ada');
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.nextCursor).toBe(null);

    const metrics = getNotifIntelMetricsSnapshot();
    expect(metrics.counts.list).toBe(1);
  });

  test('markRead rejects empty ids', async () => {
    await expect(
      notificationIntelligenceService.markRead({ viewerId: 'u1', ids: [] })
    ).rejects.toMatchObject({ message: 'ids required', statusCode: 400 });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test('markRead updates only viewer rows', async () => {
    mockUpdateMany.mockResolvedValue({ count: 2 });
    const result = await notificationIntelligenceService.markRead({
      viewerId: 'u1',
      ids: ['n1', 'n2']
    });
    expect(result.success).toBe(true);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['n1', 'n2'] }, userId: 'u1' },
      data: { isRead: true }
    });
  });

  test('markAllRead updates unread for viewer', async () => {
    mockUpdateMany.mockResolvedValue({ count: 5 });
    await notificationIntelligenceService.markAllRead({ viewerId: 'u1' });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', isRead: false },
      data: { isRead: true }
    });
  });

  test('toApiNotification dual field compatibility', () => {
    const shaped = toApiNotification({
      id: 'x',
      type: 'info',
      title: 'T',
      body: 'B',
      actorId: 'a',
      meta: {},
      isRead: true,
      createdAt: new Date()
    });
    expect(shaped.is_read).toBe(true);
    expect(shaped.isRead).toBe(true);
    expect(shaped.message).toBe('B');
  });
});
