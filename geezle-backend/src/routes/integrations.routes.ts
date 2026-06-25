import express from 'express';
import {
  getEnterpriseTalentCloudSnapshot,
  getInboundConnectorStatus,
  ingestInboundConnectorEvent
} from '../services/talentCloud.service';

const router = express.Router();

const handleError = (res: express.Response, error: any, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const lower = String(message || '').toLowerCase();
  const status =
    lower.includes('not found') ? 404 :
    lower.includes('not active') ? 409 :
    lower.includes('invalid') ? 401 :
    lower.includes('allowed') ? 400 :
    500;
  if (status >= 500) console.error('[integrations] inbound connector failed', error);
  return res.status(status).json({ success: false, error: message || fallback });
};

router.post('/inbound/:id', async (req, res) => {
  try {
    const data = await ingestInboundConnectorEvent(String(req.params.id || '').trim(), req.headers as Record<string, any>, req.body || {});
    const io = req.app.get('io');
    io?.emit?.('integrations:connector_ingested', {
      connectorId: data.connectorId,
      providerKey: data.providerKey,
      sourceEventType: data.sourceEventType,
      forwardedEventType: data.forwardedEventType
    });
    return res.status(202).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to ingest connector event');
  }
});

router.get('/inbound/:id/status', async (req, res) => {
  try {
    const data = await getInboundConnectorStatus(String(req.params.id || '').trim(), req.headers as Record<string, any>);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load connector status');
  }
});

router.get('/enterprise/talent-cloud/snapshot', async (req, res) => {
  try {
    const data = await getEnterpriseTalentCloudSnapshot(req.headers as Record<string, any>);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load enterprise talent cloud snapshot');
  }
});

export default router;
