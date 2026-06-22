import { Request } from 'express';
import prisma from '../utils/prismaClient';
import { ensureAdminStaffProfile, isAdminRole } from './rbac.service';

type AdminAuditSeverity = 'info' | 'warning' | 'critical';
type AdminAuditStatus = 'success' | 'denied' | 'error' | 'pending';

type WriteAdminAuditInput = {
  actorUserId?: string | null;
  actorStaffId?: string | null;
  actorRole?: string | null;
  moduleKey: string;
  actionKey: string;
  entityType: string;
  entityId?: string | null;
  severity?: AdminAuditSeverity | string;
  status?: AdminAuditStatus | string;
  message?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, any> | null;
};

type AuditListFilters = {
  actor?: string;
  entityType?: string;
  moduleKey?: string;
  severity?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

const clampLimit = (value: unknown, fallback = 100) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(500, Math.floor(parsed)));
};

const toIsoDate = (value?: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeSeverity = (value?: string | null): AdminAuditSeverity => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'warning') return 'warning';
  return 'info';
};

const normalizeStatus = (value?: string | null): AdminAuditStatus => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'denied') return 'denied';
  if (normalized === 'error') return 'error';
  if (normalized === 'pending') return 'pending';
  return 'success';
};

const inferSeverityFromAuthEvent = (event: string) => {
  const normalized = String(event || '').toLowerCase();
  if (normalized.includes('failed') || normalized.includes('blocked') || normalized.includes('alert')) return 'warning';
  return 'info';
};

const ensureActorStaffId = async (userId?: string | null, actorStaffId?: string | null, actorRole?: string | null) => {
  if (actorStaffId) return actorStaffId;
  if (userId && isAdminRole(actorRole)) {
    return ensureAdminStaffProfile(userId);
  }
  return null;
};

export const extractRequestAuditMeta = async (req: Request) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const actorUserId = String(req.user?.id || '').trim() || null;
  const actorRole = String(req.user?.role || '').trim() || null;
  return {
    actorUserId,
    actorRole,
    actorStaffId: await ensureActorStaffId(actorUserId, req.staffContext?.staffId || null, actorRole),
    ipAddress: forwarded || req.ip || null,
    userAgent: String(req.headers['user-agent'] || '').trim() || null
  };
};

export const writeAdminAuditEvent = async (input: WriteAdminAuditInput) => {
  return prisma.adminAuditEvent.create({
    data: {
      actorUserId: input.actorUserId || null,
      actorStaffId: await ensureActorStaffId(input.actorUserId || null, input.actorStaffId || null, input.actorRole || null),
      actorRole: input.actorRole || null,
      moduleKey: String(input.moduleKey || '').trim(),
      actionKey: String(input.actionKey || '').trim(),
      entityType: String(input.entityType || '').trim(),
      entityId: input.entityId || null,
      severity: normalizeSeverity(input.severity),
      status: normalizeStatus(input.status),
      message: input.message || null,
      ipAddress: input.ipAddress || null,
      userAgent: input.userAgent || null,
      metadata: input.metadata || null
    }
  });
};

const mapRows = (rows: any[]) =>
  rows.map((row) => ({
    id: row.id,
    source: row.source,
    actorUserId: row.actorUserId || null,
    actorStaffId: row.actorStaffId || null,
    actorRole: row.actorRole || null,
    moduleKey: row.moduleKey,
    actionKey: row.actionKey,
    entityType: row.entityType,
    entityId: row.entityId || null,
    severity: row.severity,
    status: row.status,
    message: row.message || '',
    ipAddress: row.ipAddress || null,
    userAgent: row.userAgent || null,
    metadata: row.metadata || null,
    createdAt: row.createdAt
  }));

export const listAdminAuditEvents = async (filters: AuditListFilters = {}) => {
  const limit = clampLimit(filters.limit, 100);
  const dateFrom = toIsoDate(filters.dateFrom);
  const dateTo = toIsoDate(filters.dateTo);
  const actor = String(filters.actor || '').trim();
  const entityType = String(filters.entityType || '').trim();
  const moduleKey = String(filters.moduleKey || '').trim();
  const severity = String(filters.severity || '').trim().toLowerCase();
  const status = String(filters.status || '').trim().toLowerCase();

  const createdAtFilter =
    dateFrom || dateTo
      ? {
          ...(dateFrom ? { gte: dateFrom } : {}),
          ...(dateTo ? { lte: dateTo } : {})
        }
      : undefined;

  const [adminEvents, authEvents, moderationEvents, marketplaceEvents, permissionEvents] = await Promise.all([
    prisma.adminAuditEvent.findMany({
      where: {
        ...(actor ? { OR: [{ actorUserId: actor }, { actorStaffId: actor }] } : {}),
        ...(entityType ? { entityType } : {}),
        ...(moduleKey ? { moduleKey } : {}),
        ...(severity ? { severity } : {}),
        ...(status ? { status } : {}),
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    }),
    prisma.authAuditLog.findMany({
      where: {
        ...(actor ? { OR: [{ userId: actor }, { email: { equals: actor, mode: 'insensitive' } }] } : {}),
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    }),
    prisma.moderationAuditLog.findMany({
      where: {
        ...(actor ? { staffId: actor } : {}),
        ...(entityType ? { targetType: entityType } : {}),
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    }),
    prisma.marketplaceAuditLog.findMany({
      where: {
        ...(actor ? { actorId: actor } : {}),
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    }),
    prisma.permissionDecisionLog.findMany({
      where: {
        ...(actor ? { OR: [{ subjectUserId: actor }, { staffUserId: actor }] } : {}),
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    })
  ]);

  const merged = [
    ...adminEvents.map((row) => ({
      ...row,
      source: 'admin_audit'
    })),
    ...authEvents.map((row) => ({
      id: row.id,
      source: 'auth_audit',
      actorUserId: row.userId || null,
      actorStaffId: null,
      actorRole: null,
      moduleKey: 'auth',
      actionKey: row.event,
      entityType: 'user',
      entityId: row.userId || null,
      severity: inferSeverityFromAuthEvent(row.event),
      status: row.event.toLowerCase().includes('failed') ? 'denied' : 'success',
      message: row.email || row.event,
      ipAddress: row.ip || null,
      userAgent: row.userAgent || null,
      metadata: row.meta || null,
      createdAt: row.createdAt
    })),
    ...moderationEvents.map((row) => ({
      id: row.id,
      source: 'moderation_audit',
      actorUserId: null,
      actorStaffId: row.staffId,
      actorRole: 'STAFF',
      moduleKey: 'community_moderation',
      actionKey: row.action,
      entityType: row.targetType,
      entityId: row.targetId || null,
      severity: 'warning',
      status: 'success',
      message: row.action,
      ipAddress: row.ipAddress || null,
      userAgent: row.userAgent || null,
      metadata: row.metadata || null,
      createdAt: row.createdAt
    })),
    ...marketplaceEvents.map((row) => ({
      id: row.id,
      source: 'marketplace_audit',
      actorUserId: row.actorId || null,
      actorStaffId: null,
      actorRole: null,
      moduleKey: 'listings',
      actionKey: row.action,
      entityType: 'listing',
      entityId: row.listingId || null,
      severity: 'info',
      status: 'success',
      message: row.reason || row.action,
      ipAddress: null,
      userAgent: null,
      metadata: row.payload || null,
      createdAt: row.createdAt
    })),
    ...permissionEvents.map((row) => ({
      id: row.id,
      source: 'permission_decision',
      actorUserId: row.subjectUserId || null,
      actorStaffId: row.staffUserId || null,
      actorRole: null,
      moduleKey: 'rbac',
      actionKey: row.permissionKey,
      entityType: row.resourceType || 'permission',
      entityId: row.resourceId || null,
      severity: row.decision.toLowerCase() === 'deny' ? 'warning' : 'info',
      status: row.decision.toLowerCase() === 'deny' ? 'denied' : 'success',
      message: row.source || row.decision,
      ipAddress: null,
      userAgent: null,
      metadata: row.context || null,
      createdAt: row.createdAt
    }))
  ]
    .filter((row) => (!severity || row.severity === severity) && (!status || row.status === status))
    .sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime())
    .slice(0, limit);

  return mapRows(merged);
};

export const getAdminAuditSummary = async () => {
  const [adminEvents, authEvents, moderationEvents, marketplaceEvents, deniedPermissions] = await Promise.all([
    prisma.adminAuditEvent.count(),
    prisma.authAuditLog.count(),
    prisma.moderationAuditLog.count(),
    prisma.marketplaceAuditLog.count(),
    prisma.permissionDecisionLog.count({ where: { decision: 'DENY' } })
  ]);

  return {
    totalEvents: adminEvents + authEvents + moderationEvents + marketplaceEvents + deniedPermissions,
    adminEvents,
    authEvents,
    moderationEvents,
    listingEvents: marketplaceEvents,
    deniedPermissions
  };
};
