import express from 'express';
import { requirePermission, resolveStaffContext } from '../../middleware/rbac.middleware';
import {
  getRealtimeOpsSummary,
  listDeliveryReplayJobs,
  listEventDeliveries,
  listPresenceLeases,
  listRealtimeIncidents,
  listRealtimeRuntime,
  listSocketSessions,
  recordRealtimeIncident,
  replayEventDelivery,
  resolveRealtimeIncident
} from '../../services/realtimeOps.service';

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

const emitRealtimeEvent = (req: express.Request, event: string, payload: Record<string, any>) => {
  const io = req.app.get('io');
  const communityIo = req.app.get('communityIo');
  io?.emit(event, payload);
  communityIo?.emit(event, payload);
};

const handleRealtimeError = (res: express.Response, error: unknown, fallbackMessage: string) => {
  if (error instanceof Error) {
    const message = error.message || fallbackMessage;
    if (message.toLowerCase().includes('not found')) {
      return res.status(404).json({ success: false, error: message, code: 'NOT_FOUND' });
    }
    if (message.toLowerCase().includes('required')) {
      return res.status(400).json({ success: false, error: message, code: 'VALIDATION_ERROR' });
    }
  }
  console.error('[realtime-ops] request failed', error);
  return res.status(500).json({ success: false, error: fallbackMessage, code: 'ERR_INTERNAL' });
};

router.get('/summary', requirePermission('realtime.read'), async (_req, res) => {
  try {
    const summary = await getRealtimeOpsSummary();
    return res.json({ success: true, data: summary });
  } catch (error) {
    return handleRealtimeError(res, error, 'Failed to load realtime ops summary');
  }
});

router.get('/runtime', requirePermission('realtime.read'), async (_req, res) => {
  try {
    const runtime = await listRealtimeRuntime();
    return res.json({ success: true, data: runtime });
  } catch (error) {
    return handleRealtimeError(res, error, 'Failed to load realtime runtime state');
  }
});

router.get('/socket-sessions', requirePermission('realtime.read'), async (req, res) => {
  try {
    const sessions = await listSocketSessions({
      namespace: String(req.query.namespace || ''),
      query: String(req.query.query || ''),
      activeOnly: asBoolean(req.query.activeOnly),
      limit: Number(req.query.limit || 30)
    });
    return res.json({ success: true, data: sessions });
  } catch (error) {
    return handleRealtimeError(res, error, 'Failed to load realtime socket sessions');
  }
});

router.get('/presence', requirePermission('realtime.read'), async (req, res) => {
  try {
    const rows = await listPresenceLeases({
      namespace: String(req.query.namespace || ''),
      query: String(req.query.query || ''),
      activeOnly: asBoolean(req.query.activeOnly),
      limit: Number(req.query.limit || 30)
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleRealtimeError(res, error, 'Failed to load presence leases');
  }
});

router.get('/deliveries', requirePermission('realtime.read'), async (req, res) => {
  try {
    const rows = await listEventDeliveries({
      namespace: String(req.query.namespace || ''),
      eventName: String(req.query.eventName || ''),
      status: String(req.query.status || ''),
      query: String(req.query.query || ''),
      limit: Number(req.query.limit || 40)
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleRealtimeError(res, error, 'Failed to load realtime deliveries');
  }
});

router.post('/deliveries/:id/replay', requirePermission('realtime.replay.manage'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const result = await replayEventDelivery({
      deliveryId: req.params.id,
      createdByStaffId: staffId,
      io: req.app.get('io'),
      communityIo: req.app.get('communityIo')
    });
    emitRealtimeEvent(req, 'delivery:replayed', {
      action: 'replayed',
      deliveryId: result.delivery.id,
      replayId: result.replay.id,
      eventName: result.delivery.eventName,
      namespace: result.delivery.namespace
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return handleRealtimeError(res, error, 'Failed to replay realtime delivery');
  }
});

router.get('/incidents', requirePermission('realtime.read'), async (req, res) => {
  try {
    const rows = await listRealtimeIncidents({
      status: String(req.query.status || ''),
      severity: String(req.query.severity || ''),
      limit: Number(req.query.limit || 30)
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleRealtimeError(res, error, 'Failed to load realtime incidents');
  }
});

router.post('/incidents', requirePermission('realtime.incidents.manage'), async (req, res) => {
  try {
    const incident = await recordRealtimeIncident({
      code: String(req.body?.code || ''),
      severity: String(req.body?.severity || 'ERROR'),
      source: String(req.body?.source || 'manual'),
      message: String(req.body?.message || ''),
      details: req.body?.details
    });
    emitRealtimeEvent(req, 'realtime:incident_opened', {
      action: 'created',
      incidentId: incident.id,
      code: incident.code,
      severity: incident.severity
    });
    return res.status(201).json({ success: true, data: incident });
  } catch (error) {
    return handleRealtimeError(res, error, 'Failed to create realtime incident');
  }
});

router.put('/incidents/:id/resolve', requirePermission('realtime.incidents.manage'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const incident = await resolveRealtimeIncident(
      req.params.id,
      {
        notes: String(req.body?.notes || ''),
        status: String(req.body?.status || 'RESOLVED')
      },
      staffId
    );
    emitRealtimeEvent(req, 'realtime:incident_resolved', {
      action: 'resolved',
      incidentId: incident.id,
      code: incident.code,
      status: incident.status
    });
    return res.json({ success: true, data: incident });
  } catch (error) {
    return handleRealtimeError(res, error, 'Failed to resolve realtime incident');
  }
});

router.get('/replays', requirePermission('realtime.read'), async (req, res) => {
  try {
    const rows = await listDeliveryReplayJobs({
      status: String(req.query.status || ''),
      limit: Number(req.query.limit || 30)
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleRealtimeError(res, error, 'Failed to load replay jobs');
  }
});

export default router;
