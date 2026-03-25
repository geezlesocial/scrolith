import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { resolveUserProStatus } from '../utils/proStatus';
import { JobStatus } from '@prisma/client';
import { notifyFollowersAboutPublication } from '../services/followPublicationNotifications.service';
import { resolveFeaturedListingEligibility } from '../services/listingFeaturePolicy.service';

const normalizeStatus = (status?: string) => (status || '').toString().toLowerCase();
const parseBooleanQuery = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};
const parseLimitQuery = (value: unknown, max = 100) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(1, Math.min(max, Math.floor(numeric)));
};
const isKycVerifiedStatus = (status?: string | null) => {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'verified' || normalized === 'approved';
};
const resolveUserVerified = (user?: { isVerified?: boolean | null; kycStatus?: string | null } | null) => {
  return Boolean(user?.isVerified || isKycVerifiedStatus(user?.kycStatus));
};
const shuffleItems = <T>(items: T[]) => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};
const normalizeJobType = (value: unknown, fallback: string = 'FIXED_PRICE') => {
  if (!value) return fallback as string;
  const raw = String(value).trim().toLowerCase();
  if (raw === 'fixed price' || raw === 'fixed_price' || raw === 'fixed') return 'FIXED_PRICE';
  if (raw === 'hourly') return 'HOURLY';
  if (raw === 'contract') return 'CONTRACT';
  return fallback as string;
};

const normalizeBudget = (value: any): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value.toString() : '';
  if (typeof value === 'object') {
    const amount = value.amount ?? value.value ?? value.minAmount ?? value.maxAmount;
    const min = value.minAmount ?? value.min ?? value.minimum;
    const max = value.maxAmount ?? value.max ?? value.maximum;
    if (min !== undefined && max !== undefined) return `${min}-${max}`;
    if (amount !== undefined) return `${amount}`;
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
};

const safeUserSelect = {
  id: true,
  name: true,
  avatar: true,
  profilePhotoFileId: true,
  role: true,
  isVerified: true,
  kycStatus: true
};

const getAutoApproveJobs = async () => {
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
    const data: any = record?.data || {};
    return Boolean(data?.listings?.autoApproveJobs);
  } catch {
    return false;
  }
};

const toBoolFromPayload = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return false;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
};

const rankRecommendedJob = (job: any) => {
  const recommendedBoost = job?.isRecommended ? 8 : 0;
  const topSelectedBoost = job?.isTopSelected ? 5 : 0;
  const featuredBoost = job?.isFeatured ? 3 : 0;
  const proposalsBoost = Math.min(4, Math.floor(Number(job?.proposalsCount || 0) / 5));
  return recommendedBoost + topSelectedBoost + featuredBoost + proposalsBoost;
};

const serializeJob = (job: any) => {
  const pro = job.client ? resolveUserProStatus(job.client) : { employerIsPro: false };
  const clientIsVerified = resolveUserVerified(job.client);
  return ({
  id: job.id,
  title: job.title,
  description: job.description,
  budget: job.budget || '',
  type: job.type.toLowerCase(),
  postedTime: job.postedTime.toISOString(),
  tags: job.tags || [],
  proposalsCount: job.proposalsCount || 0,
  status: job.status.toLowerCase(),
  isActive: job.isActive,
  isVisible: job.isVisible,
  isFeatured: Boolean(job.isFeatured),
  isTopSelected: Boolean(job.isTopSelected),
  isRecommended: Boolean(job.isRecommended),
  category: job.category?.name || job.categoryId || '',
  categoryId: job.categoryId || null,
  subcategory: job.subcategory || '',
  experienceLevel: job.experienceLevel ? job.experienceLevel.toLowerCase() : undefined,
  visibility: job.visibility ? job.visibility.toLowerCase() : undefined,
  duration: job.duration || undefined,
  attachments: job.attachments || [],
  clientId: job.client?.id || job.clientId,
  clientName: job.client?.name || 'Client',
  clientAvatar: job.client?.avatar || null,
  clientProfilePhotoFileId: job.client?.profilePhotoFileId || null,
  clientIsPro: Boolean((pro as any).employerIsPro),
  clientIsVerified,
  client_is_verified: clientIsVerified,
  clientVerified: clientIsVerified,
  adminStatus: job.adminStatus ? job.adminStatus.toLowerCase() : undefined,
  adminReason: job.adminReason || undefined
});
};

const emitJobPublished = (req: Request, job: any) => {
  const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
  const payload = { job: serializeJob(job) };
  try { io?.emit('community:job_published', payload); } catch {}
};

const notifyFollowersAboutJobPublication = async (req: Request, job: any) => {
  try {
    await notifyFollowersAboutPublication({
      actorUserId: String(job?.clientId || ''),
      publicationType: 'job',
      publicationId: String(job?.id || ''),
      publicationTitle: String(job?.title || '')
    });
  } catch (error) {
    console.warn('[jobs] follower notification fanout failed', error);
  }
  emitJobPublished(req, job);
};

export const listJobs = async (req: Request, res: Response) => {
  try {
    const { ownerId, status, search } = req.query as Record<string, string | undefined>;
    const userId = req.user?.id as string | undefined;
    const isOwnListingRequest = ownerId === 'me';
    const recommendedOnly = parseBooleanQuery(req.query.recommended);
    const featuredOnly = parseBooleanQuery(req.query.featuredOnly);
    const explicitRandomize = parseBooleanQuery(req.query.random);
    const hasRandomParam = req.query.random !== undefined;
    const limit = parseLimitQuery(req.query.limit, 100);
    const shouldDefaultRandomize =
      !hasRandomParam &&
      !isOwnListingRequest &&
      String(status || '').toLowerCase() === 'active' &&
      limit !== null;
    const randomize = explicitRandomize || shouldDefaultRandomize;

    const where: any = {};
    if (isOwnListingRequest) {
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
      where.clientId = userId;
    } else {
      where.isActive = true;
      where.isVisible = true;
      where.adminStatus = 'APPROVED';
      where.status = 'ACTIVE';
    }

    if (status && isOwnListingRequest) {
      where.status = status.toUpperCase();
    }

    const andFilters: any[] = [];
    if (search) {
      andFilters.push({
        OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
        ]
      });
    }
    if (featuredOnly) {
      andFilters.push({ isFeatured: true });
    }
    if (recommendedOnly) {
      andFilters.push({
        OR: [{ isRecommended: true }, { isTopSelected: true }, { isFeatured: true }]
      });
    }
    if (andFilters.length) {
      where.AND = andFilters;
    }

    let jobs = await prisma.job.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { category: true, client: { select: safeUserSelect } }
    });
    if (recommendedOnly && !randomize) {
      jobs = [...jobs].sort((a, b) => {
        const scoreDiff = rankRecommendedJob(b) - rankRecommendedJob(a);
        if (scoreDiff !== 0) return scoreDiff;
        return new Date(String(b.updatedAt || 0)).getTime() - new Date(String(a.updatedAt || 0)).getTime();
      });
    }
    if (randomize) {
      jobs = shuffleItems(jobs);
    }
    if (limit !== null) {
      jobs = jobs.slice(0, limit);
    }

    return res.json({ success: true, data: jobs.map(serializeJob) });
  } catch (error: any) {
    console.error('List jobs error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch jobs' });
  }
};

export const getJob = async (req: Request, res: Response) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: { category: true, client: { select: safeUserSelect } }
    });
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
    const requesterId = String(req.user?.id || '').trim();
    const requesterRole = String(req.user?.role || '').trim().toUpperCase();
    const canViewPrivate =
      Boolean(requesterId) &&
      (requesterRole === 'ADMIN' || requesterId === String(job.clientId || ''));
    const isPublicJob =
      Boolean(job.isActive) &&
      Boolean(job.isVisible) &&
      String(job.status || '').toUpperCase() === 'ACTIVE' &&
      String(job.adminStatus || '').toUpperCase() === 'APPROVED';
    if (!isPublicJob && !canViewPrivate) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    return res.json({ success: true, data: serializeJob(job) });
  } catch (error: any) {
    console.error('Get job error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch job' });
  }
};

export const createJob = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const payload = req.body || {};
    const requestedFeatured = toBoolFromPayload(payload.is_featured ?? payload.isFeatured);
    if (requestedFeatured) {
      const eligibility = await resolveFeaturedListingEligibility({
        listingType: 'job',
        userId
      });
      if (!eligibility.allowed) {
        return res.status(403).json({
          success: false,
          code: 'FEATURED_JOB_LIMIT_REACHED',
          error: eligibility.reason || 'Featured job quota reached for this month',
          data: eligibility
        });
      }
    }
    const created = await prisma.job.create({
      data: {
        title: payload.title,
        description: payload.description || '',
        budget: normalizeBudget(payload.budget) ?? '',
        type: normalizeJobType(payload.type, 'FIXED_PRICE'),
        tags: payload.tags || [],
        status: 'DRAFT',
        isActive: false,
        isVisible: false,
        categoryId: payload.categoryId || null,
        subcategory: payload.subcategory || null,
        experienceLevel: payload.experienceLevel ? payload.experienceLevel.toUpperCase() : null,
        visibility: payload.visibility ? payload.visibility.toUpperCase() : 'PUBLIC',
        duration: payload.duration || null,
        attachments: payload.attachments || [],
        isFeatured: requestedFeatured,
        clientId: userId,
        adminStatus: 'PENDING',
        adminReason: null
      },
      include: { category: true, client: { select: safeUserSelect } }
    });

    return res.status(201).json({ success: true, data: serializeJob(created) });
  } catch (error: any) {
    console.error('Create job error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create job' });
  }
};

export const updateJob = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const existing = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Job not found' });
    if (existing.clientId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const payload = req.body || {};
    const requestedFeaturedRaw = payload.is_featured ?? payload.isFeatured;
    let nextIsFeatured = existing.isFeatured;
    if (requestedFeaturedRaw !== undefined) {
      const requestedFeatured = toBoolFromPayload(requestedFeaturedRaw);
      if (requestedFeatured && !existing.isFeatured) {
        const eligibility = await resolveFeaturedListingEligibility({
          listingType: 'job',
          userId,
          excludeListingId: existing.id
        });
        if (!eligibility.allowed) {
          return res.status(403).json({
            success: false,
            code: 'FEATURED_JOB_LIMIT_REACHED',
            error: eligibility.reason || 'Featured job quota reached for this month',
            data: eligibility
          });
        }
      }
      nextIsFeatured = requestedFeatured;
    }
    const budgetValue = normalizeBudget(payload.budget);
    const updated = await prisma.job.update({
      where: { id: req.params.id },
      data: {
        title: payload.title ?? existing.title,
        description: payload.description ?? existing.description,
        budget: budgetValue === undefined ? existing.budget : budgetValue,
        type: payload.type ? normalizeJobType(payload.type, existing.type) : existing.type,
        tags: payload.tags ?? existing.tags,
        categoryId: payload.categoryId ?? existing.categoryId,
        subcategory: payload.subcategory ?? existing.subcategory,
        experienceLevel: payload.experienceLevel ? payload.experienceLevel.toUpperCase() : existing.experienceLevel,
        visibility: payload.visibility ? payload.visibility.toUpperCase() : existing.visibility,
        duration: payload.duration ?? existing.duration,
        attachments: payload.attachments ?? existing.attachments,
        isFeatured: nextIsFeatured
      },
      include: { category: true, client: { select: safeUserSelect } }
    });

    return res.json({ success: true, data: serializeJob(updated) });
  } catch (error: any) {
    console.error('Update job error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update job' });
  }
};

export const deleteJob = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const existing = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Job not found' });
    if (existing.clientId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    await prisma.job.delete({ where: { id: req.params.id } });
    return res.json({ success: true, data: null });
  } catch (error: any) {
    console.error('Delete job error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete job' });
  }
};

export const submitJob = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const existing = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Job not found' });
    if (existing.clientId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const autoApprove = await getAutoApproveJobs();
    const updated = await prisma.job.update({
      where: { id: req.params.id },
      data: autoApprove
        ? { status: 'ACTIVE', adminStatus: 'APPROVED', isActive: true, isVisible: true, adminReason: null }
        : { status: 'SUBMITTED', adminStatus: 'PENDING', isActive: false, isVisible: false, adminReason: null },
      include: { category: true, client: { select: safeUserSelect } }
    });
    if (updated.status === 'ACTIVE' && existing.status !== 'ACTIVE') {
      await notifyFollowersAboutJobPublication(req, updated);
    }

    return res.json({ success: true, data: serializeJob(updated) });
  } catch (error: any) {
    console.error('Submit job error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to submit job' });
  }
};

export const pauseJob = async (req: Request, res: Response) => {
  return updateJobStatus(req, res, 'PAUSED' as JobStatus);
};

export const activateJob = async (req: Request, res: Response) => {
  return updateJobStatus(req, res, 'ACTIVE' as JobStatus);
};

export const closeJob = async (req: Request, res: Response) => {
  return updateJobStatus(req, res, 'CLOSED' as JobStatus);
};

const updateJobStatus = async (req: Request, res: Response, status: JobStatus) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const existing = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Job not found' });
    if (existing.clientId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const statusData: any = { status };
    if (status === 'ACTIVE') {
      statusData.isActive = true;
      statusData.isVisible = true;
      statusData.adminStatus = 'APPROVED';
      statusData.adminReason = null;
    } else if (status === 'PAUSED') {
      statusData.isActive = false;
    } else if (status === 'CLOSED') {
      statusData.isActive = false;
      statusData.isVisible = false;
    }

    const updated = await prisma.job.update({
      where: { id: req.params.id },
      data: statusData,
      include: { category: true, client: { select: safeUserSelect } }
    });
    if (status === 'ACTIVE' && existing.status !== 'ACTIVE') {
      await notifyFollowersAboutJobPublication(req, updated);
    }

    return res.json({ success: true, data: serializeJob(updated) });
  } catch (error: any) {
    console.error('Update job status error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update job status' });
  }
};
