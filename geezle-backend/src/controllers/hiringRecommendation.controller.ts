import { Request, Response } from 'express';
import {
  clickHiringRecommendation,
  dismissHiringRecommendation,
  getHiringRecommendation,
  recordHiringRecommendationImpression,
  snoozeHiringRecommendation
} from '../services/hiringRecommendation.service';

const userId = (req: Request) => req.user?.id;
const fail = (res: Response, status: number, message: string) => res.status(status).json({ success: false, error: message });
const queryString = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
};

export const getHiringRecommendationController = async (req: Request, res: Response) => {
  const id = userId(req);
  if (!id) return fail(res, 401, 'Unauthorized');
  try {
    const accountType = queryString(req.query.accountType);
    const role = queryString(req.query.role);
    const sessionKey = queryString(req.query.sessionKey);
    const data = await getHiringRecommendation(id, accountType || role, sessionKey);
    return res.json({ success: true, data });
  } catch (error: any) {
    console.warn('[hiring-recommendation] eligibility unavailable', error);
    // This feature is advisory. A backend failure must never affect home rendering.
    return res.json({ success: true, data: null });
  }
};

export const postHiringRecommendationImpressionController = async (req: Request, res: Response) => {
  const id = userId(req);
  if (!id) return fail(res, 401, 'Unauthorized');
  try {
    const data = await recordHiringRecommendationImpression(id, req.body?.accountType, req.body?.sessionKey);
    return res.json({ success: true, data });
  } catch (error: any) {
    const message = String(error?.message || 'Unable to record recommendation impression');
    return fail(res, message.toLowerCase().includes('invalid') ? 400 : 500, message);
  }
};

export const postHiringRecommendationDismissController = async (req: Request, res: Response) => {
  const id = userId(req);
  if (!id) return fail(res, 401, 'Unauthorized');
  try {
    const data = await dismissHiringRecommendation(id, req.body?.accountType);
    return res.json({ success: true, data });
  } catch (error: any) {
    const message = String(error?.message || 'Unable to dismiss recommendation');
    return fail(res, message.toLowerCase().includes('invalid') ? 400 : 500, message);
  }
};

export const postHiringRecommendationClickController = async (req: Request, res: Response) => {
  const id = userId(req);
  if (!id) return fail(res, 401, 'Unauthorized');
  try {
    const data = await clickHiringRecommendation(id, req.body?.accountType);
    return res.json({ success: true, data });
  } catch (error: any) {
    const message = String(error?.message || 'Unable to record recommendation click');
    return fail(res, message.toLowerCase().includes('invalid') ? 400 : 500, message);
  }
};

export const postHiringRecommendationSnoozeController = async (req: Request, res: Response) => {
  const id = userId(req);
  if (!id) return fail(res, 401, 'Unauthorized');
  try {
    const data = await snoozeHiringRecommendation(id, req.body?.accountType);
    return res.json({ success: true, data });
  } catch (error: any) {
    const message = String(error?.message || 'Unable to snooze recommendation');
    return fail(res, message.toLowerCase().includes('invalid') ? 400 : 500, message);
  }
};
