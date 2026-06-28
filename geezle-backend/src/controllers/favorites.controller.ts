import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { resolveUserProStatus } from '../utils/proStatus';
import realtime from '../utils/realtime';

const normalizeEntityType = (value?: string) => {
  const raw = (value || '').toString().toLowerCase();
  if (raw === 'gig') return 'GIG';
  if (raw === 'job') return 'JOB';
  if (raw === 'freelancer') return 'FREELANCER';
  if (raw === 'marketplace') return 'MARKETPLACE';
  return null;
};

const ensureUserId = (req: Request) => req.user?.id as string | undefined;

const marketplaceListingInclude = {
  seller: {
    select: {
      id: true,
      name: true,
      username: true,
      avatar: true,
      country: true,
      role: true,
      isVerified: true,
      createdAt: true
    }
  },
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      description: true
    }
  },
  media: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }]
  }
};

const normalizeMarketplaceListing = (listing: any) => {
  const media = Array.isArray(listing?.media) ? listing.media : [];
  const images = media
    .filter((entry: any) => String(entry?.type || '').toLowerCase() === 'image')
    .map((entry: any) => ({
      id: entry.id,
      listingId: entry.listingId,
      type: 'image',
      url: entry.url,
      thumbnailUrl: entry.thumbnailUrl || null,
      storagePath: entry.storagePath || null,
      sortOrder: entry.sortOrder ?? 0,
      mimeType: entry.mimeType || null,
      sizeBytes: Number(entry.sizeBytes || 0),
      width: entry.width || null,
      height: entry.height || null,
      createdAt: entry.createdAt
    }));
  const video = media.find((entry: any) => String(entry?.type || '').toLowerCase() === 'video');

  return {
    id: listing.id,
    sellerId: listing.sellerId,
    title: listing.title,
    slug: listing.slug,
    description: listing.description || '',
    categoryId: listing.categoryId || null,
    category: listing.category || null,
    condition: listing.condition || 'other',
    brand: listing.brand || null,
    tags: Array.isArray(listing.tags) ? listing.tags.map(String) : [],
    price: Number(listing.price || 0),
    currency: listing.currency || 'USD',
    negotiable: Boolean(listing.negotiable),
    quantity: Number(listing.quantity || 1),
    location: listing.location || null,
    latitude: listing.latitude ?? null,
    longitude: listing.longitude ?? null,
    meetupPreferences: Array.isArray(listing.meetupPreferences) ? listing.meetupPreferences.map(String) : [],
    hideFromFriendsAndFollowers: Boolean(listing.hideFromFriendsAndFollowers),
    deliveryOptions: Array.isArray(listing.deliveryOptions) ? listing.deliveryOptions.map(String) : [],
    paymentMethods: Array.isArray(listing.paymentMethods) ? listing.paymentMethods.map(String) : [],
    images,
    video: video
      ? {
          id: video.id,
          listingId: video.listingId,
          type: 'video',
          url: video.url,
          thumbnailUrl: video.thumbnailUrl || null,
          storagePath: video.storagePath || null,
          sortOrder: video.sortOrder ?? 0,
          mimeType: video.mimeType || null,
          sizeBytes: Number(video.sizeBytes || 0),
          width: video.width || null,
          height: video.height || null,
          durationSeconds: video.durationSeconds || null,
          createdAt: video.createdAt
        }
      : null,
    status: listing.status,
    reviewStatus: listing.reviewStatus,
    featured: Boolean(listing.featured),
    viewCount: Number(listing.viewCount || 0),
    saveCount: Number(listing.saveCount || 0),
    reportCount: Number(listing.reportCount || 0),
    soldAt: listing.soldAt,
    reservedAt: listing.reservedAt,
    approvedAt: listing.approvedAt,
    rejectedAt: listing.rejectedAt,
    removedAt: listing.removedAt,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    contactPreference: listing.contactPreference || null,
    coverImage: images[0]?.url || video?.thumbnailUrl || video?.url || null,
    summary: listing.description || '',
    seller: listing.seller
      ? {
          ...listing.seller,
          verifiedBadge: Boolean(listing.seller?.isVerified),
          joinDate: listing.seller?.createdAt || null
        }
      : null
  };
};

export const listFavorites = async (req: Request, res: Response) => {
  try {
    const userId = ensureUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const favorites = await prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({
      success: true,
      data: favorites.map((fav) => ({
        entity_type: fav.entityType.toLowerCase(),
        entity_id: fav.entityId,
        created_at: fav.createdAt.toISOString()
      }))
    });
  } catch (error: any) {
    console.error('List favorites error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load favorites' });
  }
};

export const addFavorite = async (req: Request, res: Response) => {
  try {
    const userId = ensureUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const entityType = normalizeEntityType(req.body?.entity_type || req.body?.entityType);
    const entityId = (req.body?.entity_id || req.body?.entityId || '').toString();

    if (!entityType || !entityId) {
      return res.status(400).json({ success: false, error: 'entity_type and entity_id are required' });
    }

    const existing = await prisma.favorite.findFirst({
      where: { userId, entityType, entityId }
    });

    if (existing) {
      realtime.emitToUser(userId, 'favorites:updated', {
        action: 'noop',
        entityType: existing.entityType.toLowerCase(),
        entityId: existing.entityId
      });
      return res.json({
        success: true,
        data: {
          entity_type: existing.entityType.toLowerCase(),
          entity_id: existing.entityId,
          created_at: existing.createdAt.toISOString()
        }
      });
    }

    const created = await prisma.favorite.create({
      data: { userId, entityType, entityId }
    });
    if (entityType === 'MARKETPLACE') {
      await prisma.marketplaceListing.updateMany({
        where: { id: entityId },
        data: { saveCount: { increment: 1 } }
      });
    }
    realtime.emitToUser(userId, 'favorites:updated', {
      action: 'added',
      entityType: created.entityType.toLowerCase(),
      entityId: created.entityId
    });

    return res.json({
      success: true,
      data: {
        entity_type: created.entityType.toLowerCase(),
        entity_id: created.entityId,
        created_at: created.createdAt.toISOString()
      }
    });
  } catch (error: any) {
    console.error('Add favorite error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to add favorite' });
  }
};

export const removeFavorite = async (req: Request, res: Response) => {
  try {
    const userId = ensureUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const entityType = normalizeEntityType(req.body?.entity_type || req.body?.entityType);
    const entityId = (req.body?.entity_id || req.body?.entityId || '').toString();

    if (!entityType || !entityId) {
      return res.status(400).json({ success: false, error: 'entity_type and entity_id are required' });
    }

    const deleted = await prisma.favorite.deleteMany({
      where: { userId, entityType, entityId }
    });
    if (entityType === 'MARKETPLACE' && deleted.count > 0) {
      await prisma.marketplaceListing.updateMany({
        where: { id: entityId, saveCount: { gt: 0 } },
        data: { saveCount: { decrement: 1 } }
      });
    }
    realtime.emitToUser(userId, 'favorites:updated', {
      action: 'removed',
      entityType: entityType.toLowerCase(),
      entityId
    });

    return res.json({ success: true, data: null });
  } catch (error: any) {
    console.error('Remove favorite error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to remove favorite' });
  }
};

export const getExpandedFavorites = async (req: Request, res: Response) => {
  try {
    const userId = ensureUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const favorites = await prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    const gigIds = favorites.filter((f) => f.entityType === 'GIG').map((f) => f.entityId);
    const jobIds = favorites.filter((f) => f.entityType === 'JOB').map((f) => f.entityId);
    const freelancerIds = favorites.filter((f) => f.entityType === 'FREELANCER').map((f) => f.entityId);
    const marketplaceIds = favorites.filter((f) => f.entityType === 'MARKETPLACE').map((f) => f.entityId);

    const [gigs, jobs, freelancers, marketplace] = await Promise.all([
      gigIds.length
        ? prisma.gig.findMany({
            where: { id: { in: gigIds } },
            include: { user: { select: { id: true, name: true, avatar: true } } }
          })
        : [],
      jobIds.length
        ? prisma.job.findMany({
            where: { id: { in: jobIds } },
            include: { client: { select: { id: true, name: true, avatar: true } } }
          })
        : [],
      freelancerIds.length
        ? prisma.user.findMany({
            where: { id: { in: freelancerIds } },
            select: { id: true, name: true, avatar: true, role: true }
          })
        : [],
      marketplaceIds.length
        ? prisma.marketplaceListing.findMany({
            where: { id: { in: marketplaceIds } },
            include: marketplaceListingInclude
          })
        : []
    ]);

    const marketplaceById = new Map(
      marketplace.map((listing: any) => [String(listing.id), normalizeMarketplaceListing(listing)])
    );
    const orderedMarketplace = marketplaceIds
      .map((id) => marketplaceById.get(String(id)))
      .filter(Boolean);

    return res.json({
      success: true,
      data: {
        gigs: gigs.map((gig) => {
          const pro = gig.user ? resolveUserProStatus(gig.user) : { freelancerIsPro: false };
          return {
            id: gig.id,
            title: gig.title,
            description: gig.description,
            price: gig.price,
            rating: gig.rating || 0,
            reviews: gig.reviewCount || 0,
            image: '',
            images: [],
            freelancerId: gig.userId,
            freelancerName: gig.user?.name || 'Freelancer',
            freelancerAvatar: gig.user?.avatar || '',
            freelancerIsPro: Boolean((pro as any).freelancerIsPro),
            category: gig.categoryId || '',
            status: gig.status.toLowerCase(),
            adminStatus: gig.adminStatus.toLowerCase(),
            isActive: gig.isActive,
            createdAt: gig.createdAt.toISOString()
          };
        }),
        jobs: jobs.map((job) => {
          const pro = job.client ? resolveUserProStatus(job.client) : { employerIsPro: false };
          return {
            id: job.id,
            title: job.title,
            description: job.description,
            budget: job.budget || '',
            type: job.type.toLowerCase(),
            postedTime: job.postedTime.toISOString(),
            tags: job.tags || [],
            proposals: job.proposalsCount || 0,
            status: job.status.toLowerCase(),
            isActive: job.isActive,
            isVisible: job.isVisible,
            category: job.categoryId || '',
            subcategory: job.subcategory || '',
            experienceLevel: job.experienceLevel ? job.experienceLevel.toLowerCase() : undefined,
            visibility: job.visibility ? job.visibility.toLowerCase() : undefined,
            duration: job.duration || undefined,
            clientName: job.client?.name || 'Client',
            clientIsPro: Boolean((pro as any).employerIsPro)
          };
        }),
        freelancers: freelancers.map((freelancer: any) => {
          const pro = resolveUserProStatus(freelancer);
          return {
            ...freelancer,
            isProFreelancer: Boolean(pro.freelancerIsPro),
            is_pro_freelancer: Boolean(pro.freelancerIsPro),
            isProEmployer: Boolean(pro.employerIsPro),
            is_pro_employer: Boolean(pro.employerIsPro)
          };
        }),
        marketplace: orderedMarketplace
      }
    });
  } catch (error: any) {
    console.error('Expanded favorites error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load favorites' });
  }
};

export const getFavoritesReceived = async (req: Request, res: Response) => {
  try {
    const userId = ensureUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const gigs = await prisma.gig.findMany({
      where: { userId },
      select: { id: true, title: true }
    });
    const gigIds = gigs.map((gig) => gig.id);

    const [profileLikes, gigLikes, recentFavorites, topGigsRaw] = await Promise.all([
      prisma.favorite.count({ where: ({ entityType: 'FREELANCER', entityId: userId } as any) }),
      gigIds.length
        ? prisma.favorite.count({ where: ({ entityType: 'GIG', entityId: { in: gigIds } } as any) })
        : 0,
      prisma.favorite.findMany({
        where: ({
          OR: [
            { entityType: 'FREELANCER', entityId: userId },
            ...(gigIds.length ? [{ entityType: 'GIG', entityId: { in: gigIds } }] : [])
          ]
        } as any),
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      gigIds.length
        ? prisma.favorite.groupBy({
            by: ['entityId'],
            where: ({ entityType: 'GIG', entityId: { in: gigIds } } as any),
            _count: { entityId: true },
            orderBy: { _count: { entityId: 'desc' } },
            take: 5
          })
        : []
    ]);

    const gigsById: Record<string, string> = (gigs as any[]).reduce((acc: any, gig: any) => {
      acc[gig.id] = gig.title;
      return acc;
    }, {} as Record<string, string>);

    const topGigs = topGigsRaw.map((row) => ({
      id: row.entityId,
      title: gigsById[row.entityId] || 'Gig',
      likes: row._count.entityId
    }));

    const recent = recentFavorites.map((fav) => ({
      entity_type: fav.entityType.toLowerCase(),
      entity_id: fav.entityId,
      created_at: fav.createdAt.toISOString()
    }));

    return res.json({
      success: true,
      data: {
        profile_likes: profileLikes,
        gig_likes: gigLikes,
        total_likes: profileLikes + gigLikes,
        top_gigs: topGigs,
        recent
      }
    });
  } catch (error: any) {
    console.error('Favorites received error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load likes' });
  }
};

export const listFavoritesAdmin = async (req: Request, res: Response) => {
  try {
    const { entityType, userId } = req.query as { entityType?: string; userId?: string };
    const where: any = {};
    if (entityType) {
      const normalized = normalizeEntityType(entityType);
      if (normalized) where.entityType = normalized;
    }
    if (userId) where.userId = userId;

    const favorites = await prisma.favorite.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    return res.json({
      success: true,
      data: favorites.map((fav) => ({
        id: fav.id,
        user_id: fav.userId,
        entity_type: fav.entityType.toLowerCase(),
        entity_id: fav.entityId,
        created_at: fav.createdAt.toISOString()
      }))
    });
  } catch (error: any) {
    console.error('Admin favorites error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load favorites' });
  }
};

export const getTopFavorites = async (_req: Request, res: Response) => {
  try {
    const grouped = await prisma.favorite.groupBy({
      by: ['entityType', 'entityId'],
      _count: { entityId: true },
      orderBy: { _count: { entityId: 'desc' } },
      take: 20
    });

    return res.json({
      success: true,
      data: grouped.map((row) => ({
        entity_type: row.entityType.toLowerCase(),
        entity_id: row.entityId,
        count: row._count.entityId
      }))
    });
  } catch (error: any) {
    console.error('Top favorites error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load top favorites' });
  }
};

export const deleteFavoriteAdmin = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ success: false, error: 'Favorite id is required' });
    await prisma.favorite.delete({ where: { id } });
    return res.json({ success: true, data: null });
  } catch (error: any) {
    console.error('Admin delete favorite error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete favorite' });
  }
};
