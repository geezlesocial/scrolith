import type { Request, Response } from 'express';
import prisma from '../../../utils/prismaClient';
import { resolveActorFromRequest } from '../../../services/scrolitha/scrolitha.audit';
import { DEFAULT_INSIGHTS_CONFIG, getInsightsConfig, updateInsightsConfig } from '../policies/insights.config';
import {
  createAdminCreatorChallenge,
  finalizeAdminCreatorChallenge,
  getAdminCreatorChallenges,
  toggleAdminCreatorChallenge,
  updateAdminCreatorChallenge
} from '../services/creatorChallenge.service';
import {
  buildWeeklyLeaderboard,
  createAdminQuestCatalog,
  getAdminQuestCatalog,
  recomputeAllProfessionalScores,
  recomputeProfessionalScore,
  toggleAdminQuestCatalog,
  updateAdminQuestCatalog
} from '../services/insights.service';

const INSIGHTS_SCHEMA_TOKENS = [
  'appsetting',
  'achievement',
  'creatorchallenge',
  'creatorchallengeentry',
  'creatorchallengevote',
  'questcatalog',
  'weeklyleaderboard',
  'professionalscore',
  'insightevent'
];

const isInsightsSchemaUnavailable = (error: any, extraTokens: string[] = []) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').replace(/\s+/g, ' ').toLowerCase();
  const metaModel = String(error?.meta?.modelName || '').toLowerCase();
  const metaTable = String(error?.meta?.table || '').toLowerCase();

  if (code === 'P2021' || code === 'P2022' || code === 'P2010') return true;

  const hasMissingSignal =
    message.includes('the table') ||
    message.includes('relation') ||
    message.includes('does not exist') ||
    message.includes('does not contain') ||
    message.includes('unknown field') ||
    message.includes('unknown argument');
  if (!hasMissingSignal) return false;

  const tokens = Array.from(
    new Set(
      [...INSIGHTS_SCHEMA_TOKENS, ...extraTokens]
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );

  if (tokens.some((token) => message.includes(token))) return true;
  if (tokens.some((token) => metaModel.includes(token))) return true;
  if (tokens.some((token) => metaTable.includes(token))) return true;
  return message.includes('insight') || message.includes('quest');
};

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
    if (isInsightsSchemaUnavailable(error, ['appsetting'])) {
      return res.json({ success: true, data: DEFAULT_INSIGHTS_CONFIG, message: 'Insights config loaded' });
    }
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
    if (isInsightsSchemaUnavailable(error, ['achievement'])) {
      return res.json({ success: true, data: [], message: 'Achievements loaded' });
    }
    return fail(res, 'Failed to load achievements', error);
  }
};

export const getAdminCreatorChallengesController = async (req: Request, res: Response) => {
  try {
    const weekKey = String(req.query.weekKey || '').trim() || null;
    const data = await getAdminCreatorChallenges(weekKey);
    return res.json({ success: true, data, message: 'Creator challenges loaded' });
  } catch (error) {
    if (isInsightsSchemaUnavailable(error, ['creatorchallenge', 'creatorchallengeentry', 'creatorchallengevote'])) {
      return res.json({ success: true, data: [], message: 'Creator challenges loaded' });
    }
    return fail(res, 'Failed to load creator challenges', error);
  }
};

export const postAdminCreatorChallengeController = async (req: Request, res: Response) => {
  try {
    const actor = resolveActorFromRequest(req);
    const data = await createAdminCreatorChallenge({
      actorUserId: actor.id || null,
      payload: req.body || {},
      app: req.app
    });
    return res.status(201).json({ success: true, data, message: 'Creator challenge created' });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to create creator challenge');
    if (message.toLowerCase().includes('required') || message.toLowerCase().includes('valid')) {
      return fail(res, message, error, 400);
    }
    return fail(res, 'Failed to create creator challenge', error);
  }
};

export const putAdminCreatorChallengeController = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, data: null, message: 'id is required' });
    const actor = resolveActorFromRequest(req);
    const data = await updateAdminCreatorChallenge({
      id,
      actorUserId: actor.id || null,
      payload: req.body || {},
      app: req.app
    });
    return res.json({ success: true, data, message: 'Creator challenge updated' });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to update creator challenge');
    if (message.toLowerCase().includes('not found')) return fail(res, message, error, 404);
    if (message.toLowerCase().includes('required') || message.toLowerCase().includes('valid')) {
      return fail(res, message, error, 400);
    }
    return fail(res, 'Failed to update creator challenge', error);
  }
};

export const toggleAdminCreatorChallengeController = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, data: null, message: 'id is required' });
    const actor = resolveActorFromRequest(req);
    const data = await toggleAdminCreatorChallenge({
      id,
      actorUserId: actor.id || null,
      app: req.app
    });
    return res.json({ success: true, data, message: 'Creator challenge status toggled' });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to toggle creator challenge');
    if (message.toLowerCase().includes('not found')) return fail(res, message, error, 404);
    return fail(res, 'Failed to toggle creator challenge', error);
  }
};

export const finalizeAdminCreatorChallengeController = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, data: null, message: 'id is required' });
    const data = await finalizeAdminCreatorChallenge({
      id,
      app: req.app
    });
    return res.json({ success: true, data, message: 'Creator challenge finalized' });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to finalize creator challenge');
    if (message.toLowerCase().includes('not found')) return fail(res, message, error, 404);
    return fail(res, 'Failed to finalize creator challenge', error);
  }
};

export const getAdminQuestCatalogController = async (_req: Request, res: Response) => {
  try {
    const data = await getAdminQuestCatalog();
    return res.json({ success: true, data, message: 'Quest catalog loaded' });
  } catch (error) {
    if (isInsightsSchemaUnavailable(error, ['questcatalog'])) {
      return res.json({ success: true, data: [], message: 'Quest catalog loaded' });
    }
    return fail(res, 'Failed to load quest catalog', error);
  }
};

export const postAdminQuestCatalogController = async (req: Request, res: Response) => {
  try {
    const key = String(req.body?.key || '').trim();
    const title = String(req.body?.title || '').trim();
    if (!key || !title) {
      return res.status(400).json({ success: false, data: null, message: 'key and title are required' });
    }
    const actor = resolveActorFromRequest(req);
    const data = await createAdminQuestCatalog({
      actorUserId: actor.id || null,
      key,
      title,
      description: req.body?.description,
      roleScope: req.body?.roleScope,
      difficulty: req.body?.difficulty,
      verificationRules: req.body?.verificationRules,
      reward: req.body?.reward,
      isWeekly: req.body?.isWeekly,
      rotationWeight: req.body?.rotationWeight,
      isActive: req.body?.isActive
    });
    return res.status(201).json({ success: true, data, message: 'Quest created' });
  } catch (error) {
    return fail(res, 'Failed to create quest', error);
  }
};

export const putAdminQuestCatalogController = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, data: null, message: 'id is required' });
    const actor = resolveActorFromRequest(req);
    const data = await updateAdminQuestCatalog({
      id,
      actorUserId: actor.id || null,
      title: req.body?.title,
      description: req.body?.description,
      roleScope: req.body?.roleScope,
      difficulty: req.body?.difficulty,
      verificationRules: req.body?.verificationRules,
      reward: req.body?.reward,
      isWeekly: req.body?.isWeekly,
      rotationWeight: req.body?.rotationWeight,
      isActive: req.body?.isActive
    });
    return res.json({ success: true, data, message: 'Quest updated' });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to update quest');
    if (message.toLowerCase().includes('not found')) return fail(res, message, error, 404);
    return fail(res, 'Failed to update quest', error);
  }
};

export const toggleAdminQuestCatalogController = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, data: null, message: 'id is required' });
    const actor = resolveActorFromRequest(req);
    const data = await toggleAdminQuestCatalog({ id, actorUserId: actor.id || null });
    return res.json({ success: true, data, message: 'Quest status toggled' });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to toggle quest');
    if (message.toLowerCase().includes('not found')) return fail(res, message, error, 404);
    return fail(res, 'Failed to toggle quest', error);
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
    if (isInsightsSchemaUnavailable(error, ['weeklyleaderboard', 'professionalscore'])) {
      return res.json({
        success: true,
        data: {
          weekKey: String(req.params.weekKey || ''),
          scope: String(req.query.scope || 'global'),
          entries: [],
          builtAt: new Date().toISOString()
        },
        message: 'Leaderboard loaded'
      });
    }
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
