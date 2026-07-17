import { Request, Response } from 'express';
import {
  FeedbackFabricError,
  feedbackFabricService,
  normalizeFeedbackBatch
} from '../services/intelligenceFeedback';

const sendFeedbackError = (res: Response, error: unknown) => {
  if (error instanceof FeedbackFabricError) {
    return res.status(error.statusCode).json({
      success: false,
      code: error.code,
      error: error.message
    });
  }
  console.error('[intelligence-feedback] request failed', {
    error: String((error as any)?.message || error || 'unknown').slice(0, 220)
  });
  return res.status(500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    error: 'Failed to record feedback'
  });
};

export const submitIntelligenceFeedbackController = async (req: Request, res: Response) => {
  try {
    const events = normalizeFeedbackBatch(req.body);
    const result = await feedbackFabricService.submit({
      viewerId: req.user?.id,
      events
    });
    const status = result.accepted === 0 && result.deduped === 0 && result.rejected > 0 ? 400 : 202;
    return res.status(status).json({ success: result.success, data: result });
  } catch (error) {
    return sendFeedbackError(res, error);
  }
};

export const getIntelligenceFeedbackMetricsController = (_req: Request, res: Response) => {
  return res.json({
    success: true,
    data: feedbackFabricService.metrics()
  });
};
