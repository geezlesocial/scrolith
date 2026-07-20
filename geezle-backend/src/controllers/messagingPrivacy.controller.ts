/**
 * Phase 22.3B — GET/PATCH messaging privacy settings.
 */
import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import {
  getMessagingPrivacySettings,
  invalidateMessagingPrivacyCache,
  MESSAGING_PRIVACY_DEFAULTS,
  MESSAGING_PRIVACY_VERSION,
  normalizeDmAudience,
  normalizePrivacyAudience,
  type MessagingPrivacySettings
} from '../services/messaging/messagingPrivacyPolicy';

const resolveUserId = (req: Request) => {
  const id = req.user?.id;
  return typeof id === 'string' && id.length ? id : '';
};

const emitPrivacyUpdated = (req: Request, userId: string, settings: MessagingPrivacySettings) => {
  try {
    const io = (req as any).app?.get?.('io') || (global as any).io;
    if (!io || !userId) return;
    const communityNs = typeof io.of === 'function' ? io.of('/community') : null;
    const payload = {
      userId,
      updatedAt: settings.updatedAt,
      version: MESSAGING_PRIVACY_VERSION,
      // Self-only full settings
      settings
    };
    if (communityNs) {
      communityNs.to(`community:user:${userId}`).emit('messages:privacy:updated', payload);
    }
  } catch {
    /* best-effort */
  }
};

/** GET /messages/settings/privacy */
export const getMessagingPrivacy = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const settings = await getMessagingPrivacySettings(userId);
    return res.json({
      success: true,
      data: { settings, version: MESSAGING_PRIVACY_VERSION }
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || 'Failed to load privacy settings' });
  }
};

/** PATCH /messages/settings/privacy */
export const patchMessagingPrivacy = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const body = req.body || {};
    const data: any = {};
    const now = new Date();

    if (body.onlineStatusVisibility !== undefined || body.presenceVisibility !== undefined) {
      data.presenceVisibility = normalizePrivacyAudience(
        body.onlineStatusVisibility ?? body.presenceVisibility
      );
    }
    if (body.lastSeenVisibility !== undefined) {
      data.lastSeenVisibility = normalizePrivacyAudience(body.lastSeenVisibility);
    }
    if (body.readReceiptsEnabled !== undefined) {
      data.readReceiptsEnabled = Boolean(body.readReceiptsEnabled);
    }
    if (body.typingIndicatorsEnabled !== undefined) {
      data.typingIndicatorsEnabled = Boolean(body.typingIndicatorsEnabled);
    }
    if (body.recordingIndicatorsEnabled !== undefined) {
      data.recordingIndicatorsEnabled = Boolean(body.recordingIndicatorsEnabled);
    }
    if (body.directMessageAudience !== undefined) {
      data.directMessageAudience = normalizeDmAudience(body.directMessageAudience);
    }
    if (body.groupInviteAudience !== undefined) {
      data.groupInviteAudience = normalizePrivacyAudience(body.groupInviteAudience);
    }
    if (body.notificationMessagePreviewEnabled !== undefined) {
      data.notificationMessagePreviewEnabled = Boolean(body.notificationMessagePreviewEnabled);
    }

    if (!Object.keys(data).length) {
      const settings = await getMessagingPrivacySettings(userId);
      return res.json({ success: true, data: { settings, unchanged: true } });
    }

    data.messagingPrivacyUpdatedAt = now;

    try {
      await prisma.user.update({ where: { id: userId }, data });
    } catch (e: any) {
      // Fallback: only presenceVisibility if new columns missing
      if (data.presenceVisibility) {
        await prisma.user.update({
          where: { id: userId },
          data: { presenceVisibility: data.presenceVisibility } as any
        });
      } else {
        return res.status(500).json({
          success: false,
          error: e?.message || 'Failed to save privacy settings (migration may be pending)'
        });
      }
    }

    invalidateMessagingPrivacyCache(userId);
    const settings = await getMessagingPrivacySettings(userId);
    emitPrivacyUpdated(req, userId, settings);
    return res.json({ success: true, data: { settings, version: MESSAGING_PRIVACY_VERSION } });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || 'Failed to update privacy settings' });
  }
};

export const defaultMessagingPrivacy = () => ({ ...MESSAGING_PRIVACY_DEFAULTS });
