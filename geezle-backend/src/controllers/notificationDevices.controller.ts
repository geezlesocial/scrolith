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

    const record = await prisma.deviceToken.upsert({
      where: { token },
      update: { userId, platform, deviceId, lastSeenAt: new Date() },
      create: { userId, platform, token, deviceId: deviceId || null, lastSeenAt: new Date() }
    });

    console.log('[push] device token registered', {
      userId,
      platform,
      deviceId: deviceId || null,
      tokenPrefix: token.slice(0, 12)
    });

    return res.json({ success: true, data: { id: record.id }, timestamp: nowIso() });
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
