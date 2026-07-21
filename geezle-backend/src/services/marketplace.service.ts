import prisma from '../utils/prismaClient';
import { notifyAdmins, notifyUser } from '../utils/notify';
import { DEFAULT_MARKETPLACE_CATEGORIES } from '../config/marketplaceCategories';
import { publishIntegrationEvent } from './talentCloud.service';
import {
  normalizePublicMedia,
  resolveDirectMediaUrl,
  resolveFileBaseUrl,
  resolveMediaDescriptor
} from '../utils/mediaUrl';

type User = any;
type JsonValue = any;
const MARKETPLACE_FAVORITE_ENTITY_TYPE = 'MARKETPLACE';

type MarketplaceApprovalMode =
  | 'manual'
  | 'auto'
  | 'new_sellers'
  | 'certain_categories'
  | 'video_only'
  | 'price_threshold';

type MarketplaceStatus =
  | 'draft'
  | 'pending_review'
  | 'active'
  | 'reserved'
  | 'sold'
  | 'inactive'
  | 'removed'
  | 'suspended';

const MARKETPLACE_SETTINGS_SCOPE = 'marketplace';

export const DEFAULT_MARKETPLACE_SETTINGS = {
  enabled: true,
  publicBrowsingEnabled: true,
  approvalMode: 'manual' as MarketplaceApprovalMode,
  approvalOnlyNewSellers: false,
  approvalOnlyCertainCategories: false,
  approvalOnlyVideoListings: false,
  approvalOnlyAbovePrice: false,
  approvalPriceThreshold: 0,
  maxImagesPerListing: 10,
  maxVideosPerListing: 1,
  allowedPaymentMethods: ['cash_on_delivery'],
  enabledPaymentMethods: ['cash_on_delivery'],
  cashOnDeliveryEnabled: true,
  onlineCheckoutEnabled: false,
  paymentRequiredBeforeContact: false,
  sellerEligibility: {
    requireVerifiedEmail: false,
    requireVerifiedKyc: false,
    blockedRoles: ['MODERATOR']
  },
  reportingReasons: [
    'scam_fraud',
    'prohibited_item',
    'misleading_listing',
    'duplicate_listing',
    'offensive_content',
    'stolen_goods',
    'wrong_category',
    'suspicious_seller',
    'other'
  ],
  prohibitedKeywords: [] as string[],
  prohibitedCategoryIds: [] as string[],
  sellerListingLimit: 0,
  commission: {
    enabled: false,
    percentage: 0,
    flatFee: 0
  },
  featuredListings: {
    enabled: true,
    pinEnabled: true,
    promoteEnabled: true
  },
  sorting: {
    recommendedEnabled: true,
    nearestEnabled: true,
    popularEnabled: true
  }
};

const isPlainObject = (value: any): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const deepMerge = (existing: any, incoming: any): any => {
  if (incoming === undefined) return existing;
  if (Array.isArray(incoming)) return incoming;
  if (!isPlainObject(incoming)) return incoming;
  const out: Record<string, any> = { ...(isPlainObject(existing) ? existing : {}) };
  for (const key of Object.keys(incoming)) {
    out[key] = deepMerge(existing ? existing[key] : undefined, incoming[key]);
  }
  return out;
};

const slugify = (value: unknown) =>
  String(value || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]+/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

const toInt = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

const toNumber = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
};

const clampTags = (value: unknown): string[] =>
  Array.from(new Set(toStringArray(value).map((entry) => entry.slice(0, 60))))
    .filter(Boolean)
    .slice(0, 6);

const normalizeMeetupPreferences = (value: unknown): string[] =>
  Array.from(
    new Set(
      toStringArray(value)
        .map((entry) => entry.toLowerCase())
        .filter((entry) => ['public_meetup', 'door_pickup', 'door_dropoff'].includes(entry))
    )
  );

const normalizeStatus = (value: unknown): MarketplaceStatus => {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    [
      'draft',
      'pending_review',
      'active',
      'reserved',
      'sold',
      'inactive',
      'removed',
      'suspended'
    ].includes(normalized)
  ) {
    return normalized as MarketplaceStatus;
  }
  return 'draft';
};

const normalizeReviewStatus = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['pending', 'approved', 'rejected'].includes(normalized)) return normalized;
  return 'pending';
};

const normalizeRole = (role?: string | null) => String(role || '').trim().toUpperCase();

const resolveMarketplacePaymentMethodWhitelist = (settings: any) => {
  const allowed = toStringArray(settings?.allowedPaymentMethods);
  if (allowed.length) return Array.from(new Set(allowed));
  const enabled = toStringArray(settings?.enabledPaymentMethods);
  if (enabled.length) return Array.from(new Set(enabled));
  const legacy = toStringArray(settings?.paymentMethods);
  if (legacy.length) return Array.from(new Set(legacy));
  return [];
};

const getMarketplaceSettingsRow = async () =>
  prisma.appSetting.findUnique({ where: { scope: MARKETPLACE_SETTINGS_SCOPE } });

export const getMarketplaceSettings = async () => {
  const row = await getMarketplaceSettingsRow();
  const merged = deepMerge(DEFAULT_MARKETPLACE_SETTINGS, row?.data || {});
  const paymentMethods = resolveMarketplacePaymentMethodWhitelist(merged);
  if (paymentMethods.length) {
    merged.allowedPaymentMethods = paymentMethods;
    merged.enabledPaymentMethods = paymentMethods;
    merged.paymentMethods = paymentMethods;
  }
  return merged;
};

export const updateMarketplaceSettings = async (patch: any, actorId?: string | null) => {
  const existing = await getMarketplaceSettings();
  const incoming = patch || {};
  const merged = deepMerge(existing, incoming);
  const whitelistKeys = ['allowedPaymentMethods', 'enabledPaymentMethods', 'paymentMethods'];
  const whitelistSource = whitelistKeys.some((key) => Object.prototype.hasOwnProperty.call(incoming, key)) ? incoming : merged;
  const paymentMethods = resolveMarketplacePaymentMethodWhitelist(whitelistSource);
  if (paymentMethods.length) {
    merged.allowedPaymentMethods = paymentMethods;
    merged.enabledPaymentMethods = paymentMethods;
    merged.paymentMethods = paymentMethods;
  } else if (whitelistKeys.some((key) => Object.prototype.hasOwnProperty.call(incoming, key))) {
    merged.allowedPaymentMethods = [];
    merged.enabledPaymentMethods = [];
    merged.paymentMethods = [];
  }
  const saved = await prisma.appSetting.upsert({
    where: { scope: MARKETPLACE_SETTINGS_SCOPE },
    update: { data: merged },
    create: {
      scope: MARKETPLACE_SETTINGS_SCOPE,
      data: merged
    }
  });

  await prisma.marketplaceAuditLog.create({
    data: {
      action: 'settings.update',
      actorId: actorId || null,
      payload: merged as JsonValue
    }
  }).catch(() => null);

  return saved.data;
};

const ensureMarketplaceConversation = async (senderId: string, receiverId: string) => {
  const existing = await prisma.conversation.findFirst({
    where: {
      type: 'DIRECT',
      AND: [
        { participants: { some: { userId: senderId } } },
        { participants: { some: { userId: receiverId } } }
      ]
    },
    include: { participants: true }
  });

  if (existing && existing.participants?.length === 2) return existing;

  return prisma.conversation.create({
    data: {
      type: 'DIRECT',
      participants: { create: [{ userId: senderId }, { userId: receiverId }] }
    },
    include: { participants: true }
  });
};

const normalizeListingInclude = {
  seller: {
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      avatar: true,
      country: true,
      role: true,
      isVerified: true,
      isActive: true,
      createdAt: true
    }
  },
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      description: true,
      type: true
    }
  },
  media: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }]
  }
};

const normalizeListing = (listing: any, viewerId?: string | null) => {
  if (!listing) return null;
  const baseUrl = resolveFileBaseUrl();
  /**
   * Marketplace dual-path policy:
   * - Prefer working /uploads storagePath when present (many legacy fileIds 404 on content route).
   * - Attach content URL as fallbackUrl only; never replace a working uploads URL with a broken content URL.
   * - fileServable is left false here (no per-request File existence probe) so uploads stay primary.
   */
  const resolveMarketplaceMedia = (media: any) => {
    const normalized = normalizePublicMedia(
      {
        fileId: media?.fileId || null,
        url: media?.url || media?.downloadUrl || media?.download_url || null,
        storagePath:
          media?.storagePath ||
          media?.storage_path ||
          media?.storageKey ||
          media?.storage_key ||
          null,
        mimeType: media?.mimeType || null,
        width: media?.width ?? null,
        height: media?.height ?? null,
        durationSeconds: media?.durationSeconds ?? null,
        thumbnailUrl: media?.thumbnailUrl || null
      },
      { baseUrl, fileServable: false }
    );
    const descriptor = resolveMediaDescriptor(media, { baseUrl, fileServable: false });
    return {
      url: normalized?.url || descriptor.url || null,
      fallbackUrl: normalized?.fallbackUrl || descriptor.fallbackUrl || null,
      storagePath:
        normalized?.storagePath ||
        media?.storagePath ||
        media?.storage_path ||
        media?.storageKey ||
        null
    };
  };

  const media = Array.isArray(listing.media)
    ? listing.media.map((entry: any) => {
        const resolved = resolveMarketplaceMedia(entry);
        return {
          id: entry.id,
          listingId: entry.listingId,
          fileId: entry.fileId || null,
          type: entry.type,
          url: resolved.url || entry.url,
          fallbackUrl: resolved.fallbackUrl || null,
          storagePath: resolved.storagePath || entry.storagePath || entry.storage_key || null,
          thumbnailUrl: entry.thumbnailUrl || null,
          sortOrder: entry.sortOrder,
          mimeType: entry.mimeType,
          sizeBytes: Number(entry.sizeBytes || 0),
          width: entry.width || null,
          height: entry.height || null,
          durationSeconds: entry.durationSeconds || null,
          createdAt: entry.createdAt
        };
      })
    : [];

  return {
    ...listing,
    price: Number(listing.price || 0),
    viewCount: Number(listing.viewCount || 0),
    saveCount: Number(listing.saveCount || 0),
    reportCount: Number(listing.reportCount || 0),
    negotiable: Boolean(listing.negotiable),
    featured: Boolean(listing.featured),
    pinned: Boolean(listing.pinned),
    promoted: Boolean(listing.promoted),
    hideFromFriendsAndFollowers: Boolean(listing.hideFromFriendsAndFollowers),
    tags: Array.isArray(listing.tags) ? listing.tags.map(String) : [],
    meetupPreferences: Array.isArray(listing.meetupPreferences) ? listing.meetupPreferences.map(String) : [],
    isOwner: viewerId ? String(listing.sellerId || '') === String(viewerId) : false,
    media,
    coverImage: media.find((entry: any) => entry.type === 'image')?.url || media[0]?.url || null
  };
};

const assertMarketplaceEnabled = async () => {
  const settings = await getMarketplaceSettings();
  if (!settings?.enabled) {
    const error = new Error('Marketplace is disabled');
    (error as any).status = 403;
    throw error;
  }
  return settings;
};

const getApprovedPublicWhere = () => ({
  removedAt: null,
  status: { in: ['active', 'reserved'] },
  reviewStatus: 'approved'
});

const assertListingOwnerOrAdmin = async (listingId: string, userId: string, role?: string | null) => {
  const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing) {
    const error = new Error('Listing not found');
    (error as any).status = 404;
    throw error;
  }
  const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(normalizeRole(role));
  if (!isAdmin && String(listing.sellerId) !== String(userId)) {
    const error = new Error('Listing ownership required');
    (error as any).status = 403;
    throw error;
  }
  return listing;
};

const normalizeCommunityClubVisibility = (value: unknown): 'public' | 'private' =>
  String(value || '').trim().toLowerCase() === 'private' ? 'private' : 'public';

const normalizeCommunityClubPostPermission = (value: unknown): 'admins' | 'members' | 'everyone' => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'admins') return 'admins';
  if (normalized === 'everyone') return 'everyone';
  return 'members';
};

const assertCanShareListingToCommunityClub = async (clubId: string, user: User) => {
  const club = await prisma.communityClub.findUnique({
    where: { id: clubId },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      ownerId: true,
      visibility: true,
      postPermission: true,
      memberships: {
        where: { userId: String(user?.id || '').trim() },
        take: 1,
        select: { userId: true, role: true, status: true }
      }
    }
  });

  if (!club || String(club.status || '').toLowerCase() !== 'active') {
    const error = new Error('Group not found');
    (error as any).status = 404;
    throw error;
  }

  const normalizedRole = normalizeRole(user?.role);
  const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(normalizedRole);
  const membership = Array.isArray(club.memberships) ? club.memberships[0] || null : null;
  const isOwner = String(club.ownerId || '') === String(user?.id || '');
  const isModerator = ['owner', 'moderator'].includes(String(membership?.role || '').toLowerCase());
  const isManager = isAdmin || isOwner || isModerator;
  const isActiveMember = isManager || String(membership?.status || '').toLowerCase() === 'active';

  if (normalizeCommunityClubVisibility(club.visibility) === 'private' && !isActiveMember) {
    const error = new Error('Join this group before sharing marketplace listings here');
    (error as any).status = 403;
    throw error;
  }

  const postPermission = normalizeCommunityClubPostPermission(club.postPermission);
  if (postPermission === 'admins' && !isManager) {
    const error = new Error('Only group admins or moderators can post in this group');
    (error as any).status = 403;
    throw error;
  }
  if (postPermission === 'members' && !isActiveMember) {
    const error = new Error('Only active group members can post in this group');
    (error as any).status = 403;
    throw error;
  }

  return {
    club,
    visibility: normalizeCommunityClubVisibility(club.visibility)
  };
};

const resolveListingVisibilityForViewer = (listing: any, userId?: string | null, role?: string | null) => {
  const isOwner = userId && String(listing.sellerId || '') === String(userId);
  const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(normalizeRole(role));
  const publicAllowed = listing.reviewStatus === 'approved' && ['active', 'reserved'].includes(String(listing.status || ''));
  if (publicAllowed || isOwner || isAdmin) return listing;
  return null;
};

const resolveBoostMediaUrl = (media: any) => {
  const baseUrl = resolveFileBaseUrl();
  const directCandidates = [
    media?.storagePath,
    media?.storage_path,
    media?.storageKey,
    media?.storage_key,
    media?.url,
    media?.downloadUrl,
    media?.download_url
  ];

  for (const candidate of directCandidates) {
    const resolved = resolveDirectMediaUrl(candidate, baseUrl);
    if (resolved) return resolved;
  }

  const storageKey = String(
    media?.storagePath ||
      media?.storage_path ||
      media?.storageKey ||
      media?.storage_key ||
      ''
  ).trim();
  if (storageKey) {
    return `${baseUrl.replace(/\/+$/, '')}/uploads/${storageKey.replace(/^\/+/, '')}`;
  }

  const fileId = String(media?.fileId || media?.id || '').trim();
  if (fileId) {
    return resolveDirectMediaUrl(`/api/files/content/${encodeURIComponent(fileId)}`, baseUrl);
  }

  return null;
};

const resolveBoostMediaThumbnailUrl = (media: any) => {
  const baseUrl = resolveFileBaseUrl();
  const directCandidates = [
    media?.thumbnailUrl,
    media?.thumbnail_url,
    media?.url,
    media?.downloadUrl,
    media?.download_url,
    media?.storagePath,
    media?.storage_path,
    media?.storageKey,
    media?.storage_key
  ];

  for (const candidate of directCandidates) {
    const resolved = resolveDirectMediaUrl(candidate, baseUrl);
    if (resolved) return resolved;
  }

  return resolveBoostMediaUrl(media);
};

const ensureMarketplaceCategoriesSeeded = async () => {
  const existing = await prisma.category.findMany({
    where: {
      slug: { in: DEFAULT_MARKETPLACE_CATEGORIES.map((category) => category.slug) }
    },
    select: { slug: true }
  });
  const existingSlugs = new Set(existing.map((row) => String(row.slug || '').trim().toLowerCase()));
  const missing = DEFAULT_MARKETPLACE_CATEGORIES.filter((category) => !existingSlugs.has(category.slug));
  if (!missing.length) return;

  await prisma.$transaction(
    missing.map((category, index) =>
      prisma.category.create({
        data: {
          name: category.name,
          slug: category.slug,
          description: category.description,
          type: 'MARKETPLACE',
          isActive: true,
          order: index + 1
        }
      })
    )
  ).catch(() => null);
};

const resolveHiddenSellerIdsForViewer = async (viewerId?: string | null) => {
  if (!viewerId) return [];
  const rows = await prisma.userFollow.findMany({
    where: { followerId: String(viewerId) },
    select: { followeeId: true }
  });
  return Array.from(new Set(rows.map((row) => String(row.followeeId || '').trim()).filter(Boolean)));
};

const resolveCategoryIds = async (categoryId?: string | null, subcategoryId?: string | null) => {
  const ids = [categoryId, subcategoryId].map((value) => String(value || '').trim()).filter(Boolean);
  if (!ids.length) return null;
  const rows: any[] = await prisma.category.findMany({
    where: { id: { in: ids } },
    select: { id: true, type: true, isActive: true }
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const id of ids) {
    const category = byId.get(id);
    if (!category || !category.isActive) {
      const error = new Error('Category not found or inactive');
      (error as any).status = 400;
      throw error;
    }
    if (category.type !== 'MARKETPLACE' && category.type !== 'BOTH') {
      const error = new Error('Category is not enabled for marketplace listings');
      (error as any).status = 400;
      throw error;
    }
  }
  return { categoryId: ids[0] || null, subcategoryId: ids[1] || null };
};

const evaluateApprovalMode = async (userId: string, input: any, settings: any) => {
  const mode = String(settings?.approvalMode || 'manual').toLowerCase() as MarketplaceApprovalMode;
  if (mode === 'auto') return true;

  if (settings?.approvalOnlyNewSellers || mode === 'new_sellers') {
    const count = await prisma.marketplaceListing.count({
      where: { sellerId: userId, removedAt: null }
    });
    if (count < 1) return false;
  }

  if ((settings?.approvalOnlyCertainCategories || mode === 'certain_categories') && input.categoryId) {
    const blocked = new Set(toStringArray(settings?.prohibitedCategoryIds));
    if (blocked.has(String(input.categoryId))) return false;
  }

  if ((settings?.approvalOnlyVideoListings || mode === 'video_only') && input.mediaSummary?.videoCount > 0) {
    return false;
  }

  if ((settings?.approvalOnlyAbovePrice || mode === 'price_threshold') && Number(input.price || 0) >= Number(settings?.approvalPriceThreshold || 0)) {
    return false;
  }

  return mode === 'manual' ? false : true;
};

const validateListingPayload = async (input: any, settings: any) => {
  const title = String(input?.title || '').trim();
  const description = String(input?.description || '').trim();
  const brand = String(input?.brand || '').trim();
  const tags = clampTags(input?.tags);
  const price = toNumber(input?.price, NaN);
  const quantity = Math.max(1, toInt(input?.quantity, 1));
  const currency = String(input?.currency || 'USD').trim().toUpperCase() || 'USD';
  const condition = String(input?.condition || 'new').trim().toLowerCase();
  const status = normalizeStatus(input?.status || 'draft');
  const reviewStatus = normalizeReviewStatus(input?.reviewStatus || 'pending');
  const deliveryOptions = Array.from(new Set(toStringArray(input?.deliveryOptions)));
  const meetupPreferences = normalizeMeetupPreferences(input?.meetupPreferences);
  const paymentMethods = Array.from(new Set(toStringArray(input?.paymentMethods)));
  const location = String(input?.location || '').trim();
  const latitude = input?.latitude !== undefined && input?.latitude !== null ? toNumber(input.latitude, NaN) : null;
  const longitude = input?.longitude !== undefined && input?.longitude !== null ? toNumber(input.longitude, NaN) : null;
  const negotiable = Boolean(input?.negotiable);
  const hideFromFriendsAndFollowers = Boolean(input?.hideFromFriendsAndFollowers);
  const featured = Boolean(input?.featured);
  const pinned = Boolean(input?.pinned);
  const promoted = Boolean(input?.promoted);
  const contactPreference = String(input?.contactPreference || 'message').trim().toLowerCase() || 'message';
  const categoryIds = await resolveCategoryIds(input?.categoryId, input?.subcategoryId);
  const mediaSummary = {
    imageCount: toInt(input?.imageCount, 0),
    videoCount: toInt(input?.videoCount, 0)
  };

  const errors: string[] = [];
  if (title.length < 3) errors.push('title must be at least 3 characters');
  if (title.length > 140) errors.push('title must be at most 140 characters');
  if (description.length < 20) errors.push('description must be at least 20 characters');
  if (brand.length > 80) errors.push('brand must be at most 80 characters');
  if (!Number.isFinite(price) || price < 0) errors.push('price must be a non-negative number');
  if (quantity < 1) errors.push('quantity must be at least 1');
  if (String(currency).length < 3) errors.push('currency must be a valid ISO currency code');
  if (!['new', 'used_like_new', 'used_good', 'used_fair', 'refurbished', 'handmade', 'other'].includes(condition)) {
    errors.push('condition must be one of the allowed values');
  }
  if (settings?.maxImagesPerListing !== undefined && mediaSummary.imageCount > Number(settings.maxImagesPerListing)) {
    errors.push(`images cannot exceed ${settings.maxImagesPerListing}`);
  }
  if (settings?.maxVideosPerListing !== undefined && mediaSummary.videoCount > Number(settings.maxVideosPerListing)) {
    errors.push(`videos cannot exceed ${settings.maxVideosPerListing}`);
  }
  if (!deliveryOptions.length) errors.push('at least one delivery option is required');
  if (!meetupPreferences.length) errors.push('at least one meetup preference is required');
  if (!paymentMethods.length && settings?.allowedPaymentMethods?.length) {
    errors.push('at least one payment method is required');
  }
  const allowedPaymentMethods = new Set(toStringArray(settings?.allowedPaymentMethods).map((value) => value.toLowerCase()));
  const fallbackPaymentMethods = resolveMarketplacePaymentMethodWhitelist(settings);
  if (!allowedPaymentMethods.size && fallbackPaymentMethods.length) {
    fallbackPaymentMethods.forEach((method) => allowedPaymentMethods.add(String(method).toLowerCase()));
  }
  if (paymentMethods.length) {
    const invalid = paymentMethods.filter((method) => !allowedPaymentMethods.has(method.toLowerCase()));
    if (invalid.length) errors.push(`invalid payment methods: ${invalid.join(', ')}`);
  }
  if (deliveryOptions.includes('cash_on_delivery') && !settings?.cashOnDeliveryEnabled) {
    errors.push('cash on delivery is disabled by admin');
  }

  if (errors.length) {
    const error = new Error(errors[0]);
    (error as any).status = 400;
    (error as any).details = errors;
    throw error;
  }

  const approvalRequired = !(await evaluateApprovalMode('', { ...input, price, categoryId: categoryIds?.categoryId, mediaSummary }, settings));

  return {
    title,
    slug: slugify(input?.slug || title) || `${Date.now()}`,
    description,
    categoryId: categoryIds?.categoryId || null,
    subcategoryId: categoryIds?.subcategoryId || null,
    condition,
    brand: brand || null,
    tags,
    price,
    currency,
    negotiable,
    quantity,
    location: location || null,
    latitude: Number.isFinite(latitude as number) ? latitude : null,
    longitude: Number.isFinite(longitude as number) ? longitude : null,
    meetupPreferences,
    hideFromFriendsAndFollowers,
    deliveryOptions,
    paymentMethods,
    contactPreference,
    featured,
    pinned,
    promoted,
    status,
    reviewStatus,
    approvalRequired
  };
};

const buildMarketplaceOrderNumber = () => `MKT-${Date.now().toString().slice(-8)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

/**
 * Phase 28F — marketplace checkout quote.
 * Commission applies only for online payments (Stripe/PayPal/wallet/…).
 * Cash on delivery: zero platform commission (seller delivers personally).
 */
export const quoteMarketplaceCheckout = async (params: {
  listingId: string;
  paymentMethod?: string | null;
  quantity?: number;
  buyerCurrency?: string | null;
}) => {
  const listing = await prisma.marketplaceListing.findUnique({
    where: { id: String(params.listingId || '').trim() }
  });
  if (!listing) {
    const err: any = new Error('Listing not found');
    err.statusCode = 404;
    throw err;
  }
  const qty = Math.max(1, Math.min(Number(params.quantity) || 1, Number(listing.quantity) || 1));
  const unitPrice = Number(listing.price || 0);
  const sourceCurrency = String(listing.currency || 'USD').toUpperCase() || 'USD';
  const subtotal = Number((unitPrice * qty).toFixed(2));
  const paymentMethod = String(params.paymentMethod || listing.paymentMethods?.[0] || 'cash_on_delivery');

  const settings = await getMarketplaceSettings();
  const { computeMarketplaceCommission, convertMajorFailClosed } = await import('./currencySurface.service');
  const commission = computeMarketplaceCommission({
    amount: subtotal,
    paymentMethod,
    marketplaceSettings: settings
  });

  const buyerCurrency = String(params.buyerCurrency || sourceCurrency)
    .trim()
    .toUpperCase() || sourceCurrency;
  let displaySubtotal = subtotal;
  let displayCommission = commission.commissionAmount;
  let displaySellerEarnings = commission.sellerEarnings;
  let displayConverted = false;
  if (buyerCurrency !== sourceCurrency) {
    const subConv = await convertMajorFailClosed({
      amount: subtotal,
      fromCurrency: sourceCurrency,
      toCurrency: buyerCurrency
    });
    const feeConv = await convertMajorFailClosed({
      amount: commission.commissionAmount,
      fromCurrency: sourceCurrency,
      toCurrency: buyerCurrency
    });
    const earnConv = await convertMajorFailClosed({
      amount: commission.sellerEarnings,
      fromCurrency: sourceCurrency,
      toCurrency: buyerCurrency
    });
    if (subConv.ok && feeConv.ok && earnConv.ok) {
      displaySubtotal = Number(subConv.amount.toFixed(2));
      displayCommission = Number(feeConv.amount.toFixed(2));
      displaySellerEarnings = Number(earnConv.amount.toFixed(2));
      displayConverted = true;
    }
  }

  return {
    listingId: listing.id,
    quantity: qty,
    unitPrice,
    subtotal,
    currency: sourceCurrency,
    paymentMethod,
    commission,
    buyer: {
      currency: buyerCurrency,
      subtotal: displaySubtotal,
      platformFee: displayCommission,
      sellerEarnings: displaySellerEarnings,
      total: displaySubtotal,
      converted: displayConverted
    },
    // Settlement amounts always remain in listing currency (historical preservation).
    settlement: {
      currency: sourceCurrency,
      subtotal,
      platformFee: commission.commissionAmount,
      sellerEarnings: commission.sellerEarnings,
      total: subtotal
    }
  };
};

export const createMarketplaceOrder = async (params: {
  listingId: string;
  buyerId: string;
  paymentMethod?: string | null;
  deliveryOption?: string | null;
  quantity?: number;
}) => {
  const listing = await prisma.marketplaceListing.findUnique({
    where: { id: String(params.listingId || '').trim() }
  });
  if (!listing) {
    const err: any = new Error('Listing not found');
    err.statusCode = 404;
    throw err;
  }
  if (String(listing.sellerId) === String(params.buyerId)) {
    const err: any = new Error('You cannot purchase your own listing');
    err.statusCode = 400;
    throw err;
  }
  if (String(listing.status || '').toLowerCase() !== 'active') {
    const err: any = new Error('Listing is not available for purchase');
    err.statusCode = 400;
    throw err;
  }

  const quote = await quoteMarketplaceCheckout({
    listingId: listing.id,
    paymentMethod: params.paymentMethod,
    quantity: params.quantity
  });

  const order = await prisma.marketplaceOrder.create({
    data: {
      listingId: listing.id,
      buyerId: params.buyerId,
      sellerId: listing.sellerId,
      orderNumber: buildMarketplaceOrderNumber(),
      amount: quote.settlement.total,
      currency: quote.settlement.currency,
      paymentMethod: quote.paymentMethod,
      paymentStatus: quote.commission.isCod ? 'pending_cod' : 'pending',
      status: 'pending',
      deliveryOption: params.deliveryOption || null
    }
  });

  await prisma.marketplaceAuditLog
    .create({
      data: {
        listingId: listing.id,
        actorId: params.buyerId,
        action: 'order.created',
        payload: {
          orderId: order.id,
          paymentMethod: quote.paymentMethod,
          commission: quote.commission,
          settlement: quote.settlement
        } as any
      }
    })
    .catch(() => null);

  return {
    order,
    quote
  };
};

export const listMarketplaceCategories = async (includeInactive = false) => {
  await ensureMarketplaceCategoriesSeeded();
  return prisma.category.findMany({
    where: {
      type: { in: ['MARKETPLACE', 'BOTH'] as any },
      ...(includeInactive ? {} : { isActive: true })
    },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      description: true,
      type: true,
      isActive: true,
      order: true,
      parentId: true
    }
  });
};

export const listMarketplaceListings = async (params: {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string | null;
  condition?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  deliveryOption?: string | null;
  status?: string | null;
  sort?: string | null;
  includeMine?: boolean;
  includeAll?: boolean;
  viewerId?: string | null;
  viewerRole?: string | null;
}) => {
  const settings = await getMarketplaceSettings();
  const page = Math.max(1, toInt(params.page, 1));
  const pageSize = Math.min(50, Math.max(1, toInt(params.pageSize, 24)));
  const where: any = {};
  const hiddenSellerIds = !params.includeAll ? await resolveHiddenSellerIdsForViewer(params.viewerId) : [];

  if (!params.includeAll) {
    if (params.includeMine && params.viewerId) {
      where.OR = [
        { sellerId: params.viewerId },
        getApprovedPublicWhere()
      ];
    } else {
      Object.assign(where, getApprovedPublicWhere());
    }
  }

  if (params.includeAll) {
    if (params.status) {
      where.status = normalizeStatus(params.status);
    }
  }

  if (params.categoryId) where.categoryId = String(params.categoryId);
  if (params.condition) where.condition = String(params.condition).trim().toLowerCase();
  if (params.minPrice !== undefined && params.minPrice !== null && Number.isFinite(Number(params.minPrice))) {
    where.price = { ...(where.price as any), gte: Number(params.minPrice) };
  }
  if (params.maxPrice !== undefined && params.maxPrice !== null && Number.isFinite(Number(params.maxPrice))) {
    where.price = { ...(where.price as any), lte: Number(params.maxPrice) };
  }
  if (params.location) {
    where.location = { contains: String(params.location), mode: 'insensitive' } as any;
  }
  if (params.deliveryOption) {
    where.deliveryOptions = { has: String(params.deliveryOption).trim().toLowerCase() } as any;
  }
  if (hiddenSellerIds.length) {
    where.NOT = {
      AND: [
        { hideFromFriendsAndFollowers: true },
        { sellerId: { in: hiddenSellerIds } }
      ]
    };
  }
  if (params.search) {
    const term = String(params.search).trim();
    if (term) {
      where.OR = [
        ...(Array.isArray(where.OR) ? (where.OR as any[]) : []),
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { brand: { contains: term, mode: 'insensitive' } },
        { location: { contains: term, mode: 'insensitive' } },
        { tags: { has: term } },
        { category: { name: { contains: term, mode: 'insensitive' } } },
        { category: { slug: { contains: term, mode: 'insensitive' } } }
      ] as any;
    }
  }

  const sort = String(params.sort || 'newest').toLowerCase();
  const orderBy =
    sort === 'price_asc' || sort === 'price_low'
      ? [{ price: 'asc' as const }, { createdAt: 'desc' as const }]
      : sort === 'price_desc' || sort === 'price_high'
        ? [{ price: 'desc' as const }, { createdAt: 'desc' as const }]
        : sort === 'popular'
          ? [{ viewCount: 'desc' as const }, { createdAt: 'desc' as const }]
          : sort === 'recommended'
            ? [{ featured: 'desc' as const }, { viewCount: 'desc' as const }, { createdAt: 'desc' as const }]
            : sort === 'nearest'
              ? [{ createdAt: 'desc' as const }]
              : [{ createdAt: 'desc' as const }];

  if (
    sort === 'nearest' &&
    params.latitude !== undefined &&
    params.latitude !== null &&
    params.longitude !== undefined &&
    params.longitude !== null
  ) {
    const viewerLatitude = Number(params.latitude);
    const viewerLongitude = Number(params.longitude);
    const rows = await prisma.marketplaceListing.findMany({
      where,
      include: normalizeListingInclude,
      orderBy: [{ createdAt: 'desc' }]
    });
    const normalized = rows
      .map((row) => {
        const normalizedRow = normalizeListing(row, params.viewerId) as any;
        if (!normalizedRow) return null;
        const hasCoords =
          Number.isFinite(Number(normalizedRow.latitude)) &&
          Number.isFinite(Number(normalizedRow.longitude));
        const distanceKm = hasCoords
          ? Math.hypot(
              (Number(normalizedRow.latitude) - viewerLatitude) * 111,
              (Number(normalizedRow.longitude) - viewerLongitude) *
                111 *
                Math.cos((viewerLatitude * Math.PI) / 180)
            )
          : Number.POSITIVE_INFINITY;
        return {
          ...normalizedRow,
          distanceKm: Number.isFinite(distanceKm) ? Number(distanceKm.toFixed(2)) : null
        };
      })
      .filter(Boolean)
      .sort(
        (left: any, right: any) =>
          (left.distanceKm ?? Number.POSITIVE_INFINITY) -
          (right.distanceKm ?? Number.POSITIVE_INFINITY)
      ) as any[];
    const total = normalized.length;
    const items = normalized.slice((page - 1) * pageSize, page * pageSize);
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), settings };
  }

  const [total, rows] = await Promise.all([
    prisma.marketplaceListing.count({ where }),
    prisma.marketplaceListing.findMany({
      where,
      include: normalizeListingInclude,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);

  const items = rows.map((row) => normalizeListing(row, params.viewerId)).filter(Boolean);
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    settings
  };
};

export const getMarketplaceListingByIdOrSlug = async (idOrSlug: string, viewerId?: string | null, viewerRole?: string | null) => {
  const listing = await prisma.marketplaceListing.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }]
    },
    include: normalizeListingInclude
  });
  if (!listing) return null;
  if (
    listing.hideFromFriendsAndFollowers &&
    viewerId &&
    String(listing.sellerId || '') !== String(viewerId) &&
    !['ADMIN', 'SUPERADMIN'].includes(normalizeRole(viewerRole))
  ) {
    const hiddenSellerIds = await resolveHiddenSellerIdsForViewer(viewerId);
    if (hiddenSellerIds.includes(String(listing.sellerId || ''))) {
      return null;
    }
  }
  return resolveListingVisibilityForViewer(listing, viewerId, viewerRole)
    ? normalizeListing(listing, viewerId)
    : null;
};

export const buildMarketplaceListingBoostPrefill = async (userId: string, listingId: string) => {
  const listing = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    include: normalizeListingInclude
  });

  if (!listing) {
    const error = new Error('Listing not found');
    (error as any).status = 404;
    throw error;
  }

  if (String(listing.sellerId || '') !== String(userId || '')) {
    const error = new Error('Listing ownership required');
    (error as any).status = 403;
    throw error;
  }

  if (listing.seller?.isActive === false) {
    const error = new Error('Listing owner account is inactive');
    (error as any).status = 403;
    throw error;
  }

  const status = String(listing.status || '').toLowerCase();
  const reviewStatus = String(listing.reviewStatus || '').toLowerCase();
  const allowedStatuses = new Set(['active', 'reserved', 'pending_review', 'approved']);
  if (!allowedStatuses.has(status) && !allowedStatuses.has(reviewStatus)) {
    const error = new Error('Listing must be active or reviewable before it can be boosted');
    (error as any).status = 403;
    throw error;
  }

  if (['sold', 'removed', 'suspended', 'rejected'].includes(status) || ['rejected'].includes(reviewStatus)) {
    const error = new Error('Listing is not eligible for boost promotion');
    (error as any).status = 403;
    throw error;
  }

  const normalizedListing = normalizeListing(listing, userId);
  const images = Array.isArray(normalizedListing?.media)
    ? normalizedListing.media
        .filter((entry: any) => String(entry?.type || '').toLowerCase() !== 'video')
        .sort((left: any, right: any) => Number(left?.sortOrder || 0) - Number(right?.sortOrder || 0))
    : [];
  const primaryImage = images[0] || normalizedListing?.media?.[0] || null;
  const mediaFileIds = Array.from(
    new Set(
      (Array.isArray(listing.media) ? listing.media : [])
        .map((entry: any) => String(entry?.fileId || '').trim())
        .filter(Boolean)
    )
  );
  const publicAppUrl = String(process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'https://scrolith.com')
    .trim()
    .replace(/\/+$/, '');
  const canonicalUrl = `${publicAppUrl}/marketplace/listing/${encodeURIComponent(
    String(listing.slug || listing.id || '').trim()
  )}`;
  const canonicalTitle = String(listing.title || 'Marketplace listing').trim();
  const canonicalCopy = String(
    listing.description ||
      listing.summary ||
      `${canonicalTitle} available on Scrolith Marketplace.`
  ).trim();
  const placementCandidates = ['community_feed', 'homepage_feed'];
  const primaryPlacement = placementCandidates[0];
  const targeting = {
    sourceType: 'MARKETPLACE_LISTING',
    sourceId: listing.id,
    sourceOwnerId: listing.sellerId,
    sourceSlug: listing.slug,
    sourceUrl: canonicalUrl,
    sourceTitle: canonicalTitle,
    sourceCategoryId: listing.categoryId || null,
    sourceTags: Array.isArray(listing.tags) ? listing.tags.map(String) : [],
    sourceLocation: listing.location || null,
    sourceCurrency: listing.currency || 'USD',
    sourcePrice: Number(listing.price || 0),
    sourceMediaFileIds: mediaFileIds,
    placements: placementCandidates,
    pricingModel: 'CPM',
    targetCountries: listing.seller?.country ? [String(listing.seller.country).trim()].filter(Boolean) : [],
    targetAudience: 'users',
    dailySpend: null
  };

  await prisma.marketplaceAuditLog.create({
    data: {
      listingId: listing.id,
      actorId: userId,
      action: 'listing.boost.prefill',
      payload: targeting as JsonValue
    }
  }).catch(() => null);

  return {
    sourceType: 'MARKETPLACE_LISTING',
    listingId: listing.id,
    listingSlug: listing.slug || listing.id,
    listingUrl: canonicalUrl,
    campaignName: `Boost - ${canonicalTitle}`,
    adTitle: canonicalTitle,
    adCopy: canonicalCopy,
    destinationType: 'url',
    destinationUrl: canonicalUrl,
    ctaText: 'View Listing',
    placements: placementCandidates,
    objective: 'traffic',
    targetAudience: 'users',
    targetCountries: targeting.targetCountries,
    currency: String(listing.currency || 'USD').toUpperCase(),
    budget: Math.max(120, Number(listing.price || 0) > 0 ? Math.round(Number(listing.price || 0) * 0.1) : 120),
    dailySpend: null,
    durationDays: 7,
    mediaFileIds,
    media: images.map((entry: any) => {
      const primaryUrl = resolveBoostMediaUrl(entry) || entry.url || entry.downloadUrl || null;
      const thumbnailUrl =
        resolveBoostMediaThumbnailUrl(entry) || entry.thumbnailUrl || primaryUrl || null;

      return {
        id: entry.id,
        fileId: entry.fileId || null,
        url: primaryUrl,
        downloadUrl: primaryUrl,
        storagePath: entry.storagePath || entry.storage_path || null,
        name: primaryImage?.id === entry.id ? `${canonicalTitle} (primary)` : canonicalTitle,
        mimeType: entry.mimeType,
        type: entry.type,
        thumbnailUrl,
        width: entry.width || null,
        height: entry.height || null
      };
    }),
    targeting
  };
};

const pauseMarketplaceBoostCampaignsForListing = async (listingId: string, creatorId: string, actorId: string) => {
  const ads = await prisma.communityAd.findMany({
    where: {
      creatorId
    },
    select: {
      id: true,
      title: true,
      status: true,
      targeting: true
    }
  });

  const matchingAds = ads.filter((ad) => {
    const targeting = ad.targeting as Record<string, any> | null | undefined;
    return (
      String(targeting?.sourceType || '').toUpperCase() === 'MARKETPLACE_LISTING' &&
      String(targeting?.sourceId || '') === String(listingId)
    );
  });

  if (!matchingAds.length) {
    return [];
  }

  const pausedAt = new Date();
  const updates = await Promise.all(
    matchingAds
      .filter((ad) => !['ENDED', 'REJECTED'].includes(String(ad.status || '').toUpperCase()))
      .map(async (ad) => {
        const updated = await prisma.communityAd.update({
          where: { id: ad.id },
          data: {
            status: 'PAUSED',
            adminReviewNotes: `Source listing ${listingId} was archived or sold.`
          }
        });
        await prisma.marketplaceAuditLog
          .create({
            data: {
              listingId,
              actorId,
              action: 'listing.boost.paused',
              payload: {
                adId: ad.id,
                adStatus: ad.status,
                pausedAt
              } as JsonValue
            }
          })
          .catch(() => null);
        return updated;
      })
  );

  return updates;
};

export const createMarketplaceListing = async (user: User, input: any, allowAdmin = false) => {
  const settings = await assertMarketplaceEnabled();
  const normalizedRole = normalizeRole(user.role);
  const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(normalizedRole);
  if (!allowAdmin && !isAdmin && settings?.sellerEligibility?.blockedRoles?.includes(normalizedRole)) {
    const error = new Error('Your account is not eligible to sell');
    (error as any).status = 403;
    throw error;
  }
  if (user.isActive === false) {
    const error = new Error('Account is inactive');
    (error as any).status = 403;
    throw error;
  }

  if (settings?.sellerListingLimit && settings.sellerListingLimit > 0) {
    const existingCount = await prisma.marketplaceListing.count({
      where: { sellerId: user.id, removedAt: null, status: { not: 'removed' } }
    });
    if (existingCount >= settings.sellerListingLimit) {
      const error = new Error('Seller listing limit reached');
      (error as any).status = 403;
      throw error;
    }
  }

  const normalized = await validateListingPayload(input, settings);
  const approvalRequired = !(await evaluateApprovalMode(user.id, normalized, settings));
  const now = new Date();
  const reviewStatus = approvalRequired ? 'pending' : 'approved';
  const status = approvalRequired ? 'pending_review' : 'active';

  const created = await prisma.marketplaceListing.create({
    data: {
      sellerId: user.id,
      title: normalized.title,
      slug: await ensureUniqueMarketplaceSlug(normalized.slug || normalized.title),
      description: normalized.description,
      categoryId: normalized.categoryId,
      subcategoryId: normalized.subcategoryId,
      condition: normalized.condition,
      price: normalized.price,
      currency: normalized.currency,
      negotiable: normalized.negotiable,
      quantity: normalized.quantity,
      location: normalized.location,
      latitude: normalized.latitude,
      longitude: normalized.longitude,
      brand: normalized.brand,
      tags: normalized.tags,
      meetupPreferences: normalized.meetupPreferences,
      hideFromFriendsAndFollowers: normalized.hideFromFriendsAndFollowers,
      deliveryOptions: normalized.deliveryOptions,
      paymentMethods: normalized.paymentMethods,
      contactPreference: normalized.contactPreference,
      featured: normalized.featured,
      pinned: normalized.pinned,
      promoted: normalized.promoted,
      status,
      reviewStatus,
      approvedAt: reviewStatus === 'approved' ? now : null
    },
    include: normalizeListingInclude
  });

  await prisma.marketplaceAuditLog.create({
    data: {
      listingId: created.id,
      actorId: user.id,
      action: 'listing.create',
      payload: created as JsonValue
    }
  }).catch(() => null);

  if (reviewStatus === 'approved') {
    notifyUser(user.id, {
      type: 'marketplace.listing.approved',
      title: 'Listing approved',
      body: `${created.title} is now active on Scrolith Marketplace.`,
      link: `/marketplace/listing/${created.slug}`
    });
  } else {
    notifyUser(user.id, {
      type: 'marketplace.listing.pending',
      title: 'Listing submitted',
      body: `${created.title} is waiting for review.`,
      link: `/marketplace/my-listings`
    });
    notifyAdmins({
      type: 'marketplace.listing.submitted',
      title: 'Marketplace listing submitted',
      body: `${user.name || user.email || 'A user'} submitted ${created.title} for review.`,
      link: `/dashboard/admin/marketplace/listings/${created.id}`
    });
  }

  await publishIntegrationEvent('marketplace.listing.created', {
    listingId: created.id,
    slug: created.slug,
    sellerId: created.sellerId,
    categoryId: created.categoryId,
    status: created.status,
    reviewStatus: created.reviewStatus,
    price: created.price,
    currency: created.currency
  });

  return normalizeListing(created, user.id);
};

const ensureUniqueMarketplaceSlug = async (baseSlug: string) => {
  const safe = slugify(baseSlug) || `listing-${Date.now()}`;
  let candidate = safe;
  let counter = 1;
  while (await prisma.marketplaceListing.findUnique({ where: { slug: candidate } })) {
    candidate = `${safe}-${counter += 1}`;
  }
  return candidate;
};

export const updateMarketplaceListing = async (listingId: string, user: User, input: any, allowAdmin = false) => {
  const settings = await getMarketplaceSettings();
  const existing = allowAdmin
    ? await prisma.marketplaceListing.findUnique({ where: { id: listingId } })
    : await assertListingOwnerOrAdmin(listingId, user.id, user.role);
  if (!existing) {
    const error = new Error('Listing not found');
    (error as any).status = 404;
    throw error;
  }
  if (!allowAdmin && ['sold', 'removed', 'suspended'].includes(existing.status)) {
    const error = new Error('Listing can no longer be edited');
    (error as any).status = 403;
    throw error;
  }

  const normalized = await validateListingPayload({ ...existing, ...input }, settings);
  const nextSlug = input?.slug ? await ensureUniqueMarketplaceSlug(normalized.slug || normalized.title) : existing.slug;

  const updated = await prisma.marketplaceListing.update({
    where: { id: listingId },
    data: {
      title: normalized.title,
      slug: nextSlug,
      description: normalized.description,
      categoryId: normalized.categoryId,
      subcategoryId: normalized.subcategoryId,
      condition: normalized.condition,
      price: normalized.price,
      currency: normalized.currency,
      negotiable: normalized.negotiable,
      quantity: normalized.quantity,
      location: normalized.location,
      latitude: normalized.latitude,
      longitude: normalized.longitude,
      brand: normalized.brand,
      tags: normalized.tags,
      meetupPreferences: normalized.meetupPreferences,
      hideFromFriendsAndFollowers: normalized.hideFromFriendsAndFollowers,
      deliveryOptions: normalized.deliveryOptions,
      paymentMethods: normalized.paymentMethods,
      contactPreference: normalized.contactPreference,
      featured: normalized.featured,
      pinned: normalized.pinned,
      promoted: normalized.promoted,
      reviewStatus: existing.reviewStatus === 'rejected' ? existing.reviewStatus : normalized.reviewStatus,
      status: existing.status === 'removed' ? existing.status : normalized.status
    },
    include: normalizeListingInclude
  });

  await prisma.marketplaceAuditLog.create({
    data: {
      listingId,
      actorId: user.id,
      action: 'listing.update',
      payload: input as JsonValue
    }
  }).catch(() => null);

  await publishIntegrationEvent('marketplace.listing.updated', {
    listingId: updated.id,
    slug: updated.slug,
    sellerId: updated.sellerId,
    categoryId: updated.categoryId,
    status: updated.status,
    reviewStatus: updated.reviewStatus,
    price: updated.price,
    currency: updated.currency
  });

  return normalizeListing(updated, user.id);
};

export const submitMarketplaceListing = async (listingId: string, user: User) => {
  const settings = await assertMarketplaceEnabled();
  const listing = await assertListingOwnerOrAdmin(listingId, user.id, user.role);
  const approvalRequired = !(await evaluateApprovalMode(user.id, listing, settings));
  const reviewStatus = approvalRequired ? 'pending' : 'approved';
  const updated = await prisma.marketplaceListing.update({
    where: { id: listingId },
    data: {
      status: approvalRequired ? 'pending_review' : 'active',
      reviewStatus,
      approvedAt: reviewStatus === 'approved' ? new Date() : null,
      rejectedAt: null,
      rejectionReason: null
    },
    include: normalizeListingInclude
  });

  await prisma.marketplaceAuditLog.create({
    data: {
      listingId,
      actorId: user.id,
      action: 'listing.submit'
    }
  }).catch(() => null);

  if (reviewStatus === 'approved') {
    notifyUser(user.id, {
      type: 'marketplace.listing.approved',
      title: 'Listing approved',
      body: `${updated.title} is now active on Scrolith Marketplace.`,
      link: `/marketplace/listing/${updated.slug}`
    });
  } else {
    notifyUser(user.id, {
      type: 'marketplace.listing.pending',
      title: 'Listing submitted for review',
      body: `${updated.title} is pending review.`,
      link: `/marketplace/my-listings`
    });
    notifyAdmins({
      type: 'marketplace.listing.submitted',
      title: 'Marketplace listing submitted',
      body: `${user.name || user.email || 'A user'} submitted ${updated.title} for review.`,
      link: `/dashboard/admin/marketplace/listings/${updated.id}`
    });
  }

  await publishIntegrationEvent('marketplace.listing.submitted', {
    listingId: updated.id,
    slug: updated.slug,
    sellerId: updated.sellerId,
    status: updated.status,
    reviewStatus: updated.reviewStatus
  });

  return normalizeListing(updated, user.id);
};

export const archiveMarketplaceListing = async (listingId: string, user: User) => {
  const listing = await assertListingOwnerOrAdmin(listingId, user.id, user.role);
  const updated = await prisma.marketplaceListing.update({
    where: { id: listingId },
    data: {
      status: 'removed',
      removedAt: new Date()
    },
    include: normalizeListingInclude
  });
  await pauseMarketplaceBoostCampaignsForListing(updated.id, updated.sellerId, user.id).catch(() => null);
  await publishIntegrationEvent('marketplace.listing.archived', {
    listingId: updated.id,
    slug: updated.slug,
    sellerId: updated.sellerId,
    status: updated.status
  });

  await prisma.marketplaceAuditLog.create({
    data: {
      listingId,
      actorId: user.id,
      action: 'listing.delist'
    }
  }).catch(() => null);

  return normalizeListing(updated, user.id);
};

export const markMarketplaceListingSold = async (listingId: string, user: User) => {
  const listing = await assertListingOwnerOrAdmin(listingId, user.id, user.role);
  const updated = await prisma.marketplaceListing.update({
    where: { id: listingId },
    data: {
      status: 'sold',
      soldAt: new Date()
    },
    include: normalizeListingInclude
  });
  await pauseMarketplaceBoostCampaignsForListing(updated.id, updated.sellerId, user.id).catch(() => null);
  notifyUser(listing.sellerId, {
    type: 'marketplace.listing.sold',
    title: 'Listing marked sold',
    body: `${updated.title} has been marked as sold.`,
    link: `/marketplace/my-listings`
  });
  await publishIntegrationEvent('marketplace.listing.sold', {
    listingId: updated.id,
    slug: updated.slug,
    sellerId: updated.sellerId,
    status: updated.status,
    soldAt: updated.soldAt
  });
  return normalizeListing(updated, user.id);
};

export const shareMarketplaceListingToGroup = async (listingId: string, user: User, input: any) => {
  const listing = await assertListingOwnerOrAdmin(listingId, user.id, user.role);
  const clubId = String(input?.clubId || '').trim();
  const message = String(input?.message || '').trim().slice(0, 1200);
  if (!clubId) {
    const error = new Error('clubId is required');
    (error as any).status = 400;
    throw error;
  }

  const [{ club, visibility }, detailedListing] = await Promise.all([
    assertCanShareListingToCommunityClub(clubId, user),
    prisma.marketplaceListing.findUnique({
      where: { id: listing.id },
      include: normalizeListingInclude
    })
  ]);

  if (!detailedListing) {
    const error = new Error('Listing not found');
    (error as any).status = 404;
    throw error;
  }

  const publicAppUrl = String(
    process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'https://scrolith.com'
  )
    .trim()
    .replace(/\/+$/, '');
  const listingPath = `/marketplace/listing/${encodeURIComponent(String(detailedListing.slug || detailedListing.id || '').trim())}`;
  const listingUrl = `${publicAppUrl}${listingPath}`;
  const attachmentFileIds = Array.isArray(detailedListing.media)
    ? detailedListing.media
        .map((entry: any) => String(entry?.fileId || '').trim())
        .filter(Boolean)
        .slice(0, 10)
    : [];
  const attachmentCaptions = attachmentFileIds.length
    ? Object.fromEntries(
        attachmentFileIds.map((fileId, index) => [
          fileId,
          index === 0 ? String(detailedListing.title || 'Marketplace listing').trim() : `Marketplace image ${index + 1}`
        ])
      )
    : null;

  const contentParts = [
    message,
    String(detailedListing.description || '').trim(),
    `Marketplace listing: ${listingUrl}`
  ].filter(Boolean);

  const createdPost = await prisma.communityPost.create({
    data: {
      authorId: String(user.id || '').trim(),
      clubId: club.id,
      title: String(detailedListing.title || '').trim() || null,
      content: contentParts.join('\n\n'),
      attachments: attachmentFileIds,
      attachmentCaptions: attachmentCaptions || undefined,
      visibility,
      commentPolicy: 'everyone',
      repostsEnabled: true,
      status: 'active',
      topic: 'marketplace',
      location: String(detailedListing.location || '').trim() || null,
      tags: Array.from(
        new Set(
          ['marketplace', ...((Array.isArray(detailedListing.tags) ? detailedListing.tags : []) as string[])]
            .map((entry) => String(entry || '').trim())
            .filter(Boolean)
            .slice(0, 12)
        )
      )
    }
  });

  await prisma.marketplaceAuditLog.create({
    data: {
      listingId: detailedListing.id,
      actorId: String(user.id || '').trim(),
      action: 'listing.share_to_group',
      payload: {
        clubId: club.id,
        clubSlug: club.slug || null,
        postId: createdPost.id,
        listingUrl
      } as JsonValue
    }
  }).catch(() => null);

  publishIntegrationEvent('marketplace.listing.shared_to_group', {
    listingId: detailedListing.id,
    sellerId: detailedListing.sellerId,
    clubId: club.id,
    clubSlug: club.slug || null,
    communityPostId: createdPost.id
  }).catch(() => null);

  if (String(club.ownerId || '') && String(club.ownerId || '') !== String(user.id || '')) {
    notifyUser(String(club.ownerId || ''), {
      type: 'community.group.marketplace_share',
      title: 'New marketplace post in your group',
      body: `${String(user?.name || user?.username || 'A member')} shared "${String(detailedListing.title || 'a listing')}" in ${String(club.name || 'your group')}.`,
      link: `/community?tab=groups&group=${encodeURIComponent(String(club.slug || club.id || '').trim())}`
    });
  }

  return {
    success: true,
    club: {
      id: club.id,
      slug: club.slug || '',
      name: club.name || 'Scrolith Group'
    },
    post: {
      id: createdPost.id,
      clubId: createdPost.clubId,
      title: createdPost.title,
      content: createdPost.content
    },
    listing: normalizeListing(detailedListing, String(user.id || '').trim()),
    listingUrl
  };
};

export const reserveMarketplaceListing = async (listingId: string, user: User) => {
  const listing = await assertListingOwnerOrAdmin(listingId, user.id, user.role);
  const updated = await prisma.marketplaceListing.update({
    where: { id: listingId },
    data: {
      status: 'reserved',
      reservedAt: new Date()
    },
    include: normalizeListingInclude
  });
  notifyUser(listing.sellerId, {
    type: 'marketplace.listing.reserved',
    title: 'Listing reserved',
    body: `${updated.title} has been reserved.`,
    link: `/marketplace/my-listings`
  });
  await publishIntegrationEvent('marketplace.listing.reserved', {
    listingId: updated.id,
    slug: updated.slug,
    sellerId: updated.sellerId,
    status: updated.status,
    reservedAt: updated.reservedAt
  });
  return normalizeListing(updated, user.id);
};

export const favoriteMarketplaceListing = async (listingId: string, userId: string) => {
  const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing) {
    const error = new Error('Listing not found');
    (error as any).status = 404;
    throw error;
  }

  await prisma.favorite.upsert({
    where: {
      userId_entityType_entityId: {
        userId,
        entityType: MARKETPLACE_FAVORITE_ENTITY_TYPE,
        entityId: listingId
      }
    },
    update: {},
    create: {
      userId,
      entityType: MARKETPLACE_FAVORITE_ENTITY_TYPE,
      entityId: listingId
    }
  });

  await prisma.marketplaceListing.update({
    where: { id: listingId },
    data: { saveCount: { increment: 1 } }
  });

  return true;
};

export const unfavoriteMarketplaceListing = async (listingId: string, userId: string) => {
  await prisma.favorite.deleteMany({
    where: {
      userId,
        entityType: MARKETPLACE_FAVORITE_ENTITY_TYPE,
      entityId: listingId
    }
  });
  await prisma.marketplaceListing.updateMany({
    where: { id: listingId, saveCount: { gt: 0 } },
    data: { saveCount: { decrement: 1 } }
  });
  return true;
};

export const reportMarketplaceListing = async (listingId: string, reporterId: string, input: any) => {
  const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing) {
    const error = new Error('Listing not found');
    (error as any).status = 404;
    throw error;
  }
  const reason = String(input?.reason || '').trim();
  const details = String(input?.details || '').trim();
  if (!reason) {
    const error = new Error('Report reason is required');
    (error as any).status = 400;
    throw error;
  }

  const report = await prisma.marketplaceReport.create({
    data: {
      listingId,
      reporterId,
      reason,
      details: details || null
    }
  });

  await prisma.marketplaceListing.update({
    where: { id: listingId },
    data: { reportCount: { increment: 1 } }
  });

  notifyAdmins({
    type: 'marketplace.listing.reported',
    title: 'Marketplace listing reported',
    body: `${listing.title} was reported for ${reason}.`,
    link: `/dashboard/admin/marketplace/listings/${listingId}`
  });

  await publishIntegrationEvent('marketplace.listing.reported', {
    reportId: report.id,
    listingId,
    reporterId,
    reason
  });

  return report;
};

export const contactMarketplaceSeller = async (listingId: string, buyer: User, input: any) => {
  const listing = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    include: { seller: true }
  });
  if (!listing) {
    const error = new Error('Listing not found');
    (error as any).status = 404;
    throw error;
  }
  if (listing.sellerId === buyer.id) {
    const error = new Error('You cannot contact your own listing');
    (error as any).status = 400;
    throw error;
  }
  const message = String(input?.message || input?.body || '').trim();
  if (!message) {
    const error = new Error('Message is required');
    (error as any).status = 400;
    throw error;
  }

  const conversation = await ensureMarketplaceConversation(buyer.id, listing.sellerId);
  const directMessage = await prisma.directMessage.create({
    data: {
      conversationId: conversation.id,
      senderId: buyer.id,
      text: message,
      messageType: 'TEXT',
      metadata: {
        source: 'marketplace',
        listingId
      }
    }
  });
  await publishIntegrationEvent('marketplace.listing.contact_requested', {
    listingId,
    conversationId: conversation.id,
    messageId: directMessage.id,
    buyerId: buyer.id,
    sellerId: listing.sellerId
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageText: message,
      lastMessageAt: directMessage.createdAt,
      lastMessageSenderId: buyer.id
    }
  });

  const inquiry = await prisma.marketplaceInquiry.create({
    data: {
      listingId,
      buyerId: buyer.id,
      sellerId: listing.sellerId,
      message,
      conversationId: conversation.id
    }
  });

  notifyUser(listing.sellerId, {
    type: 'marketplace.inquiry.received',
    title: 'New marketplace inquiry',
    body: `${buyer.name || buyer.email || 'A buyer'} contacted you about ${listing.title}.`,
    link: `/messages?conversation=${conversation.id}`
  });

  return { inquiry, conversationId: conversation.id, messageId: directMessage.id };
};

export const attachMarketplaceMedia = async (listingId: string, user: User, input: any, allowAdmin = false) => {
  const listing = allowAdmin
    ? await prisma.marketplaceListing.findUnique({ where: { id: listingId } })
    : await assertListingOwnerOrAdmin(listingId, user.id, user.role);
  if (!listing) {
    const error = new Error('Listing not found');
    (error as any).status = 404;
    throw error;
  }

  const settings = await getMarketplaceSettings();
  const fileIds = Array.from(new Set(toStringArray(input?.fileIds || input?.fileId || input?.ids)));
  const mediaRecords = Array.isArray(input?.media)
    ? input.media
    : [];
  const type = String(input?.type || '').trim().toLowerCase();
  if (!fileIds.length && !mediaRecords.length) {
    const error = new Error('At least one file must be provided');
    (error as any).status = 400;
    throw error;
  }

  const existingMedia = await prisma.marketplaceListingMedia.count({ where: { listingId } });
  const existingImages = await prisma.marketplaceListingMedia.count({ where: { listingId, type: 'image' } });
  const existingVideos = await prisma.marketplaceListingMedia.count({ where: { listingId, type: 'video' } });

  const fileRows = fileIds.length
    ? await prisma.file.findMany({
        where: {
          id: { in: fileIds },
          ...(allowAdmin ? {} : { ownerId: user.id })
        }
      })
    : [];

  const mediaPayloads: any[] = [];
  let imageCount = existingImages;
  let videoCount = existingVideos;

  for (const file of fileRows) {
    const mimeType = String(file.mimeType || '').toLowerCase();
    const isImage = mimeType.startsWith('image/');
    const isVideo = mimeType.startsWith('video/');
    if (!isImage && !isVideo) continue;
    if (isImage && imageCount >= Number(settings.maxImagesPerListing || 10)) {
      const error = new Error(`Image limit reached (${settings.maxImagesPerListing || 10})`);
      (error as any).status = 400;
      throw error;
    }
    if (isVideo && videoCount >= Number(settings.maxVideosPerListing || 1)) {
      const error = new Error(`Video limit reached (${settings.maxVideosPerListing || 1})`);
      (error as any).status = 400;
      throw error;
    }
    mediaPayloads.push({
      listingId,
      fileId: file.id,
      type: isImage ? 'image' : 'video',
      url: file.url,
      storagePath: file.storageKey,
      thumbnailUrl: file.thumbnailUrl || null,
      sortOrder: existingMedia + mediaPayloads.length,
      mimeType: file.mimeType,
      sizeBytes: file.size,
      width: file.width || null,
      height: file.height || null,
      durationSeconds: file.duration || null
    });
    if (isImage) imageCount += 1;
    if (isVideo) videoCount += 1;
  }

  if (mediaRecords.length) {
    for (const media of mediaRecords) {
      const mediaType = String(media?.type || type || '').trim().toLowerCase();
      const url = String(media?.url || '').trim();
      const storagePath = String(media?.storagePath || media?.storage_key || '').trim() || url;
      if (!url) continue;
      if (mediaType === 'image' && imageCount >= Number(settings.maxImagesPerListing || 10)) {
        const error = new Error(`Image limit reached (${settings.maxImagesPerListing || 10})`);
        (error as any).status = 400;
        throw error;
      }
      if (mediaType === 'video' && videoCount >= Number(settings.maxVideosPerListing || 1)) {
        const error = new Error(`Video limit reached (${settings.maxVideosPerListing || 1})`);
        (error as any).status = 400;
        throw error;
      }
      mediaPayloads.push({
        listingId,
        fileId: media?.fileId ? String(media.fileId) : null,
        type: mediaType === 'video' ? 'video' : 'image',
        url,
        storagePath,
        thumbnailUrl: media?.thumbnailUrl ? String(media.thumbnailUrl) : null,
        sortOrder: existingMedia + mediaPayloads.length,
        mimeType: String(media?.mimeType || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg')),
        sizeBytes: BigInt(Math.max(0, Math.trunc(Number(media?.sizeBytes || media?.size || 0)))),
        width: media?.width !== undefined ? toInt(media.width, null as any) : null,
        height: media?.height !== undefined ? toInt(media.height, null as any) : null,
        durationSeconds: media?.durationSeconds !== undefined ? toNumber(media.durationSeconds, null as any) : null
      });
    }
  }

  if (!mediaPayloads.length) {
    const error = new Error('No valid media found');
    (error as any).status = 400;
    throw error;
  }

  const created = await prisma.marketplaceListingMedia.createMany({ data: mediaPayloads });

  // Link attached File rows as marketplace media so public content serving can
  // recognize them. Does not mutate legacy storage paths.
  try {
    const { syncFileUsages } = await import('../utils/fileUsage');
    const linkedFileIds = mediaPayloads
      .map((entry) => String(entry?.fileId || '').trim())
      .filter(Boolean);
    if (linkedFileIds.length) {
      await syncFileUsages('marketplace_listing_media', listingId, linkedFileIds, 'Marketplace Listing Media');
    }
  } catch (usageError) {
    console.warn('marketplace media file usage sync failed:', (usageError as any)?.message || usageError);
  }

  const refreshed = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    include: normalizeListingInclude
  });

  await prisma.marketplaceAuditLog.create({
    data: {
      listingId,
      actorId: user.id,
      action: 'media.attach',
      payload: { added: created.count } as JsonValue
    }
  }).catch(() => null);

  return normalizeListing(refreshed, user.id);
};

export const removeMarketplaceMedia = async (listingId: string, mediaId: string, user: User, allowAdmin = false) => {
  const listing = allowAdmin
    ? await prisma.marketplaceListing.findUnique({ where: { id: listingId } })
    : await assertListingOwnerOrAdmin(listingId, user.id, user.role);
  if (!listing) {
    const error = new Error('Listing not found');
    (error as any).status = 404;
    throw error;
  }
  const media = await prisma.marketplaceListingMedia.findFirst({ where: { id: mediaId, listingId } });
  if (!media) {
    const error = new Error('Media not found');
    (error as any).status = 404;
    throw error;
  }
  await prisma.marketplaceListingMedia.delete({ where: { id: mediaId } });
  const refreshed = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    include: normalizeListingInclude
  });
  await prisma.marketplaceAuditLog.create({
    data: {
      listingId,
      actorId: user.id,
      action: 'media.remove',
      payload: { mediaId } as JsonValue
    }
  }).catch(() => null);
  return normalizeListing(refreshed, user.id);
};

export const adminApproveMarketplaceListing = async (listingId: string, actor: User) => {
  const updated = await prisma.marketplaceListing.update({
    where: { id: listingId },
    data: {
      reviewStatus: 'approved',
      status: 'active',
      approvedAt: new Date(),
      rejectedAt: null,
      rejectionReason: null
    },
    include: normalizeListingInclude
  });
  await prisma.marketplaceAuditLog.create({
    data: { listingId, actorId: actor.id, action: 'admin.approve' }
  }).catch(() => null);
  notifyUser(updated.sellerId, {
    type: 'marketplace.listing.approved',
    title: 'Listing approved',
    body: `${updated.title} was approved by the admin team.`,
    link: `/marketplace/listing/${updated.slug}`
  });
  return normalizeListing(updated, actor.id);
};

export const adminRejectMarketplaceListing = async (listingId: string, actor: User, input: any) => {
  const reason = String(input?.reason || '').trim() || 'Rejected by admin';
  const updated = await prisma.marketplaceListing.update({
    where: { id: listingId },
    data: {
      reviewStatus: 'rejected',
      status: 'inactive',
      rejectedAt: new Date(),
      rejectionReason: reason
    },
    include: normalizeListingInclude
  });
  await prisma.marketplaceAuditLog.create({
    data: { listingId, actorId: actor.id, action: 'admin.reject', reason }
  }).catch(() => null);
  notifyUser(updated.sellerId, {
    type: 'marketplace.listing.rejected',
    title: 'Listing rejected',
    body: `${updated.title} was rejected. ${reason}`,
    link: `/marketplace/my-listings`
  });
  return normalizeListing(updated, actor.id);
};

export const adminSuspendMarketplaceListing = async (listingId: string, actor: User, reason?: string) => {
  const updated = await prisma.marketplaceListing.update({
    where: { id: listingId },
    data: {
      status: 'suspended'
    },
    include: normalizeListingInclude
  });
  await prisma.marketplaceAuditLog.create({
    data: { listingId, actorId: actor.id, action: 'admin.suspend', reason: reason || null }
  }).catch(() => null);
  notifyUser(updated.sellerId, {
    type: 'marketplace.listing.suspended',
    title: 'Listing suspended',
    body: `${updated.title} was suspended by the admin team.`,
    link: `/marketplace/my-listings`
  });
  return normalizeListing(updated, actor.id);
};

export const adminRestoreMarketplaceListing = async (listingId: string, actor: User) => {
  const updated = await prisma.marketplaceListing.update({
    where: { id: listingId },
    data: {
      status: 'active',
      reviewStatus: 'approved',
      removedAt: null
    },
    include: normalizeListingInclude
  });
  await prisma.marketplaceAuditLog.create({
    data: { listingId, actorId: actor.id, action: 'admin.restore' }
  }).catch(() => null);
  notifyUser(updated.sellerId, {
    type: 'marketplace.listing.restored',
    title: 'Listing restored',
    body: `${updated.title} was restored.`,
    link: `/marketplace/listing/${updated.slug}`
  });
  return normalizeListing(updated, actor.id);
};

export const adminFeatureMarketplaceListing = async (listingId: string, actor: User, featured: boolean) => {
  const updated = await prisma.marketplaceListing.update({
    where: { id: listingId },
    data: { featured, promoted: featured },
    include: normalizeListingInclude
  });
  await prisma.marketplaceAuditLog.create({
    data: { listingId, actorId: actor.id, action: featured ? 'admin.feature' : 'admin.unfeature' }
  }).catch(() => null);
  return normalizeListing(updated, actor.id);
};

export const adminDeleteMarketplaceListing = async (listingId: string, actor: User) => {
  const updated = await prisma.marketplaceListing.update({
    where: { id: listingId },
    data: { status: 'removed', removedAt: new Date() },
    include: normalizeListingInclude
  });
  await prisma.marketplaceAuditLog.create({
    data: { listingId, actorId: actor.id, action: 'admin.remove' }
  }).catch(() => null);
  notifyUser(updated.sellerId, {
    type: 'marketplace.listing.removed',
    title: 'Listing removed',
    body: `${updated.title} was removed by admin review.`,
    link: `/marketplace/my-listings`
  });
  return normalizeListing(updated, actor.id);
};

export const adminListMarketplaceReports = async (params: { page?: number; pageSize?: number; status?: string; search?: string }) => {
  const page = Math.max(1, toInt(params.page, 1));
  const pageSize = Math.min(100, Math.max(1, toInt(params.pageSize, 24)));
  const where: any = {};
  if (params.status) where.status = String(params.status).trim().toLowerCase();
  if (params.search) {
    const term = String(params.search).trim();
    if (term) {
      where.OR = [
        { reason: { contains: term, mode: 'insensitive' } },
        { details: { contains: term, mode: 'insensitive' } },
        { listing: { title: { contains: term, mode: 'insensitive' } } }
      ] as any;
    }
  }
  const [total, items] = await Promise.all([
    prisma.marketplaceReport.count({ where }),
    prisma.marketplaceReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        listing: { select: { id: true, title: true, slug: true, sellerId: true, status: true, reviewStatus: true } },
        reporter: { select: { id: true, name: true, username: true, email: true, avatar: true } },
        resolvedBy: { select: { id: true, name: true, email: true, avatar: true } }
      }
    })
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
};

export const adminResolveMarketplaceReport = async (reportId: string, actor: User, input: any) => {
  const report = await prisma.marketplaceReport.update({
    where: { id: reportId },
    data: {
      status: String(input?.status || 'resolved').trim().toLowerCase(),
      resolution: String(input?.resolution || '').trim() || null,
      resolvedById: actor.id,
      resolvedAt: new Date()
    },
    include: {
      listing: { select: { id: true, title: true, slug: true, sellerId: true } },
      reporter: { select: { id: true, name: true, email: true } },
      resolvedBy: { select: { id: true, name: true, email: true } }
    }
  });
  await prisma.marketplaceAuditLog.create({
    data: {
      listingId: report.listingId,
      actorId: actor.id,
      action: 'admin.report.resolve',
      payload: { reportId, status: report.status, resolution: report.resolution } as JsonValue
    }
  }).catch(() => null);
  return report;
};

export const adminListMarketplaceCategories = async () => {
  await ensureMarketplaceCategoriesSeeded();
  return prisma.category.findMany({
    where: { type: { in: ['MARKETPLACE', 'BOTH'] as any } },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    include: { children: true }
  });
};

export const adminUpsertMarketplaceCategory = async (input: any, actor: User, categoryId?: string) => {
  const name = String(input?.name || '').trim();
  const slug = slugify(input?.slug || name);
  if (!name) {
    const error = new Error('Category name is required');
    (error as any).status = 400;
    throw error;
  }
  const data = {
    name,
    slug,
    icon: String(input?.icon || '').trim() || null,
    description: String(input?.description || '').trim() || null,
    type: String(input?.type || 'MARKETPLACE').trim().toUpperCase() as any,
    isActive: input?.isActive !== false,
    order: toInt(input?.order, 0),
    parentId: String(input?.parentId || '').trim() || null
  };
  const row = categoryId
    ? await prisma.category.update({ where: { id: categoryId }, data })
    : await prisma.category.create({ data });

  await prisma.marketplaceAuditLog.create({
    data: {
      action: categoryId ? 'admin.category.update' : 'admin.category.create',
      actorId: actor.id,
      payload: row as JsonValue
    }
  }).catch(() => null);

  return row;
};

export const adminDeleteMarketplaceCategory = async (categoryId: string, actor: User) => {
  const row = await prisma.category.update({
    where: { id: categoryId },
    data: { isActive: false }
  });
  await prisma.marketplaceAuditLog.create({
    data: {
      action: 'admin.category.disable',
      actorId: actor.id,
      payload: row as JsonValue
    }
  }).catch(() => null);
  return row;
};

export const adminListMarketplaceListings = async (params: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string | null;
  reviewStatus?: string | null;
  categoryId?: string | null;
  sellerId?: string | null;
  reported?: boolean;
  featured?: boolean;
  sort?: string | null;
}) => {
  const page = Math.max(1, toInt(params.page, 1));
  const pageSize = Math.min(100, Math.max(1, toInt(params.pageSize, 24)));
  const where: any = {};
  if (params.status) where.status = normalizeStatus(params.status);
  if (params.reviewStatus) where.reviewStatus = normalizeReviewStatus(params.reviewStatus);
  if (params.categoryId) where.categoryId = String(params.categoryId);
  if (params.sellerId) where.sellerId = String(params.sellerId);
  if (params.reported) where.reportCount = { gt: 0 } as any;
  if (params.featured !== undefined) where.featured = Boolean(params.featured);
  if (params.search) {
    const term = String(params.search).trim();
    if (term) {
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { location: { contains: term, mode: 'insensitive' } },
        { seller: { name: { contains: term, mode: 'insensitive' } } },
        { seller: { email: { contains: term, mode: 'insensitive' } } }
      ] as any;
    }
  }
  const sort = String(params.sort || 'newest').toLowerCase();
  const orderBy =
    sort === 'price_asc'
      ? [{ price: 'asc' as const }, { createdAt: 'desc' as const }]
      : sort === 'price_desc'
        ? [{ price: 'desc' as const }, { createdAt: 'desc' as const }]
        : sort === 'popular'
          ? [{ viewCount: 'desc' as const }, { createdAt: 'desc' as const }]
          : [{ createdAt: 'desc' as const }];
  const [total, items] = await Promise.all([
    prisma.marketplaceListing.count({ where }),
    prisma.marketplaceListing.findMany({
      where,
      include: normalizeListingInclude,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);
  return { items: items.map((row) => normalizeListing(row)).filter(Boolean), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
};

export const getMarketplaceDashboardCounts = async (userId: string) => {
  const [active, pending, sold, drafts, favorites] = await Promise.all([
    prisma.marketplaceListing.count({ where: { sellerId: userId, status: 'active', removedAt: null } }),
    prisma.marketplaceListing.count({ where: { sellerId: userId, reviewStatus: 'pending', removedAt: null } }),
    prisma.marketplaceListing.count({ where: { sellerId: userId, status: 'sold' } }),
    prisma.marketplaceListing.count({ where: { sellerId: userId, status: 'draft' } }),
      prisma.favorite.count({ where: { userId, entityType: MARKETPLACE_FAVORITE_ENTITY_TYPE as any } })
  ]);
  return { active, pending, sold, drafts, favorites };
};
