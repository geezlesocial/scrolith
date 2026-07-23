import { Request, Response } from 'express';
import {
  getChatAppearance,
  setChatAppearance,
  resetChatAppearance
} from '../services/messaging/chatAppearanceService';

const resolveUserId = (req: Request) => {
  const id = req.user?.id;
  return typeof id === 'string' && id.length ? id : '';
};

const emitToUser = (req: Request, userId: string, event: string, payload: any) => {
  try {
    const ns = req.app.get('communityNs');
    if (ns && typeof ns.to === 'function' && userId) {
      ns.to(`community:user:${userId}`).emit(event, payload);
    }
  } catch {
    /* non-fatal */
  }
};

/** GET /messages/conversations/:id/appearance */
export const getConversationAppearance = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const data = await getChatAppearance(conversationId, userId);
    return res.json({ success: true, data });
  } catch (e: any) {
    const status = e?.status || (e?.code === 'NOT_FOUND' ? 404 : 500);
    return res.status(status).json({ success: false, error: e?.message || 'Failed to load appearance' });
  }
};

/** PUT /messages/conversations/:id/appearance */
export const putConversationAppearance = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const data = await setChatAppearance(conversationId, userId, req.body || {});
    emitToUser(req, userId, 'messages:appearance_updated', { conversationId, appearance: data });
    return res.json({ success: true, data });
  } catch (e: any) {
    const status = e?.status || (e?.code === 'NOT_FOUND' ? 404 : e?.message?.includes('Invalid') ? 400 : 500);
    return res.status(status).json({ success: false, error: e?.message || 'Failed to save appearance' });
  }
};

/** DELETE /messages/conversations/:id/appearance */
export const deleteConversationAppearance = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    const data = await resetChatAppearance(conversationId, userId);
    emitToUser(req, userId, 'messages:appearance_updated', { conversationId, appearance: data });
    return res.json({ success: true, data });
  } catch (e: any) {
    const status = e?.status || (e?.code === 'NOT_FOUND' ? 404 : 500);
    return res.status(status).json({ success: false, error: e?.message || 'Failed to reset appearance' });
  }
};
