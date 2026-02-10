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

const parseNumber = (value: any): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const isAdminRole = (role?: string | null) => {
  const r = (role || '').toString().toLowerCase();
  return r === 'admin' || r === 'super_admin' || r === 'superadmin';
};

const toJobResponse = (job: any) => {
  const budgetMeta = job?.budgetMeta && typeof job.budgetMeta === 'object' ? job.budgetMeta : {};
  return {
    id: job.id,
    title: job.title,
    description: job.description,
    category: job.categoryName || job.category?.name || '',
    subcategory: job.subcategoryName || job.subcategory?.name || '',
    status: job.status,
    adminStatus: job.adminStatus,
    admin_status: job.adminStatus,
    isActive: job.isActive,
    isVisible: job.isVisible,
    isFeatured: job.isFeatured,
    budget: {
      type: job.budgetType || budgetMeta.type || 'fixed',
      amount: Number(job.budgetAmount || 0),
      minAmount: job.budgetMin ?? budgetMeta.minAmount,
      maxAmount: job.budgetMax ?? budgetMeta.maxAmount
    },
    jobType: job.jobType,
    experienceLevel: job.experienceLevel,
    visibility: job.visibility,
    tags: parseArray(job.tags),
    skills: parseArray(job.skills),
    attachments: parseArray(job.attachments),
    proposalsCount: job.proposalsCount ?? 0,
    clientId: job.ownerId,
    planType: job.planType,
    planId: job.planId,
    planSnapshot: job.planSnapshot,
    paidTransactionRef: job.paidTransactionRef,
    adminReason: job.adminReason,
    meta: job.meta ?? undefined,
    postedAt: job.postedAt || job.createdAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
};

const resolveCategory = async (value: any, type: 'GIG' | 'JOB') => {
  if (!prisma || !value) return null;
  const search = String(value);
  return prisma.category.findFirst({
    where: {
      OR: [{ id: search }, { name: search }, { slug: search }],
      type: { in: [type, 'BOTH'] },
      parentId: null
    }
  });
};

const resolveSubcategory = async (value: any, type: 'GIG' | 'JOB', parentId?: string | null) => {
  if (!prisma || !value) return null;
  const search = String(value);
  return prisma.category.findFirst({
    where: {
      OR: [{ id: search }, { name: search }, { slug: search }],
      type: { in: [type, 'BOTH'] },
      parentId: parentId || undefined
    }
  });
};

export const listJobs = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const user = (req as unknown as { user?: { id?: string } }).user as { id?: string } | undefined;
  const ownerId = req.query.ownerId === 'me' ? user?.id : (req.query.ownerId as string | undefined);
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '20', 10);

  const where: any = { deletedAt: null };
  if (ownerId) where.ownerId = ownerId;
  if (status) where.status = status;
  if (search) where.title = { contains: search, mode: 'insensitive' };
  if (!ownerId) {
    where.isActive = true;
    where.isVisible = true;
    where.adminStatus = 'approved';
  }

  const [total, jobs] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      include: { category: true, subcategory: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    })
  ]);

  return res.json({
    success: true,
    data: {
      jobs: jobs.map(toJobResponse),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    }
  });
};

export const getJobById = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const job = await prisma.job.findFirst({
    where: { id, deletedAt: null },
    include: { category: true, subcategory: true }
  });
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  return res.json({ success: true, data: toJobResponse(job) });
};

export const createJob = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const user = (req as unknown as { user?: { id?: string } }).user as { id?: string } | undefined;
  if (!user?.id) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const payload = req.body || {};

  const hasBudget = payload.budget !== undefined || payload.budgetMeta !== undefined || payload.budgetType !== undefined;
  const budget = payload.budget ?? payload.budgetMeta ?? {};
  const budgetAmount = typeof budget === 'number' ? budget : budget?.amount;
  const budgetType = typeof budget === 'object' ? budget?.type : payload.budgetType;

  const category = await resolveCategory(payload.categoryId || payload.category, 'JOB');
  const subcategory = await resolveSubcategory(payload.subcategoryId || payload.subcategory, 'JOB', category?.id);

  const planSnapshot = payload.planSnapshot || (payload.plan_id || payload.plan_name ? {
    id: payload.plan_id,
    name: payload.plan_name,
    price: payload.plan_price,
    interval: payload.plan_interval
  } : null);

  const job = await prisma.job.create({
    data: {
      ownerId: user.id,
      title: payload.title || 'Untitled Job',
      description: payload.description || null,
      status: payload.status || 'draft',
      adminStatus: payload.adminStatus || 'pending',
      isActive: Boolean(payload.isActive) || false,
      isVisible: Boolean(payload.isVisible) || false,
      isFeatured: Boolean(payload.isFeatured) || false,
      categoryId: category?.id || null,
      subcategoryId: subcategory?.id || null,
      categoryName: payload.categoryName || payload.category || category?.name || null,
      subcategoryName: payload.subcategoryName || payload.subcategory || subcategory?.name || null,
      budgetAmount: parseNumber(budgetAmount),
      budgetType: budgetType || null,
      budgetMin: parseNumber(budget?.minAmount ?? payload.budgetMin),
      budgetMax: parseNumber(budget?.maxAmount ?? payload.budgetMax),
      budgetMeta: typeof budget === 'object' ? budget : null,
      jobType: payload.jobType || payload.type || null,
      experienceLevel: payload.experienceLevel || payload.experience_level || null,
      visibility: payload.visibility || null,
      tags: payload.tags ?? [],
      skills: payload.skills ?? [],
      attachments: payload.attachments ?? [],
      planType: payload.planType || payload.plan_type || null,
      planId: payload.planId || payload.plan_id || null,
      planSnapshot,
      paidTransactionRef: payload.paidTransactionRef || payload.transactionRef || payload.plan_transaction_ref || null
      ,meta: payload.meta ?? null
    }
  });

  return res.json({ success: true, data: toJobResponse(job) });
};

export const updateJob = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const payload = req.body || {};
  const user = (req as any).user;

  const existing = await prisma.job.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ success: false, error: 'Job not found' });
  if (!isAdminRole(user?.role) && existing.ownerId !== user?.id) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const budget = payload.budget ?? payload.budgetMeta ?? {};
  const budgetAmount = typeof budget === 'number' ? budget : budget?.amount;
  const budgetType = typeof budget === 'object' ? budget?.type : payload.budgetType;

  const category = await resolveCategory(payload.categoryId || payload.category, 'JOB');
  const subcategory = await resolveSubcategory(payload.subcategoryId || payload.subcategory, 'JOB', category?.id);

  const job = await prisma.job.update({
    where: { id },
    data: {
      title: payload.title,
      description: payload.description,
      status: payload.status,
      adminStatus: payload.adminStatus,
      isActive: payload.isActive,
      isVisible: payload.isVisible,
      isFeatured: payload.isFeatured,
      categoryId: category?.id || payload.categoryId,
      subcategoryId: subcategory?.id || payload.subcategoryId,
      categoryName: payload.categoryName || payload.category,
      subcategoryName: payload.subcategoryName || payload.subcategory,
      budgetAmount: hasBudget ? parseNumber(budgetAmount) : undefined,
      budgetType: hasBudget ? budgetType : undefined,
      budgetMin: hasBudget ? parseNumber(budget?.minAmount ?? payload.budgetMin) : undefined,
      budgetMax: hasBudget ? parseNumber(budget?.maxAmount ?? payload.budgetMax) : undefined,
      budgetMeta: hasBudget && typeof budget === 'object' ? budget : undefined,
      jobType: payload.jobType || payload.type,
      experienceLevel: payload.experienceLevel || payload.experience_level,
      visibility: payload.visibility,
      tags: payload.tags,
      skills: payload.skills,
      attachments: payload.attachments,
      planType: payload.planType || payload.plan_type,
      planId: payload.planId || payload.plan_id,
      planSnapshot: payload.planSnapshot,
      paidTransactionRef: payload.paidTransactionRef || payload.transactionRef,
      adminReason: payload.adminReason,
      meta: payload.meta
    }
  });

  return res.json({ success: true, data: toJobResponse(job) });
};

export const deleteJob = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const user = (req as any).user;
  const existing = await prisma.job.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ success: false, error: 'Job not found' });
  if (!isAdminRole(user?.role) && existing.ownerId !== user?.id) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  await prisma.job.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false, isVisible: false }
  });
  return res.json({ success: true, data: { id } });
};

export const jobAction = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const action = (req.params.action || req.body.action) as string;
  const now = new Date();
  const user = (req as any).user;

  const existing = await prisma.job.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ success: false, error: 'Job not found' });
  if (!isAdminRole(user?.role) && existing.ownerId !== user?.id) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  let data: any = {};
  switch (action) {
    case 'submit':
      data = { status: 'submitted', adminStatus: 'pending', isActive: false, isVisible: false };
      break;
    case 'pause':
      data = { status: 'paused', isActive: false, isVisible: false };
      break;
    case 'activate':
      data = { status: 'active', isActive: true, isVisible: true, postedAt: now };
      break;
    case 'close':
      data = { status: 'closed', isActive: false, isVisible: false };
      break;
    default:
      data = { status: action };
      break;
  }

  const job = await prisma.job.update({ where: { id }, data });
  return res.json({ success: true, data: toJobResponse(job) });
};
