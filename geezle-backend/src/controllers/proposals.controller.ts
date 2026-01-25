import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const normalizeRole = (role?: string) => (role || '').toString().toLowerCase();

const ok = (res: Response, data: any, message?: string) =>
  res.json({ success: true, data, message });

const fail = (res: Response, error: string, code?: string, status = 400) =>
  res.status(status).json({ success: false, error, code });

const getUser = (req: Request) => req.user as { id: string; role?: string; name?: string } | undefined;

const mapProposal = (proposal: any) => ({
  id: proposal.id,
  job_id: proposal.jobId,
  job_title: proposal.job?.title || '',
  freelancer_id: proposal.freelancerId,
  freelancer_name: proposal.freelancer?.name || '',
  freelancer_avatar: proposal.freelancer?.avatar || null,
  cover_letter: proposal.coverLetter || '',
  proposed_amount: proposal.proposedAmount || 0,
  proposed_timeline: proposal.proposedTimeline || 0,
  attachments: proposal.attachments || [],
  status: proposal.status.toLowerCase(),
  rejection_reason: proposal.rejectionReason || null,
  contract_id: proposal.contractId || null,
  created_at: proposal.createdAt.toISOString(),
  updated_at: proposal.updatedAt.toISOString()
});

export const listProposals = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const role = normalizeRole(user?.role);
    const { jobId, status, page = '1', limit = '20' } = req.query as any;

    if (!role.includes('employer') && !role.includes('client') && !role.includes('admin')) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    const where: any = {
      ...(status ? { status: status.toUpperCase() } : {})
    };

    if (jobId) where.jobId = jobId;

    if (!role.includes('admin')) {
      where.job = { clientId: user?.id };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [items, total] = await Promise.all([
      prisma.proposal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          job: { select: { title: true } },
          freelancer: { select: { id: true, name: true, avatar: true } }
        }
      }),
      prisma.proposal.count({ where })
    ]);

    return ok(res, {
      proposals: items.map(mapProposal),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)) || 1
      }
    });
  } catch (error: any) {
    console.error('listProposals error:', error);
    return fail(res, 'Failed to load proposals', 'SERVER_ERROR', 500);
  }
};

export const getProposal = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const role = normalizeRole(user?.role);
    const { id } = req.params;

    const proposal = await prisma.proposal.findUnique({
      where: { id },
      include: {
        job: { select: { title: true, clientId: true } },
        freelancer: { select: { id: true, name: true, avatar: true } }
      }
    });

    if (!proposal) return fail(res, 'Proposal not found', 'NOT_FOUND', 404);

    if (!role.includes('admin') && proposal.job?.clientId !== user?.id && proposal.freelancerId !== user?.id) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    return ok(res, mapProposal(proposal));
  } catch (error: any) {
    console.error('getProposal error:', error);
    return fail(res, 'Failed to load proposal', 'SERVER_ERROR', 500);
  }
};

export const listMyProposals = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const role = normalizeRole(user?.role);
    const { status, search, page = '1', limit = '20' } = req.query as any;

    if (!role.includes('freelancer') && !role.includes('seller')) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    const where: any = {
      freelancerId: user?.id,
      ...(status ? { status: status.toUpperCase() } : {})
    };

    if (search) {
      where.job = { title: { contains: String(search), mode: 'insensitive' } };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [items, total] = await Promise.all([
      prisma.proposal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { job: { select: { title: true } } }
      }),
      prisma.proposal.count({ where })
    ]);

    return ok(res, {
      proposals: items.map(mapProposal),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)) || 1
      }
    });
  } catch (error: any) {
    console.error('listMyProposals error:', error);
    return fail(res, 'Failed to load proposals', 'SERVER_ERROR', 500);
  }
};

export const acceptProposal = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const role = normalizeRole(user?.role);
    const { id } = req.params;

    if (!role.includes('employer') && !role.includes('client') && !role.includes('admin')) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    const proposal = await prisma.proposal.findUnique({
      where: { id },
      include: { job: true }
    });

    if (!proposal) return fail(res, 'Proposal not found', 'NOT_FOUND', 404);

    if (!role.includes('admin') && proposal.job?.clientId !== user?.id) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    if (!['PENDING', 'SHORTLISTED'].includes(proposal.status)) {
      return fail(res, 'Proposal cannot be accepted in current state', 'INVALID_STATE', 400);
    }

    const contractType = proposal.job?.type === 'HOURLY' ? 'HOURLY' : 'FIXED';
    const [freelancer, client] = await Promise.all([
      prisma.user.findUnique({ where: { id: proposal.freelancerId }, select: { name: true } }),
      proposal.job?.clientId
        ? prisma.user.findUnique({ where: { id: proposal.job.clientId }, select: { name: true } })
        : Promise.resolve(null)
    ]);

    const contract = await prisma.contract.create({
      data: {
        title: proposal.job?.title || 'Contract',
        clientId: proposal.job?.clientId || user?.id || '',
        freelancerId: proposal.freelancerId,
        clientName: client?.name || (user as any)?.name || 'Client',
        freelancerName: freelancer?.name || 'Freelancer',
        type: contractType as any,
        hourlyRate: 0,
        paymentCycle: 'WEEKLY',
        status: 'ACTIVE',
        jobId: proposal.jobId,
        sourceProposalId: proposal.id
      }
    });

    await prisma.proposal.update({
      where: { id },
      data: { status: 'ACCEPTED', contractId: contract.id }
    });

    return ok(res, { contract_id: contract.id }, 'Accepted');
  } catch (error: any) {
    console.error('acceptProposal error:', error);
    return fail(res, 'Failed to accept proposal', 'SERVER_ERROR', 500);
  }
};

export const rejectProposal = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const role = normalizeRole(user?.role);
    const { id } = req.params;
    const { reason } = req.body || {};

    if (!role.includes('employer') && !role.includes('client') && !role.includes('admin')) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    const proposal = await prisma.proposal.findUnique({
      where: { id },
      include: { job: true }
    });

    if (!proposal) return fail(res, 'Proposal not found', 'NOT_FOUND', 404);

    if (!role.includes('admin') && proposal.job?.clientId !== user?.id) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    await prisma.proposal.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: reason || null }
    });

    return ok(res, null, 'Rejected');
  } catch (error: any) {
    console.error('rejectProposal error:', error);
    return fail(res, 'Failed to reject proposal', 'SERVER_ERROR', 500);
  }
};

export const shortlistProposal = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const role = normalizeRole(user?.role);
    const { id } = req.params;

    if (!role.includes('employer') && !role.includes('client') && !role.includes('admin')) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    const proposal = await prisma.proposal.findUnique({ where: { id }, include: { job: true } });
    if (!proposal) return fail(res, 'Proposal not found', 'NOT_FOUND', 404);
    if (!role.includes('admin') && proposal.job?.clientId !== user?.id) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    await prisma.proposal.update({ where: { id }, data: { status: 'SHORTLISTED' } });
    return ok(res, null, 'Shortlisted');
  } catch (error: any) {
    console.error('shortlistProposal error:', error);
    return fail(res, 'Failed to shortlist proposal', 'SERVER_ERROR', 500);
  }
};

export const unshortlistProposal = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const role = normalizeRole(user?.role);
    const { id } = req.params;

    if (!role.includes('employer') && !role.includes('client') && !role.includes('admin')) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    const proposal = await prisma.proposal.findUnique({ where: { id }, include: { job: true } });
    if (!proposal) return fail(res, 'Proposal not found', 'NOT_FOUND', 404);
    if (!role.includes('admin') && proposal.job?.clientId !== user?.id) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    await prisma.proposal.update({ where: { id }, data: { status: 'PENDING' } });
    return ok(res, null, 'Removed from shortlist');
  } catch (error: any) {
    console.error('unshortlistProposal error:', error);
    return fail(res, 'Failed to unshortlist proposal', 'SERVER_ERROR', 500);
  }
};

export const messageFreelancer = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const role = normalizeRole(user?.role);
    const { id } = req.params;
    const { message } = req.body || {};

    if (!message || typeof message !== 'string') {
      return fail(res, 'Message is required', 'VALIDATION', 400);
    }

    if (!role.includes('employer') && !role.includes('client') && !role.includes('admin')) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    const proposal = await prisma.proposal.findUnique({ where: { id }, include: { job: true } });
    if (!proposal) return fail(res, 'Proposal not found', 'NOT_FOUND', 404);

    if (!role.includes('admin') && proposal.job?.clientId !== user?.id) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    await prisma.notification.create({ data: ({
      userId: proposal.freelancerId,
      title: 'New message about your proposal',
      message,
      actionUrl: '/messages'
    } as any) });

    return ok(res, null, 'Sent');
  } catch (error: any) {
    console.error('messageFreelancer error:', error);
    return fail(res, 'Failed to send message', 'SERVER_ERROR', 500);
  }
};

export const withdrawProposal = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const role = normalizeRole(user?.role);
    const { id } = req.params;

    if (!role.includes('freelancer') && !role.includes('seller')) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    const proposal = await prisma.proposal.findUnique({ where: { id } });
    if (!proposal) return fail(res, 'Proposal not found', 'NOT_FOUND', 404);
    if (proposal.freelancerId !== user?.id) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    if (!['PENDING', 'SHORTLISTED'].includes(proposal.status)) {
      return fail(res, 'Cannot withdraw in current state', 'INVALID_STATE', 400);
    }

    await prisma.proposal.update({ where: { id }, data: { status: 'WITHDRAWN' } });
    return ok(res, null, 'Withdrawn');
  } catch (error: any) {
    console.error('withdrawProposal error:', error);
    return fail(res, 'Failed to withdraw proposal', 'SERVER_ERROR', 500);
  }
};
