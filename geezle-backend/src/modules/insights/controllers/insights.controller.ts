import type { Request, Response } from 'express';
import { resolveActorFromRequest } from '../../../services/scrolitha/scrolitha.audit';
import { buildEmptyCareerStreakSummary, getCareerStreakSummary } from '../services/careerStreak.service';
import {
  buildEmptyCreatorChallengeDashboard,
  getCreatorChallengeDashboard,
  submitCreatorChallengeEntry,
  voteCreatorChallengeEntry
} from '../services/creatorChallenge.service';
import { buildEmptyDailyMissionSummary, getDailyMissionSummary } from '../services/dailyMission.service';
import {
  buildEmptyFriendStreakDashboard,
  createFriendStreakInvite,
  endFriendStreak,
  getFriendStreakDashboard,
  respondToFriendStreakInvite
} from '../services/friendStreak.service';
import {
  completeUserQuest,
  generateOpportunityBriefMatches,
  generatePostPrediction,
  generateSkillGapReport,
  getOpportunityHubForUser,
  getUserQuests,
  getLatestSkillGapReport,
  getLeaderboard,
  getOpportunityMatches,
  getProfessionalScoreForUser,
  getRevenueInsights,
  getUserAchievements,
  getUserFeedMode,
  getUserStreak,
  setUserFeedMode
} from '../services/insights.service';

const getUserId = (req: Request) => String((req as any)?.user?.id || '').trim();

const INSIGHTS_SCHEMA_TOKENS = [
  'appsetting',
  'achievement',
  'userachievement',
  'userstreak',
  'questcatalog',
  'userquest',
  'questcompletionlog',
  'careerdailyaction',
  'friendstreak',
  'creatorchallenge',
  'creatorchallengeentry',
  'creatorchallengevote',
  'professionalscore',
  'insightevent',
  'weeklyleaderboard',
  'opportunitymatch',
  'skillgapreport',
  'feedmodepreference'
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

const fallbackPgs = (userId: string) => ({
  userId,
  score: 0,
  breakdown: {},
  riskFlags: { unavailable: true },
  updatedAt: new Date().toISOString()
});

const fallbackStreak = (userId: string, roleInput: unknown = 'USER') => ({
  userId,
  currentStreakDays: 0,
  bestStreakDays: 0,
  lastActiveDate: null,
  createdAt: null,
  updatedAt: null,
  careerDaily: buildEmptyCareerStreakSummary(userId),
  friendStreaks: buildEmptyFriendStreakDashboard(userId),
  dailyMissions: buildEmptyDailyMissionSummary(userId, roleInput)
});

const fallbackRevenue = () => ({
  totalEarned: 0,
  totalSpent: 0,
  pendingDue: 0,
  walletBalance: 0,
  completedOrders: 0,
  clientOrders: 0,
  trackedHours: 0
});

const fail = (res: Response, message: string, error: any, status = 500) =>
  res.status(status).json({
    success: false,
    data: null,
    message,
    error: String(error?.message || 'Unknown error')
  });

export const getMyPgsController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const data = await getProfessionalScoreForUser(userId, req.app);
    return res.json({ success: true, data, message: 'Professional Growth Score loaded' });
  } catch (error) {
    if (isInsightsSchemaUnavailable(error, ['professionalscore'])) {
      const userId = getUserId(req);
      return res.json({
        success: true,
        data: fallbackPgs(userId || ''),
        message: 'Professional Growth Score loaded'
      });
    }
    return fail(res, 'Failed to load Professional Growth Score', error);
  }
};

export const getMyAchievementsController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const data = await getUserAchievements(userId);
    return res.json({ success: true, data, message: 'Achievements loaded' });
  } catch (error) {
    if (isInsightsSchemaUnavailable(error, ['achievement', 'userachievement'])) {
      return res.json({ success: true, data: [], message: 'Achievements loaded' });
    }
    return fail(res, 'Failed to load achievements', error);
  }
};

export const getMyStreakController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const [streak, careerDaily, friendStreaks] = await Promise.all([
      getUserStreak(userId),
      getCareerStreakSummary(userId),
      getFriendStreakDashboard(userId)
    ]);
    const dailyMissions = await getDailyMissionSummary({
      userId,
      role: (req as any)?.user?.role,
      careerDaily,
      friendStreaks
    });
    const data = {
      ...streak,
      careerDaily,
      friendStreaks,
      dailyMissions
    };
    return res.json({ success: true, data, message: 'Streak loaded' });
  } catch (error) {
    if (isInsightsSchemaUnavailable(error, ['userstreak', 'careerdailyaction', 'friendstreak'])) {
      const userId = getUserId(req);
      return res.json({
        success: true,
        data: fallbackStreak(userId || '', (req as any)?.user?.role),
        message: 'Streak loaded'
      });
    }
    return fail(res, 'Failed to load streak', error);
  }
};

export const inviteFriendStreakController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const partnerUserId = String(req.body?.partnerUserId || '').trim();
    if (!partnerUserId) return fail(res, 'partnerUserId is required', new Error('partnerUserId is required'), 400);
    const data = await createFriendStreakInvite({ userId, partnerUserId, app: req.app });
    return res.json({ success: true, data, message: 'Friend streak invite processed' });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to create friend streak invite');
    if (message.toLowerCase().includes('required')) return fail(res, message, error, 400);
    if (message.toLowerCase().includes('not found')) return fail(res, message, error, 404);
    if (
      message.toLowerCase().includes('already') ||
      message.toLowerCase().includes('limit') ||
      message.toLowerCase().includes('mutual')
    ) {
      return fail(res, message, error, 409);
    }
    return fail(res, 'Failed to create friend streak invite', error);
  }
};

export const respondFriendStreakController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const friendStreakId = String(req.params.friendStreakId || '').trim();
    const response = String(req.body?.response || '').trim();
    if (!friendStreakId) return fail(res, 'friendStreakId is required', new Error('friendStreakId is required'), 400);
    const data = await respondToFriendStreakInvite({ userId, friendStreakId, response, app: req.app });
    return res.json({ success: true, data, message: 'Friend streak invite updated' });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to update friend streak invite');
    if (message.toLowerCase().includes('required') || message.toLowerCase().includes('must be')) {
      return fail(res, message, error, 400);
    }
    if (message.toLowerCase().includes('not found')) return fail(res, message, error, 404);
    if (
      message.toLowerCase().includes('pending') ||
      message.toLowerCase().includes('limit') ||
      message.toLowerCase().includes('cannot respond')
    ) {
      return fail(res, message, error, 409);
    }
    return fail(res, 'Failed to update friend streak invite', error);
  }
};

export const endFriendStreakController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const friendStreakId = String(req.params.friendStreakId || '').trim();
    if (!friendStreakId) return fail(res, 'friendStreakId is required', new Error('friendStreakId is required'), 400);
    const data = await endFriendStreak({ userId, friendStreakId, app: req.app });
    return res.json({ success: true, data, message: 'Friend streak ended' });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to end friend streak');
    if (message.toLowerCase().includes('required')) return fail(res, message, error, 400);
    if (message.toLowerCase().includes('not found')) return fail(res, message, error, 404);
    if (message.toLowerCase().includes('already closed')) return fail(res, message, error, 409);
    return fail(res, 'Failed to end friend streak', error);
  }
};

export const getMyQuestsController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const data = await getUserQuests({ userId, app: req.app });
    return res.json({ success: true, data, message: 'Quests loaded' });
  } catch (error) {
    if (isInsightsSchemaUnavailable(error, ['questcatalog', 'userquest'])) {
      return res.json({ success: true, data: [], message: 'Quests loaded' });
    }
    return fail(res, 'Failed to load quests', error);
  }
};

export const getMyCreatorChallengesController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const data = await getCreatorChallengeDashboard(userId);
    return res.json({ success: true, data, message: 'Creator challenges loaded' });
  } catch (error) {
    if (isInsightsSchemaUnavailable(error, ['creatorchallenge', 'creatorchallengeentry', 'creatorchallengevote'])) {
      return res.json({
        success: true,
        data: buildEmptyCreatorChallengeDashboard(getUserId(req) || ''),
        message: 'Creator challenges loaded'
      });
    }
    return fail(res, 'Failed to load creator challenges', error);
  }
};

export const submitCreatorChallengeEntryController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const challengeId = String(req.params.challengeId || '').trim();
    const contentType = String(req.body?.contentType || '').trim();
    const contentId = String(req.body?.contentId || '').trim();
    if (!challengeId || !contentType || !contentId) {
      return fail(res, 'challengeId, contentType, and contentId are required', new Error('missing fields'), 400);
    }
    const data = await submitCreatorChallengeEntry({
      userId,
      challengeId,
      contentType,
      contentId,
      app: req.app
    });
    return res.json({ success: true, data, message: 'Creator challenge entry submitted' });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to submit creator challenge entry');
    if (message.toLowerCase().includes('required') || message.toLowerCase().includes('eligible')) {
      return fail(res, message, error, 400);
    }
    if (
      message.toLowerCase().includes('already') ||
      message.toLowerCase().includes('closed') ||
      message.toLowerCase().includes('accepting')
    ) {
      return fail(res, message, error, 409);
    }
    if (message.toLowerCase().includes('not found')) return fail(res, message, error, 404);
    return fail(res, 'Failed to submit creator challenge entry', error);
  }
};

export const voteCreatorChallengeEntryController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const challengeId = String(req.params.challengeId || '').trim();
    const entryId = String(req.body?.entryId || '').trim();
    if (!challengeId || !entryId) {
      return fail(res, 'challengeId and entryId are required', new Error('missing fields'), 400);
    }
    const data = await voteCreatorChallengeEntry({
      userId,
      challengeId,
      entryId,
      app: req.app
    });
    return res.json({ success: true, data, message: 'Creator challenge vote recorded' });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to vote on creator challenge entry');
    if (message.toLowerCase().includes('required') || message.toLowerCase().includes('cannot vote')) {
      return fail(res, message, error, 400);
    }
    if (message.toLowerCase().includes('closed')) return fail(res, message, error, 409);
    if (message.toLowerCase().includes('not found')) return fail(res, message, error, 404);
    return fail(res, 'Failed to vote on creator challenge entry', error);
  }
};

export const completeMyQuestController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const userQuestId = String(req.params.userQuestId || '').trim();
    if (!userQuestId) return res.status(400).json({ success: false, data: null, message: 'userQuestId is required' });
    const data = await completeUserQuest({ userId, userQuestId, app: req.app });
    return res.json({ success: true, data, message: 'Quest completion processed' });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to complete quest');
    if (message.toLowerCase().includes('not found')) return fail(res, message, error, 404);
    if (message.toLowerCase().includes('required')) return fail(res, message, error, 400);
    if (message.toLowerCase().includes('inactive') || message.toLowerCase().includes('expired')) {
      return fail(res, message, error, 409);
    }
    return fail(res, 'Failed to complete quest', error);
  }
};

export const getLeaderboardController = async (req: Request, res: Response) => {
  try {
    const scope = String(req.query.scope || 'global');
    const weekKey = req.query.weekKey;
    const data = await getLeaderboard(scope, weekKey, req.app);
    return res.json({ success: true, data, message: 'Leaderboard loaded' });
  } catch (error) {
    if (isInsightsSchemaUnavailable(error, ['weeklyleaderboard', 'professionalscore'])) {
      return res.json({
        success: true,
        data: {
          weekKey: String(req.query.weekKey || ''),
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

export const getMatchesController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const type = req.query.type;
    const data = await getOpportunityMatches({ userId, type, app: req.app });
    return res.json({ success: true, data, message: 'Opportunity matches loaded' });
  } catch (error) {
    if (isInsightsSchemaUnavailable(error, ['opportunitymatch'])) {
      return res.json({ success: true, data: [], message: 'Opportunity matches loaded' });
    }
    return fail(res, 'Failed to load opportunity matches', error);
  }
};

export const getRevenueController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const data = await getRevenueInsights(userId);
    return res.json({ success: true, data, message: 'Revenue insights loaded' });
  } catch (error) {
    if (isInsightsSchemaUnavailable(error, ['timeentry', 'wallet', 'order'])) {
      return res.json({ success: true, data: fallbackRevenue(), message: 'Revenue insights loaded' });
    }
    return fail(res, 'Failed to load revenue insights', error);
  }
};

export const getOpportunityHubController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const data = await getOpportunityHubForUser({ userId, app: req.app });
    return res.json({ success: true, data, message: 'Opportunity hub loaded' });
  } catch (error) {
    return fail(res, 'Failed to load opportunity hub', error);
  }
};

export const generateOpportunityBriefController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) {
      return res.status(400).json({ success: false, data: null, message: 'Prompt is required' });
    }
    const actor = resolveActorFromRequest(req);
    const data = await generateOpportunityBriefMatches({
      userId,
      prompt,
      actor,
      app: req.app
    });
    return res.json({ success: true, data, message: 'Opportunity brief generated' });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to generate opportunity brief');
    const status = message.toLowerCase().includes('required') ? 400 : 500;
    return fail(res, 'Failed to generate opportunity brief', error, status);
  }
};

export const getPostPredictionController = async (req: Request, res: Response) => {
  try {
    const postId = String(req.params.postId || '').trim();
    if (!postId) return res.status(400).json({ success: false, data: null, message: 'postId is required' });
    const actor = resolveActorFromRequest(req);
    const force = String(req.query.force || '').toLowerCase() === 'true';
    const data = await generatePostPrediction({ postId, actor, app: req.app, force });
    if (!data) {
      return res.json({
        success: true,
        data: null,
        message: 'Post prediction is not eligible under current policy'
      });
    }
    return res.json({ success: true, data, message: 'Post prediction loaded' });
  } catch (error) {
    return fail(res, 'Failed to load post prediction', error);
  }
};

export const generateSkillGapController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const actor = resolveActorFromRequest(req);
    const data = await generateSkillGapReport({ userId, actor, app: req.app });
    return res.json({ success: true, data, message: 'Skill gap report generated' });
  } catch (error) {
    return fail(res, 'Failed to generate skill gap report', error);
  }
};

export const getMySkillGapController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const data = await getLatestSkillGapReport(userId);
    return res.json({ success: true, data, message: 'Skill gap report loaded' });
  } catch (error) {
    if (isInsightsSchemaUnavailable(error, ['skillgapreport'])) {
      return res.json({ success: true, data: null, message: 'Skill gap report loaded' });
    }
    return fail(res, 'Failed to load skill gap report', error);
  }
};

export const setFeedModeController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const mode = req.body?.mode;
    const row = await setUserFeedMode(userId, mode);
    return res.json({ success: true, data: row, message: 'Feed mode updated' });
  } catch (error) {
    return fail(res, 'Failed to update feed mode', error);
  }
};

export const getFeedModeController = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, data: null, message: 'Unauthorized' });
    const mode = await getUserFeedMode(userId);
    return res.json({ success: true, data: { mode }, message: 'Feed mode loaded' });
  } catch (error) {
    if (isInsightsSchemaUnavailable(error, ['feedmodepreference'])) {
      return res.json({ success: true, data: { mode: 'growth' }, message: 'Feed mode loaded' });
    }
    return fail(res, 'Failed to load feed mode', error);
  }
};
