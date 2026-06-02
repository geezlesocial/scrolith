import prisma from '../utils/prismaClient';
import { notifyUser } from '../utils/notify';
import { sendSystemEmail } from './email.service';
import { recomputeTrustProfile } from './trust.service';

export type AccountModerationAction = 'warning' | 'strike' | 'restriction' | 'ban';
export type AccountModerationFeature = 'post' | 'comment' | 'react';

export type AccountModerationSummary = {
  user: {
    id: string;
    email: string;
    name: string | null;
    username: string | null;
    avatar: string | null;
    profilePhotoFileId: string | null;
    isActive: boolean;
    role: string;
  } | null;
  activeViolationCount: number;
  activeViolations: Array<{
    id: string;
    type: string;
    severity: string | null;
    reason: string | null;
    action: AccountModerationAction;
    restrictedFeatures: AccountModerationFeature[];
    expiresAt: string | null;
    createdAt: string;
  }>;
  isBanned: boolean;
  blockedFeatures: AccountModerationFeature[];
  canPost: boolean;
  canComment: boolean;
  canReact: boolean;
  latestViolation: {
    id: string;
    type: string;
    severity: string | null;
    reason: string | null;
    action: AccountModerationAction;
    restrictedFeatures: AccountModerationFeature[];
    expiresAt: string | null;
    createdAt: string;
  } | null;
};

export type ApplyAccountModerationInput = {
  userId: string;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: AccountModerationAction;
  reason?: string | null;
  severity?: string | null;
  userMessage?: string | null;
  restrictedFeatures?: Array<string | null | undefined>;
  restrictionHours?: number | null;
  source?: string | null;
  sourceId?: string | null;
  sourceLabel?: string | null;
  meta?: Record<string, any> | null;
};

export class AccountModerationError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'AccountModerationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const MODERATION_FEATURES: AccountModerationFeature[] = ['post', 'comment', 'react'];

const normalizeText = (value: unknown) => String(value || '').trim();

const normalizeAction = (value: unknown): AccountModerationAction => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'strike' || normalized === 'sanction') return 'strike';
  if (normalized === 'restriction' || normalized === 'restrict') return 'restriction';
  if (normalized === 'ban' || normalized === 'blocked') return 'ban';
  return 'warning';
};

const normalizeFeature = (value: unknown): AccountModerationFeature | null => {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return null;
  if (normalized === 'post' || normalized === 'posts' || normalized === 'posting' || normalized === 'content') return 'post';
  if (normalized === 'comment' || normalized === 'comments' || normalized === 'commenting' || normalized === 'reply' || normalized === 'replies') return 'comment';
  if (normalized === 'react' || normalized === 'reaction' || normalized === 'reactions' || normalized === 'like' || normalized === 'likes' || normalized === 'repost' || normalized === 'reposts' || normalized === 'share' || normalized === 'shares') return 'react';
  return MODERATION_FEATURES.includes(normalized as AccountModerationFeature) ? (normalized as AccountModerationFeature) : null;
};

const normalizeFeatureList = (values: unknown): AccountModerationFeature[] => {
  const rawList = Array.isArray(values)
    ? values
    : typeof values === 'string'
      ? values.split(',')
      : [];
  return Array.from(new Set(rawList.map((entry) => normalizeFeature(entry)).filter(Boolean) as AccountModerationFeature[]));
};

const parseExpiresAt = (value: unknown): Date | null => {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getMeta = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
};

const getActorDisplayName = (input: { actorEmail?: string | null; actorId?: string | null; actorRole?: string | null }) => {
  const email = normalizeText(input.actorEmail);
  if (email) return email;
  const actorId = normalizeText(input.actorId);
  if (actorId) return actorId;
  const role = normalizeText(input.actorRole);
  if (role) return role;
  return 'Scrolith moderation';
};

const buildNotificationCopy = (action: AccountModerationAction, reason?: string | null, features?: AccountModerationFeature[]) => {
  const normalizedReason = normalizeText(reason);
  const featureLabel = features && features.length ? ` (${features.join(', ')})` : '';
  switch (action) {
    case 'ban':
      return {
        title: 'Account suspended',
        body: normalizedReason || `Your account has been suspended${featureLabel}.`,
        subject: 'Your Scrolith account has been suspended'
      };
    case 'restriction':
      return {
        title: 'Account restricted',
        body: normalizedReason || `Your account has been restricted${featureLabel}.`,
        subject: 'Your Scrolith account has been restricted'
      };
    case 'strike':
      return {
        title: 'Account strike',
        body: normalizedReason || 'Your account received a policy strike.',
        subject: 'Your Scrolith account received a strike'
      };
    case 'warning':
    default:
      return {
        title: 'Account warning',
        body: normalizedReason || 'Your account received a policy warning.',
        subject: 'Your Scrolith account received a warning'
      };
  }
};

const parseRestrictedMetadata = (metadata: Record<string, any>) => {
  const action = normalizeAction(metadata.action || metadata.kind || metadata.type);
  const restrictedFeatures = normalizeFeatureList(
    metadata.restrictedFeatures || metadata.restricted_features || metadata.features || []
  );
  const expiresAt = parseExpiresAt(metadata.expiresAt || metadata.expires_at || metadata.endsAt || metadata.ends_at);
  return { action, restrictedFeatures, expiresAt };
};

export const getAccountModerationSummary = async (userId: string): Promise<AccountModerationSummary> => {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) throw new AccountModerationError('User id is required');

  const user = await prisma.user.findUnique({
    where: { id: normalizedUserId },
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      avatar: true,
      profilePhotoFileId: true,
      isActive: true,
      role: true
    }
  });
  if (!user) throw new AccountModerationError('User not found', 404, 'NOT_FOUND');

  const violations = await prisma.accountViolation.findMany({
    where: { userId: normalizedUserId, resolvedAt: null },
    orderBy: [{ createdAt: 'desc' }],
    take: 50,
    select: {
      id: true,
      type: true,
      severity: true,
      reason: true,
      metadata: true,
      createdAt: true,
      resolvedAt: true
    }
  });

  const now = Date.now();
  const expiredIds: string[] = [];
  const activeViolations: AccountModerationSummary['activeViolations'] = [];
  const blockedFeatures = new Set<AccountModerationFeature>();
  let isBanned = !user.isActive;

  for (const violation of violations) {
    const meta = getMeta(violation.metadata);
    const parsed = parseRestrictedMetadata(meta);
    const typeAction = normalizeAction(meta.action || violation.type);
    const expiry = parsed.expiresAt;
    if (expiry && expiry.getTime() <= now) {
      expiredIds.push(violation.id);
      continue;
    }

    if (typeAction === 'ban') {
      isBanned = true;
      MODERATION_FEATURES.forEach((feature) => blockedFeatures.add(feature));
    } else if (typeAction === 'restriction') {
      parsed.restrictedFeatures.forEach((feature) => blockedFeatures.add(feature));
    }

    activeViolations.push({
      id: violation.id,
      type: violation.type,
      severity: violation.severity || null,
      reason: violation.reason || null,
      action: typeAction,
      restrictedFeatures: parsed.restrictedFeatures,
      expiresAt: expiry ? expiry.toISOString() : null,
      createdAt: violation.createdAt.toISOString()
    });
  }

  if (expiredIds.length) {
    await prisma.accountViolation
      .updateMany({
        where: { id: { in: expiredIds } },
        data: { resolvedAt: new Date() }
      })
      .catch(() => null);
    await recomputeTrustProfile(normalizedUserId, null).catch(() => null);
  }

  const latestViolation = activeViolations[0] || null;
  const restrictionBlocks = {
    post: isBanned || blockedFeatures.has('post'),
    comment: isBanned || blockedFeatures.has('comment'),
    react: isBanned || blockedFeatures.has('react')
  };

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name || null,
      username: user.username || null,
      avatar: user.avatar || null,
      profilePhotoFileId: user.profilePhotoFileId || null,
      isActive: Boolean(user.isActive),
      role: String(user.role || '')
    },
    activeViolationCount: activeViolations.length,
    activeViolations,
    isBanned,
    blockedFeatures: Array.from(blockedFeatures),
    canPost: !restrictionBlocks.post,
    canComment: !restrictionBlocks.comment,
    canReact: !restrictionBlocks.react,
    latestViolation
  };
};

export const checkAccountActionAllowed = async (
  userId: string,
  action: AccountModerationFeature,
  userRole?: string | null
): Promise<{ allowed: boolean; message?: string; code?: string; summary?: AccountModerationSummary }> => {
  const normalizedRole = normalizeText(userRole).toLowerCase();
  if (normalizedRole.includes('admin') || normalizedRole.includes('moderator')) {
    return { allowed: true };
  }

  const summary = await getAccountModerationSummary(userId);
  if (!summary.user) {
    return { allowed: false, message: 'User not found', code: 'NOT_FOUND', summary };
  }
  if (!summary.canPost && action === 'post') {
    return { allowed: false, message: 'Your account is restricted from posting at the moment.', code: 'ACCOUNT_RESTRICTED', summary };
  }
  if (!summary.canComment && action === 'comment') {
    return { allowed: false, message: 'Your account is restricted from commenting at the moment.', code: 'ACCOUNT_RESTRICTED', summary };
  }
  if (!summary.canReact && action === 'react') {
    return { allowed: false, message: 'Your account is restricted from reacting at the moment.', code: 'ACCOUNT_RESTRICTED', summary };
  }
  return { allowed: true, summary };
};

export const applyAccountModerationAction = async (input: ApplyAccountModerationInput) => {
  const userId = normalizeText(input.userId);
  if (!userId) throw new AccountModerationError('User id is required');

  const action = normalizeAction(input.action);
  const reason = normalizeText(input.reason) || 'Community policy enforcement action';
  const severity = normalizeText(input.severity) || (action === 'ban' ? 'high' : action === 'restriction' ? 'medium' : 'low');
  const restrictedFeatures = normalizeFeatureList(input.restrictedFeatures);
  const restrictionHours = Math.max(0, Number(input.restrictionHours || 0));
  const expiresAt = action === 'restriction' && restrictionHours > 0
    ? new Date(Date.now() + restrictionHours * 60 * 60 * 1000)
    : null;
  const source = normalizeText(input.source) || 'admin_dashboard';
  const sourceId = normalizeText(input.sourceId) || null;
  const sourceLabel = normalizeText(input.sourceLabel) || null;
  const actorDisplayName = getActorDisplayName(input);
  const userMessage = normalizeText(input.userMessage) || null;
  const notificationCopy = buildNotificationCopy(action, userMessage || reason, restrictedFeatures);
  const meta = {
    ...(input.meta || {}),
    action,
    source,
    sourceId,
    sourceLabel,
    actorId: normalizeText(input.actorId) || null,
    actorEmail: normalizeText(input.actorEmail) || null,
    actorRole: normalizeText(input.actorRole) || null,
    actorDisplayName,
    reason,
    severity,
    userMessage,
    restrictedFeatures,
    restrictionHours: action === 'restriction' ? restrictionHours : 0,
    expiresAt: expiresAt ? expiresAt.toISOString() : null
  };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      avatar: true,
      profilePhotoFileId: true,
      isActive: true,
      role: true
    }
  });
  if (!user) throw new AccountModerationError('User not found', 404, 'NOT_FOUND');

  const violationType =
    action === 'ban'
      ? 'account_ban'
      : action === 'restriction'
        ? 'account_restriction'
        : action === 'strike'
          ? 'account_strike'
          : 'account_warning';

  const violation = await prisma.$transaction(async (tx) => {
    const createdViolation = await tx.accountViolation.create({
      data: {
        userId,
        type: violationType,
        severity,
        reason,
        metadata: meta
      }
    });

    if (action === 'ban') {
      await tx.user.update({
        where: { id: userId },
        data: { isActive: false }
      });
    }

    return createdViolation;
  });

  const notificationMeta = {
    moderationAction: action,
    violationId: violation.id,
    source,
    sourceId,
    sourceLabel,
    severity,
    restrictedFeatures,
    expiresAt: expiresAt ? expiresAt.toISOString() : null
  };

  await prisma.notification.create({
    data: {
      userId,
      actorId: input.actorId || null,
      type: violationType,
      title: notificationCopy.title,
      body: notificationCopy.body,
      meta: notificationMeta
    }
  }).catch(() => null);

  notifyUser(userId, {
    type: violationType,
    title: notificationCopy.title,
    body: notificationCopy.body,
    meta: notificationMeta
  });

  if (user.email) {
    void sendSystemEmail({
      to: user.email,
      subject: notificationCopy.subject,
      text: `${notificationCopy.body}\n\nReason: ${reason}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
          <h2 style="margin:0 0 12px">${notificationCopy.title}</h2>
          <p style="margin:0 0 12px">${notificationCopy.body}</p>
          <p style="margin:0 0 12px"><strong>Reason:</strong> ${reason}</p>
          ${restrictedFeatures.length ? `<p style="margin:0 0 12px"><strong>Restricted features:</strong> ${restrictedFeatures.join(', ')}</p>` : ''}
          ${expiresAt ? `<p style="margin:0 0 12px"><strong>Restriction expires:</strong> ${expiresAt.toISOString()}</p>` : ''}
        </div>
      `
    }).catch(() => null);
  }

  await recomputeTrustProfile(userId, input.actorId || null).catch(() => null);

  return {
    userId,
    violation,
    action,
    restrictedFeatures,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    userMessage,
    notification: notificationCopy
  };
};
