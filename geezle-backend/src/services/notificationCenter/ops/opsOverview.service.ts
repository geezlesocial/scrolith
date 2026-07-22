/**
 * Phase 32.4 — Operations dashboard aggregates from existing notification tables.
 */
import prisma from '../../../utils/prismaClient';
import { NotificationOpsConfigService } from './opsConfig.service';
import { NotificationAdminDefaultsService } from '../adminDefaults.service';

const isMissing = (err: any) =>
  err?.code === 'P2021' ||
  err?.name === 'PrismaClientInitializationError' ||
  /does not exist|DATABASE_URL|Environment variable not found/i.test(String(err?.message || ''));

const rangeToDates = (range: string, from?: string, to?: string) => {
  const end = to ? new Date(to) : new Date();
  let start: Date;
  if (from) start = new Date(from);
  else if (range === '30d') start = new Date(end.getTime() - 30 * 864e5);
  else if (range === '7d') start = new Date(end.getTime() - 7 * 864e5);
  else start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  return { start, end };
};

const safeCount = async (fn: () => Promise<number>) => {
  try {
    return await fn();
  } catch {
    return 0;
  }
};

export class NotificationOpsOverviewService {
  static async getOverview(params: { range?: string; from?: string; to?: string } = {}) {
    const range = String(params.range || 'today');
    const { start, end } = rangeToDates(range, params.from, params.to);

    const [
      emitted,
      delivered,
      failed,
      pending,
      suppressed,
      digestsSent,
      pushDelivered,
      emailDelivered,
      inAppCreated,
      readCount,
      unreadCount,
      devices,
      invalidish,
      retriesPending,
      retriesFailed,
      avgLatency
    ] = await Promise.all([
      safeCount(() =>
        prisma.notification.count({
          where: { createdAt: { gte: start, lte: end } }
        })
      ),
      safeCount(() =>
        (prisma as any).notificationDelivery.count({
          where: { status: 'sent', createdAt: { gte: start, lte: end } }
        })
      ),
      safeCount(() =>
        (prisma as any).notificationDelivery.count({
          where: { status: 'failed', createdAt: { gte: start, lte: end } }
        })
      ),
      safeCount(() =>
        (prisma as any).notificationDelivery.count({
          where: { status: 'pending', createdAt: { gte: start, lte: end } }
        })
      ),
      safeCount(() =>
        (prisma as any).notificationDelivery.count({
          where: {
            status: { in: ['suppressed', 'queued_digest'] },
            createdAt: { gte: start, lte: end }
          }
        })
      ),
      safeCount(async () => {
        try {
          return await (prisma as any).notificationDigest.count({
            where: { status: 'sent', createdAt: { gte: start, lte: end } }
          });
        } catch {
          return 0;
        }
      }),
      safeCount(() =>
        (prisma as any).notificationDelivery.count({
          where: { channel: 'push', status: 'sent', createdAt: { gte: start, lte: end } }
        })
      ),
      safeCount(() =>
        (prisma as any).notificationDelivery.count({
          where: { channel: 'email', status: 'sent', createdAt: { gte: start, lte: end } }
        })
      ),
      safeCount(() =>
        (prisma as any).notificationDelivery.count({
          where: {
            channel: { in: ['in_app', 'IN_APP'] },
            createdAt: { gte: start, lte: end }
          }
        })
      ),
      safeCount(() =>
        prisma.notification.count({
          where: { isRead: true, createdAt: { gte: start, lte: end } }
        })
      ),
      safeCount(() =>
        prisma.notification.count({
          where: { isRead: false, createdAt: { gte: start, lte: end } }
        })
      ),
      safeCount(() => prisma.deviceToken.count()),
      safeCount(() =>
        (prisma as any).deviceToken
          .count({ where: { pushStatus: { in: ['invalid', 'unregistered'] } } })
          .catch(() => 0)
      ),
      safeCount(() =>
        (prisma as any).notificationRetryJob
          .count({ where: { status: 'pending' } })
          .catch(() => 0)
      ),
      safeCount(() =>
        (prisma as any).notificationRetryJob
          .count({ where: { status: 'failed' } })
          .catch(() => 0)
      ),
      (async () => {
        try {
          const rows = await (prisma as any).notificationDelivery.findMany({
            where: {
              latencyMs: { not: null },
              createdAt: { gte: start, lte: end }
            },
            select: { latencyMs: true },
            take: 500
          });
          if (!rows?.length) return null;
          const sum = rows.reduce((a: number, r: any) => a + Number(r.latencyMs || 0), 0);
          return Math.round(sum / rows.length);
        } catch {
          return null;
        }
      })()
    ]);

    // Category / type breakdown
    let topCategories: Array<{ category: string; count: number }> = [];
    let topEventTypes: Array<{ type: string; count: number }> = [];
    try {
      const recent = await prisma.notification.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: { category: true, type: true },
        take: 2000,
        orderBy: { createdAt: 'desc' }
      });
      const catMap = new Map<string, number>();
      const typeMap = new Map<string, number>();
      for (const n of recent) {
        const c = String((n as any).category || 'system');
        const t = String(n.type || 'unknown');
        catMap.set(c, (catMap.get(c) || 0) + 1);
        typeMap.set(t, (typeMap.get(t) || 0) + 1);
      }
      topCategories = Array.from(catMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      topEventTypes = Array.from(typeMap.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    } catch {
      /* */
    }

    // Analytics counters (Phase 32.0)
    let counters: any[] = [];
    try {
      counters = await (prisma as any).notificationAnalyticsCounter.findMany({
        where: { date: { gte: start, lte: end } },
        take: 200
      });
    } catch {
      counters = [];
    }

    const totalAttempts = delivered + failed + pending + suppressed;
    const failureRate = totalAttempts ? failed / totalAttempts : 0;
    const readRate = emitted ? readCount / emitted : 0;

    const [flags, retention, settings] = await Promise.all([
      NotificationOpsConfigService.getFeatureFlags(),
      NotificationOpsConfigService.getRetention(),
      NotificationOpsConfigService.getSettings()
    ]);

    return {
      range,
      start: start.toISOString(),
      end: end.toISOString(),
      metrics: {
        emitted,
        delivered,
        failed,
        pending,
        deferred: suppressed,
        suppressed,
        digestsSent,
        pushDeliveries: pushDelivered,
        emailDeliveries: emailDelivered,
        inAppDeliveries: inAppCreated || emitted,
        deliveryLatencyMs: avgLatency,
        queueDepth: retriesPending,
        activeWorkers: 1,
        failureRate: Number(failureRate.toFixed(4)),
        readRate: Number(readRate.toFixed(4)),
        clickThroughRate: null,
        unread: unreadCount,
        devicesRegistered: devices,
        invalidTokens: invalidish,
        retryBacklog: retriesPending,
        deadLetterApprox: retriesFailed
      },
      topCategories,
      topEventTypes,
      counters,
      featureFlags: flags.value,
      retention: retention.value,
      settings: settings.value,
      adminDefaults: NotificationAdminDefaultsService.get(),
      generatedAt: new Date().toISOString()
    };
  }

  static async getDeliveryBreakdown(params: { range?: string; from?: string; to?: string } = {}) {
    const range = String(params.range || '7d');
    const { start, end } = rangeToDates(range, params.from, params.to);
    const channels = ['push', 'email', 'in_app', 'IN_APP'];
    const result: Record<string, any> = {};
    for (const channel of channels) {
      const key = channel.toLowerCase() === 'in_app' ? 'in_app' : channel.toLowerCase();
      if (result[key]) continue;
      result[key] = {
        delivered: await safeCount(() =>
          (prisma as any).notificationDelivery.count({
            where: {
              channel: { in: channel === 'in_app' ? ['in_app', 'IN_APP'] : [channel] },
              status: 'sent',
              createdAt: { gte: start, lte: end }
            }
          })
        ),
        failed: await safeCount(() =>
          (prisma as any).notificationDelivery.count({
            where: {
              channel: { in: channel === 'in_app' ? ['in_app', 'IN_APP'] : [channel] },
              status: 'failed',
              createdAt: { gte: start, lte: end }
            }
          })
        ),
        pending: await safeCount(() =>
          (prisma as any).notificationDelivery.count({
            where: {
              channel: { in: channel === 'in_app' ? ['in_app', 'IN_APP'] : [channel] },
              status: 'pending',
              createdAt: { gte: start, lte: end }
            }
          })
        ),
        suppressed: await safeCount(() =>
          (prisma as any).notificationDelivery.count({
            where: {
              channel: { in: channel === 'in_app' ? ['in_app', 'IN_APP'] : [channel] },
              status: { in: ['suppressed', 'queued_digest'] },
              createdAt: { gte: start, lte: end }
            }
          })
        )
      };
    }
    return { range, start: start.toISOString(), end: end.toISOString(), channels: result };
  }

  static async getLiveActivity(limit = 40) {
    try {
      const rows = await prisma.notification.findMany({
        orderBy: { createdAt: 'desc' },
        take: Math.min(100, Math.max(1, limit)),
        select: {
          id: true,
          userId: true,
          type: true,
          category: true,
          title: true,
          priority: true,
          isRead: true,
          createdAt: true
        } as any
      });
      return rows;
    } catch {
      return [];
    }
  }

  static async getAuditLogs(params: { limit?: number; action?: string } = {}) {
    try {
      const where: any = {};
      if (params.action) where.action = params.action;
      return await (prisma as any).notificationAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(100, Math.max(1, Number(params.limit) || 50))
      });
    } catch {
      return [];
    }
  }

  static async getDeviceHealth() {
    try {
      const total = await prisma.deviceToken.count();
      const byPlatformRaw = await prisma.deviceToken.groupBy({
        by: ['platform'],
        _count: { _all: true }
      });
      let invalid = 0;
      let withSync = 0;
      try {
        invalid = await (prisma as any).deviceToken.count({
          where: { pushStatus: { in: ['invalid', 'unregistered'] } }
        });
        withSync = await (prisma as any).deviceToken.count({
          where: { lastSyncAt: { not: null } }
        });
      } catch {
        /* columns optional */
      }
      // App version distribution when column present
      let byAppVersion: Array<{ appVersion: string; count: number }> = [];
      try {
        const rows = await (prisma as any).deviceToken.findMany({
          where: { appVersion: { not: null } },
          select: { appVersion: true },
          take: 2000
        });
        const map = new Map<string, number>();
        for (const r of rows) {
          const v = String(r.appVersion || 'unknown');
          map.set(v, (map.get(v) || 0) + 1);
        }
        byAppVersion = Array.from(map.entries())
          .map(([appVersion, count]) => ({ appVersion, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 15);
      } catch {
        byAppVersion = [];
      }

      return {
        total,
        invalidTokens: invalid,
        inactiveApprox: Math.max(0, total - withSync),
        withLastSync: withSync,
        byPlatform: byPlatformRaw.map((r) => ({
          platform: r.platform,
          count: r._count._all
        })),
        byAppVersion
      };
    } catch (err) {
      if (isMissing(err)) {
        return {
          total: 0,
          invalidTokens: 0,
          inactiveApprox: 0,
          withLastSync: 0,
          byPlatform: [],
          byAppVersion: []
        };
      }
      throw err;
    }
  }

  static async getQueueHealth() {
    const pending = await safeCount(() =>
      (prisma as any).notificationRetryJob.count({ where: { status: 'pending' } }).catch(() => 0)
    );
    const processing = await safeCount(() =>
      (prisma as any).notificationRetryJob.count({ where: { status: 'processing' } }).catch(() => 0)
    );
    const failed = await safeCount(() =>
      (prisma as any).notificationRetryJob.count({ where: { status: 'failed' } }).catch(() => 0)
    );
    const completed = await safeCount(() =>
      (prisma as any).notificationRetryJob.count({ where: { status: 'completed' } }).catch(() => 0)
    );
    const deliveryPending = await safeCount(() =>
      (prisma as any).notificationDelivery.count({ where: { status: 'pending' } }).catch(() => 0)
    );
    return {
      workerStatus: 'idle',
      queueDepth: pending + processing + deliveryPending,
      processingRate: null,
      deadLetterCount: failed,
      retryBacklog: pending,
      completed,
      processing,
      deliveryPending,
      averageProcessingTimeMs: null,
      digestCronEnabled: String(process.env.NOTIFICATION_DIGEST_CRON_ENABLED || 'true') !== 'false'
    };
  }
}

export default NotificationOpsOverviewService;
