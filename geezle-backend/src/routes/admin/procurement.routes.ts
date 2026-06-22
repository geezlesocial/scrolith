import express from 'express';
import { requirePermission, resolveStaffContext } from '../../middleware/rbac.middleware';
import {
  createCreditNote,
  createInvoiceRecord,
  generateConsolidatedInvoicePackage,
  getInvoicePackage,
  getProcurementSettings,
  getProcurementSummary,
  listApprovalQueue,
  listBudgetRules,
  listCostCenters,
  listInvoiceRecords,
  listPurchaseRequests,
  saveBudgetRule,
  saveCostCenter,
  updateInvoiceStatus,
  updateProcurementSettings,
  decidePurchaseRequest
} from '../../services/procurement.service';
import { recordGovernedAdminAction } from '../../services/enterpriseGovernance.service';
import { publishIntegrationEvent } from '../../services/talentCloud.service';

const router = express.Router();

const handleError = (res: express.Response, error: any, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const lower = String(message || '').toLowerCase();
  const status =
    lower.includes('not found') ? 404 :
    lower.includes('required') || lower.includes('invalid') ? 400 :
    500;
  if (status >= 500) console.error('[procurement] request failed', error);
  return res.status(status).json({ success: false, error: message || fallback, code: status === 500 ? 'ERR_INTERNAL' : 'VALIDATION_ERROR' });
};

const getStaffId = async (req: express.Request) => {
  const context = await resolveStaffContext(req);
  return context?.staffId || null;
};

const emitProcurementEvent = (req: express.Request, event: string, payload: Record<string, any>) => {
  const io = req.app.get('io');
  io?.emit?.(event, payload);
};

router.get('/summary', requirePermission('procurement.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await getProcurementSummary() });
  } catch (error) {
    return handleError(res, error, 'Failed to load procurement summary');
  }
});

router.get('/settings', requirePermission('procurement.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await getProcurementSettings() });
  } catch (error) {
    return handleError(res, error, 'Failed to load procurement settings');
  }
});

router.put('/settings', requirePermission('procurement.manage'), async (req, res) => {
  try {
    const data = await updateProcurementSettings(req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'procurement',
      actionKey: 'settings_update',
      entityType: 'procurement_settings',
      entityId: 'procurement_phase2',
      message: 'Procurement settings updated',
      metadata: { settings: data },
      approvalActionKey: 'enterprise_change',
      approvalEntityType: 'procurement_settings',
      approvalTitle: 'Procurement settings updated'
    });
    emitProcurementEvent(req, 'procurement:settings_updated', { settings: data });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to update procurement settings');
  }
});

router.get('/cost-centers', requirePermission('procurement.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await listCostCenters() });
  } catch (error) {
    return handleError(res, error, 'Failed to load cost centers');
  }
});

router.post('/cost-centers', requirePermission('procurement.manage'), async (req, res) => {
  try {
    const data = await saveCostCenter(req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'procurement',
      actionKey: 'cost_center_create',
      entityType: 'cost_center',
      entityId: data.id,
      message: `Cost center created: ${data.code}`,
      metadata: { costCenter: data }
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to create cost center');
  }
});

router.put('/cost-centers/:id', requirePermission('procurement.manage'), async (req, res) => {
  try {
    const data = await saveCostCenter(req.body || {}, req.params.id);
    await recordGovernedAdminAction(req, {
      moduleKey: 'procurement',
      actionKey: 'cost_center_update',
      entityType: 'cost_center',
      entityId: data.id,
      message: `Cost center updated: ${data.code}`,
      metadata: { costCenter: data }
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to update cost center');
  }
});

router.get('/budget-rules', requirePermission('budgets.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await listBudgetRules() });
  } catch (error) {
    return handleError(res, error, 'Failed to load budget rules');
  }
});

router.post('/budget-rules', requirePermission('budgets.manage'), async (req, res) => {
  try {
    const data = await saveBudgetRule(req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'procurement',
      actionKey: 'budget_rule_create',
      entityType: 'budget_rule',
      entityId: data.id,
      message: 'Budget rule created',
      metadata: { budgetRule: data }
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to create budget rule');
  }
});

router.put('/budget-rules/:id', requirePermission('budgets.manage'), async (req, res) => {
  try {
    const data = await saveBudgetRule(req.body || {}, req.params.id);
    await recordGovernedAdminAction(req, {
      moduleKey: 'procurement',
      actionKey: 'budget_rule_update',
      entityType: 'budget_rule',
      entityId: data.id,
      message: 'Budget rule updated',
      metadata: { budgetRule: data }
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to update budget rule');
  }
});

router.get('/purchase-requests', requirePermission('procurement.read'), async (req, res) => {
  try {
    const data = await listPurchaseRequests({
      status: String(req.query.status || ''),
      financeStatus: String(req.query.financeStatus || ''),
      costCenterId: String(req.query.costCenterId || ''),
      query: String(req.query.query || ''),
      limit: Number(req.query.limit || 50)
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load purchase requests');
  }
});

router.get('/approvals/queue', requirePermission('approvals.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await listApprovalQueue() });
  } catch (error) {
    return handleError(res, error, 'Failed to load approvals queue');
  }
});

router.post('/purchase-requests/:id/approve', requirePermission('approvals.review'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const data = await decidePurchaseRequest(
      req.params.id,
      'APPROVED',
      String(req.user?.id || '') || null,
      staffId,
      String(req.body?.note || ''),
      String(req.body?.idempotencyKey || '')
    );
    await recordGovernedAdminAction(req, {
      moduleKey: 'procurement',
      actionKey: 'purchase_request_approve',
      entityType: 'purchase_request',
      entityId: data?.id || req.params.id,
      message: `Purchase request approved: ${data?.requestNumber || req.params.id}`,
      metadata: { purchaseRequest: data }
    });
    await publishIntegrationEvent('procurement.purchase_request.approved', {
      purchaseRequestId: data?.id,
      requestNumber: data?.requestNumber,
      amount: data?.amount,
      currency: data?.currency,
      status: data?.status
    });
    emitProcurementEvent(req, 'procurement:approval_updated', { purchaseRequestId: data?.id, status: data?.status });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to approve purchase request');
  }
});

router.post('/purchase-requests/:id/reject', requirePermission('approvals.review'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const data = await decidePurchaseRequest(
      req.params.id,
      'REJECTED',
      String(req.user?.id || '') || null,
      staffId,
      String(req.body?.note || ''),
      String(req.body?.idempotencyKey || '')
    );
    await recordGovernedAdminAction(req, {
      moduleKey: 'procurement',
      actionKey: 'purchase_request_reject',
      entityType: 'purchase_request',
      entityId: data?.id || req.params.id,
      message: `Purchase request rejected: ${data?.requestNumber || req.params.id}`,
      metadata: { purchaseRequest: data }
    });
    await publishIntegrationEvent('procurement.purchase_request.rejected', {
      purchaseRequestId: data?.id,
      requestNumber: data?.requestNumber,
      amount: data?.amount,
      currency: data?.currency,
      status: data?.status
    });
    emitProcurementEvent(req, 'procurement:approval_updated', { purchaseRequestId: data?.id, status: data?.status });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to reject purchase request');
  }
});

router.post('/purchase-requests/:id/hold', requirePermission('approvals.review'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const data = await decidePurchaseRequest(
      req.params.id,
      'ON_HOLD',
      String(req.user?.id || '') || null,
      staffId,
      String(req.body?.note || ''),
      String(req.body?.idempotencyKey || '')
    );
    await recordGovernedAdminAction(req, {
      moduleKey: 'procurement',
      actionKey: 'purchase_request_hold',
      entityType: 'purchase_request',
      entityId: data?.id || req.params.id,
      message: `Purchase request placed on hold: ${data?.requestNumber || req.params.id}`,
      metadata: { purchaseRequest: data }
    });
    await publishIntegrationEvent('procurement.purchase_request.on_hold', {
      purchaseRequestId: data?.id,
      requestNumber: data?.requestNumber,
      amount: data?.amount,
      currency: data?.currency,
      status: data?.status
    });
    emitProcurementEvent(req, 'procurement:approval_updated', { purchaseRequestId: data?.id, status: data?.status });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to hold purchase request');
  }
});

router.get('/invoices', requirePermission('invoices.read'), async (req, res) => {
  try {
    const data = await listInvoiceRecords({
      status: String(req.query.status || ''),
      reconciliationStatus: String(req.query.reconciliationStatus || ''),
      invoiceType: String(req.query.invoiceType || ''),
      costCenterId: String(req.query.costCenterId || ''),
      query: String(req.query.query || ''),
      limit: Number(req.query.limit || 50)
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load invoices');
  }
});

router.post('/invoices', requirePermission('invoices.approve'), async (req, res) => {
  try {
    const data = await createInvoiceRecord(req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'procurement',
      actionKey: 'invoice_create',
      entityType: 'invoice_record',
      entityId: data.id,
      message: `Invoice created: ${data.invoiceNumber}`,
      metadata: { invoice: data },
      approvalActionKey: 'approve',
      approvalEntityType: 'invoice',
      approvalTitle: `Invoice created: ${data.invoiceNumber}`
    });
    await publishIntegrationEvent('procurement.invoice.created', {
      invoiceId: data.id,
      invoiceNumber: data.invoiceNumber,
      totalAmount: data.totalAmount,
      currency: data.currency,
      status: data.status
    });
    emitProcurementEvent(req, 'procurement:invoice_status_changed', { invoiceId: data.id, status: data.status });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to create invoice');
  }
});

router.post('/invoices/:id/approve', requirePermission('invoices.approve'), async (req, res) => {
  try {
    const data = await updateInvoiceStatus(req.params.id, 'APPROVED', { approvedBy: req.user?.id || null });
    await recordGovernedAdminAction(req, {
      moduleKey: 'procurement',
      actionKey: 'invoice_approve',
      entityType: 'invoice_record',
      entityId: data.id,
      message: `Invoice approved: ${data.invoiceNumber}`,
      metadata: { invoice: data }
    });
    await publishIntegrationEvent('procurement.invoice.approved', {
      invoiceId: data.id,
      invoiceNumber: data.invoiceNumber,
      totalAmount: data.totalAmount,
      currency: data.currency,
      status: data.status
    });
    emitProcurementEvent(req, 'procurement:invoice_status_changed', { invoiceId: data.id, status: data.status });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to approve invoice');
  }
});

router.post('/invoices/:id/reconcile', requirePermission('invoices.approve'), async (req, res) => {
  try {
    const data = await updateInvoiceStatus(req.params.id, 'RECONCILED', { reconciledBy: req.user?.id || null });
    await recordGovernedAdminAction(req, {
      moduleKey: 'procurement',
      actionKey: 'invoice_reconcile',
      entityType: 'invoice_record',
      entityId: data.id,
      message: `Invoice reconciled: ${data.invoiceNumber}`,
      metadata: { invoice: data }
    });
    await publishIntegrationEvent('procurement.invoice.reconciled', {
      invoiceId: data.id,
      invoiceNumber: data.invoiceNumber,
      totalAmount: data.totalAmount,
      currency: data.currency,
      status: data.status
    });
    emitProcurementEvent(req, 'procurement:invoice_status_changed', { invoiceId: data.id, status: data.status });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to reconcile invoice');
  }
});

router.post('/invoices/:id/credit-notes', requirePermission('invoices.approve'), async (req, res) => {
  try {
    const data = await createCreditNote(req.params.id, Number(req.body?.amount || 0), String(req.body?.reason || ''));
    await recordGovernedAdminAction(req, {
      moduleKey: 'procurement',
      actionKey: 'credit_note_create',
      entityType: 'credit_note',
      entityId: data.id,
      message: `Credit note issued: ${data.creditNoteNumber}`,
      metadata: { creditNote: data }
    });
    await publishIntegrationEvent('procurement.credit_note.created', {
      creditNoteId: data.id,
      creditNoteNumber: data.creditNoteNumber,
      invoiceId: data.invoiceId,
      amount: data.amount,
      currency: data.currency,
      status: data.status
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to create credit note');
  }
});

router.get('/invoices/:id/package', requirePermission('invoices.read'), async (req, res) => {
  try {
    return res.json({ success: true, data: await getInvoicePackage(req.params.id) });
  } catch (error) {
    return handleError(res, error, 'Failed to load invoice package');
  }
});

router.get('/invoice-packages/consolidated', requirePermission('invoices.read'), async (req, res) => {
  try {
    return res.json({
      success: true,
      data: await generateConsolidatedInvoicePackage({
        costCenterId: String(req.query.costCenterId || ''),
        department: String(req.query.department || ''),
        projectCode: String(req.query.projectCode || ''),
        month: String(req.query.month || '')
      })
    });
  } catch (error) {
    return handleError(res, error, 'Failed to generate consolidated package');
  }
});

export default router;
