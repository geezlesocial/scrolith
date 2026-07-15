import { Request, Response } from 'express';
import {
  enterpriseSearchService,
  SearchContractError,
  type SearchFeedbackRequest
} from '../services/enterpriseSearch';

const sendError = (res: Response, error: unknown) => {
  if (error instanceof SearchContractError) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
      details: error.details
    });
  }
  const msg = error instanceof Error ? error.message : 'Enterprise Search error';
  console.error('[enterprise-search]', error);
  return res.status(500).json({
    success: false,
    error: msg,
    code: 'ERR_INTERNAL'
  });
};

export const enterpriseSearchHealthController = (_req: Request, res: Response) => {
  return res.json(enterpriseSearchService.health());
};

export const enterpriseSearchRolloutController = (_req: Request, res: Response) => {
  return res.json({ success: true, data: enterpriseSearchService.getRollout() });
};

export const enterpriseSearchMetricsController = (_req: Request, res: Response) => {
  return res.json({ success: true, data: enterpriseSearchService.getMetrics() });
};

export const enterpriseSearchQueryController = async (req: Request, res: Response) => {
  try {
    const raw =
      req.method === 'POST'
        ? { ...(req.body || {}), ...(req.query || {}) }
        : { ...(req.query as Record<string, unknown>) };
    // Normalize domains from comma string
    if (typeof raw.domains === 'string' && raw.domains.includes(',')) {
      raw.domains = String(raw.domains)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (req.headers['x-request-id'] && !raw.requestId) {
      raw.requestId = String(req.headers['x-request-id']);
    }
    const viewerId = req.user?.id || null;
    const data = await enterpriseSearchService.query(raw as Record<string, unknown>, viewerId);
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

export const enterpriseSearchSuggestController = async (req: Request, res: Response) => {
  try {
    const raw = { ...(req.query as Record<string, unknown>) };
    const viewerId = req.user?.id || null;
    const data = await enterpriseSearchService.suggest(raw, viewerId);
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

export const enterpriseSearchFeedbackController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHORIZED' });
    }
    const body = req.body || {};
    const payload: SearchFeedbackRequest = {
      action: body.action,
      entityType: body.entityType,
      entityId: body.entityId,
      trackingToken: body.trackingToken,
      surface: body.surface,
      position: body.position,
      query: body.query,
      requestId: body.requestId,
      metadata: body.metadata,
      viewerId: req.user.id
    };
    const data = await enterpriseSearchService.feedback(payload);
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};
