import express from 'express';
import { requirePermission, resolveStaffContext } from '../../middleware/rbac.middleware';
import {
  getModerationTrustSummary,
  listContentPolicies,
  listModerationAppeals,
  listModerationCases,
  resolveModerationAppeal,
  saveContentPolicy
} from '../../services/trust.service';

const router = express.Router();

const emitModerationEvent = (req: express.Request, event: string, payload: Record<string, any>) => {
  const io = req.app.get('io');
  const communityIo = req.app.get('communityIo');
  io?.emit(event, payload);
  communityIo?.emit(event, payload);
};

const getStaffId = async (req: express.Request) => {
  const context = await resolveStaffContext(req);
  return context?.staffId || null;
};

const handleError = (res: express.Response, error: unknown, fallbackMessage: string) => {
  if (error instanceof Error) {
    const message = error.message || fallbackMessage;
    if (message.toLowerCase().includes('not found')) {
      return res.status(404).json({ success: false, error: message, code: 'NOT_FOUND' });
    }
    if (message.toLowerCase().includes('required')) {
      return res.status(400).json({ success: false, error: message, code: 'VALIDATION_ERROR' });
    }
  }
  const prismaError = error as { code?: string } | null;
  if (prismaError?.code === 'P2002') {
    return res.status(409).json({ success: false, error: 'A record with that key already exists', code: 'CONFLICT' });
  }
  console.error('[moderation-policies] request failed', error);
  return res.status(500).json({ success: false, error: fallbackMessage, code: 'ERR_INTERNAL' });
};

router.get('/summary', requirePermission('moderation.policies.read'), async (_req, res) => {
  try {
    const summary = await getModerationTrustSummary();
    return res.json({ success: true, data: summary });
  } catch (error) {
    return handleError(res, error, 'Failed to load moderation trust summary');
  }
});

router.get('/', requirePermission('moderation.policies.read'), async (req, res) => {
  try {
    const rows = await listContentPolicies({
      contentType: String(req.query.contentType || ''),
      query: String(req.query.query || ''),
      activeOnly:
        req.query.activeOnly === undefined ? undefined : ['1', 'true', 'yes', 'on'].includes(String(req.query.activeOnly).toLowerCase())
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleError(res, error, 'Failed to load moderation policies');
  }
});

router.post('/', requirePermission('moderation.policies.write'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const policy = await saveContentPolicy(req.body || {}, staffId);
    emitModerationEvent(req, 'moderation:policy_updated', {
      action: 'created',
      policyId: policy.id,
      key: policy.key,
      contentType: policy.contentType
    });
    return res.status(201).json({ success: true, data: policy });
  } catch (error) {
    return handleError(res, error, 'Failed to create moderation policy');
  }
});

router.put('/:id', requirePermission('moderation.policies.write'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const policy = await saveContentPolicy({ ...(req.body || {}), id: req.params.id }, staffId);
    emitModerationEvent(req, 'moderation:policy_updated', {
      action: 'updated',
      policyId: policy.id,
      key: policy.key,
      contentType: policy.contentType
    });
    return res.json({ success: true, data: policy });
  } catch (error) {
    return handleError(res, error, 'Failed to update moderation policy');
  }
});

router.get('/cases', requirePermission('moderation.policies.read'), async (req, res) => {
  try {
    const rows = await listModerationCases({
      status: String(req.query.status || ''),
      contentType: String(req.query.contentType || ''),
      query: String(req.query.query || ''),
      limit: Number(req.query.limit || 50)
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleError(res, error, 'Failed to load moderation cases');
  }
});

router.get('/appeals', requirePermission('moderation.appeals.manage'), async (req, res) => {
  try {
    const rows = await listModerationAppeals({
      status: String(req.query.status || ''),
      query: String(req.query.query || ''),
      limit: Number(req.query.limit || 50)
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleError(res, error, 'Failed to load moderation appeals');
  }
});

router.post('/appeals/:id/resolve', requirePermission('moderation.appeals.manage'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const appeal = await resolveModerationAppeal(req.params.id, req.body || {}, staffId, req.user?.id || null);
    emitModerationEvent(req, 'moderation:appeal_updated', {
      action: 'resolved',
      appealId: appeal.id,
      caseId: appeal.caseId,
      status: appeal.status
    });
    return res.json({ success: true, data: appeal });
  } catch (error) {
    return handleError(res, error, 'Failed to resolve moderation appeal');
  }
});

export default router;
