import { Request, Response } from 'express';
import { prisma } from '../db';

const parseArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
};

const toProposalResponse = (proposal: any, job?: any) => ({
  id: proposal.id,
  jobId: proposal.jobId,
  jobTitle: job?.title || proposal.job?.title || '',
  freelancerId: proposal.freelancerId,
  freelancerName: proposal.freelancerName || '',
  freelancerAvatar: proposal.freelancerAvatar || '',
  coverLetter: proposal.coverLetter || '',
  proposedAmount: Number(proposal.proposedAmount || 0),
  proposedTimeline: Number(proposal.proposedTimeline || 0),
  attachments: parseArray(proposal.attachments),
  status: proposal.status,
  contractId: proposal.contractId,
  createdAt: proposal.createdAt,
  updatedAt: proposal.updatedAt
});

const updateJobProposalCount = async (jobId: string) => {
  if (!prisma) return;
  const total = await prisma.jobProposal.count({
    where: { jobId, status: { not: 'withdrawn' } }
  });
  await prisma.job.update({ where: { id: jobId }, data: { proposalsCount: total } });
};

export const listProposals = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const user = (req as unknown as { user?: { id?: string } }).user;
  const jobId = req.query.jobId as string | undefined;
  const status = req.query.status as string | undefined;
  const ownerId = req.query.ownerId === 'me' ? user?.id : (req.query.ownerId as string | undefined);
  const freelancerId = req.query.freelancerId === 'me' ? user?.id : (req.query.freelancerId as string | undefined);
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '20', 10);

  const where: any = {};
  if (jobId) where.jobId = jobId;
  if (status) where.status = status;
  if (freelancerId) where.freelancerId = freelancerId;
  if (ownerId) where.clientId = ownerId;

  const [total, proposals] = await Promise.all([
    prisma.jobProposal.count({ where }),
    prisma.jobProposal.findMany({
      where,
      include: { job: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    })
  ]);

  return res.json({
    success: true,
    data: {
      proposals: proposals.map((p) => toProposalResponse(p, p.job)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    }
  });
};

export const getProposal = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const proposal = await prisma.jobProposal.findFirst({ where: { id }, include: { job: true } });
  if (!proposal) return res.status(404).json({ success: false, error: 'Proposal not found' });
  return res.json({ success: true, data: toProposalResponse(proposal, proposal.job) });
};

export const createProposal = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const user = (req as unknown as { user?: { id?: string } }).user;
  if (!user?.id) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const payload = req.body || {};
  if (!payload.jobId) return res.status(400).json({ success: false, error: 'jobId is required' });

  const job = await prisma.job.findUnique({ where: { id: payload.jobId } });

  const proposal = await prisma.jobProposal.create({
    data: {
      jobId: payload.jobId,
      freelancerId: user.id,
      freelancerName: payload.freelancerName || null,
      freelancerAvatar: payload.freelancerAvatar || null,
      clientId: payload.clientId || job?.ownerId || null,
      coverLetter: payload.coverLetter || null,
      proposedAmount: payload.proposedAmount ?? payload.amount ?? null,
      proposedTimeline: payload.proposedTimeline ?? payload.deliveryDays ?? null,
      attachments: payload.attachments ?? [],
      status: payload.status || 'pending'
    }
  });

  await updateJobProposalCount(payload.jobId);

  return res.json({ success: true, data: toProposalResponse(proposal) });
};

export const acceptProposal = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const proposal = await prisma.jobProposal.findUnique({ where: { id }, include: { job: true } });
  if (!proposal) return res.status(404).json({ success: false, error: 'Proposal not found' });

  const job = proposal.job;
  const type = (job?.budgetType || job?.jobType || '').toString().toLowerCase().includes('hourly') ? 'hourly' : 'fixed';
  const hourlyRate = type === 'hourly' ? Number(proposal.proposedAmount || job?.budgetAmount || 0) : null;
  const fixedAmount = type === 'fixed' ? Number(proposal.proposedAmount || job?.budgetAmount || 0) : null;

  const contract = await prisma.contract.create({
    data: {
      jobId: proposal.jobId,
      proposalId: proposal.id,
      title: job?.title || 'Contract',
      clientId: job?.ownerId || proposal.clientId || 'unknown',
      clientName: null,
      freelancerId: proposal.freelancerId,
      freelancerName: proposal.freelancerName || null,
      type,
      hourlyRate,
      fixedAmount,
      paymentCycle: type === 'hourly' ? 'weekly' : null,
      status: 'active',
      startDate: new Date(),
      description: job?.description || null
    }
  });

  await prisma.jobProposal.update({
    where: { id },
    data: { status: 'accepted', contractId: contract.id }
  });

  if ((req as any).io) (req as any).io.emit('proposal:accepted', { proposalId: id, contractId: contract.id });

  return res.json({ success: true, data: { contractId: contract.id } });
};

export const rejectProposal = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const reason = (req.body?.reason as string | undefined) || null;
  const proposal = await prisma.jobProposal.update({
    where: { id },
    data: { status: 'rejected', rejectionReason: reason }
  });
  if ((req as any).io) (req as any).io.emit('proposal:rejected', { proposalId: id });
  return res.json({ success: true, data: toProposalResponse(proposal) });
};

export const shortlistProposal = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const proposal = await prisma.jobProposal.update({
    where: { id },
    data: { status: 'shortlisted', shortlistedAt: new Date() }
  });
  return res.json({ success: true, data: toProposalResponse(proposal) });
};

export const unshortlistProposal = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const proposal = await prisma.jobProposal.update({
    where: { id },
    data: { status: 'pending', shortlistedAt: null }
  });
  return res.json({ success: true, data: toProposalResponse(proposal) });
};

export const messageProposal = async (_req: Request, res: Response) => {
  return res.json({ success: true });
};

export const withdrawProposal = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const proposal = await prisma.jobProposal.update({
    where: { id },
    data: { status: 'withdrawn', withdrawnAt: new Date() }
  });
  await updateJobProposalCount(proposal.jobId);
  return res.json({ success: true });
};

export const listMyProposals = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const user = (req as unknown as { user?: { id?: string } }).user;
  if (!user?.id) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const status = req.query.status as string | undefined;
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '20', 10);

  const where: any = { freelancerId: user.id };
  if (status) where.status = status;

  const [total, proposals] = await Promise.all([
    prisma.jobProposal.count({ where }),
    prisma.jobProposal.findMany({
      where,
      include: { job: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    })
  ]);

  return res.json({
    success: true,
    data: {
      proposals: proposals.map((p) => toProposalResponse(p, p.job)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    }
  });
};
