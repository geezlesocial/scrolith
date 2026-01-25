import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const nowIso = () => new Date().toISOString();

const toAlert = (r: any) => ({
  id: r.id,
  user_id: r.userId,
  userId: r.userId,
  user_name: r.user?.name || r.userId,
  userName: r.user?.name || r.userId,
  user_role: r.user?.role || 'USER',
  userRole: r.user?.role || 'USER',
  score: r.fraudScore || 0,
  risk_level: r.fraudScore >= 80 ? 'Critical' : r.fraudScore >= 50 ? 'High' : 'Medium',
  riskLevel: r.fraudScore >= 80 ? 'Critical' : r.fraudScore >= 50 ? 'High' : 'Medium',
  reason: 'Automated fraud score threshold',
  content_snippet: null,
  contentSnippet: null,
  action: r.fraudScore >= 90 ? 'Restricted' : 'Flagged',
  reviewed: false,
  timestamp: nowIso()
});

export const getFraudAlerts = async (_req: Request, res: Response) => {
  try {
    // Top wallets by fraudScore
    const wallets = await prisma.gcoinWallet.findMany({ where: { fraudScore: { gt: 0 } }, orderBy: { fraudScore: 'desc' }, take: 50, include: { user: true } });
    const alerts = wallets.map(toAlert);
    return res.json({ success: true, data: alerts, timestamp: nowIso() });
  } catch (error: any) {
    console.error('getFraudAlerts error:', error);
    return res.status(500).json({ success: false, error: 'Failed to get fraud alerts', details: error.message || String(error), timestamp: nowIso() });
  }
};

export const getFraudLogs = async (_req: Request, res: Response) => {
  try {
    // Show recent uncredited earning events and high-rate events
    const events = await prisma.gcoinEarningEvent.findMany({ where: { credited: false }, orderBy: { createdAt: 'desc' }, take: 100, include: { post: true, actor: true } });
    const logs = events.map(e => ({
      id: e.id,
      eventType: e.eventType,
      postId: e.postId,
      actorId: e.actorId,
      actorName: e.actor?.name || e.actorId,
      eventKey: e.eventKey,
      value: e.value,
      createdAt: e.createdAt,
      message: e.credited ? 'credited' : 'pending'
    }));
    return res.json({ success: true, data: logs, timestamp: nowIso() });
  } catch (error: any) {
    console.error('getFraudLogs error:', error);
    return res.status(500).json({ success: false, error: 'Failed to get fraud logs', details: error.message || String(error), timestamp: nowIso() });
  }
};
