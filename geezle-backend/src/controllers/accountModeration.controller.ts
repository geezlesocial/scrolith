import { Request, Response } from 'express';
import {
  AccountModerationAction,
  AccountModerationError,
  applyAccountModerationAction,
  getAccountModerationSummary
} from '../services/accountModeration.service';

const normalizeText = (value: unknown) => String(value || '').trim();

const normalizeAction = (value: unknown): AccountModerationAction => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'strike' || normalized === 'sanction') return 'strike';
  if (normalized === 'restriction' || normalized === 'restrict') return 'restriction';
  if (normalized === 'ban' || normalized === 'blocked') return 'ban';
  return 'warning';
};

const normalizeFeatureList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeText(entry)).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => normalizeText(entry))
      .filter(Boolean);
  }
  return [];
};

const respondWithError = (res: Response, error: unknown, fallback = 'Failed to apply moderation action') => {
  if (error instanceof AccountModerationError) {
    return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
  }
  const message = error instanceof Error ? error.message : fallback;
  return res.status(500).json({ success: false, error: message || fallback, code: 'ERR_INTERNAL' });
};

const resolveTargetUserId = (req: Request) => normalizeText(req.params?.userId || req.params?.id);

export const getUserModerationSummaryController = async (req: Request, res: Response) => {
  try {
    const userId = resolveTargetUserId(req);
    const data = await getAccountModerationSummary(userId);
    return res.json({ success: true, data });
  } catch (error) {
    return respondWithError(res, error, 'Failed to load moderation summary');
  }
};

export const applyUserModerationActionController = async (req: Request, res: Response) => {
  try {
    const userId = resolveTargetUserId(req);
    const action = normalizeAction(req.body?.action || req.body?.moderationAction);
    const reason = normalizeText(req.body?.reason || req.body?.note);
    const userMessage = normalizeText(req.body?.userMessage || req.body?.message || req.body?.notificationMessage);
    const severity = normalizeText(req.body?.severity);
    const source = normalizeText(req.body?.source) || 'admin_dashboard';
    const sourceId = normalizeText(req.body?.sourceId || req.body?.source_id);
    const sourceLabel = normalizeText(req.body?.sourceLabel || req.body?.source_label);
    const actorId = normalizeText(req.user?.id);
    const actorEmail = normalizeText(req.user?.email);
    const actorRole = normalizeText(req.user?.role);
    const restrictedFeatures = normalizeFeatureList(
      req.body?.restrictedFeatures || req.body?.restricted_features || req.body?.features
    );
    const restrictionHours = Number(req.body?.restrictionHours ?? req.body?.durationHours ?? req.body?.hours ?? 0);

    const data = await applyAccountModerationAction({
      userId,
      actorId,
      actorEmail,
      actorRole,
      action,
      reason,
      severity,
      userMessage,
      restrictedFeatures,
      restrictionHours: Number.isFinite(restrictionHours) ? Math.max(0, Math.round(restrictionHours)) : 0,
      source,
      sourceId,
      sourceLabel,
      meta: {
        reportId: normalizeText(req.body?.reportId || req.body?.report_id) || null,
        postId: normalizeText(req.body?.postId || req.body?.post_id) || null,
        context: normalizeText(req.body?.context) || null
      }
    });

    return res.json({ success: true, data });
  } catch (error) {
    console.error('[accountModeration] apply action failed:', error);
    return respondWithError(res, error);
  }
};
