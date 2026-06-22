import express from 'express';
import { requirePermission } from '../../middleware/rbac.middleware';
import {
  addComplianceDecision,
  addComplianceEvidence,
  applyHoldAction,
  createComplianceCase,
  createRiskSnapshot,
  getComplianceSettings,
  getComplianceSummary,
  listAppeals,
  listComplianceCases,
  listRiskRules,
  releaseHoldAction,
  resolveAppeal,
  saveRiskRule,
  updateComplianceSettings
} from '../../services/compliance.service';
import { recordGovernedAdminAction } from '../../services/enterpriseGovernance.service';

const router = express.Router();

const handleError = (res: express.Response, error: any, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const lower = String(message || '').toLowerCase();
  const status =
    lower.includes('not found') ? 404 :
    lower.includes('required') || lower.includes('invalid') ? 400 :
    500;
  if (status >= 500) console.error('[compliance] request failed', error);
  return res.status(status).json({ success: false, error: message || fallback, code: status === 500 ? 'ERR_INTERNAL' : 'VALIDATION_ERROR' });
};

const emitEvent = (req: express.Request, event: string, payload: Record<string, any>) => {
  const io = req.app.get('io');
  io?.emit?.(event, payload);
};

router.get('/settings', requirePermission('compliance.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await getComplianceSettings() });
  } catch (error) {
    return handleError(res, error, 'Failed to load compliance settings');
  }
});

router.put('/settings', requirePermission('compliance.manage'), async (req, res) => {
  try {
    const data = await updateComplianceSettings(req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'compliance',
      actionKey: 'settings_update',
      entityType: 'compliance_settings',
      entityId: 'compliance_phase3',
      message: 'Compliance settings updated',
      metadata: { settings: data }
    });
    emitEvent(req, 'compliance:settings_updated', { settings: data });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to update compliance settings');
  }
});

router.get('/summary', requirePermission('compliance.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await getComplianceSummary() });
  } catch (error) {
    return handleError(res, error, 'Failed to load compliance summary');
  }
});

router.get('/cases', requirePermission('compliance.read'), async (req, res) => {
  try {
    const data = await listComplianceCases({
      caseType: String(req.query.caseType || ''),
      status: String(req.query.status || ''),
      assignedStaffId: String(req.query.assignedStaffId || ''),
      entityType: String(req.query.entityType || ''),
      query: String(req.query.query || ''),
      limit: Number(req.query.limit || 50)
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load compliance cases');
  }
});

router.post('/cases', requirePermission('compliance.manage'), async (req, res) => {
  try {
    const data = await createComplianceCase(req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'compliance',
      actionKey: 'case_create',
      entityType: 'compliance_case',
      entityId: data.id,
      message: `Compliance case created: ${data.caseNumber}`,
      metadata: { complianceCase: data }
    });
    emitEvent(req, 'compliance:case_updated', { caseId: data.id, status: data.status });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to create compliance case');
  }
});

router.post('/cases/:id/evidence', requirePermission('compliance.manage'), async (req, res) => {
  try {
    const data = await addComplianceEvidence(req.params.id, req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'compliance',
      actionKey: 'evidence_add',
      entityType: 'compliance_evidence',
      entityId: data.id,
      message: 'Compliance evidence attached',
      metadata: { evidence: data, caseId: req.params.id }
    });
    emitEvent(req, 'compliance:case_updated', { caseId: req.params.id, evidenceId: data.id });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to attach compliance evidence');
  }
});

router.post('/cases/:id/decisions', requirePermission('compliance.manage'), async (req, res) => {
  try {
    const data = await addComplianceDecision(req.params.id, {
      ...req.body,
      actorUserId: req.user?.id || null,
      actorStaffId: req.staffContext?.staffId || null
    });
    await recordGovernedAdminAction(req, {
      moduleKey: 'compliance',
      actionKey: 'decision_add',
      entityType: 'compliance_case',
      entityId: req.params.id,
      message: 'Compliance decision recorded',
      metadata: { complianceCase: data }
    });
    emitEvent(req, 'compliance:case_updated', { caseId: req.params.id, status: data?.status });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to record compliance decision');
  }
});

router.get('/risk-rules', requirePermission('risk.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await listRiskRules() });
  } catch (error) {
    return handleError(res, error, 'Failed to load risk rules');
  }
});

router.post('/risk-rules', requirePermission('risk.manage'), async (req, res) => {
  try {
    const data = await saveRiskRule(req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'compliance',
      actionKey: 'risk_rule_create',
      entityType: 'risk_rule',
      entityId: data.id,
      message: `Risk rule created: ${data.code}`,
      metadata: { riskRule: data }
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to create risk rule');
  }
});

router.put('/risk-rules/:id', requirePermission('risk.manage'), async (req, res) => {
  try {
    const data = await saveRiskRule(req.body || {}, req.params.id);
    await recordGovernedAdminAction(req, {
      moduleKey: 'compliance',
      actionKey: 'risk_rule_update',
      entityType: 'risk_rule',
      entityId: data.id,
      message: `Risk rule updated: ${data.code}`,
      metadata: { riskRule: data }
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to update risk rule');
  }
});

router.post('/risk-snapshots', requirePermission('risk.manage'), async (req, res) => {
  try {
    const data = await createRiskSnapshot(req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'compliance',
      actionKey: 'risk_snapshot_create',
      entityType: 'risk_snapshot',
      entityId: data.id,
      message: `Risk snapshot created for ${data.entityType}`,
      metadata: { riskSnapshot: data }
    });
    if (['HIGH', 'CRITICAL'].includes(String(data.level || '').toUpperCase())) {
      emitEvent(req, 'compliance:risk_alert', { entityType: data.entityType, entityId: data.entityId, level: data.level, score: data.score });
    }
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to create risk snapshot');
  }
});

router.post('/holds', requirePermission('holds.manage'), async (req, res) => {
  try {
    const data = await applyHoldAction(req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'compliance',
      actionKey: 'hold_apply',
      entityType: 'hold_action',
      entityId: data.id,
      message: `Hold applied: ${data.holdType}`,
      metadata: { holdAction: data }
    });
    emitEvent(req, 'compliance:hold_updated', { holdId: data.id, status: data.status, entityType: data.entityType, entityId: data.entityId });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to apply hold');
  }
});

router.post('/holds/:id/release', requirePermission('holds.manage'), async (req, res) => {
  try {
    const data = await releaseHoldAction(req.params.id, req.body?.metadata || null);
    await recordGovernedAdminAction(req, {
      moduleKey: 'compliance',
      actionKey: 'hold_release',
      entityType: 'hold_action',
      entityId: data.id,
      message: `Hold released: ${data.holdType}`,
      metadata: { holdAction: data }
    });
    emitEvent(req, 'compliance:hold_updated', { holdId: data.id, status: data.status, entityType: data.entityType, entityId: data.entityId });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to release hold');
  }
});

router.get('/appeals', requirePermission('appeals.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await listAppeals() });
  } catch (error) {
    return handleError(res, error, 'Failed to load appeals');
  }
});

router.post('/appeals/:id/resolve', requirePermission('appeals.manage'), async (req, res) => {
  try {
    const data = await resolveAppeal(req.params.id, req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'compliance',
      actionKey: 'appeal_resolve',
      entityType: 'compliance_appeal',
      entityId: data.id,
      message: 'Compliance appeal resolved',
      metadata: { appeal: data }
    });
    emitEvent(req, 'compliance:appeal_updated', { appealId: data.id, status: data.status });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to resolve appeal');
  }
});

export default router;
