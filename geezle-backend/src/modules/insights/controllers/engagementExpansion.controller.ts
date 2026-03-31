import type { Request, Response } from 'express';
import {
  activateEventSeasonPass,
  answerExpertBountyQuestion,
  awardExpertBounty,
  createExpertBountyQuestion,
  getEngagementExpansionSummary,
  submitSkillMiniGameAnswer,
  subscribeFanChannel,
  unlockPremiumSeries
} from '../services/engagementExpansion.service';

const getUserId = (req: Request) => String((req as any)?.user?.id || '').trim();

const fail = (res: Response, message: string, error: any, status = 500) =>
  res.status(status).json({
    success: false,
    data: null,
    message,
    error: String(error?.message || 'Unknown error')
  });

export const getEngagementExpansionController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const data = await getEngagementExpansionSummary(userId);
    return res.json({ success: true, data, message: 'Engagement discovery loaded.' });
  } catch (error) {
    return fail(res, 'Failed to load engagement discovery', error);
  }
};

export const subscribeFanChannelController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const channelId = String(req.params.channelId || '').trim();
    if (!channelId) return fail(res, 'channelId is required', new Error('channelId is required'), 400);
    const data = await subscribeFanChannel({ userId, channelId, app: req.app });
    return res.json({ success: true, data, message: 'Fan channel subscription updated.' });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to subscribe to the fan channel');
    if (message.toLowerCase().includes('required')) return fail(res, message, error, 400);
    if (message.toLowerCase().includes('not found')) return fail(res, message, error, 404);
    if (
      message.toLowerCase().includes('own') ||
      message.toLowerCase().includes('private') ||
      message.toLowerCase().includes('follow it directly') ||
      message.toLowerCase().includes('insufficient')
    ) {
      return fail(res, message, error, 409);
    }
    return fail(res, 'Failed to subscribe to the fan channel', error);
  }
};

export const submitSkillMiniGameController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const gameId = String(req.params.gameId || '').trim();
    const choiceId = String(req.body?.choiceId || '').trim();
    if (!gameId) return fail(res, 'gameId is required', new Error('gameId is required'), 400);
    if (!choiceId) return fail(res, 'choiceId is required', new Error('choiceId is required'), 400);
    const data = await submitSkillMiniGameAnswer({ userId, gameId, choiceId });
    return res.json({ success: true, data, message: 'Mini-game submitted.' });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to submit the mini-game');
    if (message.toLowerCase().includes('required') || message.toLowerCase().includes('choose')) {
      return fail(res, message, error, 400);
    }
    if (message.toLowerCase().includes('not found')) return fail(res, message, error, 404);
    if (message.toLowerCase().includes('already')) return fail(res, message, error, 409);
    return fail(res, 'Failed to submit the mini-game', error);
  }
};

export const activateEventSeasonPassController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const seasonId = String(req.params.seasonId || '').trim();
    const passId = String(req.params.passId || '').trim();
    if (!seasonId) return fail(res, 'seasonId is required', new Error('seasonId is required'), 400);
    if (!passId) return fail(res, 'passId is required', new Error('passId is required'), 400);
    const data = await activateEventSeasonPass({ userId, seasonId, passId });
    return res.json({ success: true, data, message: 'Season pass activated.' });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to activate the season pass');
    if (message.toLowerCase().includes('required')) return fail(res, message, error, 400);
    if (message.toLowerCase().includes('not found')) return fail(res, message, error, 404);
    return fail(res, 'Failed to activate the season pass', error);
  }
};

export const unlockPremiumSeriesController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const seriesId = String(req.params.seriesId || '').trim();
    if (!seriesId) return fail(res, 'seriesId is required', new Error('seriesId is required'), 400);
    const data = await unlockPremiumSeries({ userId, seriesId });
    return res.json({ success: true, data, message: 'Premium series unlocked.' });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to unlock the premium series');
    if (message.toLowerCase().includes('required')) return fail(res, message, error, 400);
    if (message.toLowerCase().includes('not found')) return fail(res, message, error, 404);
    if (message.toLowerCase().includes('insufficient') || message.toLowerCase().includes('own')) {
      return fail(res, message, error, 409);
    }
    return fail(res, 'Failed to unlock the premium series', error);
  }
};

export const createExpertBountyQuestionController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const data = await createExpertBountyQuestion({
      userId,
      title: req.body?.title,
      body: req.body?.body,
      category: req.body?.category,
      tags: Array.isArray(req.body?.tags) ? req.body.tags : [],
      bountyAmount: req.body?.bountyAmount
    });
    return res.json({ success: true, data, message: 'Expert bounty question created.' });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to create the expert bounty question');
    if (message.toLowerCase().includes('clearer') || message.toLowerCase().includes('detail')) {
      return fail(res, message, error, 400);
    }
    return fail(res, 'Failed to create the expert bounty question', error);
  }
};

export const answerExpertBountyQuestionController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const questionId = String(req.params.questionId || '').trim();
    if (!questionId) return fail(res, 'questionId is required', new Error('questionId is required'), 400);
    const data = await answerExpertBountyQuestion({
      userId,
      questionId,
      body: req.body?.body,
      app: req.app
    });
    return res.json({ success: true, data, message: 'Expert answer submitted.' });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to submit the expert answer');
    if (message.toLowerCase().includes('useful')) return fail(res, message, error, 400);
    if (message.toLowerCase().includes('not found')) return fail(res, message, error, 404);
    if (message.toLowerCase().includes('own bounty')) return fail(res, message, error, 409);
    return fail(res, 'Failed to submit the expert answer', error);
  }
};

export const awardExpertBountyController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const questionId = String(req.params.questionId || '').trim();
    const answerId = String(req.body?.answerId || '').trim();
    if (!questionId) return fail(res, 'questionId is required', new Error('questionId is required'), 400);
    if (!answerId) return fail(res, 'answerId is required', new Error('answerId is required'), 400);
    const data = await awardExpertBounty({ userId, questionId, answerId });
    return res.json({ success: true, data, message: 'Expert bounty awarded.' });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to award the expert bounty');
    if (message.toLowerCase().includes('required')) return fail(res, message, error, 400);
    if (message.toLowerCase().includes('not found')) return fail(res, message, error, 404);
    if (
      message.toLowerCase().includes('only the question owner') ||
      message.toLowerCase().includes('already has an accepted answer') ||
      message.toLowerCase().includes('insufficient')
    ) {
      return fail(res, message, error, 409);
    }
    return fail(res, 'Failed to award the expert bounty', error);
  }
};
