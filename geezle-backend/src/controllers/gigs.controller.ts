import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { resolveUserProStatus } from '../utils/proStatus';
import { notifyFollowersAboutPublication } from '../services/followPublicationNotifications.service';
import { resolveFeaturedListingEligibility } from '../services/listingFeaturePolicy.service';

const getAutoApproveGigs = async () => {
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
    const data: any = record?.data || {};
    return Boolean(data?.listings?.autoApproveGigs);
  } catch {
    return false;
  }
};

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
const safeArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value : []);
const resolvePricingMode = (payload: any, existing?: any) =>
  payload?.pricingMode ?? payload?.pricing_mode ?? existing?.pricingMode ?? 'packages';
const toBoolFromPayload = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return false;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
};
const rankRecommendedGig = (gig: any) => {
  const recommendedBoost = gig?.isRecommended ? 8 : 0;
  const topSelectedBoost = gig?.isTopSelected ? 5 : 0;
  const featuredBoost = gig?.isFeatured ? 3 : 0;
  const reviewBoost = Math.min(4, Math.floor(Number(gig?.reviewCount || 0) / 5));
  const ratingBoost = Math.min(4, Math.floor(Number(gig?.rating || 0)));
  return recommendedBoost + topSelectedBoost + featuredBoost + reviewBoost + ratingBoost;
};

const resolveGigCategoryId = async (payload: any) => {
  if (payload?.categoryId) return payload.categoryId;
  if (!payload?.category) return null;
  const search = String(payload.category).trim();
  if (!search) return null;
  const category = await prisma.category.findFirst({
    where: {
      OR: [{ id: search }, { name: search }, { slug: search }],
      type: { in: ['GIG', 'BOTH'] }
    }
  });
  return category?.id || null;
};

const mapGigStatus = (gig: { status: string; adminStatus: string }) => {
  const status = normalizeStatus(gig.status);
  const adminStatus = normalizeStatus(gig.adminStatus);

  if (status === 'draft') return 'draft';
  if (status === 'active') return 'active';
  if (status === 'paused') return 'paused';
  if (status === 'rejected') return 'rejected';

  if (status === 'pending') {
    if (adminStatus === 'approved') return 'approved';
    if (adminStatus === 'rejected') return 'rejected';
    return 'under_review';
  }

  return status || 'draft';
};

export const serializeGig = (gig: any) => {
  const images = safeArray<string>(gig.images);
  const tags = safeArray<string>(gig.tags);
  const pro = gig.user ? resolveUserProStatus(gig.user) : { freelancerIsPro: false };
  const freelancerIsVerified = resolveUserVerified(gig.user);
  return {
    id: gig.id,
    title: gig.title,
    description: gig.description,
    slug: gig.slug,
    category: gig.category?.name || gig.categoryId || '',
    subcategory: gig.subcategory || '',
    price: {
      type: 'fixed',
      amount: gig.price,
      minAmount: undefined,
      maxAmount: undefined
    },
    pricingMode: gig.pricingMode || 'packages',
    packages: safeArray(gig.packages),
    extras: safeArray(gig.extras),
    faqs: safeArray(gig.faqs),
    requirements: safeArray(gig.requirements),
    images,
    videos: safeArray(gig.videos),
    documents: safeArray(gig.documents),
    tags,
    meta: gig.meta || undefined,
    image: gig.image || (images.length ? images[0] : undefined),
    status: mapGigStatus(gig),
    adminStatus: gig.adminStatus ? gig.adminStatus.toLowerCase() : undefined,
    rejectionReason: gig.adminStatus === 'REJECTED' ? 'Rejected by admin' : undefined,
    performance: {
      views: 0,
      clicks: 0,
      orders: 0,
      rating: gig.rating || 0,
      reviews: gig.reviewCount || 0
    },
    rating: gig.rating || 0,
    reviews: gig.reviewCount || 0,
    isFeatured: Boolean(gig.isFeatured),
    isTopSelected: Boolean(gig.isTopSelected),
    isRecommended: Boolean(gig.isRecommended),
    adminReason: gig.adminReason || undefined,
    freelancerId: gig.user?.id || gig.userId,
    freelancerName: gig.user?.name || 'Freelancer',
    freelancerAvatar: gig.user?.avatar || null,
    freelancerProfilePhotoFileId: gig.user?.profilePhotoFileId || null,
    freelancerIsPro: Boolean((pro as any).freelancerIsPro),
    freelancerIsVerified,
    freelancer_is_verified: freelancerIsVerified,
    freelancerVerified: freelancerIsVerified,
    media: images,
    createdAt: gig.createdAt?.toISOString(),
    updatedAt: gig.updatedAt?.toISOString()
  };
};

const emitGigPublished = (req: Request, gig: any) => {
  const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
  const payload = { gig: serializeGig(gig) };
  try { io?.emit('community:gig_published', payload); } catch {}
};

const notifyFollowersAboutGigPublication = async (req: Request, gig: any) => {
  try {
    await notifyFollowersAboutPublication({
      actorUserId: String(gig?.userId || ''),
      publicationType: 'gig',
      publicationId: String(gig?.id || ''),
      publicationTitle: String(gig?.title || '')
    });
  } catch (error) {
    console.warn('[gigs] follower notification fanout failed', error);
  }
  emitGigPublished(req, gig);
};

export const listGigs = async (req: Request, res: Response) => {
  try {
    const { ownerId, status, search, category } = req.query as Record<string, string | undefined>;
    const userId = req.user?.id as string | undefined;
    const recommendedOnly = parseBooleanQuery(req.query.recommended);
    const featuredOnly = parseBooleanQuery(req.query.featuredOnly);
    const explicitRandomize = parseBooleanQuery(req.query.random);
    const hasRandomParam = req.query.random !== undefined;
    const limit = parseLimitQuery(req.query.limit, 100);
    const shouldDefaultRandomize =
      !hasRandomParam &&
      ownerId !== 'me' &&
      String(status || '').toLowerCase() === 'active' &&
      limit !== null;
    const randomize = explicitRandomize || shouldDefaultRandomize;

    const where: any = {};

    if (ownerId === 'me') {
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
      where.userId = userId;
    }

    if (status) {
      const normalized = status.toLowerCase();
      if (normalized === 'under_review') {
        where.status = 'PENDING';
        where.adminStatus = 'PENDING';
      } else if (normalized === 'submitted') {
        where.status = 'PENDING';
      } else if (normalized === 'approved') {
        where.adminStatus = 'APPROVED';
      } else {
        where.status = normalized.toUpperCase();
      }
    }

    if (category) {
      where.category = { name: category };
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

    let gigs = await prisma.gig.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { category: true, user: true }
    });
    if (recommendedOnly && !randomize) {
      gigs = [...gigs].sort((a, b) => {
        const scoreDiff = rankRecommendedGig(b) - rankRecommendedGig(a);
        if (scoreDiff !== 0) return scoreDiff;
        return new Date(String(b.updatedAt || 0)).getTime() - new Date(String(a.updatedAt || 0)).getTime();
      });
    }
    if (randomize) {
      gigs = shuffleItems(gigs);
    }
    if (limit !== null) {
      gigs = gigs.slice(0, limit);
    }

    return res.json({ success: true, data: gigs.map(serializeGig) });
  } catch (error: any) {
    console.error('List gigs error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch gigs' });
  }
};

export const getGig = async (req: Request, res: Response) => {
  try {
    const gig = await prisma.gig.findUnique({
      where: { id: req.params.id },
      include: { category: true, user: true }
    });
    if (!gig) return res.status(404).json({ success: false, error: 'Gig not found' });
    return res.json({ success: true, data: serializeGig(gig) });
  } catch (error: any) {
    console.error('Get gig error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch gig' });
  }
};

export const createGig = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const payload = req.body || {};
    const requestedFeatured = toBoolFromPayload(payload.is_featured ?? payload.isFeatured);
    if (requestedFeatured) {
      const eligibility = await resolveFeaturedListingEligibility({
        listingType: 'gig',
        userId
      });
      if (!eligibility.allowed) {
        return res.status(403).json({
          success: false,
          code: 'FEATURED_GIG_LIMIT_REACHED',
          error: eligibility.reason || 'Featured gig quota reached for this month',
          data: eligibility
        });
      }
    }
    const categoryId = await resolveGigCategoryId(payload);
    const deliveryTime = Number(
      payload.deliveryTime ?? payload.delivery_days ?? payload.deliveryDays ?? 1
    );
    const revisions = Number(payload.revisions ?? 1);
    const images = safeArray<string>(payload.images);
    const created = await prisma.gig.create({
      data: ({
        title: payload.title || 'Untitled Gig',
        slug: payload.slug || `${payload.title || 'gig'}-${Date.now()}`,
        description: payload.description || '',
        price: Number(payload.price?.amount ?? payload.price ?? 0),
        categoryId,
        subcategory: payload.subcategory || null,
        pricingMode: resolvePricingMode(payload),
        packages: Array.isArray(payload.packages) ? payload.packages : [],
        extras: Array.isArray(payload.extras) ? payload.extras : [],
        faqs: Array.isArray(payload.faqs) ? payload.faqs : [],
        requirements: Array.isArray(payload.requirements) ? payload.requirements : [],
        images,
        videos: safeArray<string>(payload.videos),
        documents: safeArray<string>(payload.documents),
        tags: safeArray<string>(payload.tags),
        image: payload.image || images[0] || null,
        meta: payload.meta ?? null,
        userId,
        deliveryTime: Number.isFinite(deliveryTime) ? deliveryTime : 1,
        revisions: Number.isFinite(revisions) ? revisions : 1,
        isActive: false,
        isFeatured: requestedFeatured,
        status: 'DRAFT',
        adminStatus: 'PENDING',
        adminReason: null
      } as any),
      include: { category: true, user: true }
    });

    return res.status(201).json({ success: true, data: serializeGig(created) });
  } catch (error: any) {
    console.error('Create gig error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create gig' });
  }
};

export const updateGig = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const existing = await prisma.gig.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Gig not found' });
    if (existing.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const payload = req.body || {};
    const requestedFeaturedRaw = payload.is_featured ?? payload.isFeatured;
    let nextIsFeatured = existing.isFeatured;
    if (requestedFeaturedRaw !== undefined) {
      const requestedFeatured = toBoolFromPayload(requestedFeaturedRaw);
      if (requestedFeatured && !existing.isFeatured) {
        const eligibility = await resolveFeaturedListingEligibility({
          listingType: 'gig',
          userId,
          excludeListingId: existing.id
        });
        if (!eligibility.allowed) {
          return res.status(403).json({
            success: false,
            code: 'FEATURED_GIG_LIMIT_REACHED',
            error: eligibility.reason || 'Featured gig quota reached for this month',
            data: eligibility
          });
        }
      }
      nextIsFeatured = requestedFeatured;
    }
    const categoryId = await resolveGigCategoryId(payload);
    const deliveryTime =
      payload.deliveryTime ?? payload.delivery_days ?? payload.deliveryDays;
    const revisions = payload.revisions;
    const resolvedImages =
      payload.images !== undefined ? safeArray<string>(payload.images) : existing.images || [];
    const resolvedVideos =
      payload.videos !== undefined ? safeArray<string>(payload.videos) : existing.videos || [];
    const resolvedDocuments =
      payload.documents !== undefined ? safeArray<string>(payload.documents) : existing.documents || [];
    const resolvedTags =
      payload.tags !== undefined ? safeArray<string>(payload.tags) : existing.tags || [];

    const updated = await prisma.gig.update({
      where: { id: req.params.id },
      data: ({
        title: payload.title ?? existing.title,
        description: payload.description ?? existing.description,
        price: payload.price?.amount !== undefined ? Number(payload.price.amount) : payload.price !== undefined ? Number(payload.price) : existing.price,
        categoryId: categoryId ?? existing.categoryId,
        subcategory: payload.subcategory ?? existing.subcategory,
        pricingMode: resolvePricingMode(payload, existing),
        packages: payload.packages !== undefined ? payload.packages : existing.packages,
        extras: payload.extras !== undefined ? payload.extras : existing.extras,
        faqs: payload.faqs !== undefined ? payload.faqs : existing.faqs,
        requirements: payload.requirements !== undefined ? payload.requirements : existing.requirements,
        images: resolvedImages,
        videos: resolvedVideos,
        documents: resolvedDocuments,
        tags: resolvedTags,
        image: payload.image ?? (resolvedImages[0] || existing.image || null),
        meta: payload.meta ?? existing.meta,
        deliveryTime: deliveryTime !== undefined ? Number(deliveryTime) : existing.deliveryTime,
        revisions: revisions !== undefined ? Number(revisions) : existing.revisions,
        isFeatured: nextIsFeatured
      } as any),
      include: { category: true, user: true }
    });

    return res.json({ success: true, data: serializeGig(updated) });
  } catch (error: any) {
    console.error('Update gig error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update gig' });
  }
};

export const deleteGig = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const existing = await prisma.gig.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Gig not found' });
    if (existing.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    await prisma.gig.delete({ where: { id: req.params.id } });
    return res.json({ success: true, data: null });
  } catch (error: any) {
    console.error('Delete gig error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete gig' });
  }
};

export const submitGig = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const gig = await prisma.gig.findUnique({ where: { id: req.params.id } });
    if (!gig) return res.status(404).json({ success: false, error: 'Gig not found' });
    if (gig.userId !== userId) return res.status(403).json({ success: false, error: 'Not authorized' });

    const autoApprove = await getAutoApproveGigs();
    const updated = await prisma.gig.update({
      where: { id: req.params.id },
      data: autoApprove
        ? { status: 'ACTIVE', adminStatus: 'APPROVED', isActive: true, adminReason: null }
        : { status: 'PENDING', adminStatus: 'PENDING', isActive: false, adminReason: null },
      include: { category: true, user: true }
    });
    if (updated.status === 'ACTIVE' && gig.status !== 'ACTIVE') {
      await notifyFollowersAboutGigPublication(req, updated);
    }

    return res.json({ success: true, data: serializeGig(updated) });
  } catch (error: any) {
    console.error('Submit gig error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to submit gig' });
  }
};

export const pauseGig = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const gig = await prisma.gig.findUnique({ where: { id: req.params.id } });
    if (!gig) return res.status(404).json({ success: false, error: 'Gig not found' });
    if (gig.userId !== userId) return res.status(403).json({ success: false, error: 'Not authorized' });

    const updated = await prisma.gig.update({
      where: { id: req.params.id },
      data: { status: 'PAUSED', isActive: false },
      include: { category: true, user: true }
    });

    return res.json({ success: true, data: serializeGig(updated) });
  } catch (error: any) {
    console.error('Pause gig error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to pause gig' });
  }
};

export const activateGig = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const gig = await prisma.gig.findUnique({ where: { id: req.params.id } });
    if (!gig) return res.status(404).json({ success: false, error: 'Gig not found' });
    if (gig.userId !== userId) return res.status(403).json({ success: false, error: 'Not authorized' });
    if (gig.adminStatus !== 'APPROVED') {
      return res.status(400).json({ success: false, error: 'Gig must be approved before activation' });
    }

    const updated = await prisma.gig.update({
      where: { id: req.params.id },
      data: { status: 'ACTIVE', isActive: true },
      include: { category: true, user: true }
    });
    if (gig.status !== 'ACTIVE') {
      await notifyFollowersAboutGigPublication(req, updated);
    }

    return res.json({ success: true, data: serializeGig(updated) });
  } catch (error: any) {
    console.error('Activate gig error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to activate gig' });
  }
};
