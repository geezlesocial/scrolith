import { Request, Response } from 'express';
import { getRecoAccounts, submitRecoFeedback } from '../services/reco/reco.service';

export const getRecoAccountsController = async (req: Request, res: Response) => {
  try {
    const viewerId = req.user?.id;
    if (!viewerId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
        error: 'Authentication required'
      });
    }

    const data = await getRecoAccounts({
      viewerId,
      surface: req.query.surface,
      entityType: req.query.type,
      limit: req.query.limit,
      query: req.query.query,
      includeDebug: String(req.query.debug || '').toLowerCase() === 'true'
    });

    return res.json({
      success: true,
      data,
      message: 'Recommendations loaded'
    });
  } catch (error: any) {
    console.error('[reco] get accounts error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load recommendations',
      error: error?.message || 'Unknown error'
    });
  }
};

export const submitRecoFeedbackController = async (req: Request, res: Response) => {
  try {
    const payload = await submitRecoFeedback({
      viewerId: req.user?.id,
      surface: req.body?.surface,
      entityType: req.body?.entityType,
      entityId: req.body?.entityId,
      action: req.body?.action,
      metadata: req.body?.metadata
    });

    return res.json({
      success: true,
      data: payload,
      message: 'Feedback recorded'
    });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to save recommendation feedback');
    const status = message.toLowerCase().includes('invalid') || message.toLowerCase().includes('required') ? 400 : 500;
    console.error('[reco] feedback error:', error);
    return res.status(status).json({
      success: false,
      message: 'Failed to save recommendation feedback',
      error: message
    });
  }
};
