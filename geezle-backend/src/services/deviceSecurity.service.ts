import crypto from 'crypto';
import { Request } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { sendPushToUser } from './pushNotifications';

type UserForSession = {
  id: string;
  email?: string | null;
  role?: string | null;
  name?: string | null;
  username?: string | null;
};

export type DeviceMetadata = {
  deviceId: string;
  publicKey?: string | null;
  label?: string | null;
  platform?: string | null;
  deviceType?: string | null;
  deviceModel?: string | null;
  osVersion?: string | null;
  appVersion?: string | null;
  browserName?: string | null;
  metadata?: Record<string, unknown> | null;
};

const APPROVAL_TTL_MINUTES = Math.max(2, Math.min(30, Number(process.env.LOGIN_APPROVAL_TTL_MINUTES || 10)));

const clean = (value: unknown, max = 240) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return normalized.slice(0, max);
};

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export const getClientMeta = (req: Request) => {
  const headers = req.headers || {};
  const forwarded = String(headers['x-forwarded-for'] || '');
  const ip = clean(forwarded.split(',')[0] || req.ip || '', 120);
  const userAgent = clean(headers['user-agent'], 512);
  return { ip, userAgent };
};

export const extractDeviceMetadata = (req: Request): DeviceMetadata | null => {
  const bodyDevice = req.body?.device || req.body?.deviceMetadata || {};
  const headers = req.headers || {};
  const headerDeviceId =
    headers['x-scrolith-device-id'] ||
    headers['x-device-id'] ||
    headers['x-client-device-id'];
  const deviceId = clean(bodyDevice.deviceId || bodyDevice.device_id || headerDeviceId, 160);
  if (!deviceId) return null;

  return {
    deviceId,
    publicKey: clean(bodyDevice.publicKey || bodyDevice.public_key, 4096),
    label: clean(bodyDevice.label || bodyDevice.deviceName || bodyDevice.device_name, 120),
    platform: clean(bodyDevice.platform || headers['x-scrolith-platform'], 80),
    deviceType: clean(bodyDevice.deviceType || bodyDevice.device_type, 80),
    deviceModel: clean(bodyDevice.deviceModel || bodyDevice.device_model, 160),
    osVersion: clean(bodyDevice.osVersion || bodyDevice.os_version, 120),
    appVersion: clean(bodyDevice.appVersion || bodyDevice.app_version, 80),
    browserName: clean(bodyDevice.browserName || bodyDevice.browser_name, 120),
    metadata:
      bodyDevice.metadata && typeof bodyDevice.metadata === 'object'
        ? bodyDevice.metadata
        : null
  };
};

const trustedDevicePayload = (device: DeviceMetadata, meta: ReturnType<typeof getClientMeta>) => ({
  deviceId: device.deviceId,
  publicKey: device.publicKey || null,
  label: device.label || device.deviceModel || device.browserName || device.platform || 'Scrolith device',
  platform: device.platform || null,
  deviceType: device.deviceType || null,
  deviceModel: device.deviceModel || null,
  osVersion: device.osVersion || null,
  appVersion: device.appVersion || null,
  browserName: device.browserName || null,
  trustStatus: 'TRUSTED',
  trustedAt: new Date(),
  lastSeenAt: new Date(),
  lastIp: meta.ip,
  lastUserAgent: meta.userAgent,
  metadata: device.metadata || undefined
});

export const ensureTrustedDevice = async (userId: string, device: DeviceMetadata, req: Request) => {
  const meta = getClientMeta(req);
  return (prisma as any).trustedDevice.upsert({
    where: { userId_deviceId: { userId, deviceId: device.deviceId } },
    update: {
      ...trustedDevicePayload(device, meta),
      revokedAt: null
    },
    create: {
      id: crypto.randomUUID(),
      userId,
      ...trustedDevicePayload(device, meta)
    }
  });
};

const notifyTrustedDevices = async (user: UserForSession, attempt: any) => {
  const title = 'Approve new Scrolith login';
  const body = `A new ${attempt.platform || 'device'} wants to access your account.`;
  const notification = await prisma.notification
    .create({
      data: {
        userId: user.id,
        type: 'security.login_approval_required',
        title,
        body,
        category: 'security',
        priority: 'critical',
        deepLink: `/settings/security?approval=${encodeURIComponent(attempt.id)}`,
        entityType: 'login_approval',
        entityId: attempt.id,
        idempotencyKey: `login-approval:${attempt.id}`,
        meta: {
          attemptId: attempt.id,
          deviceId: attempt.newDeviceId,
          platform: attempt.platform,
          deviceModel: attempt.deviceModel,
          expiresAt: attempt.expiresAt
        }
      }
    })
    .catch(() => null);

  const payload = notification || {
    id: attempt.id,
    type: 'security.login_approval_required',
    title,
    body,
    category: 'security',
    priority: 'critical',
    deepLink: `/settings/security?approval=${encodeURIComponent(attempt.id)}`,
    meta: { attemptId: attempt.id }
  };
  realtime.emitToUser(user.id, 'security:login_approval_required', {
    attemptId: attempt.id,
    expiresAt: attempt.expiresAt,
    platform: attempt.platform,
    deviceModel: attempt.deviceModel
  });
  realtime.emitToUser(user.id, 'notifications:new', payload);
  void sendPushToUser(user.id, {
    id: String((payload as any).id || attempt.id),
    type: 'security.login_approval_required',
    title,
    body,
    deepLink: `/settings/security?approval=${encodeURIComponent(attempt.id)}`,
    data: {
      attemptId: attempt.id,
      category: 'security'
    }
  }).catch(() => null);
};

export const evaluateLoginDevice = async (user: UserForSession, req: Request) => {
  const device = extractDeviceMetadata(req);
  const meta = getClientMeta(req);

  if (!device) {
    await Promise.resolve(prisma.authAuditLog.create({
      data: {
        userId: user.id,
        email: user.email || null,
        event: 'login.device_unidentified_allowed',
        ip: meta.ip,
        userAgent: meta.userAgent,
        meta: { reason: 'missing_device_id' }
      }
    })).catch(() => null);
    return { approved: true, device: null, bootstrapped: false };
  }

  const existingTrustedCount = await (prisma as any).trustedDevice.count({
    where: { userId: user.id, trustStatus: 'TRUSTED', revokedAt: null }
  });

  if (existingTrustedCount === 0) {
    await ensureTrustedDevice(user.id, device, req);
    await Promise.resolve(prisma.authAuditLog.create({
      data: {
        userId: user.id,
        email: user.email || null,
        event: 'login.device_trust_bootstrap',
        ip: meta.ip,
        userAgent: meta.userAgent,
        meta: { deviceId: device.deviceId, platform: device.platform }
      }
    })).catch(() => null);
    return { approved: true, device, bootstrapped: true };
  }

  const trusted = await (prisma as any).trustedDevice.findFirst({
    where: {
      userId: user.id,
      deviceId: device.deviceId,
      trustStatus: 'TRUSTED',
      revokedAt: null
    }
  });

  if (trusted) {
    await (prisma as any).trustedDevice.update({
      where: { id: trusted.id },
      data: {
        lastSeenAt: new Date(),
        lastIp: meta.ip,
        lastUserAgent: meta.userAgent,
        appVersion: device.appVersion || trusted.appVersion,
        osVersion: device.osVersion || trusted.osVersion,
        publicKey: device.publicKey || trusted.publicKey
      }
    }).catch(() => null);
    return { approved: true, device, bootstrapped: false };
  }

  const approvalToken = randomToken();
  const challenge = randomToken(18);
  const expiresAt = new Date(Date.now() + APPROVAL_TTL_MINUTES * 60 * 1000);
  const attempt = await (prisma as any).loginApprovalAttempt.create({
    data: {
      id: crypto.randomUUID(),
      userId: user.id,
      newDeviceId: device.deviceId,
      approvalTokenHash: hashToken(approvalToken),
      challenge,
      expiresAt,
      requestIp: meta.ip,
      userAgent: meta.userAgent,
      platform: device.platform || null,
      deviceModel: device.deviceModel || device.label || null,
      appVersion: device.appVersion || null,
      metadata: {
        browserName: device.browserName || null,
        osVersion: device.osVersion || null,
        deviceType: device.deviceType || null
      }
    }
  });

  await Promise.resolve(prisma.authAuditLog.create({
    data: {
      userId: user.id,
      email: user.email || null,
      event: 'login.device_approval_required',
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { attemptId: attempt.id, deviceId: device.deviceId, platform: device.platform }
    }
  })).catch(() => null);

  await notifyTrustedDevices(user, attempt);

  return {
    approved: false,
    device,
    attempt: {
      id: attempt.id,
      approvalToken,
      challenge,
      expiresAt
    }
  };
};

export const listTrustedDevices = async (userId: string) => {
  return (prisma as any).trustedDevice.findMany({
    where: { userId, revokedAt: null },
    orderBy: { lastSeenAt: 'desc' },
    select: {
      id: true,
      deviceId: true,
      label: true,
      platform: true,
      deviceType: true,
      deviceModel: true,
      osVersion: true,
      appVersion: true,
      browserName: true,
      trustStatus: true,
      firstSeenAt: true,
      lastSeenAt: true,
      trustedAt: true
    }
  });
};

export const listPendingApprovals = async (userId: string) => {
  await expireOldApprovals();
  return (prisma as any).loginApprovalAttempt.findMany({
    where: { userId, status: 'PENDING', expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      newDeviceId: true,
      platform: true,
      deviceModel: true,
      appVersion: true,
      requestIp: true,
      createdAt: true,
      expiresAt: true,
      status: true
    }
  });
};

export const expireOldApprovals = async () => {
  await (prisma as any).loginApprovalAttempt.updateMany({
    where: { status: 'PENDING', expiresAt: { lte: new Date() } },
    data: { status: 'EXPIRED' }
  }).catch(() => null);
};

export const approveLoginAttempt = async (userId: string, attemptId: string) => {
  await expireOldApprovals();
  const updatedRows = await (prisma as any).loginApprovalAttempt.updateMany({
    where: { id: attemptId, userId, status: 'PENDING', expiresAt: { gt: new Date() } },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedById: userId }
  });
  if (updatedRows.count !== 1) return null;
  const updated = await (prisma as any).loginApprovalAttempt.findFirst({
    where: { id: attemptId, userId }
  });
  realtime.emitToUser(userId, 'security:login_approval_updated', { attemptId, status: 'APPROVED' });
  return updated;
};

export const rejectLoginAttempt = async (userId: string, attemptId: string) => {
  await expireOldApprovals();
  const attempt = await (prisma as any).loginApprovalAttempt.updateMany({
    where: { id: attemptId, userId, status: 'PENDING' },
    data: { status: 'REJECTED', rejectedAt: new Date() }
  });
  if (attempt.count !== 1) return null;
  const updated = await (prisma as any).loginApprovalAttempt.findFirst({
    where: { id: attemptId, userId }
  });
  realtime.emitToUser(userId, 'security:login_approval_updated', { attemptId, status: 'REJECTED' });
  return updated;
};

export const getApprovalStatus = async (attemptId: string, approvalToken: string) => {
  await expireOldApprovals();
  const attempt = await (prisma as any).loginApprovalAttempt.findFirst({
    where: { id: attemptId, approvalTokenHash: hashToken(approvalToken) },
    select: { id: true, status: true, expiresAt: true, approvedAt: true, rejectedAt: true, consumedAt: true }
  });
  return attempt || null;
};

export const consumeApprovedLogin = async (attemptId: string, approvalToken: string, req: Request) => {
  await expireOldApprovals();
  const attempt = await (prisma as any).loginApprovalAttempt.findFirst({
    where: {
      id: attemptId,
      approvalTokenHash: hashToken(approvalToken),
      status: 'APPROVED',
      consumedAt: null,
      expiresAt: { gt: new Date() }
    }
  });
  if (!attempt) return null;

  const device = extractDeviceMetadata(req) || { deviceId: attempt.newDeviceId };
  const consumed = await (prisma as any).loginApprovalAttempt.updateMany({
    where: {
      id: attempt.id,
      status: 'APPROVED',
      consumedAt: null,
      expiresAt: { gt: new Date() }
    },
    data: { status: 'CONSUMED', consumedAt: new Date(), consumedDeviceId: device.deviceId }
  });
  if (consumed.count !== 1) return null;
  await ensureTrustedDevice(attempt.userId, device, req);
  return prisma.user.findUnique({ where: { id: attempt.userId } });
};

export const revokeTrustedDevice = async (userId: string, deviceId: string) => {
  return (prisma as any).trustedDevice.updateMany({
    where: { id: deviceId, userId, revokedAt: null },
    data: { trustStatus: 'REVOKED', revokedAt: new Date() }
  });
};
