import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { recordGovernedAdminAction } from '../services/enterpriseGovernance.service';

const clampHours = (value: unknown) => {
  const hours = Number(value ?? 24);
  if (!Number.isFinite(hours)) return 24;
  return Math.min(Math.max(Math.floor(hours), 1), 168);
};

const cleanReason = (value: unknown) => String(value || 'Emergency login access').trim().slice(0, 500) || 'Emergency login access';

const mapAccount = (user: any) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  username: user.username,
  role: user.role,
  isActive: user.isActive,
  loginApprovalWaivedUntil: user.loginApprovalWaivedUntil,
  loginApprovalWaivedReason: user.loginApprovalWaivedReason,
  loginApprovalWaiverActive: Boolean(user.loginApprovalWaivedUntil && user.loginApprovalWaivedUntil > new Date())
});

export const listLoginApprovalWaiverAccounts = async (req: Request, res: Response) => {
  try {
    const query = String(req.query.q || req.query.search || '').trim();
    const users = await prisma.user.findMany({
      where: query ? {
        OR: [
          { email: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
          { username: { contains: query, mode: 'insensitive' } }
        ]
      } : undefined,
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        role: true,
        isActive: true,
        loginApprovalWaivedUntil: true,
        loginApprovalWaivedReason: true
      },
      orderBy: { email: 'asc' },
      take: Math.min(Math.max(Number(req.query.limit) || 100, 1), 200)
    });
    const data = users.map(mapAccount);
    return res.json({ success: true, data: { users: data } });
  } catch (error) {
    console.error('[login-approvals-admin] directory failed', error);
    return res.status(500).json({ success: false, error: 'Unable to load login-approval waiver directory' });
  }
};

export const waiveUserLoginApproval = async (req: Request, res: Response) => {
  const targetId = String(req.params.userId || '').trim();
  if (!targetId) return res.status(400).json({ success: false, error: 'userId required' });
  try {
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) return res.status(404).json({ success: false, error: 'User not found' });
    const hours = clampHours(req.body?.hours);
    const reason = cleanReason(req.body?.reason);
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    const [, expiredPending] = await prisma.$transaction([
      prisma.user.update({
        where: { id: targetId },
        data: {
          loginApprovalWaivedUntil: expiresAt,
          loginApprovalWaivedById: String(req.user?.id || '').trim() || null,
          loginApprovalWaivedReason: reason
        }
      }),
      prisma.loginApprovalAttempt.updateMany({
        where: { userId: targetId, status: 'PENDING' },
        data: { status: 'EXPIRED' }
      })
    ]);
    await recordGovernedAdminAction(req, {
      moduleKey: 'login_security',
      actionKey: 'security.login_approval.waive',
      entityType: 'user',
      entityId: targetId,
      severity: 'critical',
      message: 'Emergency login-approval waiver granted',
      metadata: { hours, expiresAt: expiresAt.toISOString(), reason, expiredPendingCount: expiredPending.count }
    });
    return res.json({ success: true, data: { userId: targetId, waivedUntil: expiresAt, reason } });
  } catch (error) {
    console.error('[login-approvals-admin] waiver failed', error);
    return res.status(500).json({ success: false, error: 'Unable to grant login-approval waiver' });
  }
};

export const clearUserLoginApprovalWaiver = async (req: Request, res: Response) => {
  const targetId = String(req.params.userId || '').trim();
  if (!targetId) return res.status(400).json({ success: false, error: 'userId required' });
  try {
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) return res.status(404).json({ success: false, error: 'User not found' });
    await prisma.user.update({
      where: { id: targetId },
      data: { loginApprovalWaivedUntil: null, loginApprovalWaivedById: null, loginApprovalWaivedReason: null }
    });
    await recordGovernedAdminAction(req, {
      moduleKey: 'login_security',
      actionKey: 'security.login_approval.clear_waiver',
      entityType: 'user',
      entityId: targetId,
      severity: 'warning',
      message: 'Emergency login-approval waiver cleared'
    });
    return res.json({ success: true, data: { userId: targetId, waived: false } });
  } catch (error) {
    console.error('[login-approvals-admin] clear waiver failed', error);
    return res.status(500).json({ success: false, error: 'Unable to clear login-approval waiver' });
  }
};
