import crypto from 'crypto';
import { Request } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { sendPushToUser } from './pushNotifications';
import { ANDROID_CHANNEL_IDS } from './notificationAndroidChannels';

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
  possessionProof?: {
    algorithm?: string | null;
    timestamp?: string | number | null;
    signature?: string | null;
  } | null;
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

const DEVICE_PROOF_TTL_MS = Math.max(
  60_000,
  Math.min(15 * 60_000, Number(process.env.LOGIN_DEVICE_PROOF_TTL_MS || 5 * 60_000))
);

const UNKNOWN_DEVICE_PREFIX = 'unidentified:';
const LOGIN_APPROVAL_EVENT_PREFIX = 'login-approval';
const LOGIN_APPROVAL_REQUESTED_TYPE = 'security.login_approval.requested';
const LOGIN_APPROVAL_UPDATED_TYPE = 'security.login_approval.updated';
const LOGIN_APPROVAL_RESOLVED_TYPE = 'security.login_approval.resolved';

const proofPayload = (deviceId: string, timestamp: string | number) =>
  `scrolith-device-proof:v1\n${deviceId}\n${String(timestamp)}`;

const normalizePublicKey = (value?: string | null) => {
  const raw = clean(value, 4096);
  if (!raw) return null;
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return raw;
  }
};

const parseProofTimestamp = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
};

const parsePublicKeyObject = (publicKey: string) => {
  const parsed = JSON.parse(publicKey);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid device public key');
  return crypto.createPublicKey({ key: parsed, format: 'jwk' as const });
};

export const verifyDevicePossessionProof = (
  device: Pick<DeviceMetadata, 'deviceId' | 'publicKey' | 'possessionProof'>,
  expectedPublicKey?: string | null
) => {
  const publicKey = normalizePublicKey(expectedPublicKey || device.publicKey);
  const proof = device.possessionProof;
  const timestamp = parseProofTimestamp(proof?.timestamp);
  const signature = clean(proof?.signature, 2048);
  if (!device.deviceId || !publicKey || !timestamp || !signature) return false;
  if (Math.abs(Date.now() - timestamp) > DEVICE_PROOF_TTL_MS) return false;
  try {
    const keyObject = parsePublicKeyObject(publicKey);
    return crypto.verify(
      'sha256',
      Buffer.from(proofPayload(device.deviceId, timestamp)),
      { key: keyObject, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url')
    );
  } catch {
    return false;
  }
};

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
    publicKey: normalizePublicKey(bodyDevice.publicKey || bodyDevice.public_key),
    possessionProof:
      bodyDevice.possessionProof || bodyDevice.possession_proof || bodyDevice.proof
        ? {
            algorithm: clean(
              bodyDevice.possessionProof?.algorithm ||
                bodyDevice.possession_proof?.algorithm ||
                bodyDevice.proof?.algorithm,
              80
            ),
            timestamp:
              bodyDevice.possessionProof?.timestamp ||
              bodyDevice.possession_proof?.timestamp ||
              bodyDevice.proof?.timestamp ||
              null,
            signature: clean(
              bodyDevice.possessionProof?.signature ||
                bodyDevice.possession_proof?.signature ||
                bodyDevice.proof?.signature,
              2048
            )
          }
        : null,
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

const loginApprovalDedupeKey = (attemptId: string) => `${LOGIN_APPROVAL_EVENT_PREFIX}:${attemptId}`;

const sanitizeAttemptForTrustedClients = (attempt: any, status = attempt?.status || 'PENDING') => ({
  attemptId: attempt.id,
  status,
  expiresAt: attempt.expiresAt,
  createdAt: attempt.createdAt,
  platform: attempt.platform || null,
  deviceModel: attempt.deviceModel || null,
  appVersion: attempt.appVersion || null,
  browserName: attempt.metadata?.browserName || null,
  osVersion: attempt.metadata?.osVersion || null,
  deviceType: attempt.metadata?.deviceType || null,
  eventId: loginApprovalDedupeKey(attempt.id),
  deepLink: `/settings/security?approval=${encodeURIComponent(attempt.id)}`
});

const emitLoginApprovalEvent = (userId: string, event: string, attempt: any, status = attempt?.status || 'PENDING') => {
  const payload = sanitizeAttemptForTrustedClients(attempt, status);
  realtime.emitToUser(userId, event, payload);
};

const emitLoginApprovalResolved = (userId: string, attempt: any, status: 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CONSUMED') => {
  emitLoginApprovalEvent(userId, LOGIN_APPROVAL_RESOLVED_TYPE, attempt, status);
  realtime.emitToUser(userId, 'security:login_approval_updated', {
    attemptId: attempt.id,
    status,
    eventId: loginApprovalDedupeKey(attempt.id)
  });
};

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
  const title = 'New sign-in request';
  const body = 'A new device is trying to sign in to your Scrolith account.';
  const deepLink = `/settings/security?approval=${encodeURIComponent(attempt.id)}`;
  const eventId = loginApprovalDedupeKey(attempt.id);
  const safeAttempt = sanitizeAttemptForTrustedClients(attempt);
  const notification = await prisma.notification
    .create({
      data: {
        userId: user.id,
        type: LOGIN_APPROVAL_REQUESTED_TYPE,
        title,
        body,
        category: 'security',
        priority: 'critical',
        deepLink,
        entityType: 'login_approval',
        entityId: attempt.id,
        idempotencyKey: eventId,
        meta: {
          ...safeAttempt,
          attemptId: attempt.id,
          deviceId: attempt.newDeviceId,
          channelId: ANDROID_CHANNEL_IDS.securityLogin,
          androidChannelId: ANDROID_CHANNEL_IDS.securityLogin,
          action: 'login_approval'
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
    deepLink,
    meta: safeAttempt
  };
  emitLoginApprovalEvent(user.id, LOGIN_APPROVAL_REQUESTED_TYPE, attempt);
  realtime.emitToUser(user.id, 'security:login_approval_required', safeAttempt);
  realtime.emitToUser(user.id, 'notifications:new', payload);
  void sendPushToUser(user.id, {
    id: String((payload as any).id || attempt.id),
    type: LOGIN_APPROVAL_REQUESTED_TYPE,
    title,
    body,
    deepLink,
    data: {
      ...safeAttempt,
      type: LOGIN_APPROVAL_REQUESTED_TYPE,
      attemptId: attempt.id,
      category: 'security',
      channelId: ANDROID_CHANNEL_IDS.securityLogin,
      androidChannelId: ANDROID_CHANNEL_IDS.securityLogin,
      notificationType: LOGIN_APPROVAL_REQUESTED_TYPE,
      eventId,
      action: 'login_approval'
    }
  }).catch(() => null);
};

const createPendingLoginApproval = async (
  user: UserForSession,
  req: Request,
  device: DeviceMetadata | null,
  reason: string
) => {
  const meta = getClientMeta(req);
  const approvalToken = randomToken();
  const challenge = randomToken(18);
  const expiresAt = new Date(Date.now() + APPROVAL_TTL_MINUTES * 60 * 1000);
  const newDeviceId = device?.deviceId || `${UNKNOWN_DEVICE_PREFIX}${crypto.randomUUID()}`;
  const attempt = await (prisma as any).loginApprovalAttempt.create({
    data: {
      id: crypto.randomUUID(),
      userId: user.id,
      newDeviceId,
      approvalTokenHash: hashToken(approvalToken),
      challenge,
      expiresAt,
      requestIp: meta.ip,
      userAgent: meta.userAgent,
      platform: device?.platform || null,
      deviceModel: device?.deviceModel || device?.label || null,
      appVersion: device?.appVersion || null,
      metadata: {
        reason,
        browserName: device?.browserName || null,
        osVersion: device?.osVersion || null,
        deviceType: device?.deviceType || null,
        hasDeviceId: Boolean(device?.deviceId),
        hasPublicKey: Boolean(device?.publicKey),
        hasPossessionProof: Boolean(device?.possessionProof?.signature)
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
      meta: { attemptId: attempt.id, deviceId: newDeviceId, platform: device?.platform || null, reason }
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

export const evaluateLoginDevice = async (user: UserForSession, req: Request) => {
  const device = extractDeviceMetadata(req);
  const meta = getClientMeta(req);

  const existingTrustedCount = await (prisma as any).trustedDevice.count({
    where: { userId: user.id, trustStatus: 'TRUSTED', revokedAt: null }
  });

  if (!device) {
    if (existingTrustedCount > 0) {
      return createPendingLoginApproval(user, req, null, 'missing_device_identity_enrolled_account');
    }
    await Promise.resolve(prisma.authAuditLog.create({
      data: {
        userId: user.id,
        email: user.email || null,
        event: 'login.device_bootstrap_deferred_legacy_client',
        ip: meta.ip,
        userAgent: meta.userAgent,
        meta: { reason: 'missing_device_identity_zero_trusted_devices' }
      }
    })).catch(() => null);
    return { approved: true, device: null, bootstrapped: false, legacyBootstrapDeferred: true };
  }

  if (existingTrustedCount === 0) {
    if (!verifyDevicePossessionProof(device)) {
      return {
        approved: false,
        denied: true,
        status: 428,
        code: 'DEVICE_KEY_REQUIRED',
        message: 'This sign-in needs a device-bound security key. Update Scrolith and try again.'
      };
    }
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
    if (!trusted.publicKey || !verifyDevicePossessionProof(device, trusted.publicKey)) {
      await Promise.resolve(prisma.authAuditLog.create({
        data: {
          userId: user.id,
          email: user.email || null,
          event: 'login.device_possession_failed',
          ip: meta.ip,
          userAgent: meta.userAgent,
          meta: {
            deviceId: device.deviceId,
            hasStoredPublicKey: Boolean(trusted.publicKey),
            hasPresentedPublicKey: Boolean(device.publicKey),
            hasPossessionProof: Boolean(device.possessionProof?.signature)
          }
        }
      })).catch(() => null);
      return {
        approved: false,
        denied: true,
        status: 403,
        code: 'DEVICE_POSSESSION_REQUIRED',
        message: 'Trusted-device verification failed. Approve this sign-in from another trusted session.'
      };
    }
    await (prisma as any).trustedDevice.update({
      where: { id: trusted.id },
      data: {
        lastSeenAt: new Date(),
        lastIp: meta.ip,
        lastUserAgent: meta.userAgent,
        appVersion: device.appVersion || trusted.appVersion,
        osVersion: device.osVersion || trusted.osVersion,
        publicKey: trusted.publicKey
      }
    }).catch(() => null);
    return { approved: true, device, bootstrapped: false };
  }
  return createPendingLoginApproval(user, req, device, 'untrusted_device');
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
  const expired = await Promise.resolve(
    (prisma as any).loginApprovalAttempt.findMany({
      where: { status: 'PENDING', expiresAt: { lte: new Date() } },
      select: { id: true, userId: true, expiresAt: true, createdAt: true, platform: true, deviceModel: true, appVersion: true, status: true, metadata: true }
    })
  ).catch(() => []);
  const updated = await (prisma as any).loginApprovalAttempt.updateMany({
    where: { status: 'PENDING', expiresAt: { lte: new Date() } },
    data: { status: 'EXPIRED' }
  }).catch(() => ({ count: 0 }));
  if (!updated?.count) return;
  for (const attempt of expired || []) {
    emitLoginApprovalResolved(attempt.userId, attempt, 'EXPIRED');
  }
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
  if (updated) {
    emitLoginApprovalEvent(userId, LOGIN_APPROVAL_UPDATED_TYPE, updated, 'APPROVED');
    emitLoginApprovalResolved(userId, updated, 'APPROVED');
  }
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
  if (updated) {
    emitLoginApprovalEvent(userId, LOGIN_APPROVAL_UPDATED_TYPE, updated, 'REJECTED');
    emitLoginApprovalResolved(userId, updated, 'REJECTED');
  }
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

  const device = extractDeviceMetadata(req);
  if (!device || !verifyDevicePossessionProof(device)) return null;
  const expectedDeviceId = String(attempt.newDeviceId || '');
  if (expectedDeviceId && !expectedDeviceId.startsWith(UNKNOWN_DEVICE_PREFIX) && expectedDeviceId !== device.deviceId) {
    return null;
  }
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
  emitLoginApprovalResolved(attempt.userId, attempt, 'CONSUMED');
  return prisma.user.findUnique({ where: { id: attempt.userId } });
};

export const revokeTrustedDevice = async (userId: string, deviceId: string) => {
  return (prisma as any).trustedDevice.updateMany({
    where: { id: deviceId, userId, revokedAt: null },
    data: { trustStatus: 'REVOKED', revokedAt: new Date() }
  });
};
