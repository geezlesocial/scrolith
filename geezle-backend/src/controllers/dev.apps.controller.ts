import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import {
  DEV_APP_STATUS,
  assertDeveloperAppOwnership,
  createDeveloperAuditLog,
  emitDeveloperEvent,
  evaluateAutoApprovalStatus,
  generateClientCredentials,
  getOrCreateDeveloperPlatformConfig,
  normalizeScopes,
  sanitizePlatformUrls,
  sanitizeUrlOrNull,
  toDeveloperAppResponse
} from '../services/developerPlatform.service';
import { sendSystemMessage } from '../services/systemMessaging';
import { getTrustedClientIp } from '../utils/security/clientIdentity';

const getRequestMeta = (req: Request) => ({
  ip: getTrustedClientIp(req).slice(0, 255) || null,
  userAgent: String(req.headers['user-agent'] || '').slice(0, 512) || null
});

const parsePlatformType = (value: unknown): 'WEB' | 'MOBILE' | 'SERVER' => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'MOBILE') return 'MOBILE';
  if (normalized === 'SERVER') return 'SERVER';
  return 'WEB';
};

const sanitizeRedirectUris = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  value.forEach((entry) => {
    const url = sanitizeUrlOrNull(entry);
    if (url) unique.add(url);
  });
  return Array.from(unique);
};

const parsePlatformUrlEntries = (value: unknown): string[] => {
  const entries = Array.isArray(value) ? value : String(value || '').split(/[\n,]/g);
  return entries.map((entry) => String(entry || '').trim()).filter(Boolean);
};

const validatePlatformUrlsInput = (value: unknown) => {
  const entries = parsePlatformUrlEntries(value);
  const normalized = sanitizePlatformUrls(entries);
  if (entries.length > 0 && normalized.length === 0) {
    const error = new Error(
      'Provide at least one valid app/platform URL (for example: https://example.com, https://www.example.com, example.com).'
    );
    (error as any).statusCode = 400;
    throw error;
  }
  if (normalized.length > 50) {
    const error = new Error('You can register up to 50 app/platform URLs.');
    (error as any).statusCode = 400;
    throw error;
  }
  return normalized;
};

const hostFromUrl = (value: string): string => {
  try {
    return String(new URL(value).hostname || '').trim().toLowerCase();
  } catch {
    return '';
  }
};

const isHostAllowedByPlatformUrls = (host: string, platformUrls: string[]) => {
  const candidate = String(host || '').trim().toLowerCase();
  if (!candidate) return false;
  return platformUrls.some((platformUrl) => {
    const allowedHost = hostFromUrl(platformUrl);
    if (!allowedHost) return false;
    return candidate === allowedHost || candidate.endsWith(`.${allowedHost}`);
  });
};

const assertRedirectUrisWithinPlatformUrls = (redirectUris: string[], platformUrls: string[]) => {
  if (!platformUrls.length || !redirectUris.length) return;
  const invalid = redirectUris.find((uri) => {
    const redirectHost = hostFromUrl(uri);
    return !isHostAllowedByPlatformUrls(redirectHost, platformUrls);
  });
  if (invalid) {
    const error = new Error(
      'All redirect URIs must use the app/platform URL domain or its subdomains.'
    );
    (error as any).statusCode = 400;
    throw error;
  }
};

const normalizeBusinessPageSlug = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const resolveConnectedBusinessPage = async (ownerUserId: string, body: any) => {
  const pageId = String(body?.connectedPageId || '').trim();
  const pageSlug = normalizeBusinessPageSlug(body?.connectedPageSlug);
  if (!pageId && !pageSlug) return null;

  const page = await prisma.communityBusinessPage.findFirst({
    where: {
      ownerId: ownerUserId,
      status: { not: 'deleted' },
      ...(pageId ? { id: pageId } : { slug: pageSlug })
    },
    select: {
      id: true,
      name: true,
      slug: true,
      handle: true
    }
  });

  if (!page) {
    const error = new Error('Connected Scrolith page is invalid or not owned by this account.');
    (error as any).statusCode = 400;
    throw error;
  }

  const slugOrHandle = String(page.slug || page.handle || page.id).trim();
  const connectedPageUrl = `https://scrolith.com/company/${encodeURIComponent(slugOrHandle)}`;
  return {
    id: page.id,
    slug: slugOrHandle,
    url: connectedPageUrl
  };
};

const notifyDeveloper = async (params: {
  userId?: string | null;
  email?: string | null;
  title: string;
  message: string;
  actionUrl?: string;
  type?: string;
}) => {
  if (!params.userId && !params.email) return;
  try {
    await sendSystemMessage({
      templateKey: 'system_notification',
      userId: params.userId || null,
      email: params.email || null,
      actionUrl: params.actionUrl || '/developer',
      typeOverride: params.type || 'developer_platform',
      context: {
        notification: {
          title: params.title,
          message: params.message,
          link: params.actionUrl || '/developer'
        }
      }
    });
  } catch (error) {
    console.warn('[developer] failed to send system message:', (error as any)?.message || error);
  }
};

export const listDeveloperApps = async (req: Request, res: Response) => {
  try {
    const ownerUserId = req.developerOwnerUserId!;
    const apps = await prisma.developerApp.findMany({
      where: { ownerUserId },
      orderBy: { createdAt: 'desc' },
      include: {
        redirectUris: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' }
        }
      }
    });
    return res.json({ success: true, data: apps.map((app) => toDeveloperAppResponse(app as any)) });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to list developer apps.' });
  }
};

export const createDeveloperApp = async (req: Request, res: Response) => {
  try {
    const ownerUserId = req.developerOwnerUserId!;
    const developerUser = req.developerUser!;
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ success: false, error: 'App name is required.' });

    const config = await getOrCreateDeveloperPlatformConfig();
    const requestedScopes = normalizeScopes(req.body?.requestedScopes);
    const status = evaluateAutoApprovalStatus(config, requestedScopes);
    const platformType = parsePlatformType(req.body?.platformType);
    const redirectUris = sanitizeRedirectUris(req.body?.redirectUris);
    const connectedPage = await resolveConnectedBusinessPage(ownerUserId, req.body);
    const platformUrls = sanitizePlatformUrls([
      ...validatePlatformUrlsInput(req.body?.platformUrls),
      ...(connectedPage?.url ? [connectedPage.url] : [])
    ]);
    assertRedirectUrisWithinPlatformUrls(redirectUris, platformUrls);
    const { clientId, clientSecret, clientSecretHash } = generateClientCredentials();

    const createData: any = {
        ownerUserId,
        developerUserId: developerUser.id,
        name,
        tagline: String(req.body?.tagline || '').trim() || null,
        description: String(req.body?.description || '').trim() || null,
        appUrl: connectedPage?.url || sanitizeUrlOrNull(req.body?.appUrl),
        platformUrls,
        termsUrl: sanitizeUrlOrNull(req.body?.termsUrl),
        privacyUrl: sanitizeUrlOrNull(req.body?.privacyUrl),
        logoFileId: String(req.body?.logoFileId || '').trim() || null,
        clientId,
        clientSecretHash,
        platformType,
        requestedScopes,
        status,
        approvedAt: status === DEV_APP_STATUS.ACTIVE ? new Date() : null,
        redirectUris: redirectUris.length
          ? {
              createMany: {
                data: redirectUris.map((uri) => ({ uri, isActive: true })),
                skipDuplicates: true
              }
            }
          : undefined
      };

    const app = await prisma.developerApp.create({
      data: createData,
      include: { redirectUris: { where: { isActive: true }, orderBy: { createdAt: 'asc' } } }
    });

    await createDeveloperAuditLog({
      developerUserId: developerUser.id,
      appId: app.id,
      actorUserId: req.user?.id || null,
      action: 'DEV_APP_CREATED',
      status: app.status,
      metadata: {
        requestedScopes,
        platformUrls,
        connectedPageId: connectedPage?.id || null,
        connectedPageSlug: connectedPage?.slug || null,
        autoApprovalEnabled: config.autoApproveEnabled,
        sensitiveScopes: config.sensitiveScopes
      },
      ...getRequestMeta(req)
    });

    const createdStatus = String(app.status || '').toUpperCase();
    const title =
      createdStatus === DEV_APP_STATUS.ACTIVE
        ? 'Developer app approved'
        : createdStatus === DEV_APP_STATUS.PENDING_REVIEW
          ? 'Developer app submitted for review'
          : 'Developer app created';
    const message =
      createdStatus === DEV_APP_STATUS.ACTIVE
        ? `${app.name} is active. You can now generate OAuth tokens and start API calls.`
        : `${app.name} has been created and is waiting for admin approval.`;
    await notifyDeveloper({
      userId: ownerUserId,
      email: req.user?.email || null,
      title,
      message,
      actionUrl: '/developer?section=apps',
      type: 'developer_app_created'
    });

    emitDeveloperEvent(req, 'dev:app_updated', {
      appId: app.id,
      status: app.status,
      ownerUserId
    });

    return res.status(201).json({
      success: true,
      data: {
        ...toDeveloperAppResponse(app as any),
        clientSecret
      }
    });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({ success: false, error: error?.message || 'Failed to create developer app.' });
  }
};

export const getDeveloperApp = async (req: Request, res: Response) => {
  try {
    const app = await assertDeveloperAppOwnership({
      appId: String(req.params.id || ''),
      ownerUserId: req.developerOwnerUserId!
    });
    return res.json({ success: true, data: toDeveloperAppResponse(app as any) });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({ success: false, error: error?.message || 'Failed to load developer app.' });
  }
};

export const updateDeveloperApp = async (req: Request, res: Response) => {
  try {
    const ownerUserId = req.developerOwnerUserId!;
    const app = await assertDeveloperAppOwnership({
      appId: String(req.params.id || ''),
      ownerUserId
    });

    const config = await getOrCreateDeveloperPlatformConfig();
    const hasScopeUpdate = req.body?.requestedScopes !== undefined;
    const requestedScopes = hasScopeUpdate ? normalizeScopes(req.body?.requestedScopes) : app.requestedScopes;
    const hasPlatformUrlsUpdate = req.body?.platformUrls !== undefined;
    const hasConnectedPageUpdate = req.body?.connectedPageId !== undefined || req.body?.connectedPageSlug !== undefined;
    const connectedPage = hasConnectedPageUpdate ? await resolveConnectedBusinessPage(ownerUserId, req.body) : null;
    const platformUrls = sanitizePlatformUrls([
      ...(hasPlatformUrlsUpdate ? validatePlatformUrlsInput(req.body?.platformUrls) : app.platformUrls || []),
      ...(connectedPage?.url ? [connectedPage.url] : [])
    ]);
    const nextStatus =
      hasScopeUpdate && app.status !== DEV_APP_STATUS.DISABLED && app.status !== DEV_APP_STATUS.REJECTED
        ? evaluateAutoApprovalStatus(config, requestedScopes)
        : app.status;

    const redirectUris = req.body?.redirectUris !== undefined ? sanitizeRedirectUris(req.body?.redirectUris) : null;
    const effectiveRedirectUris = redirectUris !== null ? redirectUris : (app.redirectUris || []).map((entry: any) => String(entry?.uri || '').trim()).filter(Boolean);
    assertRedirectUrisWithinPlatformUrls(effectiveRedirectUris, platformUrls);
    const explicitAppUrl = req.body?.appUrl !== undefined ? sanitizeUrlOrNull(req.body.appUrl) : null;
    const nextAppUrl =
      connectedPage?.url
        ? connectedPage.url
        : hasConnectedPageUpdate
          ? (req.body?.appUrl !== undefined ? explicitAppUrl : null)
          : req.body?.appUrl !== undefined
            ? explicitAppUrl
            : undefined;

    await prisma.$transaction(async (tx) => {
      await tx.developerApp.update({
        where: { id: app.id },
        data: {
          name: req.body?.name !== undefined ? String(req.body.name || '').trim() || app.name : undefined,
          tagline: req.body?.tagline !== undefined ? String(req.body.tagline || '').trim() || null : undefined,
          description:
            req.body?.description !== undefined ? String(req.body.description || '').trim() || null : undefined,
          appUrl: nextAppUrl,
          platformUrls: hasPlatformUrlsUpdate || Boolean(connectedPage?.url) ? platformUrls : undefined,
          termsUrl: req.body?.termsUrl !== undefined ? sanitizeUrlOrNull(req.body.termsUrl) : undefined,
          privacyUrl: req.body?.privacyUrl !== undefined ? sanitizeUrlOrNull(req.body.privacyUrl) : undefined,
          logoFileId: req.body?.logoFileId !== undefined ? String(req.body.logoFileId || '').trim() || null : undefined,
          platformType: req.body?.platformType !== undefined ? parsePlatformType(req.body.platformType) : undefined,
          requestedScopes: hasScopeUpdate ? requestedScopes : undefined,
          status: nextStatus,
          approvedAt: nextStatus === DEV_APP_STATUS.ACTIVE ? new Date() : app.approvedAt
        } as any
      });

      if (redirectUris !== null) {
        await tx.developerAppRedirectUri.updateMany({
          where: { appId: app.id, isActive: true },
          data: { isActive: false }
        });
        if (redirectUris.length) {
          await tx.developerAppRedirectUri.createMany({
            data: redirectUris.map((uri) => ({ appId: app.id, uri, isActive: true })),
            skipDuplicates: true
          });
        }
      }
    });

    const updated = await prisma.developerApp.findUniqueOrThrow({
      where: { id: app.id },
      include: { redirectUris: { where: { isActive: true }, orderBy: { createdAt: 'asc' } } }
    });

    await createDeveloperAuditLog({
      developerUserId: req.developerUser?.id || null,
      appId: app.id,
      actorUserId: req.user?.id || null,
      action: 'DEV_APP_UPDATED',
      status: updated.status,
      metadata: {
        hasScopeUpdate,
        hasPlatformUrlsUpdate,
        hasConnectedPageUpdate,
        connectedPageId: connectedPage?.id || null,
        connectedPageSlug: connectedPage?.slug || null,
        redirectUrisUpdated: redirectUris !== null
      },
      ...getRequestMeta(req)
    });

    emitDeveloperEvent(req, 'dev:app_updated', {
      appId: updated.id,
      status: updated.status,
      ownerUserId: updated.ownerUserId
    });

    return res.json({ success: true, data: toDeveloperAppResponse(updated as any) });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({ success: false, error: error?.message || 'Failed to update developer app.' });
  }
};

export const rotateDeveloperAppSecret = async (req: Request, res: Response) => {
  try {
    const app = await assertDeveloperAppOwnership({
      appId: String(req.params.id || ''),
      ownerUserId: req.developerOwnerUserId!
    });
    const { clientSecret, clientSecretHash } = generateClientCredentials();
    await prisma.developerApp.update({
      where: { id: app.id },
      data: {
        clientSecretHash,
        lastSecretRotatedAt: new Date()
      }
    });

    await createDeveloperAuditLog({
      developerUserId: req.developerUser?.id || null,
      appId: app.id,
      actorUserId: req.user?.id || null,
      action: 'DEV_APP_SECRET_ROTATED',
      status: 'SUCCESS',
      ...getRequestMeta(req)
    });

    await notifyDeveloper({
      userId: app.ownerUserId,
      email: req.user?.email || null,
      title: 'Developer API secret rotated',
      message: `${app.name} generated a new client secret. The previous secret is now invalid.`,
      actionUrl: '/developer?section=apps',
      type: 'developer_app_secret_rotated'
    });

    emitDeveloperEvent(req, 'dev:app_updated', {
      appId: app.id,
      status: app.status,
      ownerUserId: app.ownerUserId
    });

    return res.json({
      success: true,
      data: {
        appId: app.id,
        clientId: app.clientId,
        clientSecret
      }
    });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({ success: false, error: error?.message || 'Failed to rotate app secret.' });
  }
};

export const disableDeveloperApp = async (req: Request, res: Response) => {
  try {
    const app = await assertDeveloperAppOwnership({
      appId: String(req.params.id || ''),
      ownerUserId: req.developerOwnerUserId!
    });
    const updated = await prisma.developerApp.update({
      where: { id: app.id },
      data: { status: DEV_APP_STATUS.DISABLED, disabledAt: new Date() },
      include: { redirectUris: { where: { isActive: true }, orderBy: { createdAt: 'asc' } } }
    });

    await createDeveloperAuditLog({
      developerUserId: req.developerUser?.id || null,
      appId: app.id,
      actorUserId: req.user?.id || null,
      action: 'DEV_APP_DISABLED',
      status: updated.status,
      ...getRequestMeta(req)
    });

    await notifyDeveloper({
      userId: updated.ownerUserId,
      email: req.user?.email || null,
      title: 'Developer app disabled',
      message: `${updated.name} has been disabled. OAuth token issuance is blocked until it is enabled again.`,
      actionUrl: '/developer?section=apps',
      type: 'developer_app_disabled'
    });

    emitDeveloperEvent(req, 'dev:app_updated', {
      appId: updated.id,
      status: updated.status,
      ownerUserId: updated.ownerUserId
    });

    return res.json({ success: true, data: toDeveloperAppResponse(updated as any) });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({ success: false, error: error?.message || 'Failed to disable app.' });
  }
};

export const enableDeveloperApp = async (req: Request, res: Response) => {
  try {
    const app = await assertDeveloperAppOwnership({
      appId: String(req.params.id || ''),
      ownerUserId: req.developerOwnerUserId!
    });
    const config = await getOrCreateDeveloperPlatformConfig();
    const nextStatus = evaluateAutoApprovalStatus(config, app.requestedScopes || []);
    const updated = await prisma.developerApp.update({
      where: { id: app.id },
      data: {
        status: nextStatus,
        disabledAt: null,
        approvedAt: nextStatus === DEV_APP_STATUS.ACTIVE ? new Date() : app.approvedAt
      },
      include: { redirectUris: { where: { isActive: true }, orderBy: { createdAt: 'asc' } } }
    });

    await createDeveloperAuditLog({
      developerUserId: req.developerUser?.id || null,
      appId: app.id,
      actorUserId: req.user?.id || null,
      action: 'DEV_APP_ENABLED',
      status: updated.status,
      ...getRequestMeta(req)
    });

    const enabledStatus = String(updated.status || '').toUpperCase();
    const title = enabledStatus === DEV_APP_STATUS.ACTIVE ? 'Developer app enabled' : 'Developer app awaiting review';
    const message =
      enabledStatus === DEV_APP_STATUS.ACTIVE
        ? `${updated.name} is enabled and active.`
        : `${updated.name} is enabled but still requires admin review before going live.`;
    await notifyDeveloper({
      userId: updated.ownerUserId,
      email: req.user?.email || null,
      title,
      message,
      actionUrl: '/developer?section=apps',
      type: 'developer_app_enabled'
    });

    emitDeveloperEvent(req, 'dev:app_updated', {
      appId: updated.id,
      status: updated.status,
      ownerUserId: updated.ownerUserId
    });

    return res.json({ success: true, data: toDeveloperAppResponse(updated as any) });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({ success: false, error: error?.message || 'Failed to enable app.' });
  }
};

export const getDeveloperAppLogs = async (req: Request, res: Response) => {
  try {
    const app = await assertDeveloperAppOwnership({
      appId: String(req.params.id || ''),
      ownerUserId: req.developerOwnerUserId!
    });
    const take = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const logs = await prisma.developerAuditLog.findMany({
      where: { appId: app.id },
      orderBy: { createdAt: 'desc' },
      take
    });
    return res.json({ success: true, data: logs });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({ success: false, error: error?.message || 'Failed to load app logs.' });
  }
};

export const getDeveloperAppRedirectUris = async (req: Request, res: Response) => {
  try {
    const app = await assertDeveloperAppOwnership({
      appId: String(req.params.id || ''),
      ownerUserId: req.developerOwnerUserId!
    });
    return res.json({ success: true, data: app.redirectUris || [] });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({ success: false, error: error?.message || 'Failed to load redirect URIs.' });
  }
};

export const addDeveloperAppRedirectUri = async (req: Request, res: Response) => {
  try {
    const app = await assertDeveloperAppOwnership({
      appId: String(req.params.id || ''),
      ownerUserId: req.developerOwnerUserId!
    });
    const uri = sanitizeUrlOrNull(req.body?.uri);
    if (!uri) return res.status(400).json({ success: false, error: 'A valid redirect URI is required.' });

    const created = await prisma.developerAppRedirectUri.upsert({
      where: { appId_uri: { appId: app.id, uri } },
      update: { isActive: true },
      create: { appId: app.id, uri, isActive: true }
    });
    return res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({ success: false, error: error?.message || 'Failed to add redirect URI.' });
  }
};

export const deleteDeveloperAppRedirectUri = async (req: Request, res: Response) => {
  try {
    const app = await assertDeveloperAppOwnership({
      appId: String(req.params.id || ''),
      ownerUserId: req.developerOwnerUserId!
    });
    const uriId = String(req.params.uriId || '').trim();
    if (!uriId) return res.status(400).json({ success: false, error: 'uriId is required.' });

    const existing = await prisma.developerAppRedirectUri.findFirst({
      where: { id: uriId, appId: app.id }
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Redirect URI not found.' });

    await prisma.developerAppRedirectUri.update({
      where: { id: existing.id },
      data: { isActive: false }
    });
    return res.json({ success: true });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({ success: false, error: error?.message || 'Failed to remove redirect URI.' });
  }
};
