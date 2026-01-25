import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { JobStatus } from '@prisma/client';

const normalizeStatus = (status?: string) => (status || '').toString().toLowerCase();

const serializeJob = (job: any) => ({
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
  category: job.category?.name || job.categoryId || '',
  subcategory: job.subcategory || '',
  experienceLevel: job.experienceLevel ? job.experienceLevel.toLowerCase() : undefined,
  visibility: job.visibility ? job.visibility.toLowerCase() : undefined,
  duration: job.duration || undefined,
  clientName: job.client?.name || 'Client'
});

export const listJobs = async (req: Request, res: Response) => {
  try {
    const { ownerId, status, search } = req.query as Record<string, string | undefined>;
    const userId = req.user?.id as string | undefined;

    const where: any = {};
    if (ownerId === 'me') {
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
      where.clientId = userId;
    }

    if (status) {
      where.status = status.toUpperCase();
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    const jobs = await prisma.job.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { category: true, client: true }
    });

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
      include: { category: true, client: true }
    });
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
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
    const created = await prisma.job.create({
      data: {
        title: payload.title,
        description: payload.description || '',
        budget: payload.budget || '',
        type: payload.type ? payload.type.toUpperCase() : 'FIXED_PRICE',
        tags: payload.tags || [],
        status: 'DRAFT',
        isActive: true,
        isVisible: true,
        categoryId: payload.categoryId || null,
        subcategory: payload.subcategory || null,
        experienceLevel: payload.experienceLevel ? payload.experienceLevel.toUpperCase() : null,
        visibility: payload.visibility ? payload.visibility.toUpperCase() : 'PUBLIC',
        duration: payload.duration || null,
        attachments: payload.attachments || [],
        clientId: userId
      },
      include: { category: true, client: true }
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
    const updated = await prisma.job.update({
      where: { id: req.params.id },
      data: {
        title: payload.title ?? existing.title,
        description: payload.description ?? existing.description,
        budget: payload.budget ?? existing.budget,
        type: payload.type ? payload.type.toUpperCase() : existing.type,
        tags: payload.tags ?? existing.tags,
        categoryId: payload.categoryId ?? existing.categoryId,
        subcategory: payload.subcategory ?? existing.subcategory,
        experienceLevel: payload.experienceLevel ? payload.experienceLevel.toUpperCase() : existing.experienceLevel,
        visibility: payload.visibility ? payload.visibility.toUpperCase() : existing.visibility,
        duration: payload.duration ?? existing.duration,
        attachments: payload.attachments ?? existing.attachments
      },
      include: { category: true, client: true }
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
  return updateJobStatus(req, res, 'SUBMITTED' as JobStatus);
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

    const updated = await prisma.job.update({
      where: { id: req.params.id },
      data: { status },
      include: { category: true, client: true }
    });

    return res.json({ success: true, data: serializeJob(updated) });
  } catch (error: any) {
    console.error('Update job status error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update job status' });
  }
};
