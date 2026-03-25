import prisma from '../utils/prismaClient';
import {
  ContentOfferSettingsNormalized,
  DEFAULT_CONTENT_OFFER_SETTINGS,
  isContentOfferRoleEnabled,
  normalizeContentOfferSettings
} from '../utils/contentOfferSettings';

export type ContentOfferSurface = 'post' | 'scroll' | 'live';

type RequestedContentOfferTag = {
  offerType: 'user_gig' | 'business_package';
  offerId: string;
};

type ResolveContentOfferTagsContext = {
  actorUserId: string;
  actorRole?: string | null;
  contentType: ContentOfferSurface;
  businessPageId?: string | null;
};

type StoredContentOfferTag = {
  id: string;
  offerType: 'user_gig' | 'business_package';
  offerId: string;
  ownerType: 'user' | 'business';
  ownerId: string;
  ownerUserId: string | null;
  pageId: string | null;
  pageSlug: string | null;
  ownerName: string | null;
  profileUsername: string | null;
  title: string;
  summary: string | null;
  price: number | null;
  currency: string | null;
  category: string | null;
  imageUrl: string | null;
  storefrontUrl: string | null;
  messageUserId: string | null;
  ctas: {
    storefront: boolean;
    message: boolean;
    brief: boolean;
  };
};

type BusinessPageServicePackage = {
  id: string;
  title: string;
  summary: string | null;
  price: number;
  currency: string;
  active: boolean;
};

const BUSINESS_PAGE_PACKAGES_SCOPE_PREFIX = 'community.business_page.packages.';

const packageSettingScope = (pageId: string) => `${BUSINESS_PAGE_PACKAGES_SCOPE_PREFIX}${pageId}`;

const failWithStatus = (message: string, statusCode: number) => {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const toUniqueSelections = (raw: any): RequestedContentOfferTag[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const rows: RequestedContentOfferTag[] = [];
  for (const entry of raw) {
    const offerType = String(entry?.offerType || entry?.type || '').trim().toLowerCase();
    const offerId = String(entry?.offerId || entry?.id || '').trim();
    if (!offerId) continue;
    if (offerType !== 'user_gig' && offerType !== 'business_package') continue;
    const key = `${offerType}:${offerId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ offerType: offerType as RequestedContentOfferTag['offerType'], offerId });
  }
  return rows;
};

const cleanOptionalText = (value: any, maxLength: number) => {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.slice(0, maxLength);
};

const cleanOptionalUrl = (value: any) => {
  const text = String(value || '').trim();
  return text ? text : null;
};

const normalizeBusinessPagePackages = (value: unknown) => {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((entry) => {
      const payload = (entry || {}) as Record<string, any>;
      const title = cleanOptionalText(payload.title, 140);
      if (!title) return null;
      const numericPrice = Number(payload.price);
      return {
        id: String(payload.id || '').trim(),
        title,
        summary: cleanOptionalText(payload.summary, 320),
        price: Number.isFinite(numericPrice) ? Math.max(0, Number(numericPrice.toFixed(2))) : 0,
        currency: cleanOptionalText(payload.currency, 3)?.toUpperCase() || 'USD',
        active: payload.active !== false
      } as BusinessPageServicePackage;
    })
    .filter((entry): entry is BusinessPageServicePackage => Boolean(entry?.id));
};

const readBusinessPagePackages = async (pageId: string) => {
  const row = await prisma.appSetting.findUnique({ where: { scope: packageSettingScope(pageId) } });
  const data = row?.data as any;
  const source = Array.isArray(data?.packages) ? data.packages : Array.isArray(data) ? data : [];
  return normalizeBusinessPagePackages(source);
};

const isSurfaceEnabled = (
  settings: ContentOfferSettingsNormalized,
  contentType: ContentOfferSurface,
  actorRole?: string | null
) => {
  if (!settings.enabled || !isContentOfferRoleEnabled(settings, actorRole)) return false;
  if (contentType === 'post') return settings.postsEnabled;
  if (contentType === 'scroll') return settings.scrollEnabled;
  return settings.liveEnabled;
};

const normalizeRestrictedCategories = (settings: ContentOfferSettingsNormalized) =>
  new Set(
    (settings.restrictedCategories || [])
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter(Boolean)
  );

const buildGigStorefrontUrl = (gig: any) => {
  const username = cleanOptionalText(gig?.user?.username, 120);
  if (username) return `/u/${encodeURIComponent(username.replace(/^@+/, ''))}?tab=storefront`;
  return `/profile/${encodeURIComponent(String(gig?.userId || '').trim())}?tab=storefront`;
};

const buildBusinessStorefrontUrl = (page: any) =>
  cleanOptionalText(page?.slug, 160)
    ? `/company/${encodeURIComponent(String(page.slug).trim())}?tab=storefront`
    : null;

export const getContentOfferSettings = async (): Promise<ContentOfferSettingsNormalized> => {
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
    return normalizeContentOfferSettings(
      (record?.data as any)?.contentOffers ??
        (record?.data as any)?.content_offers ??
        (record?.data as any)?.contentOfferTags ??
        (record?.data as any)?.content_offer_tags
    );
  } catch {
    return DEFAULT_CONTENT_OFFER_SETTINGS;
  }
};

export const normalizeStoredContentOfferTags = (raw: any): StoredContentOfferTag[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const payload = entry && typeof entry === 'object' ? entry : {};
      const offerType = String(payload.offerType || payload.offer_type || '').trim().toLowerCase();
      const offerId = String(payload.offerId || payload.offer_id || '').trim();
      if (!offerId || (offerType !== 'user_gig' && offerType !== 'business_package')) return null;
      const storefront = payload.storefrontUrl ?? payload.storefront_url;
      const messageUserId = payload.messageUserId ?? payload.message_user_id;
      const ctas = payload.ctas && typeof payload.ctas === 'object' ? payload.ctas : {};
      return {
        id: String(payload.id || `${offerType}:${offerId}`),
        offerType: offerType as StoredContentOfferTag['offerType'],
        offerId,
        ownerType: String(payload.ownerType || payload.owner_type || 'user').trim().toLowerCase() === 'business' ? 'business' : 'user',
        ownerId: String(payload.ownerId || payload.owner_id || '').trim(),
        ownerUserId: cleanOptionalText(payload.ownerUserId ?? payload.owner_user_id, 120),
        pageId: cleanOptionalText(payload.pageId ?? payload.page_id, 120),
        pageSlug: cleanOptionalText(payload.pageSlug ?? payload.page_slug, 160),
        ownerName: cleanOptionalText(payload.ownerName ?? payload.owner_name, 160),
        profileUsername: cleanOptionalText(payload.profileUsername ?? payload.profile_username, 160),
        title: cleanOptionalText(payload.title, 180) || 'Offer',
        summary: cleanOptionalText(payload.summary, 320),
        price: payload.price === null || payload.price === undefined ? null : Number(payload.price),
        currency: cleanOptionalText(payload.currency, 8),
        category: cleanOptionalText(payload.category, 120),
        imageUrl: cleanOptionalUrl(payload.imageUrl ?? payload.image_url),
        storefrontUrl: cleanOptionalText(storefront, 300),
        messageUserId: cleanOptionalText(messageUserId, 120),
        ctas: {
          storefront: ctas.storefront !== false,
          message: ctas.message !== false,
          brief: ctas.brief !== false
        }
      } as StoredContentOfferTag;
    })
    .filter((entry): entry is StoredContentOfferTag => Boolean(entry?.offerId));
};

export const resolveSubmittedContentOfferTags = async (
  raw: any,
  context: ResolveContentOfferTagsContext
) => {
  const requested = toUniqueSelections(raw);
  if (!requested.length) return [];

  const settings = await getContentOfferSettings();
  if (!isSurfaceEnabled(settings, context.contentType, context.actorRole)) {
    throw failWithStatus('Content offer tags are disabled for this surface.', 403);
  }
  if (requested.length > Number(settings.maxTagsPerContent || 3)) {
    throw failWithStatus(`You can tag up to ${Number(settings.maxTagsPerContent || 3)} offers per content item.`, 400);
  }

  const restrictedCategories = normalizeRestrictedCategories(settings);
  const gigSelections = requested.filter((entry) => entry.offerType === 'user_gig');
  const packageSelections = requested.filter((entry) => entry.offerType === 'business_package');

  const gigIds = gigSelections.map((entry) => entry.offerId);
  const packageIds = packageSelections.map((entry) => entry.offerId);

  const [gigs, page] = await Promise.all([
    gigIds.length
      ? prisma.gig.findMany({
          where: { id: { in: gigIds } },
          select: {
            id: true,
            title: true,
            description: true,
            price: true,
            image: true,
            status: true,
            adminStatus: true,
            isActive: true,
            userId: true,
            category: { select: { name: true } },
            user: { select: { id: true, name: true, username: true } }
          }
        })
      : Promise.resolve([]),
    packageIds.length && context.businessPageId
      ? prisma.communityBusinessPage.findUnique({
          where: { id: String(context.businessPageId) },
          select: {
            id: true,
            ownerId: true,
            name: true,
            slug: true,
            category: true,
            industry: true
          }
        })
      : Promise.resolve(null)
  ]);

  const gigMap = new Map<string, any>((gigs as any[]).map((gig) => [String(gig.id), gig]));
  const packageMap = new Map<string, BusinessPageServicePackage>();
  if (packageIds.length) {
    if (!context.businessPageId) {
      throw failWithStatus('Business page offers require a business page context.', 400);
    }
    if (!page) {
      throw failWithStatus('Business page not found for tagged offers.', 404);
    }
    if (String(page.ownerId || '') !== String(context.actorUserId || '').trim()) {
      const normalizedRole = String(context.actorRole || '').toLowerCase();
      if (!normalizedRole.includes('admin')) {
        throw failWithStatus('You cannot tag offers from a business page you do not manage.', 403);
      }
    }
    const packages = await readBusinessPagePackages(String(context.businessPageId));
    packages.forEach((entry) => packageMap.set(String(entry.id), entry));
  }

  return requested.map((entry) => {
    if (entry.offerType === 'user_gig') {
      if (!settings.modules.userGigs) {
        throw failWithStatus('User storefront gig tags are disabled by platform policy.', 403);
      }
      const gig = gigMap.get(entry.offerId);
      if (!gig) {
        throw failWithStatus('One or more tagged services could not be found.', 404);
      }
      const ownerId = String(gig.userId || '').trim();
      if (ownerId !== String(context.actorUserId || '').trim()) {
        const normalizedRole = String(context.actorRole || '').toLowerCase();
        if (!normalizedRole.includes('admin')) {
          throw failWithStatus('You can only tag services from your own storefront.', 403);
        }
      }
      if (!gig.isActive || String(gig.status || '').toLowerCase() !== 'active' || String(gig.adminStatus || '').toLowerCase() !== 'approved') {
        throw failWithStatus('Tagged services must be active and approved before they can appear in content.', 400);
      }
      const category = cleanOptionalText(gig?.category?.name, 120);
      if (category && restrictedCategories.has(category.toLowerCase())) {
        if (settings.moderationMode === 'strict') {
          throw failWithStatus(`The "${category}" category is restricted for content tagging.`, 400);
        }
      }
      return {
        id: `user_gig:${gig.id}`,
        offerType: 'user_gig',
        offerId: String(gig.id),
        ownerType: 'user',
        ownerId,
        ownerUserId: ownerId,
        pageId: null,
        pageSlug: null,
        ownerName: cleanOptionalText(gig?.user?.name, 160),
        profileUsername: cleanOptionalText(gig?.user?.username, 120),
        title: cleanOptionalText(gig.title, 180) || 'Service',
        summary: cleanOptionalText(gig.description, 320),
        price: Number.isFinite(Number(gig.price)) ? Number(Number(gig.price).toFixed(2)) : null,
        currency: 'USD',
        category,
        imageUrl: cleanOptionalUrl(gig.image),
        storefrontUrl: buildGigStorefrontUrl(gig),
        messageUserId: ownerId,
        ctas: {
          storefront: settings.modules.storefrontCta,
          message: settings.modules.messageCta,
          brief: settings.modules.briefCta
        }
      } as StoredContentOfferTag;
    }

    if (!settings.modules.businessPackages) {
      throw failWithStatus('Business packaged offer tags are disabled by platform policy.', 403);
    }
    const pkg = packageMap.get(entry.offerId);
    if (!pkg) {
      throw failWithStatus('One or more tagged business offers could not be found.', 404);
    }
    if (!pkg.active) {
      throw failWithStatus('Tagged business offers must be active before they can appear in content.', 400);
    }
    const category = cleanOptionalText(page?.category || page?.industry, 120);
    if (category && restrictedCategories.has(category.toLowerCase())) {
      if (settings.moderationMode === 'strict') {
        throw failWithStatus(`The "${category}" category is restricted for content tagging.`, 400);
      }
    }
    return {
      id: `business_package:${pkg.id}`,
      offerType: 'business_package',
      offerId: String(pkg.id),
      ownerType: 'business',
      ownerId: String(page?.id || ''),
      ownerUserId: cleanOptionalText(page?.ownerId, 120),
      pageId: cleanOptionalText(page?.id, 120),
      pageSlug: cleanOptionalText(page?.slug, 160),
      ownerName: cleanOptionalText(page?.name, 160),
      profileUsername: null,
      title: pkg.title,
      summary: cleanOptionalText(pkg.summary, 320),
      price: Number.isFinite(Number(pkg.price)) ? Number(Number(pkg.price).toFixed(2)) : null,
      currency: cleanOptionalText(pkg.currency, 8),
      category,
      imageUrl: null,
      storefrontUrl: buildBusinessStorefrontUrl(page),
      messageUserId: cleanOptionalText(page?.ownerId, 120),
      ctas: {
        storefront: settings.modules.storefrontCta,
        message: settings.modules.messageCta,
        brief: settings.modules.briefCta
      }
    } as StoredContentOfferTag;
  });
};
