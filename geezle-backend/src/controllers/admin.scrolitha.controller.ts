import { Request, Response } from 'express';
import { resolveActorFromRequest } from '../services/scrolitha/scrolitha.audit';
import { getScrolithaRuntimeHealth } from '../services/scrolitha/scrolitha.ollama';
import { clearPostInsights, regeneratePostInsightsBatch } from '../services/postAi.service';
import {
  createScrolithaSkill,
  deleteScrolithaSkill,
  getScrolithaAnalyticsForAdmin,
  getScrolithaAuditForAdmin,
  getScrolithaChatRecordsForAdmin,
  getScrolithaConfigForAdmin,
  getScrolithaLearningInsightsForAdminReport,
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

const asScrolithaModelLabel = (value: any) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return 'Scrolitha';
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

export const getAdminScrolithaHealthController = async (req: Request, res: Response) => {
  try {
    const scope = String(req.query.scope || 'admin').trim().toLowerCase();
    const data = await getScrolithaRuntimeHealth(scope === 'user' ? 'user' : 'admin');
    const branded = data && typeof data === 'object' ? { ...data, model: asScrolithaModelLabel((data as any).model) } : data;
    return res.json({ success: true, data: branded, message: 'Scrolitha LLM health loaded' });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load Scrolitha LLM health',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const getAdminScrolithaModelsController = async (req: Request, res: Response) => {
  try {
    const scope = String(req.query.scope || 'admin').trim().toLowerCase();
    const health = await getScrolithaRuntimeHealth(scope === 'user' ? 'user' : 'admin');
    return res.json({
      success: true,
      data: {
        provider: health?.provider || 'scrolitha',
        runtime: (health as any)?.runtime || 'core',
        enabled: Boolean(health?.enabled),
        host: health?.host || null,
        model: asScrolithaModelLabel(health?.model),
        models: Array.isArray((health as any)?.models) ? (health as any).models : [],
        modelPresent: Boolean((health as any)?.modelPresent),
        autoPulled: Boolean((health as any)?.autoPulled),
        status: (health as any)?.status || null,
        note: (health as any)?.note || null,
        warning: (health as any)?.warning || null,
        error: (health as any)?.error || null
      },
      message: 'Scrolitha model list loaded'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load Scrolitha model list',
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
      actor,
      req.app
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

export const getAdminScrolithaLearningInsightsController = async (req: Request, res: Response) => {
  try {
    const data = await getScrolithaLearningInsightsForAdminReport({
      limitUsers: req.query.limitUsers
    });
    return res.json({ success: true, data, message: 'Scrolitha learning insights loaded' });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load Scrolitha learning insights',
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

export const postAdminScrolithaRegenerateInsightsController = async (req: Request, res: Response) => {
  try {
    const actor = resolveActorFromRequest(req);
    const bodyPostId = String(req.body?.postId || '').trim();
    const bodyPostIds = Array.isArray(req.body?.postIds)
      ? req.body.postIds.map((value: any) => String(value || '').trim()).filter(Boolean)
      : [];
    const postIds = bodyPostId ? [bodyPostId] : bodyPostIds;

    const data = await regeneratePostInsightsBatch({
      postIds,
      limit: req.body?.limit,
      app: req.app,
      actor
    });

    emit(req, 'scrolitha:post_ai_updated', {
      action: 'regenerate_insights',
      updatedAt: new Date().toISOString(),
      updatedBy: actor.id,
      generated: data.generated
    });

    return res.json({
      success: true,
      data,
      message: 'Post AI insights regenerated'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to regenerate post AI insights',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const deleteAdminScrolithaPostInsightsController = async (req: Request, res: Response) => {
  try {
    const actor = resolveActorFromRequest(req);
    const bodyPostIds = Array.isArray(req.body?.postIds)
      ? req.body.postIds.map((value: any) => String(value || '').trim()).filter(Boolean)
      : [];
    const data = await clearPostInsights({
      postIds: bodyPostIds
    });

    emit(req, 'scrolitha:post_ai_updated', {
      action: 'clear_insights',
      updatedAt: new Date().toISOString(),
      updatedBy: actor.id,
      cleared: data.updatedCount
    });

    return res.json({
      success: true,
      data,
      message: 'Post AI insights cleared'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to clear post AI insights',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const getAdminScrolithaSettingsController = async (req: Request, res: Response) => {
  return getAdminScrolithaConfigController(req, res);
};

export const putAdminScrolithaSettingsController = async (req: Request, res: Response) => {
  return putAdminScrolithaConfigController(req, res);
};

export const getAdminScrolithaLogsController = async (req: Request, res: Response) => {
  return getAdminScrolithaAuditController(req, res);
};

export const postAdminScrolithaKnowledgeReindexController = async (req: Request, res: Response) => {
  try {
    const actor = resolveActorFromRequest(req);
    emit(req, 'scrolitha:knowledge_reindex_requested', {
      updatedAt: new Date().toISOString(),
      updatedBy: actor.id,
      scope: String(req.body?.scope || req.query?.scope || 'user')
    });
    return res.json({
      success: true,
      data: {
        queued: true,
        scope: String(req.body?.scope || req.query?.scope || 'user'),
        message: 'Knowledge reindex queued'
      },
      message: 'Scrolitha knowledge reindex queued'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to queue knowledge reindex',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const postAdminScrolithaPoliciesUpdateController = async (req: Request, res: Response) => {
  return putAdminScrolithaConfigController(req, res);
};
