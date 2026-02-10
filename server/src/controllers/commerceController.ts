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

const mapCategory = (category: any) => ({
  id: category.id,
  name: category.name,
  slug: category.slug,
  type: category.type?.toLowerCase?.() || category.type,
  status: category.status,
  count: category.count || 0,
  sortOrder: category.sortOrder || 0,
  subcategories: Array.isArray(category.subcategories)
    ? category.subcategories.map((sub: any) => ({
        id: sub.id,
        name: sub.name,
        slug: sub.slug,
        status: sub.status,
        sortOrder: sub.sortOrder || 0,
        icon: sub.icon
      }))
    : []
});

const canDeleteCategory = async (categoryId: string) => {
  if (!prisma) return false;
  const [gigCount, jobCount, gigSubCount, jobSubCount] = await Promise.all([
    prisma.gig.count({ where: { categoryId, deletedAt: null } }),
    prisma.job.count({ where: { categoryId, deletedAt: null } }),
    prisma.gig.count({ where: { subcategoryId: categoryId, deletedAt: null } }),
    prisma.job.count({ where: { subcategoryId: categoryId, deletedAt: null } })
  ]);
  return gigCount + jobCount + gigSubCount + jobSubCount === 0;
};

export const getCategories = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const type = (req.query.type as string | undefined)?.toLowerCase();
  const types = type === 'gig' ? ['GIG', 'BOTH'] : type === 'job' ? ['JOB', 'BOTH'] : ['GIG', 'JOB', 'BOTH'];
  const categories = await prisma.category.findMany({
    where: { parentId: null, type: { in: types } },
    include: { subcategories: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' }
  });
  return res.json({ success: true, data: categories.map(mapCategory) });
};

export const saveCategory = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
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

  if ((req as any).io) (req as any).io.emit('admin:category_update', category);
  return res.json({ success: true, data: category });
};

export const deleteCategory = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const ok = await canDeleteCategory(id);
  if (!ok) return res.status(400).json({ success: false, error: 'Category has gigs/jobs assigned. Migrate before deleting.' });

  const subs = await prisma.category.findMany({ where: { parentId: id } });
  for (const sub of subs) {
    const subOk = await canDeleteCategory(sub.id);
    if (subOk) await prisma.category.delete({ where: { id: sub.id } });
  }
  await prisma.category.delete({ where: { id } });
  return res.json({ success: true });
};

export const getGigs = async (_req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const gigs = await prisma.gig.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  return res.json({ success: true, data: gigs });
};

export const saveGig = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const payload = req.body || {};
  const price = payload.price ?? payload.pricing ?? {};
  const priceAmount = typeof price === 'number' ? price : price?.amount;
  const priceType = typeof price === 'object' ? price?.type : payload.priceType;

  const data: any = {
    title: payload.title || 'Untitled Gig',
    description: payload.description,
    slug: payload.slug,
    freelancerId: payload.freelancerId || payload.ownerId || 'unknown',
    freelancerName: payload.freelancerName || null,
    freelancerAvatar: payload.freelancerAvatar || null,
    price: parseNumber(priceAmount) ?? 0,
    priceType: priceType || null,
    priceMin: parseNumber(price?.minAmount ?? payload.priceMin),
    priceMax: parseNumber(price?.maxAmount ?? payload.priceMax),
    priceMeta: typeof price === 'object' ? price : null,
    status: payload.status || 'draft',
    adminStatus: payload.adminStatus || payload.admin_status || 'pending',
    isActive: payload.isActive ?? false,
    isVisible: payload.isVisible ?? false,
    isFeatured: payload.isFeatured ?? false,
    categoryName: payload.categoryName || payload.category || null,
    subcategoryName: payload.subcategoryName || payload.subcategory || null,
    tags: payload.tags ?? [],
    media: payload.media ?? payload.images ?? [],
    packages: payload.packages ?? [],
    extras: payload.extras ?? [],
    pricingMode: payload.pricingMode ?? null,
    deliveryTime: parseNumber(payload.deliveryTime),
    revisions: parseNumber(payload.revisions),
    adminReason: payload.adminReason || null
  };

  const gig = payload.id
    ? await prisma.gig.upsert({
        where: { id: payload.id },
        update: data,
        create: { ...data, id: payload.id }
      })
    : await prisma.gig.create({ data: { ...data, id: payload.id || undefined } });

  if ((req as any).io) (req as any).io.emit('admin:gig_update', gig);
  return res.json({ success: true, data: gig });
};

export const deleteGig = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  await prisma.gig.update({ where: { id }, data: { deletedAt: new Date(), isActive: false, isVisible: false } });
  return res.json({ success: true });
};

export const getJobs = async (_req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const jobs = await prisma.job.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  return res.json({ success: true, data: jobs });
};

export const saveJob = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const payload = req.body || {};
  const budget = payload.budget ?? payload.budgetMeta ?? {};
  const budgetAmount = typeof budget === 'number' ? budget : budget?.amount;
  const budgetType = typeof budget === 'object' ? budget?.type : payload.budgetType;

  const data: any = {
    ownerId: payload.ownerId || payload.clientId || 'unknown',
    title: payload.title || 'Untitled Job',
    description: payload.description,
    status: payload.status || 'draft',
    adminStatus: payload.adminStatus || payload.admin_status || 'pending',
    isActive: payload.isActive ?? false,
    isVisible: payload.isVisible ?? false,
    isFeatured: payload.isFeatured ?? false,
    categoryName: payload.categoryName || payload.category || null,
    subcategoryName: payload.subcategoryName || payload.subcategory || null,
    budgetAmount: parseNumber(budgetAmount),
    budgetType: budgetType || null,
    budgetMin: parseNumber(budget?.minAmount ?? payload.budgetMin),
    budgetMax: parseNumber(budget?.maxAmount ?? payload.budgetMax),
    budgetMeta: typeof budget === 'object' ? budget : null,
    jobType: payload.jobType || payload.type || null,
    experienceLevel: payload.experienceLevel || null,
    visibility: payload.visibility || null,
    tags: payload.tags ?? [],
    skills: payload.skills ?? [],
    attachments: payload.attachments ?? [],
    planType: payload.planType || null,
    planId: payload.planId || null,
    planSnapshot: payload.planSnapshot || null,
    paidTransactionRef: payload.paidTransactionRef || null,
    adminReason: payload.adminReason || null
  };

  const job = payload.id
    ? await prisma.job.upsert({
        where: { id: payload.id },
        update: data,
        create: { ...data, id: payload.id }
      })
    : await prisma.job.create({ data: { ...data, id: payload.id || undefined } });

  if ((req as any).io) (req as any).io.emit('admin:job_update', job);
  return res.json({ success: true, data: job });
};

export const deleteJob = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  await prisma.job.update({ where: { id }, data: { deletedAt: new Date(), isActive: false, isVisible: false } });
  return res.json({ success: true });
};
