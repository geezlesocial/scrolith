/**
 * Phase 32.4 — Notification template management (versioned, multi-channel).
 */
import { randomUUID } from 'crypto';
import prisma from '../../../utils/prismaClient';
import { writeNotificationAudit } from '../analytics';

const isMissing = (err: any) =>
  err?.code === 'P2021' ||
  err instanceof TypeError ||
  /does not exist|Cannot read properties of undefined|DATABASE_URL/i.test(String(err?.message || ''));

const CHANNELS = new Set(['email', 'push', 'in_app', 'IN_APP', 'EMAIL', 'PUSH']);

function renderTemplate(template: string, vars: Record<string, string>) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v != null ? String(v) : '';
  });
}

function escapeHtml(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class NotificationOpsTemplateService {
  static async list(params: { channel?: string; status?: string; locale?: string } = {}) {
    try {
      const where: any = {};
      if (params.channel) where.channel = params.channel;
      if (params.status) where.status = params.status;
      if (params.locale) where.locale = params.locale;
      return await (prisma as any).notificationOpsTemplate.findMany({
        where,
        orderBy: [{ key: 'asc' }, { version: 'desc' }],
        take: 200
      });
    } catch (err) {
      if (isMissing(err)) return [];
      throw err;
    }
  }

  static async get(id: string) {
    try {
      return await (prisma as any).notificationOpsTemplate.findUnique({ where: { id } });
    } catch (err) {
      if (isMissing(err)) return null;
      throw err;
    }
  }

  static async create(
    input: {
      key: string;
      name: string;
      channel: string;
      locale?: string;
      subject?: string;
      title?: string;
      body?: string;
      htmlBody?: string;
      variables?: any;
      metadata?: any;
    },
    actorId?: string | null
  ) {
    const key = String(input.key || '').trim().toLowerCase();
    const channel = String(input.channel || 'in_app').toLowerCase();
    if (!key || !input.name) {
      const e = new Error('key and name required');
      (e as any).statusCode = 400;
      throw e;
    }
    if (!CHANNELS.has(channel) && !CHANNELS.has(input.channel)) {
      const e = new Error('Invalid channel');
      (e as any).statusCode = 400;
      throw e;
    }
    const model = (prisma as any).notificationOpsTemplate;
    if (!model?.create) {
      const e = new Error('Templates require Phase 32.4 migration');
      (e as any).statusCode = 503;
      throw e;
    }
    try {
      const row = await model.create({
        data: {
          id: randomUUID(),
          key,
          name: String(input.name).slice(0, 200),
          channel,
          locale: String(input.locale || 'en').slice(0, 16),
          subject: input.subject || null,
          title: input.title || null,
          body: input.body || '',
          htmlBody: input.htmlBody || null,
          variables: input.variables || [],
          version: 1,
          status: 'draft',
          metadata: input.metadata,
          createdBy: actorId || null,
          updatedBy: actorId || null
        }
      });
      await writeNotificationAudit({
        action: 'ops_template_created',
        actorId: actorId || undefined,
        details: { id: row.id, key, channel }
      });
      return row;
    } catch (err) {
      if (isMissing(err)) {
        const e = new Error('Templates require Phase 32.4 migration');
        (e as any).statusCode = 503;
        throw e;
      }
      throw err;
    }
  }

  static async update(
    id: string,
    patch: Record<string, any>,
    actorId?: string | null,
    opts?: { newVersion?: boolean }
  ) {
    try {
      const existing = await (prisma as any).notificationOpsTemplate.findUnique({ where: { id } });
      if (!existing) {
        const e = new Error('Template not found');
        (e as any).statusCode = 404;
        throw e;
      }

      if (opts?.newVersion || patch.publishAsNewVersion) {
        const nextVersion = (existing.version || 1) + 1;
        const row = await (prisma as any).notificationOpsTemplate.create({
          data: {
            id: randomUUID(),
            key: existing.key,
            name: patch.name ?? existing.name,
            channel: existing.channel,
            locale: patch.locale ?? existing.locale,
            subject: patch.subject ?? existing.subject,
            title: patch.title ?? existing.title,
            body: patch.body ?? existing.body,
            htmlBody: patch.htmlBody ?? existing.htmlBody,
            variables: patch.variables ?? existing.variables,
            version: nextVersion,
            status: 'draft',
            previousVersionId: existing.id,
            metadata: patch.metadata ?? existing.metadata,
            createdBy: actorId || null,
            updatedBy: actorId || null
          }
        });
        await writeNotificationAudit({
          action: 'ops_template_versioned',
          actorId: actorId || undefined,
          details: { id: row.id, previousId: existing.id, version: nextVersion }
        });
        return row;
      }

      const row = await (prisma as any).notificationOpsTemplate.update({
        where: { id },
        data: {
          name: patch.name ?? existing.name,
          subject: patch.subject ?? existing.subject,
          title: patch.title ?? existing.title,
          body: patch.body ?? existing.body,
          htmlBody: patch.htmlBody ?? existing.htmlBody,
          variables: patch.variables ?? existing.variables,
          locale: patch.locale ?? existing.locale,
          metadata: patch.metadata ?? existing.metadata,
          updatedBy: actorId || null
        }
      });
      await writeNotificationAudit({
        action: 'ops_template_updated',
        actorId: actorId || undefined,
        details: { id }
      });
      return row;
    } catch (err: any) {
      if (err?.statusCode) throw err;
      if (isMissing(err)) {
        const e = new Error('Templates require Phase 32.4 migration');
        (e as any).statusCode = 503;
        throw e;
      }
      throw err;
    }
  }

  static async publish(id: string, actorId?: string | null) {
    try {
      const row = await (prisma as any).notificationOpsTemplate.update({
        where: { id },
        data: { status: 'published', publishedAt: new Date(), updatedBy: actorId || null }
      });
      await writeNotificationAudit({
        action: 'ops_template_published',
        actorId: actorId || undefined,
        details: { id, version: row.version }
      });
      return row;
    } catch (err: any) {
      if (err?.code === 'P2025') {
        const e = new Error('Template not found');
        (e as any).statusCode = 404;
        throw e;
      }
      if (isMissing(err)) {
        const e = new Error('Templates require Phase 32.4 migration');
        (e as any).statusCode = 503;
        throw e;
      }
      throw err;
    }
  }

  static async rollback(id: string, actorId?: string | null) {
    try {
      const current = await (prisma as any).notificationOpsTemplate.findUnique({ where: { id } });
      if (!current?.previousVersionId) {
        const e = new Error('No previous version to rollback to');
        (e as any).statusCode = 400;
        throw e;
      }
      const prev = await (prisma as any).notificationOpsTemplate.findUnique({
        where: { id: current.previousVersionId }
      });
      if (!prev) {
        const e = new Error('Previous version not found');
        (e as any).statusCode = 404;
        throw e;
      }
      await (prisma as any).notificationOpsTemplate.update({
        where: { id: current.id },
        data: { status: 'archived', updatedBy: actorId || null }
      });
      const restored = await (prisma as any).notificationOpsTemplate.update({
        where: { id: prev.id },
        data: { status: 'published', publishedAt: new Date(), updatedBy: actorId || null }
      });
      await writeNotificationAudit({
        action: 'ops_template_rollback',
        actorId: actorId || undefined,
        details: { from: id, to: prev.id }
      });
      return restored;
    } catch (err: any) {
      if (err?.statusCode) throw err;
      if (isMissing(err)) {
        const e = new Error('Templates require Phase 32.4 migration');
        (e as any).statusCode = 503;
        throw e;
      }
      throw err;
    }
  }

  static async preview(id: string, variables: Record<string, string> = {}) {
    const tpl = await this.get(id);
    if (!tpl) {
      const e = new Error('Template not found');
      (e as any).statusCode = 404;
      throw e;
    }
    const vars = variables || {};
    const title = renderTemplate(tpl.title || '', vars);
    const body = renderTemplate(tpl.body || '', vars);
    const subject = renderTemplate(tpl.subject || '', vars);
    const htmlBody = tpl.htmlBody
      ? renderTemplate(tpl.htmlBody, Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, escapeHtml(v)])))
      : `<p>${escapeHtml(body)}</p>`;
    return {
      channel: tpl.channel,
      locale: tpl.locale,
      version: tpl.version,
      subject,
      title,
      body,
      htmlBody,
      safe: true
    };
  }

  static async history(key: string, channel?: string) {
    try {
      return await (prisma as any).notificationOpsTemplate.findMany({
        where: { key, ...(channel ? { channel } : {}) },
        orderBy: { version: 'desc' },
        take: 50
      });
    } catch (err) {
      if (isMissing(err)) return [];
      throw err;
    }
  }
}

export default NotificationOpsTemplateService;
