/**
 * Phase 29.2 — pin + catch-up HTTP endpoints (REST/socket parity helpers).
 */
import { Request, Response } from 'express';
import { pinMessage, unpinMessage, listGroupPins } from '../services/messaging/groupPinService';
import { buildGroupCatchup } from '../services/messaging/groupCatchup';
import { groupMetrics } from '../services/messaging/groupMetrics';

const resolveUserId = (req: Request) => {
  const id = req.user?.id;
  return typeof id === 'string' && id.length ? id : '';
};

/** POST /messages/groups/:id/pins  { messageId } */
export const postGroupPin = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const messageId = String(req.body?.messageId || req.body?.message_id || '').trim();
    const result = await pinMessage({ conversationId, messageId, actorId: userId });
    if (result.ok === false) {
      const status = result.code === 'GROUP_NOT_MEMBER' ? 403 : result.code === 'GROUP_PERMISSION_DENIED' ? 403 : 400;
      return res.status(status).json({ success: false, error: result.error, code: result.code });
    }
    return res.json({ success: true, data: { pins: result.pins, action: result.action } });
  } catch (e: any) {
    console.error('postGroupPin', e);
    return res.status(500).json({ success: false, error: e?.message || 'Pin failed' });
  }
};

/** DELETE /messages/groups/:id/pins/:messageId */
export const deleteGroupPin = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const messageId = String(req.params.messageId || '').trim();
    const result = await unpinMessage({ conversationId, messageId, actorId: userId });
    if (result.ok === false) {
      const status = result.code === 'GROUP_NOT_MEMBER' ? 403 : result.code === 'GROUP_PERMISSION_DENIED' ? 403 : 400;
      return res.status(status).json({ success: false, error: result.error, code: result.code });
    }
    return res.json({ success: true, data: { pins: result.pins, action: result.action } });
  } catch (e: any) {
    console.error('deleteGroupPin', e);
    return res.status(500).json({ success: false, error: e?.message || 'Unpin failed' });
  }
};

/** GET /messages/groups/:id/pins */
export const getGroupPins = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const pins = await listGroupPins(conversationId);
    return res.json({ success: true, data: pins });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e?.message || 'Failed to list pins' });
  }
};

/** GET /messages/groups/:id/catchup?cursor=&limit= */
export const getGroupCatchup = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const result = await buildGroupCatchup({
      conversationId,
      userId,
      cursor: String(req.query.cursor || '') || null,
      limit: Number(req.query.limit || 50)
    });
    if (!result.ok) {
      return res.status(result.code === 'GROUP_NOT_MEMBER' ? 403 : 404).json({
        success: false,
        error: result.error,
        code: result.code
      });
    }
    return res.json({ success: true, data: result.data });
  } catch (e: any) {
    console.error('getGroupCatchup', e);
    return res.status(500).json({ success: false, error: e?.message || 'Catch-up failed' });
  }
};

/** GET /messages/groups/metrics — ops snapshot (no PII content) */
export const getGroupRealtimeMetrics = async (_req: Request, res: Response) => {
  return res.json({ success: true, data: groupMetrics.snapshot() });
};
