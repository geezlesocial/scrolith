import express from 'express';
import { requirePermission, resolveStaffContext } from '../../middleware/rbac.middleware';
import {
  deactivateJourneyFlow,
  deactivateNotificationTemplate,
  getAdminQuietHours,
  getJourneySummary,
  listJourneyFlows,
  listJourneyRuns,
  listNotificationTemplates,
  saveJourneyFlow,
  saveNotificationTemplate,
  triggerJourneyRun
} from '../../services/journey.service';

const router = express.Router();

const asBoolean = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
};

const getStaffId = async (req: express.Request) => {
  const context = await resolveStaffContext(req);
  return context?.staffId || null;
};

const emitJourneyEvent = (req: express.Request, event: string, payload: Record<string, any>) => {
  const io = req.app.get('io');
  const communityIo = req.app.get('communityIo');
  io?.emit(event, payload);
  communityIo?.emit(event, payload);
};

const handleJourneyError = (res: express.Response, error: unknown, fallbackMessage: string) => {
  if (error instanceof Error) {
    const message = error.message || fallbackMessage;
    if (message.toLowerCase().includes('not found')) {
      return res.status(404).json({ success: false, error: message, code: 'NOT_FOUND' });
    }
    if (
      message.toLowerCase().includes('required') ||
      message.toLowerCase().includes('invalid') ||
      message.toLowerCase().includes('inactive')
    ) {
      return res.status(400).json({ success: false, error: message, code: 'VALIDATION_ERROR' });
    }
  }

  if (typeof error === 'object' && error && 'code' in error) {
    const prismaCode = String((error as { code?: unknown }).code || '');
    if (prismaCode === 'P2002') {
      return res.status(409).json({
        success: false,
        error: 'A record with that key already exists',
        code: 'CONFLICT'
      });
    }
  }

  console.error('[journeys] request failed', error);
  return res.status(500).json({ success: false, error: fallbackMessage, code: 'ERR_INTERNAL' });
};

router.get('/summary', requirePermission('journeys.read'), async (_req, res) => {
  try {
    const summary = await getJourneySummary();
    return res.json({ success: true, data: summary });
  } catch (error) {
    return handleJourneyError(res, error, 'Failed to load journey summary');
  }
});

router.get('/templates', requirePermission('journeys.read'), async (req, res) => {
  try {
    const rows = await listNotificationTemplates({
      query: String(req.query.query || ''),
      category: String(req.query.category || ''),
      activeOnly: asBoolean(req.query.activeOnly)
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleJourneyError(res, error, 'Failed to load notification templates');
  }
});

router.post('/templates', requirePermission('journeys.templates.manage'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const row = await saveNotificationTemplate(req.body || {}, staffId);
    emitJourneyEvent(req, 'journeys:updated', {
      action: 'template_created',
      templateId: row.id,
      key: row.key
    });
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    return handleJourneyError(res, error, 'Failed to create notification template');
  }
});

router.put('/templates/:id', requirePermission('journeys.templates.manage'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const row = await saveNotificationTemplate({ ...(req.body || {}), id: req.params.id }, staffId);
    emitJourneyEvent(req, 'journeys:updated', {
      action: 'template_updated',
      templateId: row.id,
      key: row.key
    });
    return res.json({ success: true, data: row });
  } catch (error) {
    return handleJourneyError(res, error, 'Failed to update notification template');
  }
});

router.delete('/templates/:id', requirePermission('journeys.templates.manage'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const row = await deactivateNotificationTemplate(req.params.id, staffId);
    emitJourneyEvent(req, 'journeys:updated', {
      action: 'template_deactivated',
      templateId: row.id,
      key: row.key
    });
    return res.json({ success: true, data: row });
  } catch (error) {
    return handleJourneyError(res, error, 'Failed to deactivate notification template');
  }
});

router.get('/flows', requirePermission('journeys.read'), async (req, res) => {
  try {
    const rows = await listJourneyFlows({
      query: String(req.query.query || ''),
      activeOnly: asBoolean(req.query.activeOnly)
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleJourneyError(res, error, 'Failed to load journey flows');
  }
});

router.post('/flows', requirePermission('journeys.flows.manage'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const row = await saveJourneyFlow(req.body || {}, staffId);
    emitJourneyEvent(req, 'journeys:updated', {
      action: 'flow_created',
      flowId: row.id,
      key: row.key
    });
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    return handleJourneyError(res, error, 'Failed to create journey flow');
  }
});

router.put('/flows/:id', requirePermission('journeys.flows.manage'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const row = await saveJourneyFlow({ ...(req.body || {}), id: req.params.id }, staffId);
    emitJourneyEvent(req, 'journeys:updated', {
      action: 'flow_updated',
      flowId: row.id,
      key: row.key
    });
    return res.json({ success: true, data: row });
  } catch (error) {
    return handleJourneyError(res, error, 'Failed to update journey flow');
  }
});

router.delete('/flows/:id', requirePermission('journeys.flows.manage'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const row = await deactivateJourneyFlow(req.params.id, staffId);
    emitJourneyEvent(req, 'journeys:updated', {
      action: 'flow_deactivated',
      flowId: row.id,
      key: row.key
    });
    return res.json({ success: true, data: row });
  } catch (error) {
    return handleJourneyError(res, error, 'Failed to deactivate journey flow');
  }
});

router.get('/runs', requirePermission('journeys.read'), async (req, res) => {
  try {
    const rows = await listJourneyRuns({
      status: String(req.query.status || ''),
      limit: Number(req.query.limit || 25)
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleJourneyError(res, error, 'Failed to load journey runs');
  }
});

router.post('/runs', requirePermission('journeys.runs.manage'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const row = await triggerJourneyRun(req.body || {}, staffId);
    emitJourneyEvent(req, 'journeys:updated', {
      action: 'run_created',
      runId: row.id,
      flowId: row.flowId,
      targetUserId: row.targetUserId
    });
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    return handleJourneyError(res, error, 'Failed to trigger journey run');
  }
});

router.get('/quiet-hours', requirePermission('journeys.quiet_hours.read'), async (req, res) => {
  try {
    const identifier = String(req.query.identifier || '').trim();
    if (!identifier) {
      return res.status(400).json({ success: false, error: 'identifier is required', code: 'VALIDATION_ERROR' });
    }
    const data = await getAdminQuietHours(identifier);
    return res.json({ success: true, data });
  } catch (error) {
    return handleJourneyError(res, error, 'Failed to load quiet hours');
  }
});

export default router;
