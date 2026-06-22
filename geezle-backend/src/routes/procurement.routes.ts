import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { resolveStaffContext } from '../middleware/rbac.middleware';
import {
  createPurchaseRequest,
  getProcurementSettings,
  listInvoiceRecords,
  listPurchaseRequests
} from '../services/procurement.service';

const router = express.Router();

const handleError = (res: express.Response, error: any, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const lower = String(message || '').toLowerCase();
  const status =
    lower.includes('not enabled') ? 403 :
    lower.includes('required') || lower.includes('invalid') ? 400 :
    500;
  if (status >= 500) console.error('[procurement-public] request failed', error);
  return res.status(status).json({ success: false, error: message || fallback });
};

router.use(authMiddleware);

router.get('/settings', async (_req, res) => {
  try {
    return res.json({ success: true, data: await getProcurementSettings() });
  } catch (error) {
    return handleError(res, error, 'Failed to load procurement settings');
  }
});

router.get('/purchase-requests/mine', async (req, res) => {
  try {
    const rows = await listPurchaseRequests({ limit: Number(req.query.limit || 50) });
    const filtered = rows.filter((row: any) => row.requesterUserId === String(req.user?.id || ''));
    return res.json({ success: true, data: filtered });
  } catch (error) {
    return handleError(res, error, 'Failed to load purchase requests');
  }
});

router.post('/purchase-requests', async (req, res) => {
  try {
    const context = await resolveStaffContext(req);
    const data = await createPurchaseRequest(String(req.user?.id || ''), context?.staffId || null, req.body || {});
    const io = req.app.get('io');
    io?.emit?.('procurement:approval_request', {
      purchaseRequestId: data?.id || null,
      requestNumber: data?.requestNumber || null,
      status: data?.status || null,
      budgetStatus: data?.budgetStatus || null
    });
    if (data?.budgetStatus === 'ALERT' || data?.budgetStatus === 'EXCEEDED') {
      io?.emit?.('procurement:budget_threshold', {
        purchaseRequestId: data?.id || null,
        budgetStatus: data?.budgetStatus || null
      });
    }
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to create purchase request');
  }
});

router.get('/invoices/mine', async (req, res) => {
  try {
    const rows = await listInvoiceRecords({ limit: Number(req.query.limit || 50) });
    const userId = String(req.user?.id || '');
    const filtered = rows.filter((row: any) => row.buyerUserId === userId || row.sellerUserId === userId);
    return res.json({ success: true, data: filtered });
  } catch (error) {
    return handleError(res, error, 'Failed to load invoices');
  }
});

export default router;
