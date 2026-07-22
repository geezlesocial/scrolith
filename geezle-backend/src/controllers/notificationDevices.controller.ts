import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const nowIso = () => new Date().toISOString();

export const registerDevice = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized', timestamp: nowIso() });

    const platform = String(req.body?.platform || '').toLowerCase();
    const token = String(req.body?.token || '').trim();
    const deviceId = req.body?.deviceId ? String(req.body.deviceId).trim() : null;
    if (!platform || !token) {
      return res.status(400).json({ success: false, error: 'platform and token are required', timestamp: nowIso() });
    }

    // Phase 32.3 — optional device metadata (backward compatible)
    const deviceName = req.body?.deviceName ? String(req.body.deviceName).slice(0, 120) : null;
    const appVersion = req.body?.appVersion ? String(req.body.appVersion).slice(0, 64) : null;
    const pushStatus = req.body?.pushStatus ? String(req.body.pushStatus).slice(0, 32) : 'active';
    const notificationCapable =
      req.body?.notificationCapable === undefined ? true : Boolean(req.body.notificationCapable);
    const capabilities =
      req.body?.capabilities && typeof req.body.capabilities === 'object' ? req.body.capabilities : undefined;

    const now = new Date();
    const record = await prisma.$transaction(async (tx) => {
      if (deviceId) {
        await tx.deviceToken.deleteMany({
          where: {
            userId,
            platform,
            deviceId,
            token: { not: token }
          }
        });
      }

      // Prefer extended upsert; fall back if Phase 32.3 columns missing
      try {
        return await (tx as any).deviceToken.upsert({
          where: { token },
          update: {
            userId,
            platform,
            deviceId,
            lastSeenAt: now,
            lastSyncAt: now,
            deviceName: deviceName || undefined,
            appVersion: appVersion || undefined,
            pushStatus,
            notificationCapable,
            capabilities
          },
          create: {
            userId,
            platform,
            token,
            deviceId: deviceId || null,
            lastSeenAt: now,
            lastSyncAt: now,
            deviceName,
            appVersion,
            pushStatus,
            notificationCapable,
            capabilities
          }
        });
      } catch {
        return tx.deviceToken.upsert({
          where: { token },
          update: { userId, platform, deviceId, lastSeenAt: now },
          create: { userId, platform, token, deviceId: deviceId || null, lastSeenAt: now }
        });
      }
    });

    console.log('[push] device token registered', {
      userId,
      platform,
      deviceId: deviceId || null,
      tokenPrefix: token.slice(0, 12),
      appVersion: appVersion || null
    });

    return res.json({
      success: true,
      data: {
        id: record.id,
        deviceId: (record as any).deviceId || deviceId,
        platform,
        pushStatus: (record as any).pushStatus || pushStatus
      },
      timestamp: nowIso()
    });
  } catch (error: any) {
    console.error('Register device token error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to register device token', timestamp: nowIso() });
  }
};

export const unregisterDevice = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized', timestamp: nowIso() });

    const token = String(req.body?.token || req.query?.token || '').trim();
    if (!token) {
      return res.status(400).json({ success: false, error: 'token is required', timestamp: nowIso() });
    }

    const removed = await prisma.deviceToken.deleteMany({ where: { token, userId } });
    console.log('[push] device token unregistered', {
      userId,
      removed: removed.count,
      tokenPrefix: token.slice(0, 12)
    });
    return res.json({ success: true, timestamp: nowIso() });
  } catch (error: any) {
    console.error('Unregister device token error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to unregister device token', timestamp: nowIso() });
  }
};
