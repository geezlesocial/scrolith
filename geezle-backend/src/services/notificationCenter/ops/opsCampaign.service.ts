/**
 * Phase 32.4 — Announcement campaigns & emergency broadcasts.
 */
import { randomUUID } from 'crypto';
import prisma from '../../../utils/prismaClient';
import { writeNotificationAudit, bumpNotificationMetric } from '../analytics';
import { NotificationService } from '../NotificationService';
import { NotificationOpsConfigService } from './opsConfig.service';

const isMissing = (err: any) =>
  err?.code === 'P2021' || /does not exist/i.test(String(err?.message || ''));

const CAMPAIGN_TYPES = new Set([
  'platform_announcement',
  'maintenance',
  'security_notice',
  'feature_release',
  'emergency'
]);

export class NotificationOpsCampaignService {
  static async list(params: { status?: string; type?: string; limit?: number } = {}) {
    try {
      const where: any = {};
      if (params.status) where.status = params.status;
      if (params.type) where.type = params.type;
      return await (prisma as any).notificationCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(100, Math.max(1, Number(params.limit) || 50))
      });
    } catch (err) {
      if (isMissing(err)) return [];
      throw err;
    }
  }

  static async get(id: string) {
    try {
      const campaign = await (prisma as any).notificationCampaign.findUnique({ where: { id } });
      if (!campaign) return null;
      const deliveries = await (prisma as any).notificationCampaignDelivery.findMany({
        where: { campaignId: id },
        take: 100,
        orderBy: { createdAt: 'desc' }
      });
      return { ...campaign, deliveries };
    } catch (err) {
      if (isMissing(err)) return null;
      throw err;
    }
  }

  static async create(
    input: {
      name: string;
      type?: string;
      title: string;
      body: string;
      deepLink?: string;
      channels?: string[];
      targeting?: any;
      scheduleType?: string;
      scheduledAt?: string | null;
      priority?: string;
      reason?: string;
      templateId?: string;
    },
    actorId?: string | null
  ) {
    const type = String(input.type || 'platform_announcement');
    if (!CAMPAIGN_TYPES.has(type)) {
      const e = new Error('Invalid campaign type');
      (e as any).statusCode = 400;
      throw e;
    }
    if (!input.name || !input.title || !input.body) {
      const e = new Error('name, title, and body are required');
      (e as any).statusCode = 400;
      throw e;
    }
    const isEmergency = type === 'emergency';
    try {
      const row = await (prisma as any).notificationCampaign.create({
        data: {
          id: randomUUID(),
          name: String(input.name).slice(0, 200),
          type,
          status: 'draft',
          priority: isEmergency ? 'critical' : String(input.priority || 'normal'),
          title: String(input.title).slice(0, 300),
          body: String(input.body).slice(0, 5000),
          deepLink: input.deepLink || null,
          channels: input.channels?.length ? input.channels : ['IN_APP', 'PUSH'],
          targeting: input.targeting || { all: true },
          templateId: input.templateId || null,
          scheduleType: input.scheduleType || 'immediate',
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          reason: input.reason || null,
          requiresConfirm: isEmergency,
          createdBy: actorId || null,
          updatedBy: actorId || null
        }
      });
      await writeNotificationAudit({
        action: 'campaign_created',
        actorId: actorId || undefined,
        details: { id: row.id, type }
      });
      return row;
    } catch (err) {
      if (isMissing(err)) {
        const e = new Error('Campaigns require Phase 32.4 migration');
        (e as any).statusCode = 503;
        throw e;
      }
      throw err;
    }
  }

  static async update(id: string, patch: Record<string, any>, actorId?: string | null) {
    try {
      const existing = await (prisma as any).notificationCampaign.findUnique({ where: { id } });
      if (!existing) {
        const e = new Error('Campaign not found');
        (e as any).statusCode = 404;
        throw e;
      }
      if (existing.status === 'sent' || existing.status === 'sending') {
        const e = new Error('Cannot edit a sent/sending campaign');
        (e as any).statusCode = 400;
        throw e;
      }
      const row = await (prisma as any).notificationCampaign.update({
        where: { id },
        data: {
          name: patch.name ?? existing.name,
          title: patch.title ?? existing.title,
          body: patch.body ?? existing.body,
          deepLink: patch.deepLink ?? existing.deepLink,
          channels: patch.channels ?? existing.channels,
          targeting: patch.targeting ?? existing.targeting,
          scheduleType: patch.scheduleType ?? existing.scheduleType,
          scheduledAt: patch.scheduledAt !== undefined ? (patch.scheduledAt ? new Date(patch.scheduledAt) : null) : existing.scheduledAt,
          reason: patch.reason ?? existing.reason,
          priority: patch.priority ?? existing.priority,
          updatedBy: actorId || null
        }
      });
      await writeNotificationAudit({
        action: 'campaign_updated',
        actorId: actorId || undefined,
        details: { id }
      });
      return row;
    } catch (err: any) {
      if (err?.statusCode) throw err;
      if (isMissing(err)) {
        const e = new Error('Campaigns require Phase 32.4 migration');
        (e as any).statusCode = 503;
        throw e;
      }
      throw err;
    }
  }

  static async confirmEmergency(id: string, reason: string, actorId?: string | null) {
    try {
      const existing = await (prisma as any).notificationCampaign.findUnique({ where: { id } });
      if (!existing) {
        const e = new Error('Campaign not found');
        (e as any).statusCode = 404;
        throw e;
      }
      if (existing.type !== 'emergency') {
        const e = new Error('Only emergency campaigns require confirmation');
        (e as any).statusCode = 400;
        throw e;
      }
      if (!reason || String(reason).trim().length < 5) {
        const e = new Error('Emergency confirmation requires a reason (min 5 chars)');
        (e as any).statusCode = 400;
        throw e;
      }
      const row = await (prisma as any).notificationCampaign.update({
        where: { id },
        data: {
          confirmedAt: new Date(),
          confirmedBy: actorId || null,
          reason: String(reason).slice(0, 1000),
          status: 'confirmed',
          updatedBy: actorId || null
        }
      });
      await writeNotificationAudit({
        action: 'emergency_confirmed',
        actorId: actorId || undefined,
        details: { id, reason: String(reason).slice(0, 200) }
      });
      return row;
    } catch (err: any) {
      if (err?.statusCode) throw err;
      if (isMissing(err)) {
        const e = new Error('Campaigns require Phase 32.4 migration');
        (e as any).statusCode = 503;
        throw e;
      }
      throw err;
    }
  }

  static async resolveAudience(targeting: any, limit = 100) {
    const t = targeting || { all: true };
    const where: any = { isActive: true };
    if (t.roles?.length) {
      where.role = { in: t.roles };
    }
    if (t.countries?.length) {
      where.OR = t.countries.map((c: string) => ({
        OR: [{ country: c }, { countryCode: c }]
      }));
    }
    // Custom segments: userIds
    if (Array.isArray(t.userIds) && t.userIds.length) {
      return prisma.user.findMany({
        where: { id: { in: t.userIds.slice(0, limit) } },
        select: { id: true },
        take: limit
      });
    }
    try {
      return await prisma.user.findMany({
        where: t.all === false && Object.keys(where).length === 1 ? { isActive: true } : where,
        select: { id: true },
        take: limit
      });
    } catch {
      // Simplified if schema differs
      return prisma.user.findMany({ select: { id: true }, take: limit });
    }
  }

  static async send(id: string, actorId?: string | null, opts?: { confirm?: boolean; reason?: string }) {
    try {
      const campaign = await (prisma as any).notificationCampaign.findUnique({ where: { id } });
      if (!campaign) {
        const e = new Error('Campaign not found');
        (e as any).statusCode = 404;
        throw e;
      }
      if (campaign.status === 'sent') {
        return { status: 'already_sent', campaign };
      }
      if (campaign.status === 'cancelled') {
        const e = new Error('Campaign was cancelled');
        (e as any).statusCode = 400;
        throw e;
      }

      const settings = await NotificationOpsConfigService.getSettings();
      const isEmergency = campaign.type === 'emergency';

      if (isEmergency) {
        if (settings.value.emergencyRequiresConfirm && !campaign.confirmedAt && !opts?.confirm) {
          const e = new Error('Emergency broadcast requires confirmation');
          (e as any).statusCode = 400;
          (e as any).code = 'EMERGENCY_CONFIRM_REQUIRED';
          throw e;
        }
        if (settings.value.emergencyRequiresReason && !(campaign.reason || opts?.reason)) {
          const e = new Error('Emergency broadcast requires a reason');
          (e as any).statusCode = 400;
          throw e;
        }
        if (opts?.confirm && !campaign.confirmedAt) {
          await this.confirmEmergency(id, opts.reason || campaign.reason || 'Confirmed send', actorId);
        }
      }

      await (prisma as any).notificationCampaign.update({
        where: { id },
        data: { status: 'sending', updatedBy: actorId || null }
      });

      const batchSize = settings.value.campaignBatchSize || 100;
      const users = await this.resolveAudience(campaign.targeting, batchSize);
      let sent = 0;
      let failed = 0;

      for (const user of users) {
        try {
          const emit = await NotificationService.emit({
            recipientId: user.id,
            type: isEmergency ? 'admin.broadcast_emergency' : `campaign.${campaign.type}`,
            category: isEmergency ? 'admin' : campaign.type === 'security_notice' ? 'security' : 'system',
            title: campaign.title,
            body: campaign.body,
            deepLink: campaign.deepLink || '/notifications',
            priority: isEmergency ? 'critical' : campaign.priority || 'normal',
            isEmergencySystem: isEmergency,
            isMandatorySecurity: campaign.type === 'security_notice',
            source: 'ops-campaign',
            metadata: {
              campaignId: campaign.id,
              campaignType: campaign.type,
              channels: campaign.channels,
              isEmergencySystem: isEmergency,
              isMandatorySecurity: campaign.type === 'security_notice'
            },
            skipPush: !(campaign.channels || []).map((c: string) => c.toUpperCase()).includes('PUSH'),
            idempotencyKey: `campaign:${campaign.id}:${user.id}`
          } as any);
          const notificationId = emit.items[0]?.notificationId || null;
          await (prisma as any).notificationCampaignDelivery.create({
            data: {
              id: randomUUID(),
              campaignId: campaign.id,
              userId: user.id,
              channel: 'IN_APP',
              status: notificationId ? 'sent' : 'failed',
              notificationId,
              sentAt: new Date()
            }
          });
          if (notificationId) sent += 1;
          else failed += 1;
        } catch (err: any) {
          failed += 1;
          try {
            await (prisma as any).notificationCampaignDelivery.create({
              data: {
                id: randomUUID(),
                campaignId: campaign.id,
                userId: user.id,
                channel: 'IN_APP',
                status: 'failed',
                errorMessage: err?.message || 'send_failed'
              }
            });
          } catch {
            /* */
          }
        }
      }

      const stats = { targeted: users.length, sent, failed, at: new Date().toISOString() };
      const updated = await (prisma as any).notificationCampaign.update({
        where: { id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          stats,
          updatedBy: actorId || null
        }
      });

      await writeNotificationAudit({
        action: isEmergency ? 'emergency_broadcast_sent' : 'campaign_sent',
        actorId: actorId || undefined,
        details: { id, ...stats }
      });
      await bumpNotificationMetric(isEmergency ? 'emergency_sent' : 'campaign_sent', campaign.type, sent);

      return { status: 'sent', campaign: updated, stats };
    } catch (err: any) {
      if (err?.statusCode) throw err;
      if (isMissing(err)) {
        const e = new Error('Campaigns require Phase 32.4 migration');
        (e as any).statusCode = 503;
        throw e;
      }
      throw err;
    }
  }

  static async cancel(id: string, actorId?: string | null) {
    try {
      const row = await (prisma as any).notificationCampaign.update({
        where: { id },
        data: { status: 'cancelled', cancelledAt: new Date(), updatedBy: actorId || null }
      });
      await writeNotificationAudit({
        action: 'campaign_cancelled',
        actorId: actorId || undefined,
        details: { id }
      });
      return row;
    } catch (err: any) {
      if (err?.code === 'P2025') {
        const e = new Error('Campaign not found');
        (e as any).statusCode = 404;
        throw e;
      }
      if (isMissing(err)) {
        const e = new Error('Campaigns require Phase 32.4 migration');
        (e as any).statusCode = 503;
        throw e;
      }
      throw err;
    }
  }

  static async preview(id: string) {
    const campaign = await this.get(id);
    if (!campaign) {
      const e = new Error('Campaign not found');
      (e as any).statusCode = 404;
      throw e;
    }
    return {
      id: campaign.id,
      name: campaign.name,
      type: campaign.type,
      title: campaign.title,
      body: campaign.body,
      deepLink: campaign.deepLink,
      channels: campaign.channels,
      targeting: campaign.targeting,
      priority: campaign.priority,
      isEmergency: campaign.type === 'emergency',
      requiresConfirm: campaign.requiresConfirm,
      confirmed: Boolean(campaign.confirmedAt)
    };
  }
}

export default NotificationOpsCampaignService;
