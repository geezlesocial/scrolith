import { Request, Response } from 'express';
import { recordEventAndEvaluate } from '../services/gcoinEarningEngine';

const nowIso = () => new Date().toISOString();
const ok = (res: Response, data: any) => res.json({ success: true, data, timestamp: nowIso() });
const fail = (res: Response, status: number, message: string) => res.status(status).json({ success: false, error: message, timestamp: nowIso() });

export const postView = async (req: Request, res: Response) => {
  try {
    const actorId = (req.user as any)?.id as string | undefined;
    const { id: postId } = req.params;
    if (!actorId) return fail(res, 401, 'Unauthorized');
    if (!postId) return fail(res, 400, 'Missing post id');
    const result = await recordEventAndEvaluate(actorId, postId, 'view');
    return ok(res, result);
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to record view');
  }
};

export const postLike = async (req: Request, res: Response) => {
  try {
    const actorId = (req.user as any)?.id as string | undefined;
    const { id: postId } = req.params;
    if (!actorId) return fail(res, 401, 'Unauthorized');
    if (!postId) return fail(res, 400, 'Missing post id');
    const result = await recordEventAndEvaluate(actorId, postId, 'like');
    return ok(res, result);
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to record like');
  }
};

export const postShare = async (req: Request, res: Response) => {
  try {
    const actorId = (req.user as any)?.id as string | undefined;
    const { id: postId } = req.params;
    if (!actorId) return fail(res, 401, 'Unauthorized');
    if (!postId) return fail(res, 400, 'Missing post id');
    const result = await recordEventAndEvaluate(actorId, postId, 'share');
    return ok(res, result);
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to record share');
  }
};

export const postRepost = async (req: Request, res: Response) => {
  try {
    const actorId = (req.user as any)?.id as string | undefined;
    const { id: postId } = req.params;
    if (!actorId) return fail(res, 401, 'Unauthorized');
    if (!postId) return fail(res, 400, 'Missing post id');
    const result = await recordEventAndEvaluate(actorId, postId, 'repost');
    return ok(res, result);
  } catch (e: any) {
    console.error(e);
    return fail(res, 500, 'Failed to record repost');
  }
};

export default {} as any;
