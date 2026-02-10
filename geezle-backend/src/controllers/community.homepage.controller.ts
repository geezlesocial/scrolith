import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const HOMEPAGE_SCOPE = 'community_homepage';

const defaultHomepage = {
  hero: {
    title: 'Scrolith Community',
    subtitle: 'Connect with fellow freelancers, share knowledge, and grow together',
    backgroundImage: '',
    backgroundColor: '#4f46e5'
  },
  banner: {
    enabled: true,
    text: 'Security Notice: Do not share sensitive personal information (Passwords, bank details, government IDs). AI Moderation is active in all chats.'
  },
  sliders: [],
  sections: []
};

const ok = (res: Response, data: any) => res.json({ success: true, data });

export const getCommunityHomepage = async (_req: Request, res: Response) => {
  try {
    const existing = await prisma.appSetting.findUnique({ where: { scope: HOMEPAGE_SCOPE } });
    if (!existing) return ok(res, defaultHomepage);
    return ok(res, existing.data || defaultHomepage);
  } catch (error: any) {
    console.error('Failed to load community homepage config:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load homepage config' });
  }
};

export const updateCommunityHomepage = async (req: Request, res: Response) => {
  try {
    const payload = req.body?.data ?? req.body ?? {};
    const merged = { ...defaultHomepage, ...(payload || {}) };
    const updated = await prisma.appSetting.upsert({
      where: { scope: HOMEPAGE_SCOPE },
      create: { scope: HOMEPAGE_SCOPE, data: merged },
      update: { data: merged }
    });
    const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
    try { io?.emit('community:homepage_updated', { config: updated.data }); } catch (e) {}
    return ok(res, updated.data);
  } catch (error: any) {
    console.error('Failed to update community homepage config:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update homepage config' });
  }
};

