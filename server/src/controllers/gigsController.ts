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
    price: {
      type: gig.priceType || priceMeta.type || 'fixed',
      amount: Number(gig.price || 0),
      minAmount: gig.priceMin ?? priceMeta.minAmount,
      maxAmount: gig.priceMax ?? priceMeta.maxAmount
    },
    performance: {
      views: gig.views ?? 0,
      clicks: gig.clicks ?? 0,
      orders: gig.ordersCount ?? 0,
      rating: gig.rating ?? 0,
      reviews: gig.reviews ?? 0
    },
    freelancerId: gig.freelancerId,
    freelancerName: gig.freelancerName,
    freelancerAvatar: gig.freelancerAvatar,
    freelancerProfilePhotoFileId: gig.freelancerProfilePhotoFileId,
    image: media[0] || '',
    images: media,
    media,
    tags: parseArray(gig.tags),
    packages: parseArray(gig.packages),
    extras: parseArray(gig.extras),
    faqs: parseArray(gig.faqs),
    requirements: parseArray(gig.requirements),
    milestones: parseArray(gig.milestones),
    pricingMode: gig.pricingMode,
    deliveryTime: gig.deliveryTime,
    revisions: gig.revisions,
    adminReason: gig.adminReason,
    meta: gig.meta ?? undefined,
    createdAt: gig.createdAt,
    updatedAt: gig.updatedAt
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

export const listGigs = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const user = (req as unknown as { user?: { id?: string } }).user;
  const ownerId = req.query.ownerId === 'me' ? user?.id : (req.query.ownerId as string | undefined);
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '20', 10);

  const where: any = { deletedAt: null };
  if (ownerId) where.freelancerId = ownerId;
  if (status) where.status = status;
  if (search) where.title = { contains: search, mode: 'insensitive' };
  if (!ownerId) {
    where.isActive = true;
    where.isVisible = true;
    where.adminStatus = 'approved';
  }

  const [total, gigs] = await Promise.all([
    prisma.gig.count({ where }),
    prisma.gig.findMany({
      where,
      include: { category: true, subcategory: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    })
  ]);

  const data = gigs.map(toGigResponse);
  return res.json({
    success: true,
    data: {
      gigs: data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    }
  });
};

export const getGigById = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const gig = await prisma.gig.findFirst({
    where: { id, deletedAt: null },
    include: { category: true, subcategory: true }
  });
  if (!gig) return res.status(404).json({ success: false, error: 'Gig not found' });
  return res.json({ success: true, data: toGigResponse(gig) });
};

export const createGig = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const user = (req as unknown as { user?: { id?: string } }).user;
  if (!user?.id) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const payload = req.body || {};

  const hasPrice = payload.price !== undefined || payload.pricing !== undefined || payload.priceType !== undefined;
  const price = payload.price ?? payload.pricing ?? {};
  const priceAmount = typeof price === 'number' ? price : price?.amount;
  const priceType = typeof price === 'object' ? price?.type : payload.priceType;

  const category = await resolveCategory(payload.categoryId || payload.category, 'GIG');
  const subcategory = await resolveSubcategory(payload.subcategoryId || payload.subcategory, 'GIG', category?.id);

  const gig = await prisma.gig.create({
    data: {
      title: payload.title || 'Untitled Gig',
      description: payload.description || null,
      slug: payload.slug || null,
      freelancerId: user.id,
      freelancerName: payload.freelancerName || null,
      freelancerAvatar: payload.freelancerAvatar || null,
      freelancerProfilePhotoFileId: payload.freelancerProfilePhotoFileId || null,
      price: parseNumber(priceAmount) || 0,
      priceType: priceType || null,
      priceMin: parseNumber(price?.minAmount ?? payload.priceMin),
      priceMax: parseNumber(price?.maxAmount ?? payload.priceMax),
      priceMeta: typeof price === 'object' ? price : null,
      status: payload.status || 'draft',
      adminStatus: payload.adminStatus || 'pending',
      isActive: Boolean(payload.isActive) || false,
      isVisible: Boolean(payload.isVisible) || false,
      isFeatured: Boolean(payload.isFeatured) || false,
      categoryId: category?.id || null,
      subcategoryId: subcategory?.id || null,
      categoryName: payload.categoryName || payload.category || category?.name || null,
      subcategoryName: payload.subcategoryName || payload.subcategory || subcategory?.name || null,
      media: payload.media ?? payload.images ?? [],
      tags: payload.tags ?? [],
      packages: payload.packages ?? [],
      extras: payload.extras ?? [],
      faqs: payload.faqs ?? [],
      requirements: payload.requirements ?? [],
      milestones: payload.milestones ?? [],
      pricingMode: payload.pricingMode || null,
      deliveryTime: parseNumber(payload.deliveryTime),
      revisions: parseNumber(payload.revisions)
      ,meta: payload.meta ?? null
    }
  });

  return res.json({ success: true, data: toGigResponse(gig) });
};

export const updateGig = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const payload = req.body || {};
  const user = (req as any).user;

  const existing = await prisma.gig.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ success: false, error: 'Gig not found' });
  if (!isAdminRole(user?.role) && existing.freelancerId !== user?.id) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const hasPrice = payload.price !== undefined || payload.pricing !== undefined || payload.priceType !== undefined;
  const price = payload.price ?? payload.pricing ?? {};
  const priceAmount = typeof price === 'number' ? price : price?.amount;
  const priceType = typeof price === 'object' ? price?.type : payload.priceType;

  const category = await resolveCategory(payload.categoryId || payload.category, 'GIG');
  const subcategory = await resolveSubcategory(payload.subcategoryId || payload.subcategory, 'GIG', category?.id);

  const gig = await prisma.gig.update({
    where: { id },
    data: {
      title: payload.title,
      description: payload.description,
      slug: payload.slug,
      freelancerName: payload.freelancerName,
      freelancerAvatar: payload.freelancerAvatar,
      freelancerProfilePhotoFileId: payload.freelancerProfilePhotoFileId,
      price: hasPrice ? parseNumber(priceAmount) : undefined,
      priceType: hasPrice ? priceType : undefined,
      priceMin: hasPrice ? parseNumber(price?.minAmount ?? payload.priceMin) : undefined,
      priceMax: hasPrice ? parseNumber(price?.maxAmount ?? payload.priceMax) : undefined,
      priceMeta: hasPrice && typeof price === 'object' ? price : undefined,
      status: payload.status,
      adminStatus: payload.adminStatus,
      isActive: payload.isActive,
      isVisible: payload.isVisible,
      isFeatured: payload.isFeatured,
      categoryId: category?.id || (payload.categoryId ?? null),
      subcategoryId: subcategory?.id || (payload.subcategoryId ?? null),
      categoryName: payload.categoryName || payload.category,
      subcategoryName: payload.subcategoryName || payload.subcategory,
      media: payload.media ?? payload.images,
      tags: payload.tags,
      packages: payload.packages,
      extras: payload.extras,
      faqs: payload.faqs,
      requirements: payload.requirements,
      milestones: payload.milestones,
      pricingMode: payload.pricingMode,
      deliveryTime: parseNumber(payload.deliveryTime),
      revisions: parseNumber(payload.revisions),
      adminReason: payload.adminReason,
      meta: payload.meta
    }
  });

  return res.json({ success: true, data: toGigResponse(gig) });
};

export const deleteGig = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const user = (req as any).user;
  const existing = await prisma.gig.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ success: false, error: 'Gig not found' });
  if (!isAdminRole(user?.role) && existing.freelancerId !== user?.id) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  await prisma.gig.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false, isVisible: false }
  });
  return res.json({ success: true, data: { id } });
};

export const submitGig = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const user = (req as any).user;
  const existing = await prisma.gig.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ success: false, error: 'Gig not found' });
  if (!isAdminRole(user?.role) && existing.freelancerId !== user?.id) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const gig = await prisma.gig.update({
    where: { id },
    data: {
      status: 'submitted',
      adminStatus: 'pending',
      isActive: false,
      isVisible: false,
      submittedAt: new Date()
    }
  });
  if ((req as any).io) (req as any).io.emit('gig:submitted', gig);
  return res.json({ success: true, data: toGigResponse(gig) });
};

export const pauseGig = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const user = (req as any).user;
  const existing = await prisma.gig.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ success: false, error: 'Gig not found' });
  if (!isAdminRole(user?.role) && existing.freelancerId !== user?.id) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const gig = await prisma.gig.update({
    where: { id },
    data: { status: 'paused', isActive: false, isVisible: false, pausedAt: new Date() }
  });
  if ((req as any).io) (req as any).io.emit('gig:paused', gig);
  return res.json({ success: true, data: toGigResponse(gig) });
};

export const activateGig = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const { id } = req.params;
  const user = (req as any).user;
  const current = await prisma.gig.findUnique({ where: { id } });
  if (!current) return res.status(404).json({ success: false, error: 'Gig not found' });
  if (!isAdminRole(user?.role) && current.freelancerId !== user?.id) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const approved = current.adminStatus === 'approved';
  const gig = await prisma.gig.update({
    where: { id },
    data: {
      status: approved ? 'active' : current.status,
      isActive: approved,
      isVisible: approved
    }
  });
  if ((req as any).io) (req as any).io.emit('gig:activated', gig);
  return res.json({ success: true, data: toGigResponse(gig) });
};

export const listPublicGigs = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const search = req.query.search as string | undefined;
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '20', 10);
  const where: any = {
    deletedAt: null,
    isActive: true,
    isVisible: true,
    adminStatus: 'approved'
  };
  if (search) where.title = { contains: search, mode: 'insensitive' };

  const [total, gigs] = await Promise.all([
    prisma.gig.count({ where }),
    prisma.gig.findMany({
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
      gigs: gigs.map(toGigResponse),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    }
  });
};
