import type { Request, Response } from 'express';
import prisma from '../../../utils/prismaClient';
import { resolveActorFromRequest } from '../../../services/scrolitha/scrolitha.audit';
import { getInsightsConfig, updateInsightsConfig } from '../policies/insights.config';
import {
  buildWeeklyLeaderboard,
  recomputeAllProfessionalScores,
  recomputeProfessionalScore
} from '../services/insights.service';

const fail = (res: Response, message: string, error: any, status = 500) =>
  res.status(status).json({
    success: false,
    data: null,
    message,
    error: String(error?.message || 'Unknown error')
  });

export const getAdminInsightsConfigController = async (_req: Request, res: Response) => {
  try {
    const data = await getInsightsConfig();
    return res.json({ success: true, data, message: 'Insights config loaded' });
  } catch (error) {
    return fail(res, 'Failed to load insights config', error);
  }
};

export const putAdminInsightsConfigController = async (req: Request, res: Response) => {
  try {
    const actor = resolveActorFromRequest(req);
    const data = await updateInsightsConfig(req.body || {});
    const io = req.app.get('io');
    const communityNs = req.app.get('communityNs');
    io?.emit('insights:config_updated', { updatedBy: actor.id, updatedAt: new Date().toISOString() });
    communityNs?.emit('insights:config_updated', { updatedBy: actor.id, updatedAt: new Date().toISOString() });
    return res.json({ success: true, data, message: 'Insights config updated' });
  } catch (error) {
    return fail(res, 'Failed to update insights config', error);
  }
};

export const postAdminRecomputeUserController = async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return res.status(400).json({ success: false, data: null, message: 'userId is required' });
    const data = await recomputeProfessionalScore(userId, req.app);
    return res.json({ success: true, data, message: 'User insights recomputed' });
  } catch (error) {
    return fail(res, 'Failed to recompute user insights', error);
  }
};

export const postAdminRecomputeAllController = async (req: Request, res: Response) => {
  try {
    const limit = Number(req.body?.limit || req.query?.limit || 300);
    const data = await recomputeAllProfessionalScores({ limit, app: req.app });
    return res.json({ success: true, data, message: 'Insights recompute queue completed' });
  } catch (error) {
    return fail(res, 'Failed to recompute insights', error);
  }
};

export const getAdminAchievementsController = async (_req: Request, res: Response) => {
  try {
    const data = await prisma.achievement.findMany({ orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }] });
    return res.json({ success: true, data, message: 'Achievements loaded' });
  } catch (error) {
    return fail(res, 'Failed to load achievements', error);
  }
};

export const postAdminAchievementController = async (req: Request, res: Response) => {
  try {
    const key = String(req.body?.key || '').trim().toUpperCase();
    const title = String(req.body?.title || '').trim();
    if (!key || !title) {
      return res.status(400).json({ success: false, data: null, message: 'key and title are required' });
    }
    const data = await prisma.achievement.create({
      data: {
        key,
        title,
        description: req.body?.description ? String(req.body.description) : null,
        tier: String(req.body?.tier || 'bronze'),
        rules: req.body?.rules || {},
        isActive: req.body?.isActive !== false
      }
    });
    return res.status(201).json({ success: true, data, message: 'Achievement created' });
  } catch (error) {
    return fail(res, 'Failed to create achievement', error);
  }
};

export const putAdminAchievementController = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, data: null, message: 'id is required' });
    const data = await prisma.achievement.update({
      where: { id },
      data: {
        title: req.body?.title !== undefined ? String(req.body.title || '').trim() : undefined,
        description: req.body?.description !== undefined ? (req.body.description ? String(req.body.description) : null) : undefined,
        tier: req.body?.tier !== undefined ? String(req.body.tier || 'bronze') : undefined,
        rules: req.body?.rules !== undefined ? req.body.rules || {} : undefined,
        isActive: typeof req.body?.isActive === 'boolean' ? req.body.isActive : undefined
      }
    });
    return res.json({ success: true, data, message: 'Achievement updated' });
  } catch (error) {
    return fail(res, 'Failed to update achievement', error);
  }
};

export const toggleAdminAchievementController = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, data: null, message: 'id is required' });
    const row = await prisma.achievement.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ success: false, data: null, message: 'Achievement not found' });
    const data = await prisma.achievement.update({
      where: { id },
      data: { isActive: !row.isActive }
    });
    return res.json({ success: true, data, message: 'Achievement status toggled' });
  } catch (error) {
    return fail(res, 'Failed to toggle achievement', error);
  }
};

export const getAdminLeaderboardController = async (req: Request, res: Response) => {
  try {
    const weekKey = String(req.params.weekKey || '').trim() || undefined;
    const scope = String(req.query.scope || 'global');
    const data = await buildWeeklyLeaderboard(scope, req.app);
    if (weekKey && data.weekKey !== weekKey) {
      const historical = await prisma.weeklyLeaderboard.findMany({
        where: { weekKey, scope: String(scope || 'global').trim().toLowerCase() },
        orderBy: { builtAt: 'desc' },
        take: 1
      });
      if (historical[0]) {
        return res.json({ success: true, data: historical[0], message: 'Leaderboard loaded' });
      }
    }
    return res.json({ success: true, data, message: 'Leaderboard loaded' });
  } catch (error) {
    return fail(res, 'Failed to load leaderboard', error);
  }
};

export const postAdminLeaderboardRebuildController = async (req: Request, res: Response) => {
  try {
    const scopes = Array.isArray(req.body?.scopes) ? req.body.scopes : ['global', 'freelancer', 'employer'];
    const results = [];
    for (const scope of scopes) {
      const row = await buildWeeklyLeaderboard(scope, req.app);
      results.push(row);
    }
    return res.json({
      success: true,
      data: {
        rebuilt: results.length,
        items: results
      },
      message: 'Leaderboards rebuilt'
    });
  } catch (error) {
    return fail(res, 'Failed to rebuild leaderboard', error);
  }
};

