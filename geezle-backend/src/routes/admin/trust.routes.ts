import express from 'express';
import { requirePermission, resolveStaffContext } from '../../middleware/rbac.middleware';
import {
  createRiskSignal,
  getTrustProfileDetails,
  listRiskSignals,
  listTrustProfiles,
  recomputeTrustProfile,
  updateRiskSignal
} from '../../services/trust.service';

const router = express.Router();

const emitTrustEvent = (req: express.Request, event: string, payload: Record<string, any>) => {
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
  console.error('[trust] request failed', error);
  return res.status(500).json({ success: false, error: fallbackMessage, code: 'ERR_INTERNAL' });
};

router.get('/users', requirePermission('trust.read'), async (req, res) => {
  try {
    const rows = await listTrustProfiles({
      riskLevel: String(req.query.riskLevel || ''),
      query: String(req.query.query || ''),
      limit: Number(req.query.limit || 50)
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleError(res, error, 'Failed to load trust profiles');
  }
});

router.get('/users/:userId', requirePermission('trust.read'), async (req, res) => {
  try {
    const data = await getTrustProfileDetails(req.params.userId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load trust profile details');
  }
});

router.post('/users/:userId/recompute', requirePermission('trust.write'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const profile = await recomputeTrustProfile(req.params.userId, staffId);
    emitTrustEvent(req, 'trust:profile_updated', {
      action: 'recomputed',
      userId: profile.userId,
      profileId: profile.id,
      riskLevel: profile.riskLevel,
      score: profile.score
    });
    return res.json({ success: true, data: profile });
  } catch (error) {
    return handleError(res, error, 'Failed to recompute trust profile');
  }
});

router.get('/signals', requirePermission('trust.read'), async (req, res) => {
  try {
    const rows = await listRiskSignals({
      status: String(req.query.status || ''),
      severity: String(req.query.severity || ''),
      query: String(req.query.query || ''),
      userId: String(req.query.userId || ''),
      limit: Number(req.query.limit || 50)
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleError(res, error, 'Failed to load trust signals');
  }
});

router.post('/signals', requirePermission('trust.write'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const signal = await createRiskSignal(req.body || {}, staffId);
    emitTrustEvent(req, 'trust:signal_updated', {
      action: 'created',
      signalId: signal.id,
      userId: signal.userId,
      severity: signal.severity
    });
    emitTrustEvent(req, 'trust:profile_updated', {
      action: 'signal_created',
      userId: signal.userId
    });
    return res.status(201).json({ success: true, data: signal });
  } catch (error) {
    return handleError(res, error, 'Failed to create trust signal');
  }
});

router.put('/signals/:id', requirePermission('trust.write'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const signal = await updateRiskSignal(req.params.id, req.body || {}, staffId);
    emitTrustEvent(req, 'trust:signal_updated', {
      action: 'updated',
      signalId: signal.id,
      userId: signal.userId,
      status: signal.status
    });
    emitTrustEvent(req, 'trust:profile_updated', {
      action: 'signal_updated',
      userId: signal.userId
    });
    return res.json({ success: true, data: signal });
  } catch (error) {
    return handleError(res, error, 'Failed to update trust signal');
  }
});

export default router;
