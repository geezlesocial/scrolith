import api from './api';
import {
  MarketplaceCategory,
  MarketplaceDashboard,
  MarketplaceListing,
  MarketplaceListingFormValues,
  MarketplaceListingMedia,
  MarketplaceQuery,
  MarketplaceReport,
  MarketplaceSettings
} from '../types/marketplace';

const extractData = <T>(response: any): T => response?.data?.data ?? response?.data ?? response;

const normalizeNumber = (value: any) => {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeBoolean = (value: any) => Boolean(value === true || value === 'true' || value === 1 || value === '1');

const normalizeCategory = (category: any): MarketplaceCategory => ({
  ...category,
  id: String(category?.id ?? category?._id ?? ''),
  name: String(category?.name ?? category?.title ?? '').trim(),
  slug: category?.slug ?? category?.code ?? undefined,
  description: category?.description ?? null,
  parentId: category?.parentId ?? category?.parent_id ?? null,
  parent_id: category?.parent_id ?? category?.parentId ?? null,
  sortOrder: category?.sortOrder ?? category?.sort_order ?? 0,
  sort_order: category?.sort_order ?? category?.sortOrder ?? 0,
  isActive: category?.isActive ?? category?.is_active ?? true,
  is_active: category?.is_active ?? category?.isActive ?? true,
  requiresApproval: category?.requiresApproval ?? category?.requires_approval ?? false,
  requires_approval: category?.requires_approval ?? category?.requiresApproval ?? false,
  subcategories: Array.isArray(category?.subcategories) ? category.subcategories.map(normalizeCategory) : []
});

const normalizeMedia = (media: any): MarketplaceListingMedia => ({
  ...media,
  id: String(media?.id ?? media?._id ?? ''),
  type: media?.type === 'video' ? 'video' : 'image',
  url: String(media?.url ?? media?.downloadUrl ?? media?.download_url ?? ''),
  storagePath: media?.storagePath ?? media?.storage_path ?? null,
  thumbnailUrl: media?.thumbnailUrl ?? media?.thumbnail_url ?? null,
  sortOrder: media?.sortOrder ?? media?.sort_order ?? 0,
  mimeType: media?.mimeType ?? media?.mime_type ?? null,
  sizeBytes: media?.sizeBytes ?? media?.size_bytes ?? null,
  width: media?.width ?? null,
  height: media?.height ?? null,
  durationSeconds: media?.durationSeconds ?? media?.duration_seconds ?? null
});

const normalizeListing = (listing: any): MarketplaceListing => {
  const mediaSource = Array.isArray(listing?.media) ? listing.media : [];
  const imageSource = Array.isArray(listing?.images) ? listing.images : mediaSource;
  const normalizedMedia = imageSource
    .map((media: any) => (typeof media === 'string' ? media : normalizeMedia(media)))
    .filter(Boolean);
  const images = normalizedMedia.filter((media: any) => typeof media === 'string' || media?.type !== 'video');
  const videoSource = listing?.video
    ? (typeof listing.video === 'string' ? listing.video : normalizeMedia(listing.video))
    : normalizedMedia.find((media: any) => typeof media !== 'string' && media?.type === 'video') || null;
  const coverImage =
    listing?.coverImage ||
    listing?.cover_image ||
    (Array.isArray(images) && images.length > 0 ? (typeof images[0] === 'string' ? images[0] : images[0]?.url) : null) ||
    null;

  const rawStatus = String(listing?.status ?? 'draft').trim().toLowerCase();
  const normalizedStatus = rawStatus === 'inactive' ? 'removed' : rawStatus;

  return {
    ...listing,
    id: String(listing?.id ?? listing?._id ?? ''),
    sellerId: String(listing?.sellerId ?? listing?.seller_id ?? listing?.userId ?? listing?.user_id ?? ''),
    title: String(listing?.title ?? '').trim(),
    slug: listing?.slug ?? undefined,
    description: listing?.description ?? null,
    categoryId: listing?.categoryId ?? listing?.category_id ?? null,
    subcategoryId: listing?.subcategoryId ?? listing?.subcategory_id ?? null,
    condition: listing?.condition ?? 'other',
    brand: listing?.brand ?? null,
    tags: Array.isArray(listing?.tags) ? listing.tags.map(String) : [],
    price: listing?.price ?? 0,
    currency: listing?.currency ?? 'USD',
    negotiable: normalizeBoolean(listing?.negotiable),
    quantity: normalizeNumber(listing?.quantity || 1),
    location: listing?.location ?? null,
    latitude: listing?.latitude ?? null,
    longitude: listing?.longitude ?? null,
    meetupPreferences: Array.isArray(listing?.meetupPreferences)
      ? listing.meetupPreferences
      : Array.isArray(listing?.meetup_preferences)
        ? listing.meetup_preferences
        : [],
    hideFromFriendsAndFollowers:
      normalizeBoolean(
        listing?.hideFromFriendsAndFollowers ?? listing?.hide_from_friends_and_followers
      ),
    deliveryOptions: Array.isArray(listing?.deliveryOptions)
      ? listing.deliveryOptions
      : Array.isArray(listing?.delivery_options)
        ? listing.delivery_options
        : [],
    paymentMethods: Array.isArray(listing?.paymentMethods)
      ? listing.paymentMethods
      : Array.isArray(listing?.payment_methods)
        ? listing.payment_methods
        : [],
    images,
    video: videoSource,
    status: normalizedStatus,
    reviewStatus: listing?.reviewStatus ?? listing?.review_status ?? 'draft',
    rejectionReason: listing?.rejectionReason ?? listing?.rejection_reason ?? null,
    adminNotes: listing?.adminNotes ?? listing?.admin_notes ?? null,
    featured: normalizeBoolean(listing?.featured ?? listing?.is_featured),
    viewCount: normalizeNumber(listing?.viewCount ?? listing?.view_count),
    saveCount: normalizeNumber(listing?.saveCount ?? listing?.save_count),
    reportCount: normalizeNumber(listing?.reportCount ?? listing?.report_count),
    soldAt: listing?.soldAt ?? listing?.sold_at ?? null,
    reservedAt: listing?.reservedAt ?? listing?.reserved_at ?? null,
    approvedAt: listing?.approvedAt ?? listing?.approved_at ?? null,
    rejectedAt: listing?.rejectedAt ?? listing?.rejected_at ?? null,
    removedAt: listing?.removedAt ?? listing?.removed_at ?? null,
    createdAt: listing?.createdAt ?? listing?.created_at ?? undefined,
    updatedAt: listing?.updatedAt ?? listing?.updated_at ?? undefined,
    contactPreference: listing?.contactPreference ?? listing?.contact_preference ?? null,
    phoneNumber: listing?.phoneNumber ?? listing?.phone_number ?? null,
    coverImage,
    distanceKm: listing?.distanceKm ?? listing?.distance_km ?? null
  } as MarketplaceListing;
};

const normalizeSettings = (settings: any): MarketplaceSettings => ({
  ...settings,
  enabled: settings?.enabled ?? settings?.marketplaceEnabled ?? settings?.marketplace_enabled ?? false,
  publicBrowsing: settings?.publicBrowsing ?? settings?.public_browsing ?? true,
  approvalMode: settings?.approvalMode ?? settings?.approval_mode ?? 'manual',
  maxImages: normalizeNumber(settings?.maxImages ?? settings?.max_images ?? 10) || 10,
  maxVideos: normalizeNumber(settings?.maxVideos ?? settings?.max_videos ?? 1) || 1,
  maxPrice: settings?.maxPrice ?? settings?.max_price ?? null,
  allowCOD: settings?.allowCOD ?? settings?.allow_cod ?? false,
  allowOnlinePayments: settings?.allowOnlinePayments ?? settings?.allow_online_payments ?? false,
  allowBuyerMessaging: settings?.allowBuyerMessaging ?? settings?.allow_buyer_messaging ?? true,
  requireApprovalForVideo: settings?.requireApprovalForVideo ?? settings?.require_approval_for_video ?? false,
  requireApprovalForNewSellers:
    settings?.requireApprovalForNewSellers ?? settings?.require_approval_for_new_sellers ?? false,
  allowedPaymentMethods: Array.isArray(settings?.allowedPaymentMethods)
    ? settings.allowedPaymentMethods
    : Array.isArray(settings?.allowed_payment_methods)
      ? settings.allowed_payment_methods
      : Array.isArray(settings?.enabledPaymentMethods)
        ? settings.enabledPaymentMethods
        : Array.isArray(settings?.paymentMethods)
          ? settings.paymentMethods
          : undefined,
  paymentMethods: Array.isArray(settings?.paymentMethods)
    ? settings.paymentMethods
    : Array.isArray(settings?.payment_methods)
      ? settings.payment_methods
      : [],
  enabledPaymentMethods: Array.isArray(settings?.enabledPaymentMethods)
    ? settings.enabledPaymentMethods
    : Array.isArray(settings?.enabled_payment_methods)
      ? settings.enabled_payment_methods
      : [],
  reportingReasons: Array.isArray(settings?.reportingReasons)
    ? settings.reportingReasons
    : Array.isArray(settings?.reporting_reasons)
      ? settings.reporting_reasons
      : [],
  categoriesRequireApproval: Array.isArray(settings?.categoriesRequireApproval)
    ? settings.categoriesRequireApproval
    : Array.isArray(settings?.categories_require_approval)
      ? settings.categories_require_approval
      : [],
  sellerLimits: settings?.sellerLimits ?? settings?.seller_limits ?? undefined,
  commission: settings?.commission ?? settings?.commissionConfig ?? undefined
});

export const getMarketplaceSettings = async () => {
  const response = await api.get('/marketplace/settings');
  return normalizeSettings(extractData<any>(response));
};

export const getMarketplaceCategories = async () => {
  const response = await api.get('/marketplace/categories');
  const data = extractData<any[]>(response);
  return Array.isArray(data) ? data.map(normalizeCategory) : [];
};

export const listMarketplaceListings = async (query: MarketplaceQuery = {}) => {
  const response = await api.get('/marketplace/listings', { params: query });
  const data = extractData<any>(response);
  if (Array.isArray(data)) return data.map(normalizeListing);
  if (Array.isArray(data?.listings)) {
    return {
      ...data,
      listings: data.listings.map(normalizeListing)
    };
  }
  if (Array.isArray(data?.items)) {
    return {
      ...data,
      items: data.items.map(normalizeListing),
      listings: data.items.map(normalizeListing)
    };
  }
  return data;
};

export const getMarketplaceListing = async (idOrSlug: string) => {
  const response = await api.get(`/marketplace/listings/${encodeURIComponent(idOrSlug)}`);
  return normalizeListing(extractData<any>(response));
};

export const createMarketplaceListing = async (payload: Record<string, unknown>) => {
  const response = await api.post('/marketplace/listings', payload);
  return normalizeListing(extractData<any>(response));
};

export const updateMarketplaceListing = async (id: string, payload: Record<string, unknown>) => {
  const response = await api.put(`/marketplace/listings/${encodeURIComponent(id)}`, payload);
  return normalizeListing(extractData<any>(response));
};

export const archiveMarketplaceListing = async (id: string) => {
  const response = await api.delete(`/marketplace/listings/${encodeURIComponent(id)}`);
  return extractData<any>(response);
};

export const submitMarketplaceListing = async (id: string) => {
  const response = await api.post(`/marketplace/listings/${encodeURIComponent(id)}/submit`);
  return extractData<any>(response);
};

export const reserveMarketplaceListing = async (id: string) => {
  const response = await api.post(`/marketplace/listings/${encodeURIComponent(id)}/reserve`);
  return extractData<any>(response);
};

export const markMarketplaceListingSold = async (id: string) => {
  const response = await api.post(`/marketplace/listings/${encodeURIComponent(id)}/mark-sold`);
  return extractData<any>(response);
};

export const favoriteMarketplaceListing = async (id: string) => {
  const response = await api.post(`/marketplace/listings/${encodeURIComponent(id)}/favorite`);
  return extractData<any>(response);
};

export const unfavoriteMarketplaceListing = async (id: string) => {
  const response = await api.delete(`/marketplace/listings/${encodeURIComponent(id)}/favorite`);
  return extractData<any>(response);
};

export const reportMarketplaceListing = async (id: string, payload: Record<string, unknown>) => {
  const response = await api.post(`/marketplace/listings/${encodeURIComponent(id)}/report`, payload);
  return extractData<any>(response);
};

export const contactMarketplaceSeller = async (id: string, payload: Record<string, unknown>) => {
  const response = await api.post(`/marketplace/listings/${encodeURIComponent(id)}/contact`, payload);
  return extractData<any>(response);
};

export const uploadMarketplaceListingMedia = async (id: string, fileIds: string[] | { fileIds?: string[] } | string) => {
  const normalizedFileIds = Array.isArray(fileIds)
    ? fileIds
    : typeof fileIds === 'string'
      ? [fileIds]
      : Array.isArray(fileIds?.fileIds)
        ? fileIds.fileIds
        : [];

  const response = await api.post(`/marketplace/listings/${encodeURIComponent(id)}/media`, {
    fileIds: normalizedFileIds
  });
  return extractData<any>(response);
};

export const deleteMarketplaceListingMedia = async (id: string, mediaId: string) => {
  const response = await api.delete(`/marketplace/listings/${encodeURIComponent(id)}/media/${encodeURIComponent(mediaId)}`);
  return extractData<any>(response);
};

export const getMarketplaceDashboard = async () => {
  const response = await api.get('/marketplace/dashboard');
  return extractData<MarketplaceDashboard>(response);
};

export const listFavorites = async () => {
  const response = await api.get('/favorites');
  return extractData<any>(response);
};
