import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const REACTIONS_SCOPE = 'community_reactions';
const defaultReactions = [
  { id: 'like', label: 'Like', enabled: true },
  { id: 'love', label: 'Love', enabled: true },
  { id: 'cry', label: 'Cry', enabled: true },
  { id: 'angry', label: 'Angry', enabled: true },
  { id: 'hug', label: 'Hug', enabled: true },
  { id: 'happy', label: 'Happy', enabled: true }
];

export const getReactionsConfig = async (_req: Request, res: Response) => {
  try {
    const setting = await prisma.appSetting.findUnique({ where: { scope: REACTIONS_SCOPE } });
    const data = (setting?.data as any) || { reactions: defaultReactions };
    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('Get reactions config error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load reactions config' });
  }
};

export const updateReactionsConfig = async (req: Request, res: Response) => {
  try {
    const payload = req.body?.reactions ? { reactions: req.body.reactions } : req.body || {};
    const upserted = await prisma.appSetting.upsert({
      where: { scope: REACTIONS_SCOPE },
      create: { scope: REACTIONS_SCOPE, data: payload },
      update: { data: payload }
    });
    const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
    try { io?.emit('community:reactions_updated', { data: upserted.data }); } catch (e) {}
    return res.json({ success: true, data: upserted.data });
  } catch (error: any) {
    console.error('Update reactions config error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update reactions config' });
  }
};
