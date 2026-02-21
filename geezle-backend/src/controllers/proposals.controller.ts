import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { resolveUserProStatus } from '../utils/proStatus';
import {
  buildSnippet,
  createEngagementNotification,
  getPlatformNotificationSettings
} from '../services/engagementNotifications.service';
import { sendSystemEmail } from '../services/email.service';

const normalizeRole = (role?: string) => (role || '').toString().toLowerCase();
const isFreelancerRole = (role?: string) => {
  const normalized = normalizeRole(role);
  return normalized.includes('freelancer') || normalized.includes('seller');
};
const isClientRole = (role?: string) => {
  const normalized = normalizeRole(role);
  return normalized.includes('client') || normalized.includes('employer');
};
const resolveEffectiveRole = (req: Request, userRole?: string) => {
  const queryRole = normalizeRole((req.query?.role as string) || (req.query?.as as string));
  if (!queryRole) return normalizeRole(userRole);
  if (queryRole.includes('admin') || queryRole.includes('superadmin')) return normalizeRole(userRole);
  if (isFreelancerRole(queryRole)) return 'freelancer';
  if (isClientRole(queryRole)) return 'client';
  return normalizeRole(userRole);
};

const ok = (res: Response, data: any, message?: string) =>
  res.json({ success: true, data, message });

const fail = (res: Response, error: string, code?: string, status = 400) =>
  res.status(status).json({ success: false, error, code });

const getUser = (req: Request) => req.user as { id: string; role?: string; name?: string } | undefined;
const FRONTEND_BASE_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');

type ProposalLifecycleNotificationType =
  | 'job_application_created'
  | 'proposal_opened'
  | 'proposal_reply'
  | 'proposal_top_applicant'
  | 'proposal_interview_scheduled';

const safeUserSelect = {
  id: true,
  name: true,
  avatar: true,
  profilePhotoFileId: true,
  role: true,
  kycStatus: true
};

const mapProposal = (proposal: any) => {
  const freelancerPro = proposal.freelancer ? resolveUserProStatus(proposal.freelancer) : { freelancerIsPro: false };
  const clientPro = proposal.job?.client ? resolveUserProStatus(proposal.job.client) : { employerIsPro: false };
  return ({
  id: proposal.id,
  job_id: proposal.jobId,
  job_title: proposal.job?.title || '',
  freelancer_id: proposal.freelancerId,
  freelancer_name: proposal.freelancer?.name || '',
  freelancer_avatar: proposal.freelancer?.avatar || null,
  freelancer_is_pro: Boolean((freelancerPro as any).freelancerIsPro),
  client_id: proposal.job?.clientId ?? null,
  client_name: proposal.job?.client?.name ?? '',
  client_is_pro: Boolean((clientPro as any).employerIsPro),
  cover_letter: proposal.coverLetter || '',
  proposed_amount: proposal.proposedAmount || 0,
  proposed_timeline: proposal.proposedTimeline || 0,
  attachments: proposal.attachments || [],
  status: proposal.status.toLowerCase(),
  rejection_reason: proposal.rejectionReason || null,
  contract_id: proposal.contractId || null,
  client_viewed_at: proposal.clientViewedAt ? proposal.clientViewedAt.toISOString() : null,
  client_view_count: Number(proposal.clientViewCount || 0),
  top_applicant_at: proposal.topApplicantAt ? proposal.topApplicantAt.toISOString() : null,
  interview_scheduled_at: proposal.interviewScheduledAt ? proposal.interviewScheduledAt.toISOString() : null,
  interview_mode: proposal.interviewMode || null,
  interview_location: proposal.interviewLocation || null,
  interview_notes: proposal.interviewNotes || null,
  clientViewedAt: proposal.clientViewedAt ? proposal.clientViewedAt.toISOString() : null,
  clientViewCount: Number(proposal.clientViewCount || 0),
  topApplicantAt: proposal.topApplicantAt ? proposal.topApplicantAt.toISOString() : null,
  interviewScheduledAt: proposal.interviewScheduledAt ? proposal.interviewScheduledAt.toISOString() : null,
  interviewMode: proposal.interviewMode || null,
  interviewLocation: proposal.interviewLocation || null,
  interviewNotes: proposal.interviewNotes || null,
  created_at: proposal.createdAt.toISOString(),
  updated_at: proposal.updatedAt.toISOString()
});
};

const toAbsoluteUrl = (actionUrl?: string | null) => {
  const value = String(actionUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (!value.startsWith('/')) return `${FRONTEND_BASE_URL}/${value}`;
  return `${FRONTEND_BASE_URL}${value}`;
};

const isEmailNotificationEnabled = (type: ProposalLifecycleNotificationType) => {
  const platform = getPlatformNotificationSettings();
  if (!platform.enableJobLifecycleEmails) return false;
  if (type === 'job_application_created') return platform.enableJobApplicationNotifications;
  if (type === 'proposal_opened') return platform.enableProposalOpenedNotifications;
  if (type === 'proposal_reply') return platform.enableProposalReplyNotifications;
  if (type === 'proposal_top_applicant') return platform.enableTopApplicantNotifications;
  return platform.enableInterviewScheduledNotifications;
};

const isUserEmailPreferenceEnabled = (
  type: ProposalLifecycleNotificationType,
  settings?: { emailNotifications?: boolean; notifyJobApplications?: boolean; notifyApplicationUpdates?: boolean } | null
) => {
  if (!settings) return true;
  if (settings.emailNotifications === false) return false;
  if (type === 'job_application_created') return settings.notifyJobApplications !== false;
  return settings.notifyApplicationUpdates !== false;
};

const notifyProposalLifecycle = async (input: {
  recipientId?: string | null;
  actorId?: string | null;
  type: ProposalLifecycleNotificationType;
  title: string;
  message: string;
  metadata: Record<string, any>;
  dedupeWindowMinutes?: number;
  dedupeMetaKeys?: string[];
}) => {
  const recipientId = String(input.recipientId || '').trim();
  if (!recipientId) return null;

  const created = await createEngagementNotification({
    recipientId,
    actorId: input.actorId || null,
    type: input.type,
    title: input.title,
    message: input.message,
    metadata: input.metadata,
    dedupeWindowMinutes: input.dedupeWindowMinutes,
    dedupeMetaKeys: input.dedupeMetaKeys
  });

  if (!created || !isEmailNotificationEnabled(input.type)) return created;

  const [recipient, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: recipientId },
      select: { email: true, name: true }
    }),
    prisma.userSettings.findUnique({
      where: { userId: recipientId },
      select: {
        emailNotifications: true,
        notifyJobApplications: true,
        notifyApplicationUpdates: true
      }
    })
  ]);

  if (!recipient?.email) return created;
  if (!isUserEmailPreferenceEnabled(input.type, settings)) return created;

  const actionUrl = toAbsoluteUrl(
    (created.meta as any)?.action_url || (created.meta as any)?.actionUrl || input.metadata?.actionUrl
  );
  const emailBody = `${input.message}${actionUrl ? `\n\nOpen: ${actionUrl}` : ''}`;
  await sendSystemEmail({
    to: recipient.email,
    subject: input.title,
    text: emailBody
  });

  return created;
};

export const listProposals = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const role = normalizeRole(user?.role);
    const { jobId, status, page = '1', limit = '20' } = req.query as any;

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
          job: { select: { title: true, clientId: true, client: { select: safeUserSelect } } },
          freelancer: { select: safeUserSelect }
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

    let proposal = await prisma.proposal.findUnique({
      where: { id },
      include: {
        job: { select: { title: true, clientId: true, client: { select: safeUserSelect } } },
        freelancer: { select: safeUserSelect }
      }
    });

    if (!proposal) return fail(res, 'Proposal not found', 'NOT_FOUND', 404);

    if (!role.includes('admin') && proposal.job?.clientId !== user?.id && proposal.freelancerId !== user?.id) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    const openedByClient = proposal.job?.clientId && proposal.job.clientId === user?.id;
    if (openedByClient) {
      const now = new Date();
      await prisma.proposal.update({
        where: { id: proposal.id },
        data: {
          clientViewedAt: now,
          clientViewCount: { increment: 1 }
        }
      });
      proposal = {
        ...proposal,
        clientViewedAt: now,
        clientViewCount: Number(proposal.clientViewCount || 0) + 1
      } as any;

      await notifyProposalLifecycle({
        recipientId: proposal.freelancerId,
        actorId: user?.id || null,
        type: 'proposal_opened',
        title: 'Your application was viewed',
        message: `${user?.name || 'An employer'} opened your application for "${proposal.job?.title || 'a job'}".`,
        metadata: {
          proposalId: proposal.id,
          jobId: proposal.jobId,
          snippet: buildSnippet(proposal.coverLetter || '', 100)
        },
        dedupeWindowMinutes: 30,
        dedupeMetaKeys: ['proposalId']
      });
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
    const effectiveRole = resolveEffectiveRole(req, role);
    const { status, search, page = '1', limit = '20' } = req.query as any;

    if (!user?.id) {
      return fail(res, 'Authentication required', 'UNAUTHORIZED', 401);
    }

    // Support dual-role accounts: users can switch dashboard views without being hard-locked by primary role.
    if (!isFreelancerRole(effectiveRole) && !isClientRole(role) && !role.includes('admin') && !role.includes('superadmin')) {
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
        include: { job: { select: { title: true, clientId: true, client: { select: safeUserSelect } } } }
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

export const createProposal = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const role = normalizeRole(user?.role);
    const effectiveRole = resolveEffectiveRole(req, role);

    if (!user?.id) {
      return fail(res, 'Authentication required', 'UNAUTHORIZED', 401);
    }

    if (!isFreelancerRole(effectiveRole) && !isClientRole(role) && !role.includes('admin') && !role.includes('superadmin')) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    const payload = req.body || {};
    const jobId = payload.jobId || payload.job_id;
    const coverLetter = payload.coverLetter || payload.cover_letter;
    const proposedAmount = Number(payload.proposedAmount ?? payload.proposed_amount ?? payload.amount ?? 0);
    const proposedTimeline = Number(payload.proposedTimeline ?? payload.proposed_timeline ?? payload.timeline ?? 0);
    const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];

    if (!jobId) return fail(res, 'Job ID is required', 'VALIDATION', 400);
    if (!coverLetter || String(coverLetter).trim().length < 10) {
      return fail(res, 'Cover letter is required (min 10 characters)', 'VALIDATION', 400);
    }
    if (!Number.isFinite(proposedAmount) || proposedAmount <= 0) {
      return fail(res, 'Proposed amount must be greater than 0', 'VALIDATION', 400);
    }
    if (!Number.isFinite(proposedTimeline) || proposedTimeline <= 0) {
      return fail(res, 'Proposed timeline must be greater than 0', 'VALIDATION', 400);
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, title: true, status: true, clientId: true, client: { select: safeUserSelect } }
    });

    if (!job) return fail(res, 'Job not found', 'NOT_FOUND', 404);
    if (job.clientId === user?.id) {
      return fail(res, 'You cannot apply to your own job', 'INVALID', 400);
    }
    if (String(job.status || '').toUpperCase() !== 'ACTIVE') {
      return fail(res, 'Job is not accepting proposals', 'INVALID_STATE', 400);
    }

    const existing = await prisma.proposal.findFirst({
      where: {
        jobId,
        freelancerId: user?.id || '',
        status: { in: ['PENDING', 'SHORTLISTED', 'ACCEPTED'] }
      }
    });

    if (existing) {
      return fail(res, 'You already submitted a proposal for this job', 'ALREADY_EXISTS', 400);
    }

    const [proposal] = await prisma.$transaction([
      prisma.proposal.create({
        data: {
          jobId,
          freelancerId: user?.id || '',
          coverLetter: String(coverLetter),
          proposedAmount,
          proposedTimeline,
          attachments
        },
        include: {
          job: { select: { title: true, clientId: true, client: { select: safeUserSelect } } },
          freelancer: { select: safeUserSelect }
        }
      }),
      prisma.job.update({
        where: { id: jobId },
        data: { proposalsCount: { increment: 1 } }
      })
    ]);

    if (job.clientId) {
      await notifyProposalLifecycle({
        recipientId: job.clientId,
        actorId: user?.id || null,
        type: 'job_application_created',
        title: 'New job application',
        message: `${user?.name || 'A freelancer'} applied for "${job.title}".`,
        metadata: {
          proposalId: proposal.id,
          jobId,
          snippet: buildSnippet(String(coverLetter || ''), 100)
        }
      });
    }

    return ok(res, mapProposal(proposal), 'Submitted');
  } catch (error: any) {
    console.error('createProposal error:', error);
    return fail(res, error.message || 'Failed to submit proposal', 'SERVER_ERROR', 500);
  }
};

export const acceptProposal = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const role = normalizeRole(user?.role);
    const { id } = req.params;

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

    const proposal = await prisma.proposal.findUnique({ where: { id }, include: { job: true } });
    if (!proposal) return fail(res, 'Proposal not found', 'NOT_FOUND', 404);
    if (!role.includes('admin') && proposal.job?.clientId !== user?.id) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    const alreadyShortlisted = proposal.status === 'SHORTLISTED';
    const updated = await prisma.proposal.update({
      where: { id },
      data: {
        status: 'SHORTLISTED',
        topApplicantAt: alreadyShortlisted ? proposal.topApplicantAt : new Date()
      }
    });

    if (!alreadyShortlisted) {
      await notifyProposalLifecycle({
        recipientId: proposal.freelancerId,
        actorId: user?.id || null,
        type: 'proposal_top_applicant',
        title: 'You are a top applicant',
        message: `${user?.name || 'An employer'} shortlisted your application for "${proposal.job?.title || 'a job'}".`,
        metadata: {
          proposalId: proposal.id,
          jobId: proposal.jobId,
          topApplicantAt: updated.topApplicantAt ? updated.topApplicantAt.toISOString() : null
        },
        dedupeWindowMinutes: 180,
        dedupeMetaKeys: ['proposalId']
      });
    }

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

    const proposal = await prisma.proposal.findUnique({ where: { id }, include: { job: true } });
    if (!proposal) return fail(res, 'Proposal not found', 'NOT_FOUND', 404);
    if (!role.includes('admin') && proposal.job?.clientId !== user?.id) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    await prisma.proposal.update({ where: { id }, data: { status: 'PENDING', topApplicantAt: null } });
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

    const proposal = await prisma.proposal.findUnique({ where: { id }, include: { job: true } });
    if (!proposal) return fail(res, 'Proposal not found', 'NOT_FOUND', 404);

    if (!role.includes('admin') && proposal.job?.clientId !== user?.id) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    await notifyProposalLifecycle({
      recipientId: proposal.freelancerId,
      actorId: user?.id || null,
      type: 'proposal_reply',
      title: 'New update on your application',
      message: `${user?.name || 'An employer'} replied to your application.`,
      metadata: {
        proposalId: proposal.id,
        jobId: proposal.jobId,
        snippet: buildSnippet(message, 140)
      },
      dedupeWindowMinutes: 2,
      dedupeMetaKeys: ['proposalId', 'snippet']
    });

    return ok(res, null, 'Sent');
  } catch (error: any) {
    console.error('messageFreelancer error:', error);
    return fail(res, 'Failed to send message', 'SERVER_ERROR', 500);
  }
};

export const scheduleInterview = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const role = normalizeRole(user?.role);
    const { id } = req.params;
    const payload = req.body || {};

    const proposal = await prisma.proposal.findUnique({
      where: { id },
      include: {
        job: { select: { title: true, clientId: true, client: { select: safeUserSelect } } },
        freelancer: { select: safeUserSelect }
      }
    });
    if (!proposal) return fail(res, 'Proposal not found', 'NOT_FOUND', 404);
    if (!role.includes('admin') && proposal.job?.clientId !== user?.id) {
      return fail(res, 'Not authorized', 'FORBIDDEN', 403);
    }

    const rawScheduledAt = payload.scheduledAt || payload.interviewScheduledAt || payload.dateTime;
    if (!rawScheduledAt) {
      return fail(res, 'Interview date/time is required', 'VALIDATION', 400);
    }
    const scheduledAt = new Date(rawScheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      return fail(res, 'Invalid interview date/time', 'VALIDATION', 400);
    }

    const interviewMode = String(payload.mode || payload.interviewMode || payload.type || 'virtual').trim() || 'virtual';
    const interviewLocation = String(payload.location || payload.interviewLocation || '').trim();
    const interviewNotes = String(payload.notes || payload.interviewNotes || '').trim();

    const updated = await prisma.proposal.update({
      where: { id },
      data: {
        interviewScheduledAt: scheduledAt,
        interviewMode,
        interviewLocation: interviewLocation || null,
        interviewNotes: interviewNotes || null
      },
      include: {
        job: { select: { title: true, clientId: true, client: { select: safeUserSelect } } },
        freelancer: { select: safeUserSelect }
      }
    });

    await notifyProposalLifecycle({
      recipientId: proposal.freelancerId,
      actorId: user?.id || null,
      type: 'proposal_interview_scheduled',
      title: 'Interview scheduled',
      message: `${user?.name || 'An employer'} scheduled an interview for your application.`,
      metadata: {
        proposalId: proposal.id,
        jobId: proposal.jobId,
        scheduledAt: scheduledAt.toISOString(),
        mode: interviewMode,
        location: interviewLocation || null,
        snippet: buildSnippet(interviewNotes || `${proposal.job?.title || 'Job'} interview`, 120)
      },
      dedupeWindowMinutes: 10,
      dedupeMetaKeys: ['proposalId', 'scheduledAt']
    });

    return ok(res, mapProposal(updated), 'Interview scheduled');
  } catch (error: any) {
    console.error('scheduleInterview error:', error);
    return fail(res, 'Failed to schedule interview', 'SERVER_ERROR', 500);
  }
};

export const withdrawProposal = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const role = normalizeRole(user?.role);
    const effectiveRole = resolveEffectiveRole(req, role);
    const { id } = req.params;

    if (!user?.id) {
      return fail(res, 'Authentication required', 'UNAUTHORIZED', 401);
    }

    if (!isFreelancerRole(effectiveRole) && !isClientRole(role) && !role.includes('admin') && !role.includes('superadmin')) {
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
