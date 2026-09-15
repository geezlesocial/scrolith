import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { idempotency } from '../middleware/idempotency';
import { createEnrollmentCheckout, getFoundingPartnerProgram, getMyFoundingPartnership } from '../services/foundingPartners.service';

const router = express.Router();

router.get('/program', async (_req, res) => {
  try { return res.json({ success: true, data: await getFoundingPartnerProgram() }); }
  catch (error: any) { return res.status(500).json({ success: false, error: error?.message || 'Unable to load program' }); }
});

router.get('/me', authMiddleware, async (req: any, res) => {
  try { return res.json({ success: true, data: await getMyFoundingPartnership(req.user.id) }); }
  catch (error: any) { return res.status(500).json({ success: false, error: error?.message || 'Unable to load partnership' }); }
});

router.post('/enrollment/checkout', authMiddleware, idempotency(), async (req: any, res) => {
  try {
    const body = req.body || {};
    const origin = `${req.protocol}://${req.get('host')}`;
    const result = await createEnrollmentCheckout({
      userId: req.user.id,
      fullName: String(body.fullName || '').trim(),
      country: String(body.country || '').trim(),
      city: String(body.city || '').trim(),
      stateRegion: String(body.stateRegion || '').trim() || undefined,
      taxId: String(body.taxId || '').trim() || undefined,
      termsAccepted: body.termsAccepted === true,
      idempotencyKey: String(req.get('Idempotency-Key') || '').trim(),
      successUrl: String(body.successUrl || `${origin}/dashboard?tab=founding-partners&enrollment=success`),
      cancelUrl: String(body.cancelUrl || `${origin}/dashboard?tab=founding-partners&enrollment=cancelled`)
    });
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) { return res.status(400).json({ success: false, error: error?.message || 'Unable to start enrollment' }); }
});

export default router;
