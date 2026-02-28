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
  sanitizeUrlOrNull,
  toDeveloperAppResponse
} from '../services/developerPlatform.service';

const getRequestMeta = (req: Request) => ({
  ip: String(req.ip || req.headers['x-forwarded-for'] || '').slice(0, 255) || null,
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
    const { clientId, clientSecret, clientSecretHash } = generateClientCredentials();

    const app = await prisma.developerApp.create({
      data: {
        ownerUserId,
        developerUserId: developerUser.id,
        name,
        tagline: String(req.body?.tagline || '').trim() || null,
        description: String(req.body?.description || '').trim() || null,
        appUrl: sanitizeUrlOrNull(req.body?.appUrl),
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
      },
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
        autoApprovalEnabled: config.autoApproveEnabled,
        sensitiveScopes: config.sensitiveScopes
      },
      ...getRequestMeta(req)
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
    return res.status(500).json({ success: false, error: error?.message || 'Failed to create developer app.' });
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
    const app = await assertDeveloperAppOwnership({
      appId: String(req.params.id || ''),
      ownerUserId: req.developerOwnerUserId!
    });

    const config = await getOrCreateDeveloperPlatformConfig();
    const hasScopeUpdate = req.body?.requestedScopes !== undefined;
    const requestedScopes = hasScopeUpdate ? normalizeScopes(req.body?.requestedScopes) : app.requestedScopes;
    const nextStatus =
      hasScopeUpdate && app.status !== DEV_APP_STATUS.DISABLED && app.status !== DEV_APP_STATUS.REJECTED
        ? evaluateAutoApprovalStatus(config, requestedScopes)
        : app.status;

    const redirectUris = req.body?.redirectUris !== undefined ? sanitizeRedirectUris(req.body?.redirectUris) : null;

    await prisma.$transaction(async (tx) => {
      await tx.developerApp.update({
        where: { id: app.id },
        data: {
          name: req.body?.name !== undefined ? String(req.body.name || '').trim() || app.name : undefined,
          tagline: req.body?.tagline !== undefined ? String(req.body.tagline || '').trim() || null : undefined,
          description:
            req.body?.description !== undefined ? String(req.body.description || '').trim() || null : undefined,
          appUrl: req.body?.appUrl !== undefined ? sanitizeUrlOrNull(req.body.appUrl) : undefined,
          termsUrl: req.body?.termsUrl !== undefined ? sanitizeUrlOrNull(req.body.termsUrl) : undefined,
          privacyUrl: req.body?.privacyUrl !== undefined ? sanitizeUrlOrNull(req.body.privacyUrl) : undefined,
          logoFileId: req.body?.logoFileId !== undefined ? String(req.body.logoFileId || '').trim() || null : undefined,
          platformType: req.body?.platformType !== undefined ? parsePlatformType(req.body.platformType) : undefined,
          requestedScopes: hasScopeUpdate ? requestedScopes : undefined,
          status: nextStatus,
          approvedAt: nextStatus === DEV_APP_STATUS.ACTIVE ? new Date() : app.approvedAt
        }
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
