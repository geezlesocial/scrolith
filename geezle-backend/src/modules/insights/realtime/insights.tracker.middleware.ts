import type { NextFunction, Request, Response } from 'express';
import { recordInsightEvent } from '../services/insights.service';

const inferEventType = (req: Request): string | null => {
  const method = String(req.method || '').toUpperCase();
  const path = String(req.originalUrl || req.url || '').toLowerCase();

  if (path.includes('/api/insights')) return null;

  if (method === 'POST' && path.includes('/api/posts')) return 'POST_CREATED';
  if (method === 'POST' && path.includes('/api/community') && path.includes('comment')) return 'COMMENT_CREATED';
  if (method === 'POST' && path.includes('/api/proposals')) return 'PROPOSAL_SUBMITTED';
  if (method === 'POST' && path.includes('/api/contracts')) return 'CONTRACT_CREATED';
  if (method === 'POST' && path.includes('/api/messages')) return 'MESSAGE_SENT';
  if (method === 'POST' && path.includes('/api/auth/login')) return 'LOGIN';

  if ((method === 'PATCH' || method === 'PUT') && path.includes('/api/orders')) {
    const status = String((req.body as any)?.status || '').toUpperCase();
    if (status === 'COMPLETED') return 'ORDER_COMPLETED';
  }

  return null;
};

export const insightsActionTrackerMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const eventType = inferEventType(req);
  if (!eventType) return next();

  res.on('finish', () => {
    const status = Number(res.statusCode || 0);
    if (status < 200 || status >= 400) return;
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return;
    void recordInsightEvent({
      userId,
      type: eventType,
      payload: {
        method: req.method,
        path: req.originalUrl,
        statusCode: status
      },
      countForStreak: true,
      recomputeScore: true,
      app: req.app
    }).catch((error) => {
      console.warn('[insights] action tracker failed', error);
    });
  });

  return next();
};

