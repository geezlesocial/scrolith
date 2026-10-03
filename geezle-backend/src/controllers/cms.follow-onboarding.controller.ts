import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { recordGovernedAdminAction } from '../services/enterpriseGovernance.service';
import {
  DEFAULT_FOLLOW_ONBOARDING_CONTENT,
  followOnboardingContentSchema
} from '../utils/followOnboardingContent';

const CONTENT_SCOPE = 'cms_follow_onboarding';

const emitContentUpdate = (req: Request, payload: unknown) => {
  const io = req.app.get('io');
  const communityIo = req.app.get('communityIo');
  io?.emit('cms:follow_onboarding_updated', payload);
  communityIo?.emit('cms:follow_onboarding_updated', payload);
};

export const getFollowOnboardingContent = async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  try {
    const setting = await prisma.appSetting.findUnique({ where: { scope: CONTENT_SCOPE } });
    if (setting?.data == null) return res.json({ success: true, data: DEFAULT_FOLLOW_ONBOARDING_CONTENT });
    const parsed = followOnboardingContentSchema.safeParse(setting.data);
    if (!parsed.success) return res.status(500).json({ error: 'Saved onboarding content is invalid' });
    return res.json({ success: true, data: parsed.data });
  } catch {
    return res.status(500).json({ error: 'Unable to load onboarding content' });
  }
};

export const saveFollowOnboardingContent = async (req: Request, res: Response) => {
  const parsed = followOnboardingContentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid onboarding content', issues: parsed.error.issues.map(({ path, code }) => ({ path, code })) });
  }

  try {
    const content = { ...parsed.data, updatedAt: new Date().toISOString() };
    await prisma.appSetting.upsert({
      where: { scope: CONTENT_SCOPE },
      create: { scope: CONTENT_SCOPE, data: content },
      update: { data: content }
    });
    try {
      await recordGovernedAdminAction(req, {
        moduleKey: 'cms',
        actionKey: 'follow_onboarding.content.update',
        entityType: 'app_setting',
        entityId: CONTENT_SCOPE,
        message: 'Updated follow-onboarding presentation content',
        metadata: { featureCardCount: content.featureCards.length }
      });
    } catch {
      console.warn('[cms] Follow-onboarding content saved but audit recording failed');
    }
    emitContentUpdate(req, content);
    return res.json({ success: true, data: content });
  } catch {
    return res.status(500).json({ error: 'Unable to save onboarding content' });
  }
};
