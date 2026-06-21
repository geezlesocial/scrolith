import type { StorefrontSettings } from '../types'

export const DEFAULT_STOREFRONT_SETTINGS: StorefrontSettings = {
  enabled: true,
  userProfilesEnabled: true,
  businessPagesEnabled: true,
  roles: {
    user: true,
    freelancer: true,
    employer: true,
    business: true,
    admin: true
  },
  modules: {
    merchantSummary: true,
    userGigs: true,
    businessPackages: true
  },
  maxFeaturedItems: 4,
  maxCatalogItems: 12
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

export const normalizeStorefrontSettings = (raw: any): StorefrontSettings => {
  const source = raw && typeof raw === 'object' ? raw : {}
  const roles = source.roles && typeof source.roles === 'object' ? source.roles : {}
  const modules = source.modules && typeof source.modules === 'object' ? source.modules : {}

  return {
    enabled: toBoolean(source.enabled, Boolean(DEFAULT_STOREFRONT_SETTINGS.enabled)),
    userProfilesEnabled: toBoolean(
      source.userProfilesEnabled ?? source.user_profiles_enabled,
      Boolean(DEFAULT_STOREFRONT_SETTINGS.userProfilesEnabled)
    ),
    businessPagesEnabled: toBoolean(
      source.businessPagesEnabled ?? source.business_pages_enabled,
      Boolean(DEFAULT_STOREFRONT_SETTINGS.businessPagesEnabled)
    ),
    roles: {
      user: toBoolean(roles.user, Boolean(DEFAULT_STOREFRONT_SETTINGS.roles?.user)),
      freelancer: toBoolean(roles.freelancer, Boolean(DEFAULT_STOREFRONT_SETTINGS.roles?.freelancer)),
      employer: toBoolean(roles.employer, Boolean(DEFAULT_STOREFRONT_SETTINGS.roles?.employer)),
      business: toBoolean(roles.business, Boolean(DEFAULT_STOREFRONT_SETTINGS.roles?.business)),
      admin: toBoolean(roles.admin, Boolean(DEFAULT_STOREFRONT_SETTINGS.roles?.admin))
    },
    modules: {
      merchantSummary: toBoolean(
        modules.merchantSummary ?? modules.merchant_summary,
        Boolean(DEFAULT_STOREFRONT_SETTINGS.modules?.merchantSummary)
      ),
      userGigs: toBoolean(
        modules.userGigs ?? modules.user_gigs,
        Boolean(DEFAULT_STOREFRONT_SETTINGS.modules?.userGigs)
      ),
      businessPackages: toBoolean(
        modules.businessPackages ?? modules.business_packages,
        Boolean(DEFAULT_STOREFRONT_SETTINGS.modules?.businessPackages)
      )
    },
    maxFeaturedItems: toNumber(
      source.maxFeaturedItems ?? source.max_featured_items,
      Number(DEFAULT_STOREFRONT_SETTINGS.maxFeaturedItems || 4),
      1,
      12
    ),
    maxCatalogItems: toNumber(
      source.maxCatalogItems ?? source.max_catalog_items,
      Number(DEFAULT_STOREFRONT_SETTINGS.maxCatalogItems || 12),
      1,
      60
    )
  }
}
