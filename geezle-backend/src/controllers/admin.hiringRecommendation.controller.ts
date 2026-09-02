import { Request, Response } from 'express';
import {
  DEFAULT_HIRING_RECOMMENDATION_CONFIG,
  getHiringRecommendationAnalytics,
  getHiringRecommendationConfig,
  normalizeHiringRecommendationConfig,
  updateHiringRecommendationConfig
} from '../services/hiringRecommendation.service';
import { extractRequestAuditMeta, writeAdminAuditEvent } from '../services/adminAudit.service';

const audit = async (req: Request, actionKey: string, metadata?: Record<string, any>) => {
  const meta = await extractRequestAuditMeta(req);
  await writeAdminAuditEvent({
    ...meta,
    moduleKey: 'hiring_recommendations',
    actionKey,
    entityType: 'hiring_recommendation_config',
    entityId: 'global',
    metadata: metadata || null
  });
};

const emit = (req: Request, payload: any) => {
  try {
    req.app.get('io')?.emit('hiring_recommendations:config_updated', payload);
  } catch (error) {
    console.warn('[hiring-recommendation] config event failed', error);
  }
};

export const getAdminHiringRecommendationConfigController = async (_req: Request, res: Response) => {
  try {
    return res.json({ success: true, data: await getHiringRecommendationConfig() });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load hiring recommendations' });
  }
};

export const updateAdminHiringRecommendationConfigController = async (req: Request, res: Response) => {
  try {
    const current = await getHiringRecommendationConfig();
    const data = await updateHiringRecommendationConfig(req.body, req.user?.id);
    await audit(req, 'config.updated', { previous: current, next: data });
    emit(req, { updatedAt: new Date().toISOString() });
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error?.message || 'Invalid hiring recommendation settings' });
  }
};

export const resetAdminHiringRecommendationConfigController = async (req: Request, res: Response) => {
  try {
    const data = await updateHiringRecommendationConfig(DEFAULT_HIRING_RECOMMENDATION_CONFIG, req.user?.id);
    await audit(req, 'config.reset');
    emit(req, { updatedAt: new Date().toISOString(), reset: true });
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to reset hiring recommendation settings' });
  }
};

export const setAdminHiringRecommendationEnabledController = async (req: Request, res: Response) => {
  try {
    const state = String(req.params.state || '').toLowerCase();
    if (state !== 'enable' && state !== 'disable') {
      return res.status(400).json({ success: false, error: 'State must be enable or disable' });
    }
    const current = await getHiringRecommendationConfig();
    const data = await updateHiringRecommendationConfig({ ...current, enabled: state === 'enable' }, req.user?.id);
    await audit(req, state === 'enable' ? 'system.enabled' : 'system.disabled', { enabled: data.enabled });
    emit(req, { enabled: data.enabled, updatedAt: new Date().toISOString() });
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error?.message || 'Failed to update global recommendation state' });
  }
};

export const getAdminHiringRecommendationAnalyticsController = async (req: Request, res: Response) => {
  try {
    return res.json({ success: true, data: await getHiringRecommendationAnalytics(req.query.days) });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load hiring recommendation analytics' });
  }
};
