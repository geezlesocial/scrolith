import { Request, Response } from 'express';
import { NotificationPreferencesUserService } from '../services/notificationCenter/preferencesUser.service';
import { NotificationFocusModeService } from '../services/notificationCenter/focusMode.service';
import { NotificationDigestEngine } from '../services/notificationCenter/digestEngine.service';
import {
  createMyQuietHourRule,
  deactivateMyQuietHourRule,
  getMyQuietHours
} from '../services/journey.service';
import { NotificationDeliveryPolicy } from '../services/notificationCenter/delivery/NotificationDeliveryPolicy';

const authId = (req: Request) => req.user?.id as string | undefined;

const handle = (res: Response, error: any, fallback: string) => {
  const status = Number(error?.statusCode || 500);
  return res.status(status).json({
    success: false,
    code: error?.code,
    error: error?.message || fallback
  });
};

export const getPreferencesBundle = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await NotificationPreferencesUserService.getAll(userId);
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to load preferences');
  }
};

export const patchPreferencesGlobal = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await NotificationPreferencesUserService.patchGlobal(
      userId,
      req.body || {},
      req.body?.version
    );
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to update preferences');
  }
};

export const patchPreferenceCategory = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await NotificationPreferencesUserService.patchCategory(
      userId,
      String(req.params.category || ''),
      req.body || {}
    );
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to update category preference');
  }
};

export const patchPreferenceEvent = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await NotificationPreferencesUserService.patchEvent(
      userId,
      String(req.params.eventType || ''),
      req.body || {}
    );
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to update event preference');
  }
};

export const resetPreferences = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await NotificationPreferencesUserService.reset(userId);
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to reset preferences');
  }
};

export const putQuietHours = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    // Replace strategy: create new active rule (existing create API)
    const data = await createMyQuietHourRule(userId, req.body || {});
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to save quiet hours');
  }
};

export const getFocusMode = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await NotificationFocusModeService.getActive(userId);
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to load focus mode');
  }
};

export const startFocusMode = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await NotificationFocusModeService.start(userId, req.body || {});
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to start focus mode');
  }
};

export const stopFocusMode = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await NotificationFocusModeService.stop(userId);
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to stop focus mode');
  }
};

export const getDigestSettings = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await NotificationDigestEngine.getSchedule(userId);
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to load digest settings');
  }
};

export const putDigestSettings = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await NotificationDigestEngine.putSchedule(userId, req.body || {});
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to save digest settings');
  }
};

export const listDigests = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await NotificationDigestEngine.listDigests(userId, Number(req.query?.limit || 20));
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to list digests');
  }
};

export const getDigest = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await NotificationDigestEngine.getDigest(userId, String(req.params.digestId || ''));
    if (!data) return res.status(404).json({ success: false, error: 'Digest not found' });
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to load digest');
  }
};

export const markDigestRead = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await NotificationDigestEngine.markDigestRead(userId, String(req.params.digestId || ''));
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to mark digest read');
  }
};

/** Debug/evaluate endpoint for policy decisions (authenticated self only) */
export const evaluateDeliveryPolicy = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const body = req.body || {};
    const data = await NotificationDeliveryPolicy.evaluate({
      userId,
      eventType: body.eventType || body.type || 'system',
      category: body.category || 'system',
      channel: body.channel || 'PUSH',
      priority: body.priority,
      actorId: body.actorId,
      conversationId: body.conversationId,
      isMandatorySecurity: body.isMandatorySecurity,
      isEmergencySystem: body.isEmergencySystem,
      timezone: body.timezone
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to evaluate policy');
  }
};

// Re-export quiet hours list for PUT alias documentation
export { getMyQuietHours, deactivateMyQuietHourRule };
