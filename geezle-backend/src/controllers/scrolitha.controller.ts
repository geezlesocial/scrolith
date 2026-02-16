import { Request, Response } from 'express';
import { resolveActorFromRequest } from '../services/scrolitha/scrolitha.audit';
import {
  getScrolithaCommunicationRecords,
  getScrolithaKnowledgeForActor,
  getScrolithaWidgetConfigPublic,
  scrolithaChat,
  scrolithaExecute,
  scrolithaFeedback,
  scrolithaHistory
} from '../services/scrolitha/scrolitha.orchestrator';

const unauthorized = (res: Response) =>
  res.status(401).json({
    success: false,
    message: 'Unauthorized',
    error: 'Authentication required'
  });

export const scrolithaChatController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const actor = resolveActorFromRequest(req);
    const data = await scrolithaChat(
      {
        message: req.body?.message,
        context: req.body?.context,
        conversationId: req.body?.conversationId
      },
      actor,
      req.app
    );

    return res.json({
      success: true,
      data,
      message: 'Scrolitha response ready'
    });
  } catch (error: any) {
    const msg = String(error?.message || 'Scrolitha chat failed');
    const lower = msg.toLowerCase();
    const status =
      lower.includes('required') || lower.includes('invalid') || lower.includes('forbidden')
        ? 400
        : lower.includes('rate limit')
          ? 429
          : 500;
    console.error('[scrolitha] chat error', error);
    return res.status(status).json({ success: false, message: 'Scrolitha chat failed', error: msg });
  }
};

export const scrolithaExecuteController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const actor = resolveActorFromRequest(req);
    const data = await scrolithaExecute(
      {
        actionId: req.body?.actionId,
        confirmed: req.body?.confirmed,
        params: req.body?.params
      },
      actor,
      req.app
    );

    return res.json({
      success: true,
      data,
      message: data?.success ? 'Action executed' : 'Action pending confirmation'
    });
  } catch (error: any) {
    const msg = String(error?.message || 'Scrolitha execution failed');
    const lower = msg.toLowerCase();
    const status =
      lower.includes('required') || lower.includes('invalid') || lower.includes('not allowed')
        ? 400
        : lower.includes('rate limit')
          ? 429
          : 500;
    console.error('[scrolitha] execute error', error);
    return res.status(status).json({ success: false, message: 'Scrolitha execution failed', error: msg });
  }
};

export const scrolithaHistoryController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const actor = resolveActorFromRequest(req);
    const data = await scrolithaHistory(actor, req.query.limit);
    return res.json({ success: true, data, message: 'Scrolitha history loaded' });
  } catch (error: any) {
    console.error('[scrolitha] history error', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load Scrolitha history',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const scrolithaRecordsController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const actor = resolveActorFromRequest(req);
    const data = await getScrolithaCommunicationRecords(actor, {
      limit: req.query.limit,
      conversationId: req.query.conversationId
    });
    return res.json({ success: true, data, message: 'Scrolitha communication records loaded' });
  } catch (error: any) {
    console.error('[scrolitha] records error', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load Scrolitha communication records',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const scrolithaKnowledgeController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const actor = resolveActorFromRequest(req);
    const data = await getScrolithaKnowledgeForActor(actor, {
      message: req.query.message
    });
    return res.json({ success: true, data, message: 'Scrolitha knowledge context loaded' });
  } catch (error: any) {
    console.error('[scrolitha] knowledge error', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load Scrolitha knowledge context',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const scrolithaFeedbackController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const actor = resolveActorFromRequest(req);
    const data = await scrolithaFeedback(
      {
        conversationId: req.body?.conversationId,
        rating: req.body?.rating,
        note: req.body?.note
      },
      actor
    );

    return res.json({ success: true, data, message: 'Scrolitha feedback recorded' });
  } catch (error: any) {
    const msg = String(error?.message || 'Failed to save feedback');
    const status = msg.toLowerCase().includes('required') || msg.toLowerCase().includes('rating') ? 400 : 500;
    console.error('[scrolitha] feedback error', error);
    return res.status(status).json({ success: false, message: 'Failed to save feedback', error: msg });
  }
};

export const scrolithaWidgetConfigController = async (_req: Request, res: Response) => {
  try {
    const data = await getScrolithaWidgetConfigPublic();
    return res.json({ success: true, data, message: 'Scrolitha widget config loaded' });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load Scrolitha widget config',
      error: String(error?.message || 'Unknown error')
    });
  }
};
