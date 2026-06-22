import prisma from '../utils/prismaClient';

type CreateSecurityAlertInput = {
  code: string;
  severity?: 'low' | 'medium' | 'high' | 'critical' | string;
  status?: 'open' | 'acknowledged' | 'resolved' | 'dismissed' | string;
  title: string;
  message: string;
  source?: string;
  actorUserId?: string | null;
  actorStaffId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, any> | null;
};

const cleanString = (value: unknown) => String(value || '').trim();
const normalizeSeverity = (value?: string | null) => {
  const normalized = cleanString(value).toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'high') return 'high';
  if (normalized === 'low') return 'low';
  return 'medium';
};

const normalizeStatus = (value?: string | null) => {
  const normalized = cleanString(value).toLowerCase();
  if (normalized === 'acknowledged') return 'acknowledged';
  if (normalized === 'resolved') return 'resolved';
  if (normalized === 'dismissed') return 'dismissed';
  return 'open';
};

const mapAlert = (row: any) => ({
  id: row.id,
  code: row.code,
  severity: row.severity,
  status: row.status,
  title: row.title,
  message: row.message,
  source: row.source,
  actorUserId: row.actorUserId || null,
  actorStaffId: row.actorStaffId || null,
  entityType: row.entityType || null,
  entityId: row.entityId || null,
  metadata: row.metadata || null,
  dismissedByStaffId: row.dismissedByStaffId || null,
  resolvedAt: row.resolvedAt || null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

export const createSecurityAlert = async (input: CreateSecurityAlertInput) => {
  const row = await prisma.securityAlert.create({
    data: {
      code: cleanString(input.code),
      severity: normalizeSeverity(input.severity),
      status: normalizeStatus(input.status),
      title: cleanString(input.title),
      message: cleanString(input.message),
      source: cleanString(input.source) || 'system',
      actorUserId: input.actorUserId || null,
      actorStaffId: input.actorStaffId || null,
      entityType: cleanString(input.entityType) || null,
      entityId: cleanString(input.entityId) || null,
      metadata: input.metadata || null
    }
  });
  return mapAlert(row);
};

export const listSecurityAlerts = async (params?: {
  status?: string;
  severity?: string;
  limit?: number;
}) => {
  const rows = await prisma.securityAlert.findMany({
    where: {
      ...(cleanString(params?.status) ? { status: normalizeStatus(params?.status) } : {}),
      ...(cleanString(params?.severity) ? { severity: normalizeSeverity(params?.severity) } : {})
    },
    orderBy: [{ createdAt: 'desc' }],
    take: Math.max(1, Math.min(200, Number(params?.limit || 50)))
  });
  return rows.map(mapAlert);
};

export const getSecurityAlertSummary = async () => {
  const [open, acknowledged, resolved, critical, high] = await prisma.$transaction([
    prisma.securityAlert.count({ where: { status: 'open' } }),
    prisma.securityAlert.count({ where: { status: 'acknowledged' } }),
    prisma.securityAlert.count({ where: { status: 'resolved' } }),
    prisma.securityAlert.count({ where: { severity: 'critical', status: { not: 'resolved' } } }),
    prisma.securityAlert.count({ where: { severity: 'high', status: { not: 'resolved' } } })
  ]);
  return { open, acknowledged, resolved, critical, high };
};

export const updateSecurityAlertStatus = async (
  id: string,
  status: 'acknowledged' | 'resolved' | 'dismissed',
  staffId?: string | null
) => {
  const normalized = normalizeStatus(status);
  const row = await prisma.securityAlert.update({
    where: { id },
    data: {
      status: normalized,
      dismissedByStaffId: staffId || null,
      resolvedAt: normalized === 'resolved' ? new Date() : null
    }
  });
  return mapAlert(row);
};
