import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import {
  getPushRuntimeStatus,
  sendPushToUsers
} from '../services/pushNotifications';
import { buildNotificationActionUrl } from '../services/notificationActionUrl.service';
import { jwtSecret } from '../utils/security/requiredSecret';
import { getTrustedClientIp } from '../utils/security/clientIdentity';

const APP_DISTRIBUTION_SCOPE = 'app_distribution';
const APP_CAMPAIGNS_SCOPE = 'app_distribution_campaigns';
const TRACKING_EVENT_PREFIX = 'app_dist:';
const BRAND_ASSET_URL = 'https://scrolith.com/icon-192.png';
const KNOWN_EVENTS = new Set([
  'prompt_shown',
  'prompt_dismissed',
  'download_clicked',
  'install_marked',
  'prompt_suppressed',
  'campaign_opened',
  'push_registration_error',
  'push_token_registered',
  'push_token_project_reset',
  'mobile_runtime_error',
  'chunk_load_recovery',
  'route_sync_recovery',
  'deep_link_opened',
  'deep_link_invalid',
  'push_permission_denied',
  'push_notification_received',
  'push_notification_opened',
  'push_notification_open_failed',
  'push_token_sync_failed',
  'socket_connect_error',
  'socket_reconnected',
  'app_backgrounded',
  'app_resumed',
  'deep_link_navigation_failed'
]);

type CampaignRecord = {
  id: string;
  name: string;
  title: string;
  body: string;
  mediaType: 'none' | 'image' | 'video';
  mediaUrl: string;
  actionUrl: string;
  targetPlatform: 'all' | 'android' | 'desktop';
  targetRole: 'all' | 'freelancer' | 'employer' | 'admin';
  deliveryInApp: boolean;
  deliveryPush: boolean;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
  createdByEmail: string | null;
  totalRecipients: number;
  totalPushSent: number;
  totalPushFailed: number;
  totalNotificationsCreated: number;
  lastPushEligibleUsers: number;
  lastPushSkippedUsers: number;
  lastPushDisabled: boolean;
  lastPushAttemptedTokens: number;
  lastPushCredentialSource: string | null;
  lastPushErrorSummary: string | null;
  lastSentAt: string | null;
};

const isObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asString = (value: unknown, fallback = '') => {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim();
  return normalized || fallback;
};

const asBoolean = (value: unknown, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const asNumber = (value: unknown, fallback: number, min?: number, max?: number) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;
  let output = parsed;
  if (typeof min === 'number') output = Math.max(min, output);
  if (typeof max === 'number') output = Math.min(max, output);
  return output;
};

const nowIso = () => new Date().toISOString();

const toTrackingEvent = (value: unknown) => {
  const normalized = asString(value).toLowerCase().replace(/^app_dist:/, '');
  if (!KNOWN_EVENTS.has(normalized)) return '';
  return normalized;
};

const toTargetPlatform = (value: unknown): 'all' | 'android' | 'desktop' => {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'android') return 'android';
  if (normalized === 'desktop') return 'desktop';
  return 'all';
};

const toTargetRole = (value: unknown): 'all' | 'freelancer' | 'employer' | 'admin' => {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'freelancer') return 'freelancer';
  if (normalized === 'employer') return 'employer';
  if (normalized === 'admin') return 'admin';
  return 'all';
};

const defaultConfig = () => ({
  enabled: true,
  autoHideSeconds: 8,
  maxShowsPerDay: 2,
  cooldownHours: 2,
  branding: {
    title: 'Install Scrolith App',
    subtitle: 'Get a faster app experience built for your device.',
    logoUrl: BRAND_ASSET_URL,
    iconUrl: BRAND_ASSET_URL
  },
  android: {
    enabled: true,
    title: 'Try the Scrolith Android App',
    message: 'Download the latest APK test build before Google Play release.',
    ctaLabel: 'Download APK',
    secondaryCtaLabel: 'I Installed',
    downloadUrl: '',
    version: 'beta',
    iconUrl: BRAND_ASSET_URL
  },
  desktop: {
    enabled: true,
    title: 'Get the Scrolith Desktop App',
    message: 'Install the desktop build with your latest logo/icon branding.',
    ctaLabel: 'Download Desktop App',
    secondaryCtaLabel: 'I Installed',
    downloadUrl:
      'https://storage.googleapis.com/downloads.scrolith.com/desktop/win/Scrolith-Desktop-Setup-latest-x64.exe',
    version: 'beta',
    iconUrl: BRAND_ASSET_URL
  }
});

const deepMerge = (base: any, patch: any): any => {
  if (!isObject(patch)) return patch === undefined ? base : patch;
  const out: Record<string, any> = { ...(isObject(base) ? base : {}) };
  Object.keys(patch).forEach((key) => {
    out[key] = deepMerge((base || {})[key], patch[key]);
  });
  return out;
};

const normalizeConfig = (raw: unknown) => {
  const defaults = defaultConfig();
  const merged = deepMerge(defaults, isObject(raw) ? raw : {});
  return {
    enabled: asBoolean(merged.enabled, defaults.enabled),
    autoHideSeconds: asNumber(merged.autoHideSeconds, defaults.autoHideSeconds, 3, 30),
    maxShowsPerDay: asNumber(merged.maxShowsPerDay, defaults.maxShowsPerDay, 1, 6),
    cooldownHours: asNumber(merged.cooldownHours, defaults.cooldownHours, 1, 12),
    branding: {
      title: asString(merged.branding?.title, defaults.branding.title),
      subtitle: asString(merged.branding?.subtitle, defaults.branding.subtitle),
      logoUrl: asString(merged.branding?.logoUrl, defaults.branding.logoUrl),
      iconUrl: asString(merged.branding?.iconUrl, defaults.branding.iconUrl)
    },
    android: {
      enabled: asBoolean(merged.android?.enabled, defaults.android.enabled),
      title: asString(merged.android?.title, defaults.android.title),
      message: asString(merged.android?.message, defaults.android.message),
      ctaLabel: asString(merged.android?.ctaLabel, defaults.android.ctaLabel),
      secondaryCtaLabel: asString(
        merged.android?.secondaryCtaLabel,
        defaults.android.secondaryCtaLabel
      ),
      downloadUrl: asString(merged.android?.downloadUrl, defaults.android.downloadUrl),
      version: asString(merged.android?.version, defaults.android.version),
      iconUrl: asString(merged.android?.iconUrl, defaults.android.iconUrl)
    },
    desktop: {
      enabled: asBoolean(merged.desktop?.enabled, defaults.desktop.enabled),
      title: asString(merged.desktop?.title, defaults.desktop.title),
      message: asString(merged.desktop?.message, defaults.desktop.message),
      ctaLabel: asString(merged.desktop?.ctaLabel, defaults.desktop.ctaLabel),
      secondaryCtaLabel: asString(
        merged.desktop?.secondaryCtaLabel,
        defaults.desktop.secondaryCtaLabel
      ),
      downloadUrl: asString(merged.desktop?.downloadUrl, defaults.desktop.downloadUrl),
      version: asString(merged.desktop?.version, defaults.desktop.version),
      iconUrl: asString(merged.desktop?.iconUrl, defaults.desktop.iconUrl)
    }
  };
};

const parseCookies = (cookieHeader?: string): Record<string, string> => {
  const jar: Record<string, string> = {};
  if (!cookieHeader) return jar;
  cookieHeader.split(';').forEach((part) => {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) return;
    const key = rawKey.trim();
    const value = rest.join('=').trim();
    if (!key) return;
    try {
      jar[key] = decodeURIComponent(value);
    } catch {
      jar[key] = value;
    }
  });
  return jar;
};

const getTokenFromRequest = (req: Request) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  const cookies = parseCookies(req.headers.cookie as string | undefined);
  const cookieToken = cookies['Scrolith_token'] || cookies['token'];
  return asString(cookieToken);
};

const resolveOptionalRequester = (req: Request) => {
  if (req.user?.id) return req.user;
  const token = getTokenFromRequest(req);
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, jwtSecret()) as any;
    const id = asString(decoded?.id);
    if (!id) return null;
    return {
      id,
      email: asString(decoded?.email),
      role: asString(decoded?.role)
    };
  } catch {
    return null;
  }
};

const resolveClientIp = (req: Request) => {
  return getTrustedClientIp(req);
};

const resolveGeo = (req: Request) => {
  const country =
    asString(req.headers['cf-ipcountry']) ||
    asString(req.headers['x-country-code']) ||
    asString(req.headers['x-geo-country']) ||
    asString(req.headers['x-country']);
  const region = asString(req.headers['x-geo-region']) || asString(req.headers['x-region']);
  const city = asString(req.headers['x-geo-city']) || asString(req.headers['x-city']);
  return { country: country || 'unknown', region: region || 'unknown', city: city || 'unknown' };
};

const emitAdminEvent = (req: Request, event: string, payload: Record<string, any>) => {
  const withTime = { ...payload, timestamp: nowIso() };
  try {
    const communityNs = req.app.get('communityNs');
    if (communityNs && typeof communityNs.to === 'function') {
      communityNs.to('community:admin').emit(event, withTime);
    }
  } catch {
    // ignore
  }
  try {
    const io = req.app.get('io');
    if (io && typeof io.emit === 'function') {
      io.emit(event, withTime);
    }
  } catch {
    // ignore
  }
};

export const readAppDistributionConfig = async () => {
  const record = await prisma.appSetting.findUnique({ where: { scope: APP_DISTRIBUTION_SCOPE } });
  return normalizeConfig(record?.data);
};

export const saveAppDistributionConfig = async (payload: any) => {
  const normalized = normalizeConfig(payload);
  await prisma.appSetting.upsert({
    where: { scope: APP_DISTRIBUTION_SCOPE },
    create: { scope: APP_DISTRIBUTION_SCOPE, data: normalized as any },
    update: { data: normalized as any }
  });
  return normalized;
};

const normalizeCampaignRecord = (raw: any): CampaignRecord => {
  const now = nowIso();
  return {
    id: asString(raw?.id) || randomUUID(),
    name: asString(raw?.name) || 'Untitled campaign',
    title: asString(raw?.title),
    body: asString(raw?.body),
    mediaType:
      asString(raw?.mediaType).toLowerCase() === 'image'
        ? 'image'
        : asString(raw?.mediaType).toLowerCase() === 'video'
          ? 'video'
          : 'none',
    mediaUrl: asString(raw?.mediaUrl),
    actionUrl: asString(raw?.actionUrl),
    targetPlatform: toTargetPlatform(raw?.targetPlatform),
    targetRole: toTargetRole(raw?.targetRole),
    deliveryInApp: asBoolean(raw?.deliveryInApp, true),
    deliveryPush: asBoolean(raw?.deliveryPush, true),
    createdAt: asString(raw?.createdAt) || now,
    updatedAt: asString(raw?.updatedAt) || now,
    createdById: asString(raw?.createdById) || null,
    createdByEmail: asString(raw?.createdByEmail) || null,
    totalRecipients: asNumber(raw?.totalRecipients, 0, 0),
    totalPushSent: asNumber(raw?.totalPushSent, 0, 0),
    totalPushFailed: asNumber(raw?.totalPushFailed, 0, 0),
    totalNotificationsCreated: asNumber(raw?.totalNotificationsCreated, 0, 0),
    lastPushEligibleUsers: asNumber(raw?.lastPushEligibleUsers, 0, 0),
    lastPushSkippedUsers: asNumber(raw?.lastPushSkippedUsers, 0, 0),
    lastPushDisabled: asBoolean(raw?.lastPushDisabled, false),
    lastPushAttemptedTokens: asNumber(raw?.lastPushAttemptedTokens, 0, 0),
    lastPushCredentialSource: asString(raw?.lastPushCredentialSource) || null,
    lastPushErrorSummary: asString(raw?.lastPushErrorSummary) || null,
    lastSentAt: asString(raw?.lastSentAt) || null
  };
};

const summarizePushErrors = (errors: Array<{ code?: string; message?: string }>) => {
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const counts = new Map<string, number>();
  errors.forEach((error) => {
    const key = asString(error?.code) || asString(error?.message) || 'push_send_failed';
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, count]) => `${key} (${count})`)
    .join(', ');
};

const buildCampaignFallbackPath = (
  campaignId: string,
  targetPlatform: 'all' | 'android' | 'desktop'
) => {
  if (targetPlatform === 'android') {
    return `/dashboard?tab=messages&campaignId=${encodeURIComponent(campaignId)}`;
  }
  return `/dashboard?tab=messages&campaignId=${encodeURIComponent(campaignId)}`;
};

const readCampaigns = async () => {
  const record = await prisma.appSetting.findUnique({ where: { scope: APP_CAMPAIGNS_SCOPE } });
  const list = Array.isArray(record?.data) ? record?.data : [];
  return list.map(normalizeCampaignRecord).sort((a, b) => {
    const bTime = new Date(b.updatedAt || b.createdAt).getTime();
    const aTime = new Date(a.updatedAt || a.createdAt).getTime();
    return bTime - aTime;
  });
};

const saveCampaigns = async (campaigns: CampaignRecord[]) => {
  await prisma.appSetting.upsert({
    where: { scope: APP_CAMPAIGNS_SCOPE },
    create: { scope: APP_CAMPAIGNS_SCOPE, data: campaigns as any },
    update: { data: campaigns as any }
  });
};

const roleWhere = (targetRole: 'all' | 'freelancer' | 'employer' | 'admin') => {
  if (targetRole === 'freelancer') return { role: { in: ['FREELANCER', 'SELLER'] } };
  if (targetRole === 'employer') return { role: { in: ['EMPLOYER', 'CLIENT', 'BUYER'] } };
  if (targetRole === 'admin') return { role: { in: ['ADMIN', 'MODERATOR'] } };
  return { role: { notIn: ['GUEST'] } };
};

const resolveCampaignRecipients = async (payload: {
  targetRole: 'all' | 'freelancer' | 'employer' | 'admin';
  targetPlatform: 'all' | 'android' | 'desktop';
  explicitUserIds: string[];
}) => {
  const where: any = {
    isActive: true,
    ...roleWhere(payload.targetRole)
  };
  if (payload.explicitUserIds.length) {
    where.id = { in: payload.explicitUserIds };
  }

  const users = await prisma.user.findMany({
    where,
    select: { id: true, role: true }
  });
  const baseRecipients = users.map((user) => ({
    id: user.id,
    role: asString(user.role)
  }));
  const baseIds = baseRecipients.map((user) => user.id);
  if (!baseIds.length) return [];
  if (payload.targetPlatform === 'all') return baseRecipients;

  const tokens = await prisma.deviceToken.findMany({
    where: { userId: { in: baseIds } },
    select: { userId: true, platform: true }
  });
  const platformMap = new Map<string, Set<string>>();
  tokens.forEach((token) => {
    const key = token.userId;
    if (!platformMap.has(key)) platformMap.set(key, new Set<string>());
    platformMap.get(key)!.add(asString(token.platform).toLowerCase());
  });

  if (payload.targetPlatform === 'android') {
    return baseRecipients.filter((recipient) => platformMap.get(recipient.id)?.has('android'));
  }

  // Desktop/web fallback bucket.
  return baseRecipients.filter((recipient) => {
    const platforms = platformMap.get(recipient.id);
    if (!platforms || platforms.size === 0) return false;
    return !platforms.has('android') || platforms.has('web') || platforms.has('desktop');
  });
};

const matchesPushTargetPlatform = (
  tokenPlatformInput: unknown,
  targetPlatform: 'all' | 'android' | 'desktop'
) => {
  const tokenPlatform = asString(tokenPlatformInput).toLowerCase();
  if (!tokenPlatform) return false;
  if (targetPlatform === 'all') return true;
  if (targetPlatform === 'android') {
    return tokenPlatform === 'android' || tokenPlatform === 'ios';
  }
  // Desktop/web bucket.
  return tokenPlatform === 'web' || tokenPlatform === 'desktop' || tokenPlatform === 'browser';
};

const resolvePushRecipientUserIds = async (
  userIds: string[],
  targetPlatform: 'all' | 'android' | 'desktop'
) => {
  if (!userIds.length) return [];
  const tokens = await prisma.deviceToken.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, platform: true }
  });
  const eligible = new Set<string>();
  tokens.forEach((token) => {
    if (matchesPushTargetPlatform(token.platform, targetPlatform)) {
      eligible.add(token.userId);
    }
  });
  return userIds.filter((id) => eligible.has(id));
};

export const getPublicAppDistributionConfig = async (_req: Request, res: Response) => {
  try {
    const config = await readAppDistributionConfig();
    return res.json({ success: true, data: config, timestamp: nowIso() });
  } catch (error: any) {
    console.error('Failed to load app distribution config:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to load app distribution config',
      timestamp: nowIso()
    });
  }
};

export const trackAppDistributionEvent = async (req: Request, res: Response) => {
  try {
    const requester = resolveOptionalRequester(req);
    const event = toTrackingEvent(req.body?.event);
    if (!event) {
      return res.status(400).json({
        success: false,
        error: 'Unsupported app tracking event',
        timestamp: nowIso()
      });
    }

    const platform = toTargetPlatform(req.body?.platform);
    const deviceCategory = toTargetPlatform(req.body?.deviceCategory);
    const userAgent = asString(req.headers['user-agent']);
    const ip = resolveClientIp(req);
    const geo = resolveGeo(req);
    const sessionId = asString(req.body?.sessionId) || randomUUID();
    const sourcePath = asString(req.body?.sourcePath || req.body?.path || req.body?.route);
    const referrer = asString(req.headers.referer);
    const details = isObject(req.body?.details) ? req.body.details : {};

    const created = await prisma.authAuditLog.create({
      data: {
        userId: requester?.id || null,
        email: requester?.email || null,
        event: `${TRACKING_EVENT_PREFIX}${event}`,
        ip: ip || null,
        userAgent: userAgent || null,
        meta: {
          platform,
          deviceCategory,
          sessionId,
          sourcePath,
          referrer,
          geo,
          details
        } as any
      }
    });

    emitAdminEvent(req, 'apps:event_tracked', {
      id: created.id,
      event,
      platform,
      deviceCategory,
      userId: requester?.id || null,
      geo
    });

    return res.json({
      success: true,
      data: { id: created.id, sessionId },
      timestamp: nowIso()
    });
  } catch (error: any) {
    console.error('Failed to track app event:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to track app event',
      timestamp: nowIso()
    });
  }
};

export const getAdminAppDistributionConfig = async (_req: Request, res: Response) => {
  try {
    const config = await readAppDistributionConfig();
    return res.json({ success: true, data: config, timestamp: nowIso() });
  } catch (error: any) {
    console.error('Failed to load admin app config:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to load app config',
      timestamp: nowIso()
    });
  }
};

export const updateAdminAppDistributionConfig = async (req: Request, res: Response) => {
  try {
    const existing = await readAppDistributionConfig();
    const merged = deepMerge(existing, isObject(req.body) ? req.body : {});
    const saved = await saveAppDistributionConfig(merged);
    emitAdminEvent(req, 'apps:config_updated', {
      updatedBy: req.user?.id || null
    });
    return res.json({ success: true, data: saved, timestamp: nowIso() });
  } catch (error: any) {
    console.error('Failed to update app config:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to update app config',
      timestamp: nowIso()
    });
  }
};

export const getAdminAppDistributionEvents = async (req: Request, res: Response) => {
  try {
    const limit = asNumber(req.query.limit, 100, 1, 500);
    const rows = await prisma.authAuditLog.findMany({
      where: {
        event: { startsWith: TRACKING_EVENT_PREFIX }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        userId: true,
        email: true,
        event: true,
        ip: true,
        userAgent: true,
        meta: true,
        createdAt: true
      }
    });

    const events = rows.map((row) => {
      const meta: Record<string, any> = isObject(row.meta)
        ? (row.meta as Record<string, any>)
        : {};
      const geo: Record<string, any> = isObject(meta.geo)
        ? (meta.geo as Record<string, any>)
        : {};
      return {
        id: row.id,
        userId: row.userId,
        email: row.email,
        event: asString(row.event).replace(TRACKING_EVENT_PREFIX, ''),
        ip: row.ip,
        userAgent: row.userAgent,
        platform: asString(meta.platform) || 'all',
        deviceCategory: asString(meta.deviceCategory) || 'all',
        sessionId: asString(meta.sessionId),
        sourcePath: asString(meta.sourcePath),
        country: asString(geo.country) || 'unknown',
        region: asString(geo.region) || 'unknown',
        city: asString(geo.city) || 'unknown',
        details: isObject(meta.details) ? meta.details : {},
        createdAt: row.createdAt
      };
    });

    return res.json({ success: true, data: events, timestamp: nowIso() });
  } catch (error: any) {
    console.error('Failed to load app events:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to load app events',
      timestamp: nowIso()
    });
  }
};

export const getAdminAppDistributionAnalytics = async (req: Request, res: Response) => {
  try {
    const rangeDays = asNumber(req.query.rangeDays, 7, 1, 90);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (rangeDays - 1));
    // Never let Firebase init failures fail the whole analytics dashboard.
    let pushRuntime: ReturnType<typeof getPushRuntimeStatus>;
    try {
      pushRuntime = getPushRuntimeStatus();
    } catch (pushError: any) {
      pushRuntime = {
        enabled: false,
        initialized: false,
        credentialSource: null,
        credentialPath: null,
        projectId: null,
        clientEmail: null,
        error: pushError?.message || 'Push runtime unavailable'
      };
    }

    const [logs, tokens, campaigns] = await Promise.all([
      prisma.authAuditLog.findMany({
        where: {
          event: { startsWith: TRACKING_EVENT_PREFIX },
          createdAt: { gte: since }
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          userId: true,
          event: true,
          meta: true,
          createdAt: true
        }
      }),
      prisma.deviceToken.findMany({
        select: {
          userId: true,
          platform: true
        }
      }),
      readCampaigns()
    ]);

    const summary = {
      promptShown: 0,
      promptDismissed: 0,
      downloads: 0,
      installs: 0,
      suppressed: 0
    };
    const byCountry = new Map<string, number>();
    const byPlatform = new Map<string, number>();
    const byEvent = new Map<string, number>();
    const byDay = new Map<
      string,
      { date: string; promptShown: number; downloads: number; installs: number; dismissals: number }
    >();

    logs.forEach((row) => {
      const normalizedEvent = asString(row.event).replace(TRACKING_EVENT_PREFIX, '');
      const meta: Record<string, any> = isObject(row.meta)
        ? (row.meta as Record<string, any>)
        : {};
      const geo: Record<string, any> = isObject(meta.geo)
        ? (meta.geo as Record<string, any>)
        : {};
      const country = asString(geo.country, 'unknown');
      const platform = asString(meta.platform, 'unknown');
      const day = row.createdAt.toISOString().split('T')[0];

      if (!byDay.has(day)) {
        byDay.set(day, { date: day, promptShown: 0, downloads: 0, installs: 0, dismissals: 0 });
      }
      const bucket = byDay.get(day)!;

      byCountry.set(country, (byCountry.get(country) || 0) + 1);
      byPlatform.set(platform, (byPlatform.get(platform) || 0) + 1);
      byEvent.set(normalizedEvent, (byEvent.get(normalizedEvent) || 0) + 1);

      if (normalizedEvent === 'prompt_shown') {
        summary.promptShown += 1;
        bucket.promptShown += 1;
      } else if (normalizedEvent === 'prompt_dismissed') {
        summary.promptDismissed += 1;
        bucket.dismissals += 1;
      } else if (normalizedEvent === 'download_clicked') {
        summary.downloads += 1;
        bucket.downloads += 1;
      } else if (normalizedEvent === 'install_marked') {
        summary.installs += 1;
        bucket.installs += 1;
      } else if (normalizedEvent === 'prompt_suppressed') {
        summary.suppressed += 1;
      }
    });

    const tokenByPlatform = new Map<string, number>();
    const uniqueTokenUsers = new Set<string>();
    tokens.forEach((token) => {
      const platform = asString(token.platform, 'unknown').toLowerCase();
      tokenByPlatform.set(platform, (tokenByPlatform.get(platform) || 0) + 1);
      if (token.userId) uniqueTokenUsers.add(token.userId);
    });

    const conversionRate =
      summary.promptShown > 0
        ? Number(((summary.installs / summary.promptShown) * 100).toFixed(2))
        : 0;

    const campaignsInRange = campaigns.filter((campaign) => {
      const sentAt = campaign.lastSentAt ? new Date(campaign.lastSentAt).getTime() : 0;
      return sentAt >= since.getTime();
    });
    const campaignStats = campaignsInRange.reduce(
      (acc, campaign) => {
        acc.totalCampaigns += 1;
        acc.totalRecipients += Number(campaign.totalRecipients || 0);
        acc.totalPushSent += Number(campaign.totalPushSent || 0);
        acc.totalPushFailed += Number(campaign.totalPushFailed || 0);
        return acc;
      },
      {
        totalCampaigns: 0,
        totalRecipients: 0,
        totalPushSent: 0,
        totalPushFailed: 0
      }
    );

    return res.json({
      success: true,
      data: {
        summary: {
          ...summary,
          conversionRate,
          activePushUsers: uniqueTokenUsers.size,
          totalDeviceTokens: tokens.length
        },
        pushRuntime,
        campaignStats,
        byCountry: Array.from(byCountry.entries())
          .map(([country, count]) => ({ country, count }))
          .sort((a, b) => b.count - a.count),
        byPlatform: Array.from(byPlatform.entries())
          .map(([platform, count]) => ({ platform, count }))
          .sort((a, b) => b.count - a.count),
        byEvent: Array.from(byEvent.entries())
          .map(([event, count]) => ({ event, count }))
          .sort((a, b) => b.count - a.count),
        deviceTokensByPlatform: Array.from(tokenByPlatform.entries())
          .map(([platform, count]) => ({ platform, count }))
          .sort((a, b) => b.count - a.count),
        timeline: Array.from(byDay.values()).sort((a, b) =>
          a.date.localeCompare(b.date)
        )
      },
      timestamp: nowIso()
    });
  } catch (error: any) {
    console.error('Failed to load app analytics:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to load app analytics',
      timestamp: nowIso()
    });
  }
};

export const getAdminAppCampaigns = async (_req: Request, res: Response) => {
  try {
    const campaigns = await readCampaigns();
    return res.json({ success: true, data: campaigns, timestamp: nowIso() });
  } catch (error: any) {
    console.error('Failed to load app campaigns:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to load app campaigns',
      timestamp: nowIso()
    });
  }
};

export const updateAdminAppCampaign = async (req: Request, res: Response) => {
  try {
    const campaignId = asString(req.params.id);
    if (!campaignId) {
      return res.status(400).json({
        success: false,
        error: 'campaign id is required',
        timestamp: nowIso()
      });
    }
    const campaigns = await readCampaigns();
    const existing = campaigns.find((item) => item.id === campaignId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
        timestamp: nowIso()
      });
    }
    const payload = isObject(req.body) ? req.body : {};
    const candidate = normalizeCampaignRecord({
      ...existing,
      ...payload,
      id: existing.id,
      createdAt: existing.createdAt,
      createdById: existing.createdById,
      createdByEmail: existing.createdByEmail,
      totalRecipients: existing.totalRecipients,
      totalPushSent: existing.totalPushSent,
      totalPushFailed: existing.totalPushFailed,
      totalNotificationsCreated: existing.totalNotificationsCreated,
      lastPushEligibleUsers: existing.lastPushEligibleUsers,
      lastPushSkippedUsers: existing.lastPushSkippedUsers,
      lastPushDisabled: existing.lastPushDisabled,
      lastSentAt: existing.lastSentAt,
      updatedAt: nowIso()
    });
    if (!candidate.title || !candidate.body) {
      return res.status(400).json({
        success: false,
        error: 'title and body are required',
        timestamp: nowIso()
      });
    }
    const nextCampaigns = [
      candidate,
      ...campaigns.filter((item) => item.id !== campaignId)
    ].slice(0, 500);
    await saveCampaigns(nextCampaigns);
    emitAdminEvent(req, 'apps:campaign_updated', {
      campaignId: candidate.id
    });
    return res.json({
      success: true,
      data: candidate,
      timestamp: nowIso()
    });
  } catch (error: any) {
    console.error('Failed to update app campaign:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to update app campaign',
      timestamp: nowIso()
    });
  }
};

export const deleteAdminAppCampaign = async (req: Request, res: Response) => {
  try {
    const campaignId = asString(req.params.id);
    if (!campaignId) {
      return res.status(400).json({
        success: false,
        error: 'campaign id is required',
        timestamp: nowIso()
      });
    }
    const campaigns = await readCampaigns();
    const exists = campaigns.some((item) => item.id === campaignId);
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
        timestamp: nowIso()
      });
    }
    const nextCampaigns = campaigns.filter((item) => item.id !== campaignId);
    await saveCampaigns(nextCampaigns);
    emitAdminEvent(req, 'apps:campaign_deleted', {
      campaignId
    });
    return res.json({
      success: true,
      data: { id: campaignId },
      timestamp: nowIso()
    });
  } catch (error: any) {
    console.error('Failed to delete app campaign:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to delete app campaign',
      timestamp: nowIso()
    });
  }
};

export const resendAdminAppCampaign = async (req: Request, res: Response) => {
  try {
    const campaignId = asString(req.params.id);
    if (!campaignId) {
      return res.status(400).json({
        success: false,
        error: 'campaign id is required',
        timestamp: nowIso()
      });
    }
    const campaigns = await readCampaigns();
    const existing = campaigns.find((item) => item.id === campaignId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
        timestamp: nowIso()
      });
    }
    const payload = isObject(req.body) ? req.body : {};
    req.body = {
      ...existing,
      ...payload,
      id: existing.id
    };
    return sendAdminAppCampaign(req, res);
  } catch (error: any) {
    console.error('Failed to resend app campaign:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to resend app campaign',
      timestamp: nowIso()
    });
  }
};

export const sendAdminAppCampaign = async (req: Request, res: Response) => {
  try {
    const payload = isObject(req.body) ? req.body : {};
    const title = asString(payload.title);
    const body = asString(payload.body);
    if (!title || !body) {
      return res.status(400).json({
        success: false,
        error: 'title and body are required',
        timestamp: nowIso()
      });
    }

    const campaignId = asString(payload.id) || randomUUID();
    const name = asString(payload.name) || title;
    const targetPlatform = toTargetPlatform(payload.targetPlatform);
    const targetRole = toTargetRole(payload.targetRole);
    const deliveryInApp = asBoolean(payload.deliveryInApp, true);
    const deliveryPush = asBoolean(payload.deliveryPush, true);
    if (!deliveryInApp && !deliveryPush) {
      return res.status(400).json({
        success: false,
        error: 'Select at least one delivery channel (in-app or push)',
        timestamp: nowIso()
      });
    }
    const mediaType =
      asString(payload.mediaType).toLowerCase() === 'image'
        ? 'image'
        : asString(payload.mediaType).toLowerCase() === 'video'
          ? 'video'
          : 'none';
    const mediaUrl = asString(payload.mediaUrl);
    const actionUrl = asString(payload.actionUrl);
    const fallbackPath = buildCampaignFallbackPath(campaignId, targetPlatform);
    const resolvedActionUrl = actionUrl || fallbackPath;
    const explicitUserIds = Array.isArray(payload.userIds)
      ? payload.userIds.map((value: any) => asString(value)).filter(Boolean)
      : [];

    const recipients = await resolveCampaignRecipients({
      targetRole,
      targetPlatform,
      explicitUserIds
    });
    const recipientIds = recipients.map((recipient) => recipient.id);
    if (!recipientIds.length) {
      return res.status(400).json({
        success: false,
        error: 'No recipients matched the selected audience',
        timestamp: nowIso()
      });
    }

    const pushRuntime = deliveryPush ? getPushRuntimeStatus() : null;
    const pushEnabled = deliveryPush ? Boolean(pushRuntime?.enabled) : false;
    if (deliveryPush && !deliveryInApp && !pushEnabled) {
      return res.status(503).json({
        success: false,
        error:
          pushRuntime?.error ||
          'Push delivery is unavailable. Configure Firebase credentials first.',
        data: {
          pushRuntime
        },
        timestamp: nowIso()
      });
    }
    const pushRecipientIds = deliveryPush
      ? await resolvePushRecipientUserIds(recipientIds, targetPlatform)
      : [];
    const pushSkippedUsers = deliveryPush
      ? Math.max(0, recipientIds.length - pushRecipientIds.length)
      : 0;

    let notificationsCreated = 0;
    if (deliveryInApp) {
      const notificationRows = recipients.map((recipient) => {
        const recipientActionUrl =
          actionUrl ||
          buildNotificationActionUrl('app_campaign', {
            campaignId,
            recipientRole: recipient.role
          }) ||
          fallbackPath;

        return {
          userId: recipient.id,
          actorId: req.user?.id || null,
          type: 'app_campaign',
          title,
          body,
          isRead: false,
          meta: {
            campaignId,
            campaignName: name,
            mediaType,
            mediaUrl,
            actionUrl: recipientActionUrl,
            action_url: recipientActionUrl,
            targetPlatform,
            targetRole
          } as any
        };
      });
      const created = await prisma.notification.createMany({
        data: notificationRows
      });
      notificationsCreated = created.count;

      notificationRows.forEach((row) => {
        const rowMeta = (row.meta as any) || {};
        realtime.emitToUser(row.userId, 'notifications:new', {
          id: `campaign:${campaignId}:${row.userId}`,
          type: 'app_campaign',
          title,
          body,
          message: body,
          actionUrl: rowMeta.actionUrl,
          meta: {
            campaignId,
            campaignName: name,
            mediaType,
            mediaUrl,
            actionUrl: rowMeta.actionUrl,
            action_url: rowMeta.action_url
          },
          createdAt: nowIso(),
          isRead: false
        });
      });
    }

    let pushSent = 0;
    let pushFailed = 0;
    let pushAttemptedTokens = 0;
    let pushErrorSummary: string | null = null;
    if (deliveryPush && pushEnabled && pushRecipientIds.length) {
      const result = await sendPushToUsers(
        pushRecipientIds,
        {
          id: campaignId,
          type: 'app_campaign',
          title,
          body,
          deepLink: resolvedActionUrl || undefined,
          data: {
            campaignId,
            campaignName: name,
            mediaType,
            mediaUrl,
            actionUrl: resolvedActionUrl,
            action_url: resolvedActionUrl
          }
        },
        {
          targetPlatform
        }
      );
      pushSent += Number(result.sent || 0);
      pushFailed += Number(result.failed || 0);
      pushAttemptedTokens += Number(result.eligibleTokens || result.attempted || 0);
      pushErrorSummary = summarizePushErrors(result.errors);
    } else if (deliveryPush && !pushEnabled && pushRecipientIds.length) {
      pushFailed += pushRecipientIds.length;
      pushErrorSummary = pushRuntime?.error || 'Push delivery disabled on backend';
    }

    const now = nowIso();
    const campaigns = await readCampaigns();
    const existing = campaigns.find((item) => item.id === campaignId);
    const updatedCampaign = normalizeCampaignRecord({
      ...(existing || {}),
      id: campaignId,
      name,
      title,
      body,
      mediaType,
      mediaUrl,
      actionUrl: resolvedActionUrl,
      targetPlatform,
      targetRole,
      deliveryInApp,
      deliveryPush,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      createdById: existing?.createdById || req.user?.id || null,
      createdByEmail: existing?.createdByEmail || req.user?.email || null,
      totalRecipients: Number(existing?.totalRecipients || 0) + recipientIds.length,
      totalPushSent: Number(existing?.totalPushSent || 0) + pushSent,
      totalPushFailed: Number(existing?.totalPushFailed || 0) + pushFailed,
      totalNotificationsCreated:
        Number(existing?.totalNotificationsCreated || 0) + notificationsCreated,
      lastPushEligibleUsers: pushRecipientIds.length,
      lastPushSkippedUsers: pushSkippedUsers,
      lastPushDisabled: deliveryPush && !pushEnabled,
      lastPushAttemptedTokens: pushAttemptedTokens,
      lastPushCredentialSource: pushRuntime?.credentialSource || null,
      lastPushErrorSummary: pushErrorSummary,
      lastSentAt: now
    });

    const nextCampaigns = [
      updatedCampaign,
      ...campaigns.filter((item) => item.id !== campaignId)
    ].slice(0, 500);
    await saveCampaigns(nextCampaigns);

    emitAdminEvent(req, 'apps:campaign_sent', {
      campaignId,
      recipients: recipientIds.length,
      pushEligibleUsers: pushRecipientIds.length,
      pushSkippedUsers,
      pushEnabled,
      pushAttemptedTokens,
      pushSent,
      pushFailed,
      pushRuntime
    });
    emitAdminEvent(req, 'apps:metrics_updated', {
      campaignId
    });

    return res.json({
      success: true,
      data: {
        campaign: updatedCampaign,
        recipients: recipientIds.length,
        notificationsCreated,
        pushEligibleUsers: pushRecipientIds.length,
        pushSkippedUsers,
        pushEnabled,
        pushAttemptedTokens,
        pushSent,
        pushFailed,
        pushErrorSummary,
        pushRuntime
      },
      timestamp: nowIso()
    });
  } catch (error: any) {
    console.error('Failed to send app campaign:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to send app campaign',
      timestamp: nowIso()
    });
  }
};
