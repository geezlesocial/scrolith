import { Request, Response } from 'express';
import {
  createRecoRule,
  deleteRecoRule,
  getRecoAnalytics,
  getRecoAudit,
  getRecoConfig,
  listRecoRules,
  updateRecoConfig,
  updateRecoRule
} from '../services/reco/reco.service';

const emitRecoEvent = (req: Request, eventName: 'reco:config_updated' | 'reco:rules_updated', payload: any) => {
  try {
    const io = req.app.get('io');
    const communityNs = req.app.get('communityNs');
    io?.emit(eventName, payload);
    communityNs?.emit(eventName, payload);
  } catch (error) {
    console.warn('[reco] failed to emit socket event', eventName, error);
  }
};

export const getAdminRecoConfigController = async (req: Request, res: Response) => {
  try {
    const data = await getRecoConfig({
      surface: req.query.surface,
      entityType: req.query.entityType || req.query.type
    });
    return res.json({
      success: true,
      data,
      message: 'Recommendation config loaded'
    });
  } catch (error: any) {
    console.error('[admin/reco] get config error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load recommendation config',
      error: error?.message || 'Unknown error'
    });
  }
};

export const updateAdminRecoConfigController = async (req: Request, res: Response) => {
  try {
    const payload = await updateRecoConfig({
      surface: req.body?.surface,
      entityType: req.body?.entityType || req.body?.type,
      mode: req.body?.mode,
      enabled: req.body?.enabled,
      weights: req.body?.weights,
      gating: req.body?.gating,
      penalties: req.body?.penalties,
      diversity: req.body?.diversity,
      coldStart: req.body?.coldStart,
      notes: req.body?.notes,
      updatedBy: req.user?.id
    });

    emitRecoEvent(req, 'reco:config_updated', {
      surface: payload.surface,
      entityType: payload.entityType,
      updatedAt: new Date().toISOString()
    });

    return res.json({
      success: true,
      data: payload,
      message: 'Recommendation config updated'
    });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to update recommendation config');
    const status = message.toLowerCase().includes('required') || message.toLowerCase().includes('invalid') ? 400 : 500;
    console.error('[admin/reco] update config error:', error);
    return res.status(status).json({
      success: false,
      message: 'Failed to update recommendation config',
      error: message
    });
  }
};

export const listAdminRecoRulesController = async (req: Request, res: Response) => {
  try {
    const data = await listRecoRules({
      surface: req.query.surface,
      entityType: req.query.entityType || req.query.type,
      action: req.query.action,
      includeInactive: req.query.includeInactive
    });
    return res.json({
      success: true,
      data,
      message: 'Recommendation rules loaded'
    });
  } catch (error: any) {
    console.error('[admin/reco] list rules error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load recommendation rules',
      error: error?.message || 'Unknown error'
    });
  }
};

export const createAdminRecoRuleController = async (req: Request, res: Response) => {
  try {
    const data = await createRecoRule({
      entityType: req.body?.entityType,
      entityId: req.body?.entityId,
      action: req.body?.action,
      value: req.body?.value,
      priority: req.body?.priority,
      surface: req.body?.surface,
      startAt: req.body?.startAt,
      endAt: req.body?.endAt,
      isActive: req.body?.isActive,
      metadata: req.body?.metadata,
      note: req.body?.note,
      createdBy: req.user?.id
    });

    emitRecoEvent(req, 'reco:rules_updated', {
      ruleId: data.id,
      action: 'created',
      updatedAt: new Date().toISOString()
    });

    return res.status(201).json({
      success: true,
      data,
      message: 'Recommendation rule created'
    });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to create recommendation rule');
    const status = message.toLowerCase().includes('invalid') || message.toLowerCase().includes('required') ? 400 : 500;
    console.error('[admin/reco] create rule error:', error);
    return res.status(status).json({
      success: false,
      message: 'Failed to create recommendation rule',
      error: message
    });
  }
};

export const updateAdminRecoRuleController = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Rule id is required',
        error: 'Missing rule id'
      });
    }

    const data = await updateRecoRule(id, {
      entityType: req.body?.entityType,
      entityId: req.body?.entityId,
      action: req.body?.action,
      value: req.body?.value,
      priority: req.body?.priority,
      surface: req.body?.surface,
      startAt: req.body?.startAt,
      endAt: req.body?.endAt,
      isActive: req.body?.isActive,
      metadata: req.body?.metadata,
      note: req.body?.note,
      updatedBy: req.user?.id
    });

    emitRecoEvent(req, 'reco:rules_updated', {
      ruleId: data.id,
      action: 'updated',
      updatedAt: new Date().toISOString()
    });

    return res.json({
      success: true,
      data,
      message: 'Recommendation rule updated'
    });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to update recommendation rule');
    const lower = message.toLowerCase();
    const status = lower.includes('not found') ? 404 : lower.includes('invalid') || lower.includes('required') ? 400 : 500;
    console.error('[admin/reco] update rule error:', error);
    return res.status(status).json({
      success: false,
      message: 'Failed to update recommendation rule',
      error: message
    });
  }
};

export const deleteAdminRecoRuleController = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Rule id is required',
        error: 'Missing rule id'
      });
    }

    const removed = await deleteRecoRule(id);
    if (!removed) {
      return res.status(404).json({
        success: false,
        message: 'Recommendation rule not found',
        error: 'Rule not found'
      });
    }

    emitRecoEvent(req, 'reco:rules_updated', {
      ruleId: removed.id,
      action: 'deleted',
      updatedAt: new Date().toISOString()
    });

    return res.json({
      success: true,
      data: { id: removed.id },
      message: 'Recommendation rule deleted'
    });
  } catch (error: any) {
    console.error('[admin/reco] delete rule error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete recommendation rule',
      error: error?.message || 'Unknown error'
    });
  }
};

export const getAdminRecoAuditController = async (req: Request, res: Response) => {
  try {
    const entityId = String(req.query.entityId || '').trim();
    const viewerId = String(req.query.viewerId || req.query.userId || '').trim();
    if (!entityId) {
      return res.status(400).json({
        success: false,
        message: 'entityId is required',
        error: 'Missing entityId'
      });
    }
    if (!viewerId) {
      return res.status(400).json({
        success: false,
        message: 'viewerId is required for explainability',
        error: 'Missing viewerId'
      });
    }

    const data = await getRecoAudit({
      viewerId,
      entityId,
      entityType: req.query.entityType || req.query.type,
      surface: req.query.surface
    });

    return res.json({
      success: true,
      data,
      message: data?.found ? 'Recommendation audit loaded' : 'Entity not currently recommended'
    });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to load recommendation audit');
    const status = message.toLowerCase().includes('required') ? 400 : 500;
    console.error('[admin/reco] audit error:', error);
    return res.status(status).json({
      success: false,
      message: 'Failed to load recommendation audit',
      error: message
    });
  }
};

export const getAdminRecoAnalyticsController = async (req: Request, res: Response) => {
  try {
    const data = await getRecoAnalytics({ days: req.query.days });
    return res.json({
      success: true,
      data,
      message: 'Recommendation analytics loaded'
    });
  } catch (error: any) {
    console.error('[admin/reco] analytics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load recommendation analytics',
      error: error?.message || 'Unknown error'
    });
  }
};
