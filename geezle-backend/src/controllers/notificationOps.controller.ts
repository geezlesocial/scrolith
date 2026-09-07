/**
 * Phase 32.4 — Admin notification operations controllers.
 */
import { Request, Response } from 'express';
import { NotificationOpsOverviewService } from '../services/notificationCenter/ops/opsOverview.service';
import { NotificationOpsRetryService } from '../services/notificationCenter/ops/opsRetry.service';
import { NotificationOpsTemplateService } from '../services/notificationCenter/ops/opsTemplate.service';
import { NotificationOpsCampaignService } from '../services/notificationCenter/ops/opsCampaign.service';
import { NotificationOpsConfigService } from '../services/notificationCenter/ops/opsConfig.service';
import { NotificationAdminDefaultsService } from '../services/notificationCenter/adminDefaults.service';
import { EngagementMilestoneAdminService } from '../services/engagementMilestones/admin.service';

const actor = (req: Request) => (req as any).user?.id as string | undefined;

const handle = (res: Response, error: any, fallback: string) => {
  const status = Number(error?.statusCode || 500);
  return res.status(status).json({
    success: false,
    code: error?.code,
    error: error?.message || fallback
  });
};

export const opsOverview = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsOverviewService.getOverview({
      range: String(req.query.range || 'today'),
      from: req.query.from ? String(req.query.from) : undefined,
      to: req.query.to ? String(req.query.to) : undefined
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to load ops overview');
  }
};

export const opsDelivery = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsOverviewService.getDeliveryBreakdown({
      range: String(req.query.range || '7d'),
      from: req.query.from ? String(req.query.from) : undefined,
      to: req.query.to ? String(req.query.to) : undefined
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to load delivery metrics');
  }
};

export const opsLive = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsOverviewService.getLiveActivity(Number(req.query.limit || 40));
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to load live activity');
  }
};

export const opsAudit = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsOverviewService.getAuditLogs({
      limit: Number(req.query.limit || 50),
      action: req.query.action ? String(req.query.action) : undefined
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to load audit logs');
  }
};

export const opsDeviceHealth = async (_req: Request, res: Response) => {
  try {
    const data = await NotificationOpsOverviewService.getDeviceHealth();
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to load device health');
  }
};

export const opsQueueHealth = async (_req: Request, res: Response) => {
  try {
    const data = await NotificationOpsOverviewService.getQueueHealth();
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to load queue health');
  }
};

export const opsListRetries = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsRetryService.list({
      status: req.query.status ? String(req.query.status) : undefined,
      channel: req.query.channel ? String(req.query.channel) : undefined,
      limit: Number(req.query.limit || 50)
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to list retries');
  }
};

export const opsEnqueueRetries = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsRetryService.enqueueFromFailures(
      Number(req.body?.limit || 50),
      actor(req)
    );
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to enqueue retries');
  }
};

export const opsRetryOne = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsRetryService.retryOne(String(req.params.id), actor(req));
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to retry job');
  }
};

export const opsRetryBatch = async (req: Request, res: Response) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const data = await NotificationOpsRetryService.retryBatch(ids, actor(req));
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to retry batch');
  }
};

export const opsCancelRetry = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsRetryService.cancel(String(req.params.id), actor(req));
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to cancel retry');
  }
};

export const opsListFailures = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsRetryService.listFailures(Number(req.query.limit || 50));
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to list failures');
  }
};

export const opsListTemplates = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsTemplateService.list({
      channel: req.query.channel ? String(req.query.channel) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      locale: req.query.locale ? String(req.query.locale) : undefined
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to list templates');
  }
};

export const opsGetTemplate = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsTemplateService.get(String(req.params.id));
    if (!data) return res.status(404).json({ success: false, error: 'Template not found' });
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to load template');
  }
};

export const opsCreateTemplate = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsTemplateService.create(req.body || {}, actor(req));
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to create template');
  }
};

export const opsUpdateTemplate = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsTemplateService.update(
      String(req.params.id),
      req.body || {},
      actor(req),
      { newVersion: Boolean(req.body?.newVersion) }
    );
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to update template');
  }
};

export const opsPublishTemplate = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsTemplateService.publish(String(req.params.id), actor(req));
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to publish template');
  }
};

export const opsRollbackTemplate = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsTemplateService.rollback(String(req.params.id), actor(req));
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to rollback template');
  }
};

export const opsPreviewTemplate = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsTemplateService.preview(
      String(req.params.id),
      req.body?.variables || {}
    );
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to preview template');
  }
};

export const opsTemplateHistory = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsTemplateService.history(
      String(req.params.key),
      req.query.channel ? String(req.query.channel) : undefined
    );
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to load template history');
  }
};

export const opsListCampaigns = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsCampaignService.list({
      status: req.query.status ? String(req.query.status) : undefined,
      type: req.query.type ? String(req.query.type) : undefined,
      limit: Number(req.query.limit || 50)
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to list campaigns');
  }
};

export const opsGetCampaign = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsCampaignService.get(String(req.params.id));
    if (!data) return res.status(404).json({ success: false, error: 'Campaign not found' });
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to load campaign');
  }
};

export const opsCreateCampaign = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsCampaignService.create(req.body || {}, actor(req));
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to create campaign');
  }
};

export const opsUpdateCampaign = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsCampaignService.update(
      String(req.params.id),
      req.body || {},
      actor(req)
    );
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to update campaign');
  }
};

export const opsConfirmEmergency = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsCampaignService.confirmEmergency(
      String(req.params.id),
      String(req.body?.reason || ''),
      actor(req)
    );
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to confirm emergency');
  }
};

export const opsSendCampaign = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsCampaignService.send(String(req.params.id), actor(req), {
      confirm: Boolean(req.body?.confirm),
      reason: req.body?.reason
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to send campaign');
  }
};

export const opsCancelCampaign = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsCampaignService.cancel(String(req.params.id), actor(req));
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to cancel campaign');
  }
};

export const opsPreviewCampaign = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsCampaignService.preview(String(req.params.id));
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to preview campaign');
  }
};

export const opsGetFlags = async (_req: Request, res: Response) => {
  try {
    const data = await NotificationOpsConfigService.getFeatureFlags();
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to load feature flags');
  }
};

export const opsPutFlags = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsConfigService.updateFeatureFlags(req.body || {}, actor(req));
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to update feature flags');
  }
};

export const opsGetRetention = async (_req: Request, res: Response) => {
  try {
    const data = await NotificationOpsConfigService.getRetention();
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to load retention');
  }
};

export const opsPutRetention = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsConfigService.updateRetention(req.body || {}, actor(req));
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to update retention');
  }
};

export const opsGetSettings = async (_req: Request, res: Response) => {
  try {
    const [settings, defaults] = await Promise.all([
      NotificationOpsConfigService.getSettings(),
      Promise.resolve(NotificationAdminDefaultsService.get())
    ]);
    return res.json({ success: true, data: { ...settings, adminDefaults: defaults } });
  } catch (error: any) {
    return handle(res, error, 'Failed to load settings');
  }
};

export const opsPutSettings = async (req: Request, res: Response) => {
  try {
    const data = await NotificationOpsConfigService.updateSettings(req.body || {}, actor(req));
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to update settings');
  }
};

export const opsListEngagementRules = async (_req: Request, res: Response) => {
  try { return res.json({ success: true, data: await EngagementMilestoneAdminService.listRules() }); }
  catch (error: any) { return handle(res, error, 'Failed to load engagement rules'); }
};

export const opsCreateEngagementRule = async (req: Request, res: Response) => {
  try { return res.status(201).json({ success: true, data: await EngagementMilestoneAdminService.createRule(req.body || {}, actor(req)) }); }
  catch (error: any) { return handle(res, error, 'Failed to create engagement rule'); }
};

export const opsUpdateEngagementRule = async (req: Request, res: Response) => {
  try { return res.json({ success: true, data: await EngagementMilestoneAdminService.updateRule(String(req.params.id), req.body || {}, actor(req)) }); }
  catch (error: any) { return handle(res, error, 'Failed to update engagement rule'); }
};

export const opsGetEngagementState = async (_req: Request, res: Response) => {
  try { return res.json({ success: true, data: await EngagementMilestoneAdminService.getGlobalState() }); }
  catch (error: any) { return handle(res, error, 'Failed to load engagement automation state'); }
};

export const opsPutEngagementState = async (req: Request, res: Response) => {
  try { return res.json({ success: true, data: await EngagementMilestoneAdminService.setGlobalPause(Boolean(req.body?.paused), actor(req)) }); }
  catch (error: any) { return handle(res, error, 'Failed to update engagement automation state'); }
};

export const opsGetEngagementStats = async (_req: Request, res: Response) => {
  try { return res.json({ success: true, data: await EngagementMilestoneAdminService.stats() }); }
  catch (error: any) { return handle(res, error, 'Failed to load engagement automation stats'); }
};

export const opsPreviewEngagementRule = async (req: Request, res: Response) => {
  try { return res.json({ success: true, data: EngagementMilestoneAdminService.preview(req.body || {}) }); }
  catch (error: any) { return handle(res, error, 'Failed to preview engagement rule'); }
};
