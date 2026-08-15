import { Request } from 'express';
import prisma from '../utils/prismaClient';
import { writeAdminAuditEvent } from './adminAudit.service';

export const DEVICE_APPROVAL_WAIVER_SCOPE = 'security.deviceApprovalWaiver';
export const DEVICE_APPROVAL_WAIVER_PERMISSION = 'security.deviceApproval.manage';
export const DEVICE_APPROVAL_WAIVER_MODES = ['ONE_TIME', 'UNLIMITED'] as const;
export type DeviceApprovalWaiverMode = (typeof DEVICE_APPROVAL_WAIVER_MODES)[number];

const ACTIVE = 'ACTIVE';
const CONSUMED = 'CONSUMED';
const REVOKED = 'REVOKED';

export type DeviceApprovalWaiverSettings = { enabled: boolean };

export type SafeWaiver = {
  id: string;
  mode: DeviceApprovalWaiverMode;
  status: string;
  createdAt: string;
  updatedAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
};

const db = prisma as any;

const normalizeMode = (value: unknown): DeviceApprovalWaiverMode => {
  const mode = String(value || '').trim().toUpperCase();
  if (!DEVICE_APPROVAL_WAIVER_MODES.includes(mode as DeviceApprovalWaiverMode)) {
    throw new Error('Waiver mode must be ONE_TIME or UNLIMITED');
  }
  return mode as DeviceApprovalWaiverMode;
};

const safeIso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null);

const serializeWaiver = (row: any): SafeWaiver => ({
  id: String(row.id),
  mode: normalizeMode(row.mode),
  status: String(row.status || ACTIVE),
  createdAt: new Date(row.createdAt).toISOString(),
  updatedAt: new Date(row.updatedAt).toISOString(),
  consumedAt: safeIso(row.consumedAt),
  revokedAt: safeIso(row.revokedAt)
});

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase().slice(0, 320);

export const getDeviceApprovalWaiverSettings = async (): Promise<DeviceApprovalWaiverSettings> => {
  const row = await db.appSetting.findUnique({ where: { scope: DEVICE_APPROVAL_WAIVER_SCOPE } });
  const data = row?.data && typeof row.data === 'object' ? row.data as Record<string, unknown> : {};
  return { enabled: data.enabled === true };
};

export const setDeviceApprovalWaiverEnabled = async (enabled: boolean) => {
  return db.appSetting.upsert({
    where: { scope: DEVICE_APPROVAL_WAIVER_SCOPE },
    create: { scope: DEVICE_APPROVAL_WAIVER_SCOPE, data: { enabled: Boolean(enabled) } },
    update: { data: { enabled: Boolean(enabled) } }
  });
};

const userSelect = {
  id: true,
  email: true,
  name: true,
  username: true,
  avatar: true,
  profilePhotoFileId: true,
  isActive: true,
  role: true
};

export const findUserForDeviceApprovalWaiver = async (email: unknown) => {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes('@')) return null;
  return db.user.findUnique({ where: { email: normalized }, select: userSelect });
};

export const getDeviceApprovalWaiverState = async (userId: string) => {
  const user = await db.user.findUnique({ where: { id: userId }, select: userSelect });
  if (!user) throw new Error('User not found');
  const rows = await db.deviceApprovalWaiver.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 25
  });
  const active = rows.find((row: any) => row.status === ACTIVE) || null;
  return {
    user,
    current: active ? serializeWaiver(active) : null,
    history: rows.map(serializeWaiver)
  };
};

export const grantDeviceApprovalWaiver = async (
  userId: string,
  modeInput: unknown,
  adminId: string
) => {
  const mode = normalizeMode(modeInput);
  const user = await db.user.findUnique({ where: { id: userId }, select: userSelect });
  if (!user) throw new Error('User not found');

  const row = await db.$transaction(async (tx: any) => {
    await tx.deviceApprovalWaiver.updateMany({
      where: { userId, status: ACTIVE },
      data: { status: REVOKED, revokedAt: new Date(), revokedByAdminId: adminId, updatedByAdminId: adminId }
    });
    return tx.deviceApprovalWaiver.create({
      data: { userId, mode, status: ACTIVE, createdByAdminId: adminId, updatedByAdminId: adminId }
    });
  });

  return { user, waiver: serializeWaiver(row) };
};

export const revokeDeviceApprovalWaiver = async (userId: string, adminId: string) => {
  const result = await db.deviceApprovalWaiver.updateMany({
    where: { userId, status: ACTIVE },
    data: { status: REVOKED, revokedAt: new Date(), revokedByAdminId: adminId, updatedByAdminId: adminId }
  });
  return { revoked: result.count > 0, ...(await getDeviceApprovalWaiverState(userId)) };
};

/**
 * Claims only an active waiver for an otherwise-untrusted device. This is
 * deliberately separate from trusted-device possession verification.
 */
export const claimDeviceApprovalWaiver = async (userId: string, deviceId: string, req: Request) => {
  const settings = await getDeviceApprovalWaiverSettings();
  if (!settings.enabled) return { approved: false as const, reason: 'disabled' as const };

  const active = await db.deviceApprovalWaiver.findFirst({
    where: { userId, status: ACTIVE },
    orderBy: { createdAt: 'desc' }
  });
  if (!active) return { approved: false as const, reason: 'not_configured' as const };

  if (active.mode === 'ONE_TIME') {
    const claimed = await db.deviceApprovalWaiver.updateMany({
      where: { id: active.id, status: ACTIVE, mode: 'ONE_TIME' },
      data: { status: CONSUMED, consumedAt: new Date(), consumedByDeviceId: deviceId }
    });
    if (claimed.count !== 1) return { approved: false as const, reason: 'already_claimed' as const };
  } else {
    // Touch the row with an active predicate so a concurrent revoke/grant
    // cannot turn a stale read into an approval.
    const claimed = await db.deviceApprovalWaiver.updateMany({
      where: { id: active.id, status: ACTIVE, mode: 'UNLIMITED' },
      data: { updatedAt: new Date() }
    });
    if (claimed.count !== 1) return { approved: false as const, reason: 'already_revoked' as const };
  }

  await Promise.resolve(db.authAuditLog.create({
    data: {
      userId,
      email: null,
      event: 'login.device_admin_waiver_used',
      ip: String(req.ip || '').slice(0, 120) || null,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 512) || null,
      meta: { mode: active.mode, consumed: active.mode === 'ONE_TIME' }
    }
  })).catch(() => null);

  return {
    approved: true as const,
    waiverId: String(active.id),
    mode: normalizeMode(active.mode),
    consumed: active.mode === 'ONE_TIME'
  };
};

export const restoreOneTimeDeviceApprovalWaiver = async (waiverId: string, deviceId: string) => {
  await db.deviceApprovalWaiver.updateMany({
    where: { id: waiverId, status: CONSUMED, mode: 'ONE_TIME', consumedByDeviceId: deviceId },
    data: { status: ACTIVE, consumedAt: null, consumedByDeviceId: null }
  });
};

export const auditDeviceApprovalWaiverAdminAction = async (
  req: Request,
  actionKey: string,
  entityId: string,
  metadata: Record<string, unknown>
) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  await writeAdminAuditEvent({
    actorUserId: req.user?.id || null,
    actorRole: req.user?.role || null,
    moduleKey: 'security',
    actionKey,
    entityType: 'device_approval_waiver',
    entityId,
    severity: 'warning',
    status: 'success',
    ipAddress: forwarded || req.ip || null,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 512) || null,
    metadata
  });
};
