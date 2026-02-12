import { Request, Response } from 'express';
import { resolveActorFromRequest } from '../services/scrolitha/scrolitha.audit';
import {
  createScrolithaSkill,
  deleteScrolithaSkill,
  getScrolithaAnalyticsForAdmin,
  getScrolithaAuditForAdmin,
  getScrolithaChatRecordsForAdmin,
  getScrolithaConfigForAdmin,
  getScrolithaToolRegistry,
  listScrolithaSkillsForAdmin,
  saveScrolithaConfigForAdmin,
  scrolithaChat,
  scrolithaExecute,
  updateScrolithaSkill
} from '../services/scrolitha/scrolitha.orchestrator';

const emit = (req: Request, eventName: string, payload: any) => {
  try {
    const io = req.app.get('io');
    const communityNs = req.app.get('communityNs');
    io?.emit(eventName, payload);
    communityNs?.emit(eventName, payload);
  } catch (error) {
    console.warn('[admin/scrolitha] failed to emit socket event', eventName, error);
  }
};

export const getAdminScrolithaConfigController = async (req: Request, res: Response) => {
  try {
    const data = await getScrolithaConfigForAdmin(req.query.scope);
    return res.json({ success: true, data, message: 'Scrolitha config loaded' });
  } catch (error: any) {
    console.error('[admin/scrolitha] get config error', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load Scrolitha config',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const postAdminScrolithaChatController = async (req: Request, res: Response) => {
  try {
    const actor = resolveActorFromRequest(req);
    const data = await scrolithaChat(
      {
        message: req.body?.message,
        context: req.body?.context,
        conversationId: req.body?.conversationId
      },
      actor
    );
    return res.json({ success: true, data, message: 'Scrolitha admin response ready' });
  } catch (error: any) {
    const msg = String(error?.message || 'Scrolitha admin chat failed');
    const lower = msg.toLowerCase();
    const status =
      lower.includes('required') || lower.includes('invalid') || lower.includes('forbidden')
        ? 400
        : lower.includes('rate limit')
          ? 429
          : 500;
    return res.status(status).json({ success: false, message: 'Scrolitha admin chat failed', error: msg });
  }
};

export const postAdminScrolithaExecuteController = async (req: Request, res: Response) => {
  try {
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
      message: data?.success ? 'Admin action executed' : 'Admin action pending confirmation'
    });
  } catch (error: any) {
    const msg = String(error?.message || 'Scrolitha admin execution failed');
    const lower = msg.toLowerCase();
    const status =
      lower.includes('required') || lower.includes('invalid') || lower.includes('not allowed')
        ? 400
        : lower.includes('rate limit')
          ? 429
          : 500;
    return res.status(status).json({ success: false, message: 'Scrolitha admin execution failed', error: msg });
  }
};

export const putAdminScrolithaConfigController = async (req: Request, res: Response) => {
  try {
    const actor = resolveActorFromRequest(req);
    const data = await saveScrolithaConfigForAdmin(req.body || {}, actor);
    emit(req, 'scrolitha:config_updated', {
      scope: data.scope,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.id
    });

    return res.json({ success: true, data, message: 'Scrolitha config updated' });
  } catch (error: any) {
    const msg = String(error?.message || 'Failed to update config');
    const status = msg.toLowerCase().includes('scope') ? 400 : 500;
    console.error('[admin/scrolitha] update config error', error);
    return res.status(status).json({ success: false, message: 'Failed to update Scrolitha config', error: msg });
  }
};

export const getAdminScrolithaSkillsController = async (req: Request, res: Response) => {
  try {
    const data = await listScrolithaSkillsForAdmin(req.query.includeInactive);
    return res.json({ success: true, data, message: 'Scrolitha skills loaded' });
  } catch (error: any) {
    console.error('[admin/scrolitha] get skills error', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load Scrolitha skills',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const postAdminScrolithaSkillController = async (req: Request, res: Response) => {
  try {
    const actor = resolveActorFromRequest(req);
    const data = await createScrolithaSkill(req.body || {}, actor);
    emit(req, 'scrolitha:skills_updated', {
      action: 'created',
      skillId: data.id,
      updatedAt: new Date().toISOString()
    });
    return res.status(201).json({ success: true, data, message: 'Scrolitha skill created' });
  } catch (error: any) {
    const msg = String(error?.message || 'Failed to create skill');
    const status = msg.toLowerCase().includes('required') ? 400 : 500;
    console.error('[admin/scrolitha] create skill error', error);
    return res.status(status).json({ success: false, message: 'Failed to create Scrolitha skill', error: msg });
  }
};

export const putAdminScrolithaSkillController = async (req: Request, res: Response) => {
  try {
    const actor = resolveActorFromRequest(req);
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ success: false, message: 'Skill id is required', error: 'Missing skill id' });
    }

    const data = await updateScrolithaSkill(id, req.body || {}, actor);
    emit(req, 'scrolitha:skills_updated', {
      action: 'updated',
      skillId: data.id,
      updatedAt: new Date().toISOString()
    });
    return res.json({ success: true, data, message: 'Scrolitha skill updated' });
  } catch (error: any) {
    const msg = String(error?.message || 'Failed to update skill');
    const lower = msg.toLowerCase();
    const status = lower.includes('not found') ? 404 : lower.includes('required') ? 400 : 500;
    console.error('[admin/scrolitha] update skill error', error);
    return res.status(status).json({ success: false, message: 'Failed to update Scrolitha skill', error: msg });
  }
};

export const deleteAdminScrolithaSkillController = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ success: false, message: 'Skill id is required', error: 'Missing skill id' });
    }

    const removed = await deleteScrolithaSkill(id);
    if (!removed) {
      return res.status(404).json({ success: false, message: 'Skill not found', error: 'Skill not found' });
    }

    emit(req, 'scrolitha:skills_updated', {
      action: 'deleted',
      skillId: id,
      updatedAt: new Date().toISOString()
    });

    return res.json({ success: true, data: removed, message: 'Scrolitha skill deleted' });
  } catch (error: any) {
    console.error('[admin/scrolitha] delete skill error', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete Scrolitha skill',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const getAdminScrolithaAuditController = async (req: Request, res: Response) => {
  try {
    const data = await getScrolithaAuditForAdmin({
      cursor: req.query.cursor,
      limit: req.query.limit,
      actorId: req.query.actorId,
      scope: req.query.scope
    });
    return res.json({ success: true, data, message: 'Scrolitha audit loaded' });
  } catch (error: any) {
    console.error('[admin/scrolitha] get audit error', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load Scrolitha audit',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const getAdminScrolithaAnalyticsController = async (_req: Request, res: Response) => {
  try {
    const data = await getScrolithaAnalyticsForAdmin();
    return res.json({ success: true, data, message: 'Scrolitha analytics loaded' });
  } catch (error: any) {
    console.error('[admin/scrolitha] analytics error', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load Scrolitha analytics',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const getAdminScrolithaToolsController = async (_req: Request, res: Response) => {
  try {
    const data = getScrolithaToolRegistry();
    return res.json({ success: true, data, message: 'Scrolitha tool registry loaded' });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load Scrolitha tool registry',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const getAdminScrolithaChatRecordsController = async (req: Request, res: Response) => {
  try {
    const data = await getScrolithaChatRecordsForAdmin({
      limit: req.query.limit,
      userId: req.query.userId,
      scope: req.query.scope,
      conversationId: req.query.conversationId
    });
    return res.json({ success: true, data, message: 'Scrolitha chat records loaded' });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load Scrolitha chat records',
      error: String(error?.message || 'Unknown error')
    });
  }
};
