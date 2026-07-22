/**
 * Phase 32.6 — Retention dry-run / conservative purge for notification operational tables.
 * Kill switch: NOTIFICATION_RETENTION_PURGE_ENABLED must be "true" for execute.
 * Dry-run is always safe and never deletes.
 */
import prisma from '../../../utils/prismaClient';
import { NotificationOpsConfigService } from './opsConfig.service';
import { writeNotificationAudit, bumpNotificationMetric } from '../analytics';

const isMissing = (err: any) =>
  err?.code === 'P2021' ||
  err?.name === 'PrismaClientInitializationError' ||
  /does not exist|DATABASE_URL/i.test(String(err?.message || ''));

export type RetentionCandidateReport = {
  dryRun: boolean;
  executed: boolean;
  killSwitchEnabled: boolean;
  batchSize: number;
  windows: Record<string, number>;
  candidates: Record<string, number>;
  deleted: Record<string, number>;
  notes: string[];
  at: string;
};

const daysAgo = (days: number) => new Date(Date.now() - days * 864e5);

export class NotificationRetentionPurgeService {
  static killSwitchOn() {
    return String(process.env.NOTIFICATION_RETENTION_PURGE_ENABLED || '').toLowerCase() === 'true';
  }

  static async plan(): Promise<RetentionCandidateReport> {
    const retention = await NotificationOpsConfigService.getRetention();
    const windows = retention.value as Record<string, number>;
    const batchSize = Math.min(
      5000,
      Math.max(50, Number(process.env.NOTIFICATION_RETENTION_BATCH_SIZE || 500))
    );
    const candidates: Record<string, number> = {};
    const notes: string[] = [];

    const countSafe = async (label: string, fn: () => Promise<number>) => {
      try {
        candidates[label] = await fn();
      } catch (err) {
        candidates[label] = 0;
        if (!isMissing(err)) notes.push(`${label}: ${String((err as any)?.message || err).slice(0, 120)}`);
        else notes.push(`${label}: table_missing_or_unavailable`);
      }
    };

    await countSafe('notificationEvents', () =>
      (prisma as any).notificationEvent.count({
        where: { createdAt: { lt: daysAgo(windows.notificationEventsDays || 90) } }
      })
    );
    await countSafe('deliveryLogs', () =>
      (prisma as any).notificationDelivery.count({
        where: { createdAt: { lt: daysAgo(windows.deliveryLogsDays || 60) } }
      })
    );
    await countSafe('auditLogs', () =>
      (prisma as any).notificationAudit.count({
        where: { createdAt: { lt: daysAgo(windows.auditLogsDays || 180) } }
      })
    );
    // Preserve recent audit always — dry-run only reports older than window
    await countSafe('lifecycleEvents', () =>
      (prisma as any).notificationLifecycleEvent.count({
        where: { createdAt: { lt: daysAgo(windows.lifecycleEventsDays || 60) } }
      })
    );
    await countSafe('digests', () =>
      (prisma as any).notificationDigest.count({
        where: { createdAt: { lt: daysAgo(windows.digestsDays || 90) } }
      })
    );
    await countSafe('analyticsCounters', () =>
      (prisma as any).notificationAnalyticsCounter.count({
        where: { date: { lt: daysAgo(windows.analyticsSummariesDays || 365) } }
      })
    );

    return {
      dryRun: true,
      executed: false,
      killSwitchEnabled: this.killSwitchOn(),
      batchSize,
      windows,
      candidates,
      deleted: {},
      notes,
      at: new Date().toISOString()
    };
  }

  /**
   * Execute deletions in batches. Refuses if kill switch off.
   * Never deletes Notification inbox rows (user-facing) in 32.6 — only ops/log tables.
   */
  static async execute(opts?: { maxBatches?: number; actorId?: string | null }) {
    if (!this.killSwitchOn()) {
      const plan = await this.plan();
      return {
        ...plan,
        dryRun: false,
        executed: false,
        notes: [...plan.notes, 'kill_switch_off']
      };
    }

    const plan = await this.plan();
    const batchSize = plan.batchSize;
    const maxBatches = Math.min(20, Math.max(1, Number(opts?.maxBatches || 5)));
    const deleted: Record<string, number> = {};
    const notes = [...plan.notes];

    const deleteBatch = async (
      label: string,
      fn: (take: number) => Promise<{ count: number }>
    ) => {
      let total = 0;
      for (let i = 0; i < maxBatches; i++) {
        try {
          const r = await fn(batchSize);
          total += r.count || 0;
          if (!r.count || r.count < batchSize) break;
        } catch (err) {
          notes.push(`${label}_delete: ${String((err as any)?.message || err).slice(0, 120)}`);
          break;
        }
      }
      deleted[label] = total;
      if (total) await bumpNotificationMetric('retention_purged', label, total);
    };

    const cutoff = (days: number) => daysAgo(days);
    const w = plan.windows;

    // Prefer deleting by id lists to avoid unbounded deleteMany locks
    await deleteBatch('deliveryLogs', async (take) => {
      const rows = await (prisma as any).notificationDelivery.findMany({
        where: { createdAt: { lt: cutoff(w.deliveryLogsDays || 60) } },
        select: { id: true },
        take
      });
      if (!rows.length) return { count: 0 };
      const r = await (prisma as any).notificationDelivery.deleteMany({
        where: { id: { in: rows.map((x: any) => x.id) } }
      });
      return { count: r.count || 0 };
    });

    await deleteBatch('lifecycleEvents', async (take) => {
      const rows = await (prisma as any).notificationLifecycleEvent.findMany({
        where: { createdAt: { lt: cutoff(w.lifecycleEventsDays || 60) } },
        select: { id: true },
        take
      });
      if (!rows.length) return { count: 0 };
      const r = await (prisma as any).notificationLifecycleEvent.deleteMany({
        where: { id: { in: rows.map((x: any) => x.id) } }
      });
      return { count: r.count || 0 };
    });

    await deleteBatch('notificationEvents', async (take) => {
      const rows = await (prisma as any).notificationEvent.findMany({
        where: { createdAt: { lt: cutoff(w.notificationEventsDays || 90) } },
        select: { id: true },
        take
      });
      if (!rows.length) return { count: 0 };
      const r = await (prisma as any).notificationEvent.deleteMany({
        where: { id: { in: rows.map((x: any) => x.id) } }
      });
      return { count: r.count || 0 };
    });

    // Digests: delete items first then digests
    await deleteBatch('digestItems', async (take) => {
      const digests = await (prisma as any).notificationDigest.findMany({
        where: { createdAt: { lt: cutoff(w.digestsDays || 90) } },
        select: { id: true },
        take
      });
      if (!digests.length) return { count: 0 };
      const ids = digests.map((d: any) => d.id);
      await (prisma as any).notificationDigestItem.deleteMany({ where: { digestId: { in: ids } } });
      const r = await (prisma as any).notificationDigest.deleteMany({ where: { id: { in: ids } } });
      return { count: r.count || 0 };
    });

    // Audit logs: only if older than retention AND kill switch on (conservative)
    await deleteBatch('auditLogs', async (take) => {
      const rows = await (prisma as any).notificationAudit.findMany({
        where: { createdAt: { lt: cutoff(w.auditLogsDays || 180) } },
        select: { id: true },
        take
      });
      if (!rows.length) return { count: 0 };
      const r = await (prisma as any).notificationAudit.deleteMany({
        where: { id: { in: rows.map((x: any) => x.id) } }
      });
      return { count: r.count || 0 };
    });

    await writeNotificationAudit({
      action: 'retention_purge_executed',
      actorId: opts?.actorId || undefined,
      details: { deleted, batchSize, maxBatches }
    });

    return {
      dryRun: false,
      executed: true,
      killSwitchEnabled: true,
      batchSize,
      windows: w,
      candidates: plan.candidates,
      deleted,
      notes,
      at: new Date().toISOString()
    };
  }
}

export default NotificationRetentionPurgeService;
