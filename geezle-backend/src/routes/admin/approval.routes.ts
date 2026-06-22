import express from 'express';
import { requirePermission, resolveStaffContext } from '../../middleware/rbac.middleware';
import {
  createApprovalObservation,
  decideApprovalRequest,
  getApprovalPolicySummary,
  listApprovalPolicies,
  listApprovalRequests,
  saveApprovalPolicy
} from '../../services/approvalPolicy.service';
import { recordGovernedAdminAction } from '../../services/enterpriseGovernance.service';

const router = express.Router();

const getStaffId = async (req: express.Request) => {
  const context = await resolveStaffContext(req);
  return context?.staffId || null;
};

router.get('/summary', requirePermission('approvals.read'), async (_req, res) => {
  try {
    const data = await getApprovalPolicySummary();
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[approvals] summary failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load approval summary', code: 'ERR_INTERNAL' });
  }
});

router.get('/policies', requirePermission('approvals.read'), async (_req, res) => {
  try {
    const data = await listApprovalPolicies();
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[approvals] policies failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load approval policies', code: 'ERR_INTERNAL' });
  }
});

router.post('/policies', requirePermission('approvals.manage'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const data = await saveApprovalPolicy(req.body || {}, staffId);
    await recordGovernedAdminAction(req, {
      moduleKey: 'approvals',
      actionKey: 'policy_upsert',
      entityType: 'approval_policy',
      entityId: data.id,
      message: `Approval policy saved: ${data.label}`,
      metadata: { policy: data }
    });
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    console.error('[approvals] create policy failed', error);
    return res.status(400).json({ success: false, error: error?.message || 'Failed to save approval policy', code: 'VALIDATION_ERROR' });
  }
});

router.put('/policies/:id', requirePermission('approvals.manage'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const data = await saveApprovalPolicy({ ...(req.body || {}), id: req.params.id }, staffId);
    await recordGovernedAdminAction(req, {
      moduleKey: 'approvals',
      actionKey: 'policy_upsert',
      entityType: 'approval_policy',
      entityId: data.id,
      message: `Approval policy updated: ${data.label}`,
      metadata: { policy: data }
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('[approvals] update policy failed', error);
    return res.status(400).json({ success: false, error: error?.message || 'Failed to update approval policy', code: 'VALIDATION_ERROR' });
  }
});

router.get('/requests', requirePermission('approvals.read'), async (req, res) => {
  try {
    const data = await listApprovalRequests({
      status: String(req.query.status || ''),
      moduleKey: String(req.query.moduleKey || ''),
      limit: Number(req.query.limit || 50)
    });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[approvals] requests failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load approval requests', code: 'ERR_INTERNAL' });
  }
});

router.post('/requests/observe', requirePermission('approvals.manage'), async (req, res) => {
  try {
    const context = await resolveStaffContext(req);
    const data = await createApprovalObservation({
      moduleKey: String(req.body?.moduleKey || ''),
      actionKey: String(req.body?.actionKey || ''),
      entityType: String(req.body?.entityType || ''),
      entityId: String(req.body?.entityId || '').trim() || null,
      title: String(req.body?.title || ''),
      summary: String(req.body?.summary || '').trim() || null,
      requestedByUserId: String(req.user?.id || '').trim() || null,
      requestedByStaffId: context?.staffId || null,
      payload: req.body?.payload || null,
      metadata: req.body?.metadata || null
    });
    await recordGovernedAdminAction(req, {
      moduleKey: 'approvals',
      actionKey: 'request_observe',
      entityType: 'approval_request',
      entityId: data?.id || null,
      message: `Approval request observed: ${data?.title || req.body?.title || 'unnamed request'}`,
      metadata: { request: data }
    });
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    console.error('[approvals] observe failed', error);
    return res.status(400).json({ success: false, error: error?.message || 'Failed to observe approval request', code: 'VALIDATION_ERROR' });
  }
});

router.post('/requests/:id/approve', requirePermission('approvals.review'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const data = await decideApprovalRequest(req.params.id, 'APPROVED', staffId, String(req.body?.reason || ''));
    await recordGovernedAdminAction(req, {
      moduleKey: 'approvals',
      actionKey: 'request_approve',
      entityType: 'approval_request',
      entityId: data.id,
      message: `Approval request approved: ${data.title}`,
      metadata: { request: data }
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('[approvals] approve failed', error);
    return res.status(400).json({ success: false, error: error?.message || 'Failed to approve request', code: 'VALIDATION_ERROR' });
  }
});

router.post('/requests/:id/reject', requirePermission('approvals.review'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const data = await decideApprovalRequest(req.params.id, 'REJECTED', staffId, String(req.body?.reason || ''));
    await recordGovernedAdminAction(req, {
      moduleKey: 'approvals',
      actionKey: 'request_reject',
      entityType: 'approval_request',
      entityId: data.id,
      message: `Approval request rejected: ${data.title}`,
      metadata: { request: data }
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('[approvals] reject failed', error);
    return res.status(400).json({ success: false, error: error?.message || 'Failed to reject request', code: 'VALIDATION_ERROR' });
  }
});

export default router;
