import { Request } from 'express';
import { randomBytes, createHash } from 'crypto';
import prisma from '../utils/prismaClient';

export type AuthActor = {
  id: string;
  email?: string;
  role?: string;
};

export const DEV_LINK_STATUS = {
  UNLINKED: 'UNLINKED',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  LINKED: 'LINKED',
  SUSPENDED: 'SUSPENDED'
} as const;

export const DEV_LINK_REQUEST_STATUS = {
  CREATED: 'CREATED',
  OTP_SENT: 'OTP_SENT',
  VERIFIED: 'VERIFIED',
  EXPIRED: 'EXPIRED',
  FAILED: 'FAILED'
} as const;

export const DEV_APP_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
  REJECTED: 'REJECTED'
} as const;

const DEFAULT_SCOPE_SENSITIVE = ['email:read', 'phone:read'];

const DEVELOPER_PLATFORM_TABLE_NAMES = [
  'DeveloperPlatformConfig',
  'DeveloperUser',
  'DeveloperLinkRequest',
  'DeveloperApp',
  'DeveloperAppRedirectUri',
  'OAuthAuthorizationCode',
  'OAuthToken',
  'OAuthConsent',
  'DeveloperAuditLog'
];

export const normalizeEmail = (value: string) => String(value || '').trim().toLowerCase();

export const maskEmail = (email: string) => {
  const normalized = normalizeEmail(email);
  if (!normalized.includes('@')) return normalized;
  const [local, domain] = normalized.split('@');
  if (!local) return `***@${domain}`;
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
};

export const hashSensitiveValue = (value: string) =>
  createHash('sha256')
    .update(`${String(value || '')}:${process.env.DEV_PLATFORM_HASH_PEPPER || 'dev-platform-pepper'}`)
    .digest('hex');

export const generateOpaqueToken = (prefix: string, bytes = 32) =>
  `${prefix}_${randomBytes(bytes).toString('hex')}`;

export const normalizeScopes = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((scope) => String(scope || '').trim())
        .filter(Boolean)
    )
  );
};

export const sanitizeUrlOrNull = (value: unknown): string | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return raw;
  } catch {
    return null;
  }
};

export const isDeveloperPlatformSchemaMissingError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '');
  if (code !== 'P2021') return false;
  return DEVELOPER_PLATFORM_TABLE_NAMES.some((tableName) => message.includes(tableName));
};

export const getDeveloperPlatformConfigFallback = () => ({
  id: 'default',
  developerBaseUrl: process.env.DEVELOPER_BASE_URL || 'https://developer.scrolith.com',
  autoApproveEnabled: false,
  autoApproveRules: null,
  authorizationCodeTtlSeconds: 300,
  accessTokenTtlSeconds: 3600,
  refreshTokenTtlSeconds: 2592000,
  rateLimitPerMinute: 120,
  sensitiveScopes: [...DEFAULT_SCOPE_SENSITIVE],
  requireManualApprovalForSensitiveScope: true,
  updatedByAdminId: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  _schemaMissing: true
});

export const getOrCreateDeveloperPlatformConfig = async (): Promise<any> => {
  try {
    return await prisma.developerPlatformConfig.upsert({
      where: { id: 'default' },
      update: {},
      create: {
        id: 'default',
        developerBaseUrl: process.env.DEVELOPER_BASE_URL || 'https://developer.scrolith.com',
        autoApproveEnabled: false,
        sensitiveScopes: DEFAULT_SCOPE_SENSITIVE
      }
    });
  } catch (error: any) {
    if (isDeveloperPlatformSchemaMissingError(error)) {
      console.warn('[developer] schema missing, serving fallback config');
      return getDeveloperPlatformConfigFallback();
    }
    throw error;
  }
};

export const getOrCreateDeveloperUserFromAuth = async (actor: AuthActor): Promise<any> => {
  const email = normalizeEmail(actor.email || '');
  if (!email) throw new Error('Authenticated user email is required for developer profile.');

  const existing = await prisma.developerUser.findFirst({
    where: {
      OR: [{ developerEmail: email }, { userId: actor.id }]
    }
  });

  if (existing) {
    const needsSyncEmail = existing.developerEmail !== email;
    if (needsSyncEmail) {
      return prisma.developerUser.update({
        where: { id: existing.id },
        data: { developerEmail: email }
      });
    }
    return existing;
  }

  return prisma.developerUser.create({
      data: {
        developerEmail: email,
        developerUsername: String(email.split('@')[0] || '').trim() || null,
        linkStatus: DEV_LINK_STATUS.UNLINKED
      }
    });
};

export const loadDeveloperUserFromAuth = async (actor: AuthActor): Promise<any | null> => {
  const email = normalizeEmail(actor.email || '');
  if (!email && !actor.id) return null;
  return prisma.developerUser.findFirst({
    where: {
      OR: [email ? { developerEmail: email } : undefined, actor.id ? { userId: actor.id } : undefined].filter(Boolean) as any
    }
  });
};

export const buildDeveloperSyncSnapshot = (user: {
  id: string;
  email: string;
  username?: string | null;
  name?: string | null;
  avatar?: string | null;
}) => ({
  userId: user.id,
  username: user.username || null,
  name: user.name || null,
  avatar: user.avatar || null,
  emailMasked: maskEmail(user.email)
});

export const finalizeDeveloperLink = async (params: {
  developerUserId: string;
  resolvedUserId: string;
  action: 'DEV_ACCOUNT_LINKED_OTP' | 'DEV_ACCOUNT_LINKED_SCROLITH_LOGIN';
  actorUserId?: string;
  ip?: string | null;
  userAgent?: string | null;
  linkRequestId?: string;
}) => {
  const user = await prisma.user.findUnique({
    where: { id: params.resolvedUserId },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      avatar: true
    }
  });
  if (!user) throw new Error('Resolved user account not found.');

  const now = new Date();
  const snapshot = buildDeveloperSyncSnapshot(user);

  const developerUser = await prisma.developerUser.update({
    where: { id: params.developerUserId },
    data: {
      userId: user.id,
      linkStatus: DEV_LINK_STATUS.LINKED,
      linkedAt: now,
      lastSyncedAt: now,
      syncSnapshot: snapshot
    }
  });

  await prisma.developerAuditLog.create({
    data: {
      developerUserId: developerUser.id,
      actorUserId: params.actorUserId || null,
      action: params.action,
      status: 'SUCCESS',
      ip: params.ip || null,
      userAgent: params.userAgent || null,
      metadata: {
        linkRequestId: params.linkRequestId || null,
        linkedUserId: user.id
      }
    }
  });

  return developerUser;
};

export const createDeveloperAuditLog = async (params: {
  developerUserId?: string | null;
  appId?: string | null;
  actorUserId?: string | null;
  action: string;
  status?: string | null;
  metadata?: Record<string, any> | null;
  ip?: string | null;
  userAgent?: string | null;
}) =>
  prisma.developerAuditLog.create({
    data: {
      developerUserId: params.developerUserId || null,
      appId: params.appId || null,
      actorUserId: params.actorUserId || null,
      action: params.action,
      status: params.status || null,
      metadata: params.metadata || null,
      ip: params.ip || null,
      userAgent: params.userAgent || null
    }
  });

export const emitDeveloperEvent = (req: Request, event: string, payload: Record<string, any>) => {
  try {
    const io = req.app.get('io');
    const communityNs = req.app.get('communityNs');
    io?.emit?.(event, payload);
    communityNs?.emit?.(event, payload);
  } catch (error) {
    console.warn('[developer] realtime emit failed:', (error as any)?.message || error);
  }
};

export const evaluateAutoApprovalStatus = (
  config: any,
  requestedScopes: string[]
): string => {
  const sensitiveScopes = Array.isArray(config.sensitiveScopes) ? config.sensitiveScopes : DEFAULT_SCOPE_SENSITIVE;
  const hasSensitiveScope = requestedScopes.some((scope) => sensitiveScopes.includes(scope));
  if (hasSensitiveScope && config.requireManualApprovalForSensitiveScope) return DEV_APP_STATUS.PENDING_REVIEW;
  return config.autoApproveEnabled ? DEV_APP_STATUS.ACTIVE : DEV_APP_STATUS.PENDING_REVIEW;
};

export const assertDeveloperAppOwnership = async (params: {
  appId: string;
  ownerUserId: string;
}) => {
  const app = await prisma.developerApp.findFirst({
    where: { id: params.appId, ownerUserId: params.ownerUserId },
    include: { redirectUris: { where: { isActive: true }, orderBy: { createdAt: 'asc' } } }
  });
  if (!app) {
    const error = new Error('Developer app not found.');
    (error as any).statusCode = 404;
    throw error;
  }
  return app;
};

export const generateClientCredentials = () => {
  const clientId = generateOpaqueToken('scrolith_client', 18);
  const clientSecret = generateOpaqueToken('scrolith_secret', 36);
  return { clientId, clientSecret, clientSecretHash: hashSensitiveValue(clientSecret) };
};

export const toDeveloperAppResponse = (app: any) => ({
  id: app.id,
  ownerUserId: app.ownerUserId,
  developerUserId: app.developerUserId,
  name: app.name,
  tagline: app.tagline,
  description: app.description,
  appUrl: app.appUrl,
  termsUrl: app.termsUrl,
  privacyUrl: app.privacyUrl,
  logoFileId: app.logoFileId,
  clientId: app.clientId,
  platformType: app.platformType,
  requestedScopes: app.requestedScopes,
  status: app.status,
  approvedAt: app.approvedAt,
  disabledAt: app.disabledAt,
  lastSecretRotatedAt: app.lastSecretRotatedAt,
  createdAt: app.createdAt,
  updatedAt: app.updatedAt,
  redirectUris: Array.isArray(app.redirectUris) ? app.redirectUris : []
});

export const markExpiredLinkRequests = async (developerUserId: string) => {
  const now = new Date();
  await prisma.developerLinkRequest.updateMany({
    where: {
      developerUserId,
      status: { in: [DEV_LINK_REQUEST_STATUS.CREATED, DEV_LINK_REQUEST_STATUS.OTP_SENT] },
      expiresAt: { lt: now }
    },
    data: { status: DEV_LINK_REQUEST_STATUS.EXPIRED }
  });
};
