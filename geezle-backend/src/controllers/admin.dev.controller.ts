import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import {
  DEV_APP_STATUS,
  DEV_LINK_STATUS,
  createDeveloperAuditLog,
  emitDeveloperEvent,
  getOrCreateDeveloperPlatformConfig,
  isDeveloperPlatformSchemaMissingError,
  normalizeDeveloperBaseUrl
} from '../services/developerPlatform.service';
import { sendSystemMessage } from '../services/systemMessaging';

const getRequestMeta = (req: Request) => ({
  ip: String(req.ip || req.headers['x-forwarded-for'] || '').slice(0, 255) || null,
  userAgent: String(req.headers['user-agent'] || '').slice(0, 512) || null
});

const parseScopes = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    )
  );
};

const schemaNotReadyResponse = (res: Response) =>
  res.status(503).json({
    success: false,
    code: 'DEV_PLATFORM_SCHEMA_MISSING',
    error: 'Developer Platform database tables are not ready. Run the latest backend database migration.'
  });

export const getAdminDeveloperConfig = async (_req: Request, res: Response) => {
  try {
    const config = await getOrCreateDeveloperPlatformConfig();
    return res.json({ success: true, data: config });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load developer config.' });
  }
};

export const updateAdminDeveloperConfig = async (req: Request, res: Response) => {
  try {
    const current = await getOrCreateDeveloperPlatformConfig();
    if (current?._schemaMissing) return schemaNotReadyResponse(res);
    const developerBaseUrl = normalizeDeveloperBaseUrl(req.body?.developerBaseUrl || current.developerBaseUrl);
    const updated = await prisma.developerPlatformConfig.update({
      where: { id: current.id },
      data: {
        developerBaseUrl,
        autoApproveEnabled:
          req.body?.autoApproveEnabled !== undefined ? Boolean(req.body.autoApproveEnabled) : current.autoApproveEnabled,
        autoApproveRules: req.body?.autoApproveRules !== undefined ? req.body.autoApproveRules : current.autoApproveRules,
        authorizationCodeTtlSeconds:
          req.body?.authorizationCodeTtlSeconds !== undefined
            ? Math.max(60, Number(req.body.authorizationCodeTtlSeconds || 300))
            : current.authorizationCodeTtlSeconds,
        accessTokenTtlSeconds:
          req.body?.accessTokenTtlSeconds !== undefined
            ? Math.max(300, Number(req.body.accessTokenTtlSeconds || 3600))
            : current.accessTokenTtlSeconds,
        refreshTokenTtlSeconds:
          req.body?.refreshTokenTtlSeconds !== undefined
            ? Math.max(3600, Number(req.body.refreshTokenTtlSeconds || 2592000))
            : current.refreshTokenTtlSeconds,
        rateLimitPerMinute:
          req.body?.rateLimitPerMinute !== undefined
            ? Math.max(10, Number(req.body.rateLimitPerMinute || 120))
            : current.rateLimitPerMinute,
        sensitiveScopes: req.body?.sensitiveScopes !== undefined ? parseScopes(req.body.sensitiveScopes) : current.sensitiveScopes,
        requireManualApprovalForSensitiveScope:
          req.body?.requireManualApprovalForSensitiveScope !== undefined
            ? Boolean(req.body.requireManualApprovalForSensitiveScope)
            : current.requireManualApprovalForSensitiveScope,
        updatedByAdminId: req.user?.id || null
      }
    });

    emitDeveloperEvent(req, 'dev:config_updated', {
      updatedBy: req.user?.id || null,
      updatedAt: updated.updatedAt.toISOString()
    });

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    if (isDeveloperPlatformSchemaMissingError(error)) return schemaNotReadyResponse(res);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to update developer config.' });
  }
};

export const listAdminDeveloperApps = async (req: Request, res: Response) => {
  try {
    const statusRaw = String(req.query.status || '').trim().toUpperCase();
    const statusFilter = Object.values(DEV_APP_STATUS).includes(statusRaw as any)
      ? statusRaw
      : null;
    const apps = await prisma.developerApp.findMany({
      where: statusFilter ? { status: statusFilter } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        redirectUris: { where: { isActive: true }, orderBy: { createdAt: 'asc' } },
        ownerUser: {
          select: { id: true, email: true, username: true, name: true }
        }
      }
    });
    return res.json({ success: true, data: apps });
  } catch (error: any) {
    if (isDeveloperPlatformSchemaMissingError(error)) {
      return res.json({ success: true, data: [] });
    }
    return res.status(500).json({ success: false, error: error?.message || 'Failed to list developer apps.' });
  }
};

const updateAppAdminStatus = async (req: Request, res: Response, status: string) => {
  try {
    const appId = String(req.params.id || '').trim();
    if (!appId) return res.status(400).json({ success: false, error: 'App id is required.' });
    const existing = await prisma.developerApp.findUnique({
      where: { id: appId },
      include: {
        ownerUser: {
          select: {
            id: true,
            email: true
          }
        }
      }
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Developer app not found.' });

    const next = await prisma.developerApp.update({
      where: { id: appId },
      data: {
        status,
        approvedByAdminId: req.user?.id || null,
        approvedAt: status === DEV_APP_STATUS.ACTIVE ? new Date() : existing.approvedAt,
        disabledAt: status === DEV_APP_STATUS.DISABLED ? new Date() : null
      }
    });

    await createDeveloperAuditLog({
      developerUserId: existing.developerUserId,
      appId: appId,
      actorUserId: req.user?.id || null,
      action: `ADMIN_DEV_APP_${status}`,
      status,
      metadata: { previousStatus: existing.status },
      ...getRequestMeta(req)
    });

    const actionUrl = '/developer?section=apps';
    const statusUpper = String(status || '').toUpperCase();
    const title =
      statusUpper === DEV_APP_STATUS.ACTIVE
        ? 'Developer app approved'
        : statusUpper === DEV_APP_STATUS.REJECTED
          ? 'Developer app rejected'
          : 'Developer app disabled';
    const message =
      statusUpper === DEV_APP_STATUS.ACTIVE
        ? `${existing.name} has been approved by admin and is now live.`
        : statusUpper === DEV_APP_STATUS.REJECTED
          ? `${existing.name} was rejected during admin review. Update details and resubmit.`
          : `${existing.name} was disabled by admin.`;
    try {
      await sendSystemMessage({
        templateKey: 'system_notification',
        userId: existing.ownerUserId,
        email: existing.ownerUser?.email || null,
        actionUrl,
        typeOverride: 'developer_app_status',
        context: {
          notification: {
            title,
            message,
            link: actionUrl
          }
        }
      });
    } catch (notifyError) {
      console.warn('[developer-admin] app status notification failed', (notifyError as any)?.message || notifyError);
    }

    emitDeveloperEvent(req, 'dev:app_updated', {
      appId: next.id,
      status: next.status,
      ownerUserId: next.ownerUserId
    });

    return res.json({ success: true, data: next });
  } catch (error: any) {
    if (isDeveloperPlatformSchemaMissingError(error)) return schemaNotReadyResponse(res);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to update app status.' });
  }
};

export const approveAdminDeveloperApp = async (req: Request, res: Response) =>
  updateAppAdminStatus(req, res, DEV_APP_STATUS.ACTIVE);

export const rejectAdminDeveloperApp = async (req: Request, res: Response) =>
  updateAppAdminStatus(req, res, DEV_APP_STATUS.REJECTED);

export const disableAdminDeveloperApp = async (req: Request, res: Response) =>
  updateAppAdminStatus(req, res, DEV_APP_STATUS.DISABLED);

export const listAdminDevelopers = async (_req: Request, res: Response) => {
  try {
    const developers = await prisma.developerUser.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            avatar: true
          }
        }
      }
    });
    return res.json({ success: true, data: developers });
  } catch (error: any) {
    if (isDeveloperPlatformSchemaMissingError(error)) {
      return res.json({ success: true, data: [] });
    }
    return res.status(500).json({ success: false, error: error?.message || 'Failed to list developers.' });
  }
};

const updateDeveloperLinkStatus = async (req: Request, res: Response, linkStatus: string) => {
  try {
    const developerId = String(req.params.id || '').trim();
    if (!developerId) return res.status(400).json({ success: false, error: 'Developer id is required.' });

    const existing = await prisma.developerUser.findUnique({
      where: { id: developerId },
      include: {
        user: {
          select: {
            id: true,
            email: true
          }
        }
      }
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Developer profile not found.' });

    const updated = await prisma.developerUser.update({
      where: { id: existing.id },
      data: { linkStatus }
    });

    await createDeveloperAuditLog({
      developerUserId: updated.id,
      actorUserId: req.user?.id || null,
      action: linkStatus === DEV_LINK_STATUS.SUSPENDED ? 'ADMIN_DEV_SUSPENDED' : 'ADMIN_DEV_UNSUSPENDED',
      status: linkStatus,
      metadata: {
        previousStatus: existing.linkStatus
      },
      ...getRequestMeta(req)
    });

    if (linkStatus === DEV_LINK_STATUS.SUSPENDED) {
      await prisma.developerApp.updateMany({
        where: { developerUserId: updated.id, status: { notIn: [DEV_APP_STATUS.DISABLED, DEV_APP_STATUS.REJECTED] } },
        data: { status: DEV_APP_STATUS.DISABLED, disabledAt: new Date() }
      });
    }

    if (existing.userId) {
      const actionUrl = '/developer?section=settings';
      const title = linkStatus === DEV_LINK_STATUS.SUSPENDED ? 'Developer account suspended' : 'Developer account restored';
      const message =
        linkStatus === DEV_LINK_STATUS.SUSPENDED
          ? 'Admin suspended your developer account. App and OAuth operations are now restricted.'
          : 'Admin restored your developer account access.';
      try {
        await sendSystemMessage({
          templateKey: 'system_notification',
          userId: existing.userId,
          email: existing.user?.email || null,
          actionUrl,
          typeOverride: 'developer_account_status',
          context: {
            notification: {
              title,
              message,
              link: actionUrl
            }
          }
        });
      } catch (notifyError) {
        console.warn(
          '[developer-admin] developer status notification failed',
          (notifyError as any)?.message || notifyError
        );
      }
    }

    emitDeveloperEvent(req, 'dev:link_status_updated', {
      developerUserId: updated.id,
      linkStatus: updated.linkStatus
    });

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    if (isDeveloperPlatformSchemaMissingError(error)) return schemaNotReadyResponse(res);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to update developer status.' });
  }
};

export const suspendAdminDeveloper = async (req: Request, res: Response) =>
  updateDeveloperLinkStatus(req, res, DEV_LINK_STATUS.SUSPENDED);

export const unsuspendAdminDeveloper = async (req: Request, res: Response) =>
  updateDeveloperLinkStatus(req, res, DEV_LINK_STATUS.LINKED);
