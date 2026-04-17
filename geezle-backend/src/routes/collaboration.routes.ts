import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  createCollaborationRoom,
  getCollaborationRoom,
  listCollaborationRooms,
  recordCollaborationActivity
} from '../services/phase2.service';

const router = express.Router();

const handleError = (res: express.Response, error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const lower = message.toLowerCase();
  const status =
    lower.includes('not found') ? 404 :
    lower.includes('required') || lower.includes('participant') ? 400 :
    lower.includes('auth') ? 401 :
    500;
  if (status >= 500) console.error('[collaboration] request failed', error);
  return res.status(status).json({ success: false, error: message || fallback });
};

const emitRoomEvent = (req: express.Request, event: string, room: any, extra?: Record<string, any>) => {
  try {
    const ns = req.app.get('communityNs') || req.app.get('io');
    if (!ns) return;
    const payload = { roomId: room?.id, room, ...(extra || {}), emittedAt: new Date().toISOString() };
    ns.to?.(`collaboration:room:${room?.id}`)?.emit?.(event, payload);
    const participants = Array.isArray(room?.participants) ? room.participants : [];
    participants.forEach((participant: any) => {
      const userId = String(participant?.userId || '').trim();
      if (userId) ns.to?.(`community:user:${userId}`)?.emit?.(event, payload);
    });
  } catch (error) {
    console.warn('[collaboration] realtime emit failed', error);
  }
};

router.get('/rooms', authMiddleware, async (req, res) => {
  try {
    const data = await listCollaborationRooms(String(req.user?.id || ''), { limit: req.query.limit });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to list collaboration rooms');
  }
});

router.post('/rooms', authMiddleware, async (req, res) => {
  try {
    const room = await createCollaborationRoom(String(req.user?.id || ''), req.body || {});
    emitRoomEvent(req, 'collaboration:room_created', room);
    return res.status(201).json({ success: true, data: room });
  } catch (error) {
    return handleError(res, error, 'Failed to create collaboration room');
  }
});

router.get('/rooms/:roomId', authMiddleware, async (req, res) => {
  try {
    const room = await getCollaborationRoom(String(req.user?.id || ''), req.params.roomId);
    return res.json({ success: true, data: room });
  } catch (error) {
    return handleError(res, error, 'Failed to load collaboration room');
  }
});

router.post('/rooms/:roomId/activity', authMiddleware, async (req, res) => {
  try {
    const activity = await recordCollaborationActivity(String(req.user?.id || ''), req.params.roomId, req.body || {});
    const room = await getCollaborationRoom(String(req.user?.id || ''), req.params.roomId);
    emitRoomEvent(req, 'collaboration:activity', room, { activity });
    return res.status(201).json({ success: true, data: { room, activity } });
  } catch (error) {
    return handleError(res, error, 'Failed to record collaboration activity');
  }
});

router.post('/rooms/:roomId/presence', authMiddleware, async (req, res) => {
  try {
    const room = await getCollaborationRoom(String(req.user?.id || ''), req.params.roomId);
    const presence = {
      roomId: room.id,
      userId: req.user?.id,
      status: String(req.body?.status || 'active').trim().slice(0, 32) || 'active',
      cursor: req.body?.cursor || null,
      section: req.body?.section || null,
      at: new Date().toISOString()
    };
    emitRoomEvent(req, 'collaboration:presence', room, { presence });
    return res.json({ success: true, data: presence });
  } catch (error) {
    return handleError(res, error, 'Failed to update collaboration presence');
  }
});

export default router;
