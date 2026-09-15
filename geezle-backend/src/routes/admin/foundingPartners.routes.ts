import express from 'express';
import prisma from '../../utils/prismaClient';
import { requirePermission } from '../../middleware/rbac.middleware';
import { approveDistributionRun, approveProfitPeriod, closeProfitPeriod, createDistributionRun, executeDistributionRun, getFoundingPartnerProgram, listProfitPeriods, upsertProfitPeriod } from '../../services/foundingPartners.service';

const router = express.Router();

router.get('/program', requirePermission('founding_partners.read'), async (_req, res) => {
  try { return res.json({ success: true, data: await getFoundingPartnerProgram() }); }
  catch (error: any) { return res.status(500).json({ success: false, error: error?.message || 'Unable to load program' }); }
});

router.get('/partners', requirePermission('founding_partners.read'), async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));
    const status = String(req.query.status || '').trim();
    const search = String(req.query.search || '').trim();
    const where: any = {};
    if (status) where.status = status;
    if (search) where.OR = [{ fullName: { contains: search, mode: 'insensitive' } }, { user: { email: { contains: search, mode: 'insensitive' } } }];
    const [items, total] = await prisma.$transaction([
      prisma.foundingPartner.findMany({ where, include: { user: { select: { id: true, email: true, username: true } }, enrollmentPayment: { select: { provider: true, status: true, amount: true, settledAt: true } } }, orderBy: { enrolledAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.foundingPartner.count({ where })
    ]);
    return res.json({ success: true, data: { items: items.map((item) => ({ ...item, enrollmentPayment: item.enrollmentPayment ? { ...item.enrollmentPayment, amount: item.enrollmentPayment.amount.toFixed(2) } : null })), page, limit, total } });
  } catch (error: any) { return res.status(500).json({ success: false, error: error?.message || 'Unable to list partners' }); }
});

router.post('/program/status', requirePermission('founding_partners.manage'), async (req: any, res) => {
  try {
    const status = String(req.body?.status || '').toUpperCase();
    if (!['ACTIVE', 'PAUSED'].includes(status)) return res.status(400).json({ success: false, error: 'Status must be ACTIVE or PAUSED' });
    const program = await prisma.foundingPartnerProgram.upsert({ where: { programKey: 'founding-partners' }, create: { programKey: 'founding-partners', status }, update: { status } });
    await prisma.foundingPartnerAuditLog.create({ data: { programId: program.id, actorUserId: req.user?.id || null, action: 'PROGRAM_STATUS_UPDATED', entityType: 'program', entityId: program.id, metadata: { status } } });
    return res.json({ success: true, data: await getFoundingPartnerProgram() });
  } catch (error: any) { return res.status(500).json({ success: false, error: error?.message || 'Unable to update program' }); }
});

router.get('/profit-periods', requirePermission('founding_partners.read'), async (_req, res) => {
  try { return res.json({ success: true, data: await listProfitPeriods() }); }
  catch (error: any) { return res.status(500).json({ success: false, error: error?.message || 'Unable to list profit periods' }); }
});

router.post('/profit-periods', requirePermission('founding_partners.manage'), async (req: any, res) => {
  try {
    const year = Number(req.body?.year);
    const sources = Array.isArray(req.body?.sources) ? req.body.sources : [];
    if (!Number.isInteger(year) || year < 2020 || year > 2200 || sources.length === 0) return res.status(400).json({ success: false, error: 'A valid year and at least one profit source are required' });
    return res.json({ success: true, data: await upsertProfitPeriod({ year, sources, notes: req.body?.notes, actorUserId: req.user.id }) });
  } catch (error: any) { return res.status(400).json({ success: false, error: error?.message || 'Unable to save profit period' }); }
});

router.post('/profit-periods/:id/close', requirePermission('founding_partners.manage'), async (req: any, res) => {
  try { return res.json({ success: true, data: await closeProfitPeriod(req.params.id, req.user.id) }); }
  catch (error: any) { return res.status(400).json({ success: false, error: error?.message || 'Unable to close profit period' }); }
});

router.post('/profit-periods/:id/approve', requirePermission('founding_partners.distribution.approve'), async (req: any, res) => {
  try { return res.json({ success: true, data: await approveProfitPeriod(req.params.id, req.user.id) }); }
  catch (error: any) { return res.status(400).json({ success: false, error: error?.message || 'Unable to approve profit period' }); }
});

router.post('/profit-periods/:id/distribution-run', requirePermission('founding_partners.distribution.approve'), async (req: any, res) => {
  try { return res.json({ success: true, data: await createDistributionRun(req.params.id, req.user.id) }); }
  catch (error: any) { return res.status(400).json({ success: false, error: error?.message || 'Unable to create distribution run' }); }
});

router.post('/distribution-runs/:id/approve', requirePermission('founding_partners.distribution.approve'), async (req: any, res) => {
  try { return res.json({ success: true, data: await approveDistributionRun(req.params.id, req.user.id) }); }
  catch (error: any) { return res.status(400).json({ success: false, error: error?.message || 'Unable to approve distribution run' }); }
});

router.post('/distribution-runs/:id/execute', requirePermission('founding_partners.distribution.execute'), async (req: any, res) => {
  try { return res.json({ success: true, data: await executeDistributionRun(req.params.id, req.user.id) }); }
  catch (error: any) { return res.status(400).json({ success: false, error: error?.message || 'Unable to execute distribution run' }); }
});

router.post('/partners/:id/deactivate', requirePermission('founding_partners.manage'), async (req: any, res) => {
  try {
    const partner = await prisma.foundingPartner.update({ where: { id: req.params.id }, data: { status: 'DEACTIVATED', deactivatedAt: new Date(), deactivatedReason: String(req.body?.reason || 'Admin action') } });
    await prisma.foundingPartnerAuditLog.create({ data: { programId: partner.programId, actorUserId: req.user?.id || null, action: 'PARTNER_DEACTIVATED', entityType: 'partner', entityId: partner.id, reason: partner.deactivatedReason } });
    return res.json({ success: true, data: partner });
  } catch (error: any) { return res.status(400).json({ success: false, error: error?.message || 'Unable to deactivate partner' }); }
});

router.post('/partners/:id/reactivate', requirePermission('founding_partners.manage'), async (req: any, res) => {
  try {
    const partner = await prisma.foundingPartner.update({ where: { id: req.params.id }, data: { status: 'ACTIVE', reactivatedAt: new Date(), deactivatedAt: null, deactivatedReason: null } });
    await prisma.foundingPartnerAuditLog.create({ data: { programId: partner.programId, actorUserId: req.user?.id || null, action: 'PARTNER_REACTIVATED', entityType: 'partner', entityId: partner.id } });
    return res.json({ success: true, data: partner });
  } catch (error: any) { return res.status(400).json({ success: false, error: error?.message || 'Unable to reactivate partner' }); }
});

export default router;
