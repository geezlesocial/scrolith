type ContentOfferRoleSettings = {
  user: boolean
  freelancer: boolean
  employer: boolean
  business: boolean
  admin: boolean
}

type ContentOfferModuleSettings = {
  userGigs: boolean
  businessPackages: boolean
  storefrontCta: boolean
  messageCta: boolean
  briefCta: boolean
}

export type ContentOfferSettingsNormalized = {
  enabled: boolean
  postsEnabled: boolean
  scrollEnabled: boolean
  liveEnabled: boolean
  roles: ContentOfferRoleSettings
  modules: ContentOfferModuleSettings
  maxTagsPerContent: number
  moderationMode: 'off' | 'review' | 'strict'
  restrictedCategories: string[]
}

export const DEFAULT_CONTENT_OFFER_SETTINGS: ContentOfferSettingsNormalized = {
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

const normalizeModerationMode = (value: any) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'review') return 'review'
  if (normalized === 'strict') return 'strict'
  return 'off'
}

const normalizeRestrictedCategories = (value: any) => {
  const source = Array.isArray(value)
    ? value
    : String(value || '')
        .split(',')
        .map((entry) => entry.trim())
  return Array.from(
    new Set(
      source
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .map((entry) => entry.slice(0, 80))
    )
  ).slice(0, 40)
}

export const normalizeContentOfferSettings = (raw: any): ContentOfferSettingsNormalized => {
  const source = raw && typeof raw === 'object' ? raw : {}
  const roles = source.roles && typeof source.roles === 'object' ? source.roles : {}
  const modules = source.modules && typeof source.modules === 'object' ? source.modules : {}

  return {
    enabled: toBoolean(source.enabled, DEFAULT_CONTENT_OFFER_SETTINGS.enabled),
    postsEnabled: toBoolean(
      source.postsEnabled ?? source.posts_enabled,
      DEFAULT_CONTENT_OFFER_SETTINGS.postsEnabled
    ),
    scrollEnabled: toBoolean(
      source.scrollEnabled ?? source.scroll_enabled,
      DEFAULT_CONTENT_OFFER_SETTINGS.scrollEnabled
    ),
    liveEnabled: toBoolean(
      source.liveEnabled ?? source.live_enabled,
      DEFAULT_CONTENT_OFFER_SETTINGS.liveEnabled
    ),
    roles: {
      user: toBoolean(roles.user, DEFAULT_CONTENT_OFFER_SETTINGS.roles.user),
      freelancer: toBoolean(roles.freelancer, DEFAULT_CONTENT_OFFER_SETTINGS.roles.freelancer),
      employer: toBoolean(roles.employer, DEFAULT_CONTENT_OFFER_SETTINGS.roles.employer),
      business: toBoolean(roles.business, DEFAULT_CONTENT_OFFER_SETTINGS.roles.business),
      admin: toBoolean(roles.admin, DEFAULT_CONTENT_OFFER_SETTINGS.roles.admin)
    },
    modules: {
      userGigs: toBoolean(
        modules.userGigs ?? modules.user_gigs,
        DEFAULT_CONTENT_OFFER_SETTINGS.modules.userGigs
      ),
      businessPackages: toBoolean(
        modules.businessPackages ?? modules.business_packages,
        DEFAULT_CONTENT_OFFER_SETTINGS.modules.businessPackages
      ),
      storefrontCta: toBoolean(
        modules.storefrontCta ?? modules.storefront_cta,
        DEFAULT_CONTENT_OFFER_SETTINGS.modules.storefrontCta
      ),
      messageCta: toBoolean(
        modules.messageCta ?? modules.message_cta,
        DEFAULT_CONTENT_OFFER_SETTINGS.modules.messageCta
      ),
      briefCta: toBoolean(
        modules.briefCta ?? modules.brief_cta,
        DEFAULT_CONTENT_OFFER_SETTINGS.modules.briefCta
      )
    },
    maxTagsPerContent: toNumber(
      source.maxTagsPerContent ?? source.max_tags_per_content,
      DEFAULT_CONTENT_OFFER_SETTINGS.maxTagsPerContent,
      1,
      6
    ),
    moderationMode: normalizeModerationMode(
      source.moderationMode ?? source.moderation_mode
    ),
    restrictedCategories: normalizeRestrictedCategories(
      source.restrictedCategories ?? source.restricted_categories
    )
  }
}

const resolveRoleKey = (role?: string | null): keyof ContentOfferRoleSettings => {
  const normalized = String(role || '').trim().toLowerCase()
  if (normalized.includes('admin')) return 'admin'
  if (normalized.includes('business')) return 'business'
  if (normalized.includes('employer') || normalized.includes('client')) return 'employer'
  if (normalized.includes('freelancer') || normalized.includes('seller') || normalized.includes('creator')) {
    return 'freelancer'
  }
  return 'user'
}

export const isContentOfferRoleEnabled = (
  settings: ContentOfferSettingsNormalized,
  role?: string | null
) => Boolean(settings.roles[resolveRoleKey(role)])

export const sanitizePublicContentOfferSettings = (raw: any) => normalizeContentOfferSettings(raw)
