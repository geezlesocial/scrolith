import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { applyAccountModerationAction } from '../services/accountModeration.service';

export const takeModerationAction = async (req: Request, res: Response) => {
  try {
    const { targetType, targetId, action, note } = req.body || {};
    if (!targetType || !targetId || !action) {
      return res.status(400).json({ success: false, error: 'Missing moderation parameters' });
    }

    if (targetType === 'post') {
      const normalizedAction = String(action || '').trim().toLowerCase();
      const nextStatus = normalizedAction === 'hide' ? 'draft' : 'deleted';
      await prisma.communityPost.update({ where: { id: targetId }, data: { status: nextStatus } });
      const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
      if (nextStatus === 'deleted') {
        try { io?.emit('community:post_deleted', { postId: targetId }); } catch (e) {}
        try { realtime.emitToPost(targetId, 'community:post_deleted', { postId: targetId }); } catch (e) {}
      } else {
        try { io?.emit('community:post_updated', { postId: targetId, status: nextStatus }); } catch (e) {}
        try { realtime.emitToPost(targetId, 'community:post_updated', { postId: targetId, status: nextStatus }); } catch (e) {}
      }
    }

    if (targetType === 'comment') {
      await prisma.communityPostComment.delete({ where: { id: targetId } });
      const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
      try { io?.emit('community:comment_deleted', { id: targetId }); } catch (e) {}
    }

    if (targetType === 'thread') {
      await prisma.forumThread.delete({ where: { id: targetId } });
      const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
      try { io?.emit('community:thread_deleted', { id: targetId }); } catch (e) {}
    }

    if (targetType === 'user' && ['warn', 'warning', 'strike', 'restrict', 'restriction', 'ban'].includes(String(action || '').toLowerCase())) {
      await applyAccountModerationAction({
        userId: targetId,
        actorId: req.user?.id || null,
        actorEmail: req.user?.email || null,
        actorRole: req.user?.role || null,
        action: String(action || '').toLowerCase() === 'ban'
          ? 'ban'
          : String(action || '').toLowerCase() === 'strike'
            ? 'strike'
            : String(action || '').toLowerCase() === 'restrict' || String(action || '').toLowerCase() === 'restriction'
              ? 'restriction'
              : 'warning',
        reason: note || 'Community moderation action',
        userMessage: note || null,
        restrictedFeatures: Array.isArray(req.body?.restrictedFeatures)
          ? req.body.restrictedFeatures
          : String(req.body?.restrictedFeatures || '').split(','),
        restrictionHours: Number(req.body?.restrictionHours || req.body?.durationHours || 0),
        source: 'community_moderation',
        sourceId: String(targetId || '')
      });
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Moderation action error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to take action' });
  }
};
