import { Request, Response } from 'express';
import {
  getMatchFeed,
  getScrolithMatchAnalytics,
  getScrolithMatchConfig,
  normalizeMatchAccountType,
  recordMatchAction,
  assertMutualMatch,
  getMatchPreferences,
  updateMatchPreferences,
  updateScrolithMatchConfig
} from '../services/scrolithMatch.service';
import { createConversation } from './messages.controller';

const userId = (req: Request) => String(req.user?.id || '').trim();
const queryString = (value: unknown) => typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined;
const queryList = (value: unknown) => (Array.isArray(value) ? value : String(value || '').split(',')).flatMap((item) => String(item || '').split(',')).map((item) => item.trim()).filter(Boolean).slice(0, 20);
const queryBoolean = (value: unknown) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
const queryNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : undefined;
};
const fail = (res: Response, status: number, message: string) => res.status(status).json({ success: false, error: message });

export const getMatchController = async (req: Request, res: Response) => {
  const id = userId(req);
  if (!id) return fail(res, 401, 'Unauthorized');
  try {
    const minimumScore = queryNumber(req.query.minimumScore ?? req.query.minScore);
    const data = await getMatchFeed({
      userId: id,
      accountTypeInput: queryString(req.query.accountType || req.query.role),
      mutualOnly: String(req.query.tab || '').toLowerCase() === 'mutual',
      filters: {
        skills: queryList(req.query.skills),
        location: queryString(req.query.location),
        remoteOnly: queryBoolean(req.query.remoteOnly),
        experience: queryString(req.query.experience),
        availability: queryString(req.query.availability),
        minimumScore
      }
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    console.warn('[scrolith-match] feed unavailable', error);
    return res.json({ success: true, data: { enabled: false, accountType: normalizeMatchAccountType(req.query.accountType) || 'FREELANCER', items: [], mutual: [], limits: { dailyInterestLimit: 0, interestsUsed: 0 } } });
  }
};

export const postMatchInterestController = async (req: Request, res: Response) => {
  const id = userId(req);
  if (!id) return fail(res, 401, 'Unauthorized');
  try {
    const targetId = String(req.body?.targetId || '').trim();
    if (!targetId) return fail(res, 400, 'targetId is required');
    const data = await recordMatchAction({ userId: id, targetId, accountTypeInput: req.body?.accountType || req.body?.role, action: 'INTERESTED' });
    return res.json({ success: true, data });
  } catch (error: any) {
    const message = String(error?.message || 'Unable to record Match interest');
    return fail(res, message.includes('limit') || message.includes('Invalid') ? 400 : 409, message);
  }
};

export const postMatchDismissController = async (req: Request, res: Response) => {
  const id = userId(req);
  if (!id) return fail(res, 401, 'Unauthorized');
  try {
    const targetId = String(req.body?.targetId || '').trim();
    if (!targetId) return fail(res, 400, 'targetId is required');
    const data = await recordMatchAction({ userId: id, targetId, accountTypeInput: req.body?.accountType || req.body?.role, action: 'DISMISSED' });
    return res.json({ success: true, data });
  } catch (error: any) {
    return fail(res, 409, String(error?.message || 'Unable to dismiss Match'));
  }
};

export const getMutualMatchController = async (req: Request, res: Response) => {
  const id = userId(req);
  if (!id) return fail(res, 401, 'Unauthorized');
  try {
    const data = await getMatchFeed({ userId: id, accountTypeInput: queryString(req.query.accountType || req.query.role), mutualOnly: true });
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.json({ success: true, data: { enabled: false, items: [], mutual: [] } });
  }
};

export const getMatchPreferencesController = async (req: Request, res: Response) => {
  const id = userId(req);
  if (!id) return fail(res, 401, 'Unauthorized');
  return res.json({ success: true, data: await getMatchPreferences(id) });
};

export const putMatchPreferencesController = async (req: Request, res: Response) => {
  const id = userId(req);
  if (!id) return fail(res, 401, 'Unauthorized');
  try { return res.json({ success: true, data: await updateMatchPreferences(id, req.body) }); }
  catch (error: any) { return fail(res, 400, String(error?.message || 'Unable to update Match preferences')); }
};

export const postMutualConversationController = async (req: Request, res: Response) => {
  const id = userId(req);
  if (!id) return fail(res, 401, 'Unauthorized');
  const targetId = String(req.body?.targetId || '').trim();
  if (!targetId) return fail(res, 400, 'targetId is required');
  try {
    await assertMutualMatch(id, targetId);
    req.body = { participants: [id, targetId], type: 'DIRECT' };
    return createConversation(req, res);
  } catch (error: any) {
    return fail(res, 403, String(error?.message || 'A mutual Match is required before messaging'));
  }
};

export const getAdminMatchConfigController = async (_req: Request, res: Response) => res.json({ success: true, data: await getScrolithMatchConfig() });
export const putAdminMatchConfigController = async (req: Request, res: Response) => {
  try { return res.json({ success: true, data: await updateScrolithMatchConfig(req.body, req.user?.id) }); }
  catch (error: any) { return fail(res, 400, String(error?.message || 'Invalid Match configuration')); }
};
export const getAdminMatchAnalyticsController = async (req: Request, res: Response) => {
  try { return res.json({ success: true, data: await getScrolithMatchAnalytics(req.query.days) }); }
  catch (error: any) { return fail(res, 500, String(error?.message || 'Unable to load Match analytics')); }
};
