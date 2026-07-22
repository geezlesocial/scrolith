/**
 * Phase 32.4 — Retry queue for failed notification deliveries.
 */
import { randomUUID } from 'crypto';
import prisma from '../../../utils/prismaClient';
import { writeNotificationAudit, bumpNotificationMetric } from '../analytics';
import { sendPushToUser } from '../../pushNotifications';
import { NotificationOpsConfigService } from './opsConfig.service';

const isMissing = (err: any) =>
  err?.code === 'P2021' || /does not exist/i.test(String(err?.message || ''));

export class NotificationOpsRetryService {
  static async list(params: { status?: string; channel?: string; limit?: number } = {}) {
    try {
      const where: any = {};
      if (params.status) where.status = params.status;
      if (params.channel) where.channel = params.channel;
      return await (prisma as any).notificationRetryJob.findMany({
        where,
        orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'desc' }],
        take: Math.min(100, Math.max(1, Number(params.limit) || 50))
      });
    } catch (err) {
      if (isMissing(err)) return [];
      throw err;
    }
  }

  static async enqueueFromFailures(limit = 50, actorId?: string | null) {
    try {
      const failed = await (prisma as any).notificationDelivery.findMany({
        where: { status: 'failed' },
        orderBy: { createdAt: 'desc' },
        take: Math.min(200, Math.max(1, limit))
      });
      const settings = await NotificationOpsConfigService.getSettings();
      let created = 0;
      for (const d of failed) {
        const existing = await (prisma as any).notificationRetryJob.findFirst({
          where: {
            deliveryId: d.id,
            status: { in: ['pending', 'processing'] }
          }
        });
        if (existing) continue;
        await (prisma as any).notificationRetryJob.create({
          data: {
            id: randomUUID(),
            notificationId: d.notificationId,
            deliveryId: d.id,
            userId: d.userId,
            channel: d.channel,
            status: 'pending',
            attemptCount: d.attemptCount || 0,
            maxAttempts: settings.value.maxRetryAttempts || 5,
            nextAttemptAt: new Date(),
            lastError: d.errorMessage,
            errorCode: d.errorCode,
            payload: { title: null },
            history: [],
            createdBy: actorId || null
          }
        });
        created += 1;
      }
      await writeNotificationAudit({
        action: 'retry_queue_enqueued',
        actorId: actorId || undefined,
        details: { created }
      });
      return { created };
    } catch (err) {
      if (isMissing(err)) {
        const e = new Error('Retry queue requires Phase 32.4 migration');
        (e as any).statusCode = 503;
        throw e;
      }
      throw err;
    }
  }

  static async retryOne(jobId: string, actorId?: string | null) {
    try {
      const job = await (prisma as any).notificationRetryJob.findUnique({ where: { id: jobId } });
      if (!job) {
        const e = new Error('Retry job not found');
        (e as any).statusCode = 404;
        throw e;
      }
      if (job.status === 'cancelled' || job.status === 'completed') {
        return { status: job.status, job };
      }

      await (prisma as any).notificationRetryJob.update({
        where: { id: jobId },
        data: { status: 'processing', attemptCount: (job.attemptCount || 0) + 1 }
      });

      let success = false;
      let errorMessage: string | null = null;

      if (String(job.channel).toLowerCase() === 'push' && job.userId) {
        try {
          let title = 'Notification';
          let body = '';
          if (job.notificationId) {
            const n = await prisma.notification.findUnique({ where: { id: job.notificationId } });
            if (n) {
              title = n.title || title;
              body = n.body || '';
            }
          }
          const result = await sendPushToUser(job.userId, {
            id: job.notificationId || undefined,
            title,
            body,
            type: 'retry'
          });
          success = (result?.sent || 0) > 0;
          if (!success) errorMessage = result?.errors?.[0]?.message || 'push_failed';
        } catch (err: any) {
          errorMessage = err?.message || 'push_retry_failed';
        }
      } else {
        // Non-push: mark for re-emit inspection
        errorMessage = 'channel_retry_not_automated';
        success = false;
      }

      const history = Array.isArray(job.history) ? job.history : [];
      history.push({
        at: new Date().toISOString(),
        attempt: (job.attemptCount || 0) + 1,
        success,
        errorMessage,
        actorId
      });

      const maxAttempts = job.maxAttempts || 5;
      const attemptCount = (job.attemptCount || 0) + 1;
      let status = success ? 'completed' : attemptCount >= maxAttempts ? 'failed' : 'pending';
      const settings = await NotificationOpsConfigService.getSettings();
      const backoff = (settings.value.retryBackoffSeconds || 60) * attemptCount * 1000;

      const updated = await (prisma as any).notificationRetryJob.update({
        where: { id: jobId },
        data: {
          status,
          lastError: errorMessage,
          history,
          completedAt: success ? new Date() : null,
          nextAttemptAt: status === 'pending' ? new Date(Date.now() + backoff) : null
        }
      });

      if (success && job.deliveryId) {
        try {
          await (prisma as any).notificationDelivery.update({
            where: { id: job.deliveryId },
            data: { status: 'sent', deliveredAt: new Date(), attemptCount: attemptCount }
          });
        } catch {
          /* */
        }
      }

      await writeNotificationAudit({
        action: 'retry_executed',
        actorId: actorId || undefined,
        notificationId: job.notificationId,
        details: { jobId, success, status }
      });
      await bumpNotificationMetric(success ? 'retry_success' : 'retry_fail', job.channel, 1);
      return { status, job: updated, success };
    } catch (err: any) {
      if (err?.statusCode) throw err;
      if (isMissing(err)) {
        const e = new Error('Retry queue requires Phase 32.4 migration');
        (e as any).statusCode = 503;
        throw e;
      }
      throw err;
    }
  }

  static async retryBatch(ids: string[], actorId?: string | null) {
    const results = [];
    for (const id of (ids || []).slice(0, 50)) {
      try {
        results.push({ id, ...(await this.retryOne(id, actorId)) });
      } catch (err: any) {
        results.push({ id, success: false, error: err?.message });
      }
    }
    return { count: results.length, results };
  }

  static async cancel(jobId: string, actorId?: string | null) {
    try {
      const job = await (prisma as any).notificationRetryJob.update({
        where: { id: jobId },
        data: { status: 'cancelled', cancelledAt: new Date() }
      });
      await writeNotificationAudit({
        action: 'retry_cancelled',
        actorId: actorId || undefined,
        details: { jobId }
      });
      return job;
    } catch (err: any) {
      if (err?.code === 'P2025') {
        const e = new Error('Retry job not found');
        (e as any).statusCode = 404;
        throw e;
      }
      if (isMissing(err)) {
        const e = new Error('Retry queue requires Phase 32.4 migration');
        (e as any).statusCode = 503;
        throw e;
      }
      throw err;
    }
  }

  static async listFailures(limit = 50) {
    try {
      return await (prisma as any).notificationDelivery.findMany({
        where: { status: 'failed' },
        orderBy: { createdAt: 'desc' },
        take: Math.min(100, Math.max(1, limit))
      });
    } catch {
      return [];
    }
  }
}

export default NotificationOpsRetryService;
