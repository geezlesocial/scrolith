import type { ContentOfferSettings, ContentOfferTag, Gig } from '../types'
import type { BusinessPageServicePackage } from '../services/community'

export type OfferTagSelection = {
  offerType: 'user_gig' | 'business_package'
  offerId: string
}

export type OfferTagOption = OfferTagSelection & {
  title: string
  summary?: string | null
  price?: number | null
  currency?: string | null
  category?: string | null
}

export const DEFAULT_CONTENT_OFFER_SETTINGS: ContentOfferSettings = {
  enabled: true,
  postsEnabled: true,
  scrollEnabled: true,
  liveEnabled: true,
  roles: {
    user: true,
    freelancer: true,
    employer: true,
    business: true,
    admin: true
  },
  modules: {
    userGigs: true,
    businessPackages: true,
    storefrontCta: true,
    messageCta: true,
    briefCta: true
  },
  maxTagsPerContent: 3,
  moderationMode: 'off',
  restrictedCategories: []
}

const toBoolean = (value: any, fallback: boolean) => {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'boolean') return value
  const normalized = String(value).trim().toLowerCase()
  if (!normalized) return fallback
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'off'].includes(normalized)) return false
  return fallback
}

const toNumber = (value: any, fallback: number, min: number, max: number) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, Math.round(numeric)))
}

export const normalizeContentOfferSettings = (raw: any): ContentOfferSettings => {
  const source = raw && typeof raw === 'object' ? raw : {}
  const roles = source.roles && typeof source.roles === 'object' ? source.roles : {}
  const modules = source.modules && typeof source.modules === 'object' ? source.modules : {}

  return {
    enabled: toBoolean(source.enabled, Boolean(DEFAULT_CONTENT_OFFER_SETTINGS.enabled)),
    postsEnabled: toBoolean(
      source.postsEnabled ?? source.posts_enabled,
      Boolean(DEFAULT_CONTENT_OFFER_SETTINGS.postsEnabled)
    ),
    scrollEnabled: toBoolean(
      source.scrollEnabled ?? source.scroll_enabled,
      Boolean(DEFAULT_CONTENT_OFFER_SETTINGS.scrollEnabled)
    ),
    liveEnabled: toBoolean(
      source.liveEnabled ?? source.live_enabled,
      Boolean(DEFAULT_CONTENT_OFFER_SETTINGS.liveEnabled)
    ),
    roles: {
      user: toBoolean(roles.user, Boolean(DEFAULT_CONTENT_OFFER_SETTINGS.roles?.user)),
      freelancer: toBoolean(roles.freelancer, Boolean(DEFAULT_CONTENT_OFFER_SETTINGS.roles?.freelancer)),
      employer: toBoolean(roles.employer, Boolean(DEFAULT_CONTENT_OFFER_SETTINGS.roles?.employer)),
      business: toBoolean(roles.business, Boolean(DEFAULT_CONTENT_OFFER_SETTINGS.roles?.business)),
      admin: toBoolean(roles.admin, Boolean(DEFAULT_CONTENT_OFFER_SETTINGS.roles?.admin))
    },
    modules: {
      userGigs: toBoolean(
        modules.userGigs ?? modules.user_gigs,
        Boolean(DEFAULT_CONTENT_OFFER_SETTINGS.modules?.userGigs)
      ),
      businessPackages: toBoolean(
        modules.businessPackages ?? modules.business_packages,
        Boolean(DEFAULT_CONTENT_OFFER_SETTINGS.modules?.businessPackages)
      ),
      storefrontCta: toBoolean(
        modules.storefrontCta ?? modules.storefront_cta,
        Boolean(DEFAULT_CONTENT_OFFER_SETTINGS.modules?.storefrontCta)
      ),
      messageCta: toBoolean(
        modules.messageCta ?? modules.message_cta,
        Boolean(DEFAULT_CONTENT_OFFER_SETTINGS.modules?.messageCta)
      ),
      briefCta: toBoolean(
        modules.briefCta ?? modules.brief_cta,
        Boolean(DEFAULT_CONTENT_OFFER_SETTINGS.modules?.briefCta)
      )
    },
    maxTagsPerContent: toNumber(
      source.maxTagsPerContent ?? source.max_tags_per_content,
      Number(DEFAULT_CONTENT_OFFER_SETTINGS.maxTagsPerContent || 3),
      1,
      6
    ),
    moderationMode: ['review', 'strict'].includes(
      String((source.moderationMode ?? source.moderation_mode) || '').toLowerCase()
    )
      ? String(source.moderationMode ?? source.moderation_mode).toLowerCase()
      : 'off',
    restrictedCategories: Array.isArray(source.restrictedCategories ?? source.restricted_categories)
      ? Array.from(
          new Set(
            (source.restrictedCategories ?? source.restricted_categories)
              .map((entry: any) => String(entry || '').trim())
              .filter(Boolean)
          )
        )
      : []
  }
}

export const normalizeContentOfferTags = (value: any): ContentOfferTag[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      const payload = entry && typeof entry === 'object' ? entry : {}
      const offerType = String(payload.offerType || payload.offer_type || '').trim()
      const offerId = String(payload.offerId || payload.offer_id || '').trim()
      if (!offerType || !offerId) return null
      return {
        id: String(payload.id || `${offerType}:${offerId}`),
        offerType,
        offerId,
        ownerType: payload.ownerType ?? payload.owner_type ?? null,
        ownerId: payload.ownerId ?? payload.owner_id ?? '',
        ownerUserId: payload.ownerUserId ?? payload.owner_user_id ?? null,
        owner_user_id: payload.ownerUserId ?? payload.owner_user_id ?? null,
        pageId: payload.pageId ?? payload.page_id ?? null,
        page_id: payload.pageId ?? payload.page_id ?? null,
        pageSlug: payload.pageSlug ?? payload.page_slug ?? null,
        page_slug: payload.pageSlug ?? payload.page_slug ?? null,
        ownerName: payload.ownerName ?? payload.owner_name ?? null,
        owner_name: payload.ownerName ?? payload.owner_name ?? null,
        profileUsername: payload.profileUsername ?? payload.profile_username ?? null,
        profile_username: payload.profileUsername ?? payload.profile_username ?? null,
        title: payload.title ?? 'Offer',
        summary: payload.summary ?? null,
        price:
          payload.price === null || payload.price === undefined || !Number.isFinite(Number(payload.price))
            ? null
            : Number(payload.price),
        currency: payload.currency ?? null,
        category: payload.category ?? null,
        imageUrl: payload.imageUrl ?? payload.image_url ?? null,
        image_url: payload.imageUrl ?? payload.image_url ?? null,
        storefrontUrl: payload.storefrontUrl ?? payload.storefront_url ?? null,
        storefront_url: payload.storefrontUrl ?? payload.storefront_url ?? null,
        messageUserId: payload.messageUserId ?? payload.message_user_id ?? null,
        message_user_id: payload.messageUserId ?? payload.message_user_id ?? null,
        ctas:
          payload.ctas && typeof payload.ctas === 'object'
            ? {
                storefront: payload.ctas.storefront !== false,
                message: payload.ctas.message !== false,
                brief: payload.ctas.brief !== false
              }
            : {
                storefront: true,
                message: true,
                brief: true
              }
      } satisfies ContentOfferTag
    })
    .filter((entry): entry is ContentOfferTag => Boolean(entry))
}

export const mapGigToOfferOption = (gig: Gig): OfferTagOption => ({
  offerType: 'user_gig',
  offerId: String(gig.id),
  title: String(gig.title || 'Service'),
  summary: gig.description || null,
  price: Number.isFinite(Number(gig.price)) ? Number(gig.price) : null,
  currency: 'USD',
  category: gig.category || null
})

export const mapBusinessPackageToOfferOption = (
  pkg: BusinessPageServicePackage
): OfferTagOption => ({
  offerType: 'business_package',
  offerId: String(pkg.id),
  title: String(pkg.title || 'Offer'),
  summary: pkg.summary || null,
  price: Number.isFinite(Number(pkg.price)) ? Number(pkg.price) : null,
  currency: pkg.currency || null,
  category: null
})

export const mergeUniqueOfferOptions = (items: OfferTagOption[]) => {
  const byKey = new Map<string, OfferTagOption>()
  for (const item of items) {
    const key = `${item.offerType}:${item.offerId}`
    if (!byKey.has(key)) byKey.set(key, item)
  }
  return Array.from(byKey.values())
}

export const formatOfferPrice = (price?: number | null, currency?: string | null) => {
  if (!Number.isFinite(Number(price))) return null
  const normalizedCurrency = String(currency || 'USD').trim().toUpperCase() || 'USD'
  return `${normalizedCurrency} ${Number(price).toFixed(2)}`
}
