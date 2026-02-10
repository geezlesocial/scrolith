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

const logAdminAction = async (
  adminId: string | null | undefined,
  action: string,
  entityType: string,
  entityId: string,
  reason?: string | null,
  metadata?: any
) => {
  if (!prisma) return;
  await prisma.adminAuditLog.create({
    data: {
      adminId: adminId || 'system',
      action,
      entityType,
      entityId,
      reason: reason || null,
      metadata: metadata ?? null
    }
  });
};

const toGigResponse = (gig: any) => {
  const priceMeta = gig?.priceMeta && typeof gig.priceMeta === 'object' ? gig.priceMeta : {};
  const media = parseArray(gig.media);
  return {
    id: gig.id,
    title: gig.title,
    description: gig.description,
    slug: gig.slug,
    category: gig.categoryName || gig.category?.name || '',
    subcategory: gig.subcategoryName || gig.subcategory?.name || '',
    status: gig.status,
    adminStatus: gig.adminStatus,
    admin_status: gig.adminStatus,
    isActive: gig.isActive,
    isVisible: gig.isVisible,
    isFeatured: gig.isFeatured,
    price: Number(gig.price || 0),
    pricingMode: gig.pricingMode,
    priceType: gig.priceType || priceMeta.type || 'fixed',
    tags: parseArray(gig.tags),
    image: media[0] || '',
    images: media,
    media,
    packages: parseArray(gig.packages),
    extras: parseArray(gig.extras),
    views: gig.views ?? 0,
    clicks: gig.clicks ?? 0,
    ordersCount: gig.ordersCount ?? 0,
    rating: gig.rating ?? 0,
    reviews: gig.reviews ?? 0,
    adminReason: gig.adminReason,
    meta: gig.meta ?? undefined,
    createdAt: gig.createdAt,
    updatedAt: gig.updatedAt
  };
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
    budget: job.budgetAmount ?? budgetMeta.amount ?? 0,
    budgetType: job.budgetType || budgetMeta.type || 'fixed',
    proposalsCount: job.proposalsCount ?? 0,
    tags: parseArray(job.tags),
    skills: parseArray(job.skills),
    attachments: parseArray(job.attachments),
    planType: job.planType,
    planId: job.planId,
    planSnapshot: job.planSnapshot,
    paidTransactionRef: job.paidTransactionRef,
    adminReason: job.adminReason,
    meta: job.meta ?? undefined,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
};

export const getAdminGigs = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { status, adminStatus, search, category, subcategory, page, limit } = req.query;
  const take = parseInt((limit as string) || '50', 10);
  const skip = (parseInt((page as string) || '1', 10) - 1) * take;

  const where: any = { deletedAt: null };
  if (status) where.status = status;
  if (adminStatus) where.adminStatus = adminStatus;
  if (category) where.categoryName = String(category);
  if (subcategory) where.subcategoryName = String(subcategory);
  if (search) where.title = { contains: String(search), mode: 'insensitive' };

  const gigs = await prisma.gig.findMany({
    where,
    include: { category: true, subcategory: true },
    orderBy: { createdAt: 'desc' },
    skip,
    take
  });
  return res.json({ success: true, data: gigs.map(toGigResponse) });
};

export const saveAdminGig = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const adminId = (req as any).user?.id;
  const payload = req.body || {};
  const price = payload.price ?? payload.pricing ?? {};
  const priceAmount = typeof price === 'number' ? price : price?.amount;
  const priceType = typeof price === 'object' ? price?.type : payload.priceType;

  const data: any = {
    title: payload.title || 'Untitled Gig',
    description: payload.description,
    slug: payload.slug,
    freelancerId: payload.freelancerId || payload.freelancer_id || payload.ownerId || payload.owner_id || 'unknown',
    freelancerName: payload.freelancerName || payload.freelancer_name || null,
    freelancerAvatar: payload.freelancerAvatar || payload.freelancer_avatar || null,
    price: parseNumber(priceAmount) ?? 0,
    priceType: priceType || null,
    priceMin: parseNumber(price?.minAmount ?? payload.priceMin),
    priceMax: parseNumber(price?.maxAmount ?? payload.priceMax),
    priceMeta: typeof price === 'object' ? price : null,
    status: payload.status || 'draft',
    adminStatus: payload.adminStatus || payload.admin_status || 'pending',
    isActive: payload.isActive ?? payload.is_active ?? false,
    isVisible: payload.isVisible ?? payload.is_visible ?? false,
    isFeatured: payload.isFeatured ?? payload.is_featured ?? false,
    categoryName: payload.categoryName || payload.category || null,
    subcategoryName: payload.subcategoryName || payload.subcategory || null,
    tags: payload.tags ?? [],
    media: payload.media ?? payload.images ?? [],
    packages: payload.packages ?? [],
    extras: payload.extras ?? [],
    pricingMode: payload.pricingMode ?? payload.pricing_mode ?? null,
    deliveryTime: parseNumber(payload.deliveryTime ?? payload.delivery_time),
    revisions: parseNumber(payload.revisions),
    adminReason: payload.adminReason || payload.admin_reason || null,
    meta: payload.meta ?? null
  };

  const gig = payload.id
    ? await prisma.gig.upsert({
        where: { id: payload.id },
        update: data,
        create: { ...data, id: payload.id }
      })
    : await prisma.gig.create({ data: { ...data, id: payload.id || undefined } });

  await logAdminAction(adminId, 'GIG_SAVE', 'GIG', gig.id, null, { status: gig.status });
  if ((req as any).io) (req as any).io.emit('admin:gig_update', gig);
  return res.json({ success: true, data: toGigResponse(gig) });
};

export const deleteAdminGig = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const adminId = (req as any).user?.id;
  const { id } = req.params;
  await prisma.gig.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false, isVisible: false }
  });
  await logAdminAction(adminId, 'GIG_DELETE', 'GIG', id, req.body?.reason || null);
  if ((req as any).io) (req as any).io.emit('admin:gig_delete', { id });
  return res.json({ success: true, data: { id } });
};

export const approveAdminGig = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const adminId = (req as any).user?.id;
  const { id } = req.params;
  const action = (req.body?.action || 'approve').toString().toLowerCase();
  const notes = req.body?.notes as string | undefined;

  let data: any = {};
  if (action === 'approve') {
    data = { adminStatus: 'approved', status: 'active', isActive: true, isVisible: true, approvedAt: new Date(), adminReason: null };
  } else if (action === 'reject') {
    data = { adminStatus: 'rejected', status: 'rejected', isActive: false, isVisible: false, rejectedAt: new Date(), adminReason: notes || null };
  } else if (action === 'changes') {
    data = { adminStatus: 'changes_requested', status: 'under_review', isActive: false, isVisible: false, adminReason: notes || null };
  }

  const gig = await prisma.gig.update({ where: { id }, data });
  await logAdminAction(adminId, 'GIG_APPROVAL', 'GIG', id, notes || null, { action });
  if ((req as any).io) (req as any).io.emit('admin:gig_update', gig);
  return res.json({ success: true, data: toGigResponse(gig) });
};

export const getAdminJobs = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { status, adminStatus, search, category, subcategory, page, limit } = req.query;
  const take = parseInt((limit as string) || '50', 10);
  const skip = (parseInt((page as string) || '1', 10) - 1) * take;

  const where: any = { deletedAt: null };
  if (status) where.status = status;
  if (adminStatus) where.adminStatus = adminStatus;
  if (category) where.categoryName = String(category);
  if (subcategory) where.subcategoryName = String(subcategory);
  if (search) where.title = { contains: String(search), mode: 'insensitive' };

  const jobs = await prisma.job.findMany({
    where,
    include: { category: true, subcategory: true },
    orderBy: { createdAt: 'desc' },
    skip,
    take
  });

  return res.json({ success: true, data: jobs.map(toJobResponse) });
};

export const saveAdminJob = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const adminId = (req as any).user?.id;
  const payload = req.body || {};
  const budget = payload.budget ?? payload.budgetMeta ?? {};
  const budgetAmount = typeof budget === 'number' ? budget : budget?.amount;
  const budgetType = typeof budget === 'object' ? budget?.type : payload.budgetType;

  const data: any = {
    ownerId: payload.ownerId || payload.owner_id || payload.clientId || 'unknown',
    title: payload.title || 'Untitled Job',
    description: payload.description,
    status: payload.status || 'draft',
    adminStatus: payload.adminStatus || payload.admin_status || 'pending',
    isActive: payload.isActive ?? payload.is_active ?? false,
    isVisible: payload.isVisible ?? payload.is_visible ?? false,
    isFeatured: payload.isFeatured ?? payload.is_featured ?? false,
    categoryName: payload.categoryName || payload.category || null,
    subcategoryName: payload.subcategoryName || payload.subcategory || null,
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
    planSnapshot: payload.planSnapshot || null,
    paidTransactionRef: payload.paidTransactionRef || payload.transactionRef || null,
    adminReason: payload.adminReason || payload.admin_reason || null,
    meta: payload.meta ?? null
  };

  const job = payload.id
    ? await prisma.job.upsert({
        where: { id: payload.id },
        update: data,
        create: { ...data, id: payload.id }
      })
    : await prisma.job.create({ data: { ...data, id: payload.id || undefined } });

  await logAdminAction(adminId, 'JOB_SAVE', 'JOB', job.id, null, { status: job.status });
  if ((req as any).io) (req as any).io.emit('admin:job_update', job);
  return res.json({ success: true, data: toJobResponse(job) });
};

export const deleteAdminJob = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const adminId = (req as any).user?.id;
  const { id } = req.params;
  await prisma.job.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false, isVisible: false }
  });
  await logAdminAction(adminId, 'JOB_DELETE', 'JOB', id, req.body?.reason || null);
  if ((req as any).io) (req as any).io.emit('admin:job_delete', { id });
  return res.json({ success: true, data: { id } });
};

export const approveAdminJob = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const adminId = (req as any).user?.id;
  const { id } = req.params;
  const action = (req.body?.action || 'approve').toString().toLowerCase();
  const notes = req.body?.notes as string | undefined;

  let data: any = {};
  if (action === 'approve') {
    data = { adminStatus: 'approved', status: 'active', isActive: true, isVisible: true, postedAt: new Date(), adminReason: null };
  } else if (action === 'reject') {
    data = { adminStatus: 'rejected', status: 'rejected', isActive: false, isVisible: false, adminReason: notes || null };
  } else if (action === 'changes') {
    data = { adminStatus: 'changes_requested', status: 'under_review', isActive: false, isVisible: false, adminReason: notes || null };
  }

  const job = await prisma.job.update({ where: { id }, data });
  await logAdminAction(adminId, 'JOB_APPROVAL', 'JOB', id, notes || null, { action });
  if ((req as any).io) (req as any).io.emit('admin:job_update', job);
  return res.json({ success: true, data: toJobResponse(job) });
};

export const getGigCategoriesAdmin = async (_req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const categories = await prisma.category.findMany({
    where: { parentId: null, type: { in: ['GIG', 'BOTH'] } },
    include: { subcategories: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' }
  });
  const mapped = categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    type: c.type.toLowerCase(),
    status: c.status,
    count: 0,
    sortOrder: c.sortOrder,
    subcategories: c.subcategories.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      status: s.status,
      sortOrder: s.sortOrder
    })),
    description: c.description || '',
    logo: c.image || ''
  }));
  return res.json({ success: true, data: mapped });
};

export const getJobCategoriesAdmin = async (_req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const categories = await prisma.category.findMany({
    where: { parentId: null, type: { in: ['JOB', 'BOTH'] } },
    include: { subcategories: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' }
  });
  const mapped = categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    type: c.type.toLowerCase(),
    status: c.status,
    count: 0,
    sortOrder: c.sortOrder,
    subcategories: c.subcategories.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      status: s.status,
      sortOrder: s.sortOrder
    })),
    description: c.description || '',
    logo: c.image || ''
  }));
  return res.json({ success: true, data: mapped });
};

const canDeleteCategory = async (categoryId: string) => {
  if (!prisma) return false;
  const gigCount = await prisma.gig.count({ where: { categoryId: categoryId, deletedAt: null } });
  const jobCount = await prisma.job.count({ where: { categoryId: categoryId, deletedAt: null } });
  const gigSubCount = await prisma.gig.count({ where: { subcategoryId: categoryId, deletedAt: null } });
  const jobSubCount = await prisma.job.count({ where: { subcategoryId: categoryId, deletedAt: null } });
  return gigCount + jobCount + gigSubCount + jobSubCount === 0;
};

export const saveCategoryAdmin = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const adminId = (req as any).user?.id;
  const payload = req.body || {};
  const typeRaw = (payload.type || '').toString().toUpperCase();
  const type = typeRaw === 'JOB' || typeRaw === 'BOTH' ? typeRaw : 'GIG';
  const status = payload.status || 'active';

  const category = payload.id
    ? await prisma.category.update({
        where: { id: payload.id },
        data: {
          name: payload.name,
          slug: payload.slug,
          type,
          status,
          sortOrder: payload.sortOrder || 0,
          icon: payload.icon || null,
          description: payload.description || null,
          image: payload.logo || payload.image || null
        }
      })
    : await prisma.category.create({
        data: {
          id: payload.id || undefined,
          name: payload.name,
          slug: payload.slug,
          type,
          status,
          sortOrder: payload.sortOrder || 0,
          icon: payload.icon || null,
          description: payload.description || null,
          image: payload.logo || payload.image || null
        }
      });

  const subcategories = Array.isArray(payload.subcategories) ? payload.subcategories : [];
  const seenIds: string[] = [];
  for (const sub of subcategories) {
    const subId = sub.id || undefined;
    const saved = subId
      ? await prisma.category.update({
          where: { id: subId },
          data: {
            name: sub.name,
            slug: sub.slug || sub.name?.toLowerCase?.().replace(/\s+/g, '-') || subId,
            type,
            status: sub.status || 'active',
            sortOrder: sub.sortOrder || 0,
            icon: sub.icon || null,
            parentId: category.id
          }
        })
      : await prisma.category.create({
          data: {
            name: sub.name,
            slug: sub.slug || sub.name?.toLowerCase?.().replace(/\s+/g, '-') || `sub-${Date.now()}`,
            type,
            status: sub.status || 'active',
            sortOrder: sub.sortOrder || 0,
            icon: sub.icon || null,
            parentId: category.id
          }
        });
    seenIds.push(saved.id);
  }

  const existingSubs = await prisma.category.findMany({ where: { parentId: category.id } });
  for (const existing of existingSubs) {
    if (!seenIds.includes(existing.id)) {
      const ok = await canDeleteCategory(existing.id);
      if (ok) await prisma.category.delete({ where: { id: existing.id } });
    }
  }

  await logAdminAction(adminId, 'CATEGORY_SAVE', 'CATEGORY', category.id, null, { type });
  if ((req as any).io) (req as any).io.emit('admin:category_update', category);
  return res.json({ success: true, data: category });
};

export const deleteCategoryAdmin = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const adminId = (req as any).user?.id;
  const { id } = req.params;
  const ok = await canDeleteCategory(id);
  if (!ok) return res.status(400).json({ success: false, error: 'Category has gigs/jobs assigned. Migrate before deleting.' });

  const subs = await prisma.category.findMany({ where: { parentId: id } });
  for (const sub of subs) {
    const subOk = await canDeleteCategory(sub.id);
    if (subOk) await prisma.category.delete({ where: { id: sub.id } });
  }

  await prisma.category.delete({ where: { id } });
  await logAdminAction(adminId, 'CATEGORY_DELETE', 'CATEGORY', id, null);
  if ((req as any).io) (req as any).io.emit('admin:category_delete', { id });
  return res.json({ success: true, data: { id } });
};

export const getPlans = async (_req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const plans = await prisma.plan.findMany({ orderBy: { createdAt: 'desc' } });
  return res.json({ success: true, data: plans.map((p) => ({
    ...p,
    isActive: p.isActive,
    isPopular: p.isPopular,
    features: Array.isArray(p.features) ? p.features : []
  })) });
};

export const savePlan = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const adminId = (req as any).user?.id;
  const payload = req.body || {};
  const data: any = {
    name: payload.name,
    type: payload.type || 'freelancer',
    price: parseNumber(payload.price) ?? 0,
    interval: payload.interval || 'monthly',
    currency: payload.currency || 'USD',
    isActive: payload.isActive ?? payload.is_active ?? true,
    isPopular: payload.isPopular ?? payload.is_popular ?? false,
    features: payload.features ?? [],
    jobPostsIncluded: payload.jobPostsIncluded ?? payload.job_posts_included ?? null,
    featuredBoost: payload.featuredBoost ?? payload.featured_boost ?? false,
    visibilityDays: payload.visibilityDays ?? payload.visibility_days ?? null,
    priorityReview: payload.priorityReview ?? payload.priority_review ?? false,
    bidLimit: payload.bidLimit ?? payload.bid_limit ?? null,
    proposalLimit: payload.proposalLimit ?? payload.proposal_limit ?? null,
    portfolioSlots: payload.portfolioSlots ?? payload.portfolio_slots ?? null,
    accessPremiumJobs: payload.accessPremiumJobs ?? payload.access_premium_jobs ?? false
  };

  const plan = payload.id
    ? await prisma.plan.update({ where: { id: payload.id }, data })
    : await prisma.plan.create({ data: { ...data, id: payload.id || undefined } });

  await logAdminAction(adminId, 'PLAN_SAVE', 'PLAN', plan.id, null, { type: plan.type });
  return res.json({ success: true, data: plan });
};

export const getDashboardStats = async (_req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const [gigsTotal, gigsPending, jobsTotal, jobsPending] = await Promise.all([
    prisma.gig.count({ where: { deletedAt: null } }),
    prisma.gig.count({ where: { deletedAt: null, adminStatus: 'pending' } }),
    prisma.job.count({ where: { deletedAt: null } }),
    prisma.job.count({ where: { deletedAt: null, adminStatus: 'pending' } })
  ]);

  return res.json({
    success: true,
    data: {
      gigsTotal,
      gigsPending,
      jobsTotal,
      jobsPending
    }
  });
};

export const listJobProposalsAdmin = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const proposals = await prisma.jobProposal.findMany({
    where: { jobId: id },
    orderBy: { createdAt: 'desc' }
  });
  return res.json({ success: true, data: proposals });
};

export const rejectProposalAdmin = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const adminId = (req as any).user?.id;
  const { id } = req.params;
  const reason = req.body?.reason || null;
  const proposal = await prisma.jobProposal.update({
    where: { id },
    data: { status: 'rejected', rejectionReason: reason }
  });
  await logAdminAction(adminId, 'PROPOSAL_REJECT', 'PROPOSAL', id, reason);
  return res.json({ success: true, data: proposal });
};
