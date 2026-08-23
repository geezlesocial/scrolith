import crypto from 'crypto';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { NotificationService } from './notificationCenter/NotificationService';

export type LoginDeviceMetadata = {
  deviceId?: string | null;
  publicKey?: string | null;
  platform?: string | null;
  deviceType?: string | null;
  browserName?: string | null;
  deviceModel?: string | null;
  osVersion?: string | null;
  appVersion?: string | null;
  possessionProof?: {
    algorithm?: string | null;
    timestamp?: number | null;
    signature?: string | null;
  } | null;
};

const APPROVAL_TTL_MS = Math.max(2, Math.min(30, Number(process.env.LOGIN_APPROVAL_TTL_MINUTES || 10))) * 60 * 1000;
const LOGIN_APPROVAL_STATUS = {
  pending: 'PENDING',
  approved: 'APPROVED',
  rejected: 'REJECTED',
  expired: 'EXPIRED',
  consumed: 'CONSUMED'
} as const;

const clean = (value: unknown, max = 160) => String(value || '').trim().slice(0, max) || null;

export const normalizeLoginDeviceMetadata = (input: unknown): LoginDeviceMetadata => {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const rawProof = value.possessionProof && typeof value.possessionProof === 'object'
    ? value.possessionProof as Record<string, unknown>
    : null;
  return {
    deviceId: clean(value.deviceId, 180),
    publicKey: clean(value.publicKey, 4096),
    platform: clean(value.platform, 32),
    deviceType: clean(value.deviceType, 32),
    browserName: clean(value.browserName, 64),
    deviceModel: clean(value.deviceModel, 120),
    osVersion: clean(value.osVersion, 160),
    appVersion: clean(value.appVersion, 64),
    possessionProof: rawProof ? {
      algorithm: clean(rawProof.algorithm, 64),
      timestamp: Number.isFinite(Number(rawProof.timestamp)) ? Number(rawProof.timestamp) : null,
      signature: clean(rawProof.signature, 512)
    } : null
  };
};

const hashApprovalToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const createApprovalToken = () => crypto.randomBytes(32).toString('base64url');
const createApprovalChallenge = () => crypto.randomBytes(24).toString('base64url');

const hasValidPossessionProof = (metadata: LoginDeviceMetadata) => {
  const deviceId = clean(metadata.deviceId, 180);
  const proof = metadata.possessionProof;
  const timestamp = Number(proof?.timestamp || 0);
  if (!deviceId || metadata.publicKey === null || !metadata.publicKey || proof?.algorithm !== 'ECDSA_P256_SHA256' || !proof.signature) return false;
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return false;
  try {
    const jwk = JSON.parse(metadata.publicKey);
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const payload = `scrolith-device-proof:v1\n${deviceId}\n${timestamp}`;
    return crypto.verify(
      'sha256',
      Buffer.from(payload),
      key,
      Buffer.from(String(proof.signature), 'base64url')
    );
  } catch {
    return false;
  }
};

const publicDeviceMetadata = (metadata: LoginDeviceMetadata) => ({
  platform: metadata.platform,
  deviceType: metadata.deviceType,
  browserName: metadata.browserName,
  deviceModel: metadata.deviceModel,
  osVersion: metadata.osVersion,
  appVersion: metadata.appVersion
});

const persistedDeviceMetadata = (metadata: LoginDeviceMetadata) => ({
  deviceId: metadata.deviceId,
  publicKey: metadata.publicKey,
  ...publicDeviceMetadata(metadata)
});

const mapApproval = (row: any) => {
  const metadata = (row?.deviceMetadata || {}) as LoginDeviceMetadata;
  return {
    id: row.id,
    status: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    platform: metadata.platform || null,
    deviceType: metadata.deviceType || null,
    browserName: metadata.browserName || null,
    deviceModel: metadata.deviceModel || null,
    appVersion: metadata.appVersion || null
  };
};

const expirePendingApprovals = async (userId: string) => {
  await prisma.loginApprovalAttempt.updateMany({
    where: { userId, status: LOGIN_APPROVAL_STATUS.pending, expiresAt: { lte: new Date() } },
    data: { status: LOGIN_APPROVAL_STATUS.expired }
  });
};

export const registerTrustedDevice = async (userId: string, metadata: LoginDeviceMetadata) => {
  const deviceId = clean(metadata.deviceId, 180);
  if (!deviceId) return;
  await prisma.loginTrustedDevice.upsert({
    where: { userId_deviceId: { userId, deviceId } },
    update: {
      publicKey: metadata.publicKey || undefined,
      platform: metadata.platform || undefined,
      deviceType: metadata.deviceType || undefined,
      browserName: metadata.browserName || undefined,
      deviceModel: metadata.deviceModel || undefined,
      osVersion: metadata.osVersion || undefined,
      appVersion: metadata.appVersion || undefined,
      isTrusted: true,
      lastSeenAt: new Date()
    },
    create: {
      userId,
      deviceId,
      publicKey: metadata.publicKey,
      platform: metadata.platform,
      deviceType: metadata.deviceType,
      browserName: metadata.browserName,
      deviceModel: metadata.deviceModel,
      osVersion: metadata.osVersion,
      appVersion: metadata.appVersion,
      isTrusted: true
    }
  });
};

export const listTrustedDevices = async (userId: string) => {
  const devices = await prisma.loginTrustedDevice.findMany({
    where: { userId, isTrusted: true },
    orderBy: { lastSeenAt: 'desc' },
    select: {
      id: true,
      deviceId: true,
      platform: true,
      deviceType: true,
      browserName: true,
      deviceModel: true,
      osVersion: true,
      appVersion: true,
      isTrusted: true,
      lastSeenAt: true,
      createdAt: true
    }
  });

  return devices.map((device) => ({
    id: device.id,
    deviceId: device.deviceId,
    label: [device.browserName, device.deviceModel, device.platform]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .join(' - ') || 'Scrolith device',
    platform: device.platform,
    deviceType: device.deviceType,
    browserName: device.browserName,
    deviceModel: device.deviceModel,
    osVersion: device.osVersion,
    appVersion: device.appVersion,
    trustStatus: device.isTrusted ? 'TRUSTED' : 'REVOKED',
    firstSeenAt: device.createdAt,
    trustedAt: device.createdAt,
    lastSeenAt: device.lastSeenAt
  }));
};

export const revokeTrustedDevice = async (userId: string, deviceRecordId: string) =>
  prisma.loginTrustedDevice.updateMany({
    where: { id: deviceRecordId, userId, isTrusted: true },
    data: { isTrusted: false }
  });

export const getLoginApprovalWaiver = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      loginApprovalWaivedUntil: true,
      loginApprovalWaivedReason: true
    }
  });
  const expiresAt = user?.loginApprovalWaivedUntil || null;
  return {
    active: Boolean(expiresAt && expiresAt > new Date()),
    expiresAt,
    reason: user?.loginApprovalWaivedReason || null
  };
};

/**
 * A device is approved automatically when it is already trusted or when the
 * account has no trusted device yet. New devices require an existing trusted
 * session, preserving first-login and legacy clients while closing the gap
 * for subsequent device sign-ins.
 */
export const evaluateLoginDevice = async (
  userId: string,
  metadata: LoginDeviceMetadata,
  request: { ip?: string | null; userAgent?: string | null }
) => {
  const deviceId = clean(metadata.deviceId, 180);
  if (!deviceId) return { required: false as const };

  const waiver = await getLoginApprovalWaiver(userId);
  if (waiver.active) {
    return {
      required: false as const,
      bypassed: true as const,
      waiverExpiresAt: waiver.expiresAt
    };
  }

  const current = await prisma.loginTrustedDevice.findUnique({
    where: { userId_deviceId: { userId, deviceId } },
    select: { id: true, isTrusted: true, publicKey: true }
  });
  if (current?.isTrusted && (!current.publicKey || (current.publicKey === metadata.publicKey && hasValidPossessionProof(metadata)))) {
    return { required: false as const, trustedDevice: true as const };
  }

  const trustedCount = await prisma.loginTrustedDevice.count({ where: { userId, isTrusted: true } });
  if (trustedCount === 0) {
    await registerTrustedDevice(userId, metadata);
    return { required: false as const, bootstrapped: true as const };
  }

  await expirePendingApprovals(userId);
  await prisma.loginApprovalAttempt.updateMany({
    where: { userId, requestedDeviceId: deviceId, status: LOGIN_APPROVAL_STATUS.pending },
    data: { status: LOGIN_APPROVAL_STATUS.expired }
  });

  const approvalToken = createApprovalToken();
  const challenge = createApprovalChallenge();
  const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS);
  const row = await prisma.loginApprovalAttempt.create({
    data: {
      userId,
      requestedDeviceId: deviceId,
      challenge,
      approvalTokenHash: hashApprovalToken(approvalToken),
      status: LOGIN_APPROVAL_STATUS.pending,
      expiresAt,
      requestedIp: clean(request.ip, 128),
      requestedUserAgent: clean(request.userAgent, 512),
      deviceMetadata: persistedDeviceMetadata(metadata)
    }
  });

  const payload = {
    attemptId: row.id,
    status: LOGIN_APPROVAL_STATUS.pending,
    expiresAt: expiresAt.toISOString(),
    ...publicDeviceMetadata(metadata)
  };
  realtime.emitToUser(userId, 'security.login_approval.requested', payload);
  realtime.emitToUser(userId, 'security:login_approval_required', payload);
  void NotificationService.emitToUser(userId, {
    type: 'security.login_approval',
    eventType: 'security.login_approval.requested',
    category: 'security',
    priority: 'critical',
    title: 'New sign-in request',
    body: 'A new device is waiting for approval before it can sign in.',
    deepLink: '/settings?section=security',
    metadata: { ...payload, isMandatorySecurity: true },
    entityType: 'login_approval',
    entityId: row.id,
    isMandatorySecurity: true,
    source: 'auth.login',
    idempotencyKey: `login-approval:${row.id}`
  }).catch(() => undefined);

  return { required: true as const, attemptId: row.id, approvalToken, expiresAt };
};

export const listPendingLoginApprovals = async (userId: string) => {
  await expirePendingApprovals(userId);
  const rows = await prisma.loginApprovalAttempt.findMany({
    where: { userId, status: LOGIN_APPROVAL_STATUS.pending, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    take: 20
  });
  return rows.map(mapApproval);
};

export const decideLoginApproval = async (userId: string, id: string, decision: 'APPROVED' | 'REJECTED') => {
  const row = await prisma.loginApprovalAttempt.findFirst({ where: { id, userId } });
  if (!row) throw new Error('Login approval request not found');
  if (row.status !== LOGIN_APPROVAL_STATUS.pending || row.expiresAt <= new Date()) {
    if (row.status === LOGIN_APPROVAL_STATUS.pending) {
      await prisma.loginApprovalAttempt.update({ where: { id }, data: { status: LOGIN_APPROVAL_STATUS.expired } });
    }
    throw new Error('Login approval request is no longer pending');
  }

  const updated = await prisma.loginApprovalAttempt.update({
    where: { id },
    data: decision === 'APPROVED'
      ? { status: LOGIN_APPROVAL_STATUS.approved, approvedByUserId: userId, approvedAt: new Date() }
      : { status: LOGIN_APPROVAL_STATUS.rejected, approvedByUserId: userId, rejectedAt: new Date() }
  });
  const payload = { attemptId: updated.id, status: updated.status, decidedAt: new Date().toISOString() };
  realtime.emitToUser(userId, 'security.login_approval.updated', payload);
  realtime.emitToUser(userId, 'security:login_approval_updated', payload);
  return mapApproval(updated);
};

export const getLoginApprovalStatus = async (id: string, approvalToken: string) => {
  const row = await prisma.loginApprovalAttempt.findUnique({ where: { id } });
  if (!row || !crypto.timingSafeEqual(Buffer.from(row.approvalTokenHash), Buffer.from(hashApprovalToken(approvalToken)))) {
    throw new Error('Login approval request is invalid');
  }
  if (row.status === LOGIN_APPROVAL_STATUS.pending && row.expiresAt <= new Date()) {
    await prisma.loginApprovalAttempt.update({ where: { id }, data: { status: LOGIN_APPROVAL_STATUS.expired } });
    return { status: LOGIN_APPROVAL_STATUS.expired, expiresAt: row.expiresAt };
  }
  return { status: row.status, expiresAt: row.expiresAt };
};

export const consumeApprovedLogin = async (id: string, approvalToken: string) => {
  const row = await prisma.loginApprovalAttempt.findUnique({ where: { id } });
  const tokenHash = hashApprovalToken(approvalToken);
  if (!row || !crypto.timingSafeEqual(Buffer.from(row.approvalTokenHash), Buffer.from(tokenHash))) {
    throw new Error('Login approval request is invalid');
  }
  if (row.status !== LOGIN_APPROVAL_STATUS.approved || row.expiresAt <= new Date() || row.consumedAt) {
    throw new Error('Login approval is not available');
  }
  const consumed = await prisma.loginApprovalAttempt.updateMany({
    where: { id, approvalTokenHash: tokenHash, status: LOGIN_APPROVAL_STATUS.approved, consumedAt: null },
    data: { status: LOGIN_APPROVAL_STATUS.consumed, consumedAt: new Date() }
  });
  if (consumed.count !== 1) throw new Error('Login approval is not available');
  return row;
};

export const getLoginApprovalMetadata = (row: any): LoginDeviceMetadata => normalizeLoginDeviceMetadata(row?.deviceMetadata || {});
