import { Request, Response } from 'express';
import { prisma } from '../db';

const proposals: any[] = [];

export const listProposals = async (req: Request, res: Response) => {
  const ownerId = req.query.ownerId === 'me' ? (req as any).user?.id : req.query.ownerId;
  const jobId = req.query.jobId as string | undefined;
  const status = req.query.status as string | undefined;

  if (prisma) {
    const where: any = {};
    if (ownerId) where.ownerId = ownerId;
    if (jobId) where.jobId = jobId;
    if (status) where.status = status;
    const data = await prisma.proposal.findMany({ where });
    const parsed = data.map((p: any) => ({ ...p, data: p.data ? JSON.parse(p.data) : undefined }));
    return res.json({ success: true, data: parsed });
  }

  let result = proposals;
  if (ownerId) result = result.filter(p => p.ownerId === ownerId);
  if (jobId) result = result.filter(p => p.jobId === jobId);
  if (status) result = result.filter(p => p.status === status);

  return res.json({ success: true, data: result });
};

export const acceptProposal = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (prisma) {
    const p = await prisma.proposal.update({ where: { id }, data: { status: 'accepted' } });
    if (!p) return res.status(404).json({ success: false, error: 'Proposal not found' });
    return res.json({ success: true });
  }
  const p = proposals.find(x => x.id === id);
  if (!p) return res.status(404).json({ success: false, error: 'Proposal not found' });
  p.status = 'accepted';
  return res.json({ success: true });
};

export const rejectProposal = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (prisma) {
    const p = await prisma.proposal.update({ where: { id }, data: { status: 'rejected' } });
    if (!p) return res.status(404).json({ success: false, error: 'Proposal not found' });
    return res.json({ success: true });
  }
  const p = proposals.find(x => x.id === id);
  if (!p) return res.status(404).json({ success: false, error: 'Proposal not found' });
  p.status = 'rejected';
  return res.json({ success: true });
};

export const inviteProposal = async (req: Request, res: Response) => {
  const { jobId, toUserId } = req.body;
  if (prisma) {
    const p = await prisma.proposal.create({ data: { jobId, toUserId, ownerId: (req as any).user?.id || null, status: 'invited', data: null } });
    return res.json({ success: true, data: p });
  }
  const p = { id: `proposal_${Date.now()}`, jobId, toUserId, ownerId: (req as any).user?.id || null, status: 'invited' };
  proposals.push(p);
  return res.json({ success: true, data: p });
};
