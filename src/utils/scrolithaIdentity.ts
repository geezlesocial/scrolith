/**
 * Phase 20.7.9 — Canonical Scrolitha identity assets for all client surfaces.
 * Prefer server public-profile when available; these defaults match production assets.
 */
import { resolveAssetUrl } from './assetUrl';

export const SCROLITHA_USERNAME = 'scrolitha';
export const SCROLITHA_DISPLAY_NAME = 'Scrolitha';
export const SCROLITHA_ASSET_VERSION = 'p2079';
export const SCROLITHA_BUNDLED_PROFILE_PHOTO_URL = '/logo.png';
export const SCROLITHA_BUNDLED_COVER_PHOTO_URL = '/assets/branding/scrolith-onboarding-wordmark.png';

export const SCROLITHA_OFFICIAL_PROFILE_PHOTO_URL =
  'https://api.scrolith.com/api/files/content/edd2e7e7-1b32-4edd-9209-6e87fe80ea45';
export const SCROLITHA_OFFICIAL_COVER_PHOTO_URL =
  'https://api.scrolith.com/api/files/content/a163c581-9ca1-4561-a41f-0540c7fb9214';

export const withScrolithaAssetVersion = (url: string | null | undefined): string => {
  const base = String(url || SCROLITHA_OFFICIAL_PROFILE_PHOTO_URL).trim();
  const versioned = !base
    ? `${SCROLITHA_OFFICIAL_PROFILE_PHOTO_URL}?v=${SCROLITHA_ASSET_VERSION}`
    : /[?&]v=/.test(base)
      ? base
      : `${base}${base.includes('?') ? '&' : '?'}v=${encodeURIComponent(SCROLITHA_ASSET_VERSION)}`;
  return resolveAssetUrl(versioned);
};

export const getScrolithaProfilePhotoUrl = (override?: string | null) =>
  override ? withScrolithaAssetVersion(override) : SCROLITHA_BUNDLED_PROFILE_PHOTO_URL;

export const getScrolithaCoverPhotoUrl = (override?: string | null) =>
  override ? withScrolithaAssetVersion(override) : SCROLITHA_BUNDLED_COVER_PHOTO_URL;

export const isScrolithaUsername = (username: string | null | undefined): boolean => {
  const n = String(username || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  return n === SCROLITHA_USERNAME || n === 'ai' || n === 'scrolitha_ai' || n === 'scrolitha-bot';
};

/** Resolve avatar for any participant/user-like object that may be Scrolitha. */
export const resolveScrolithaAvatar = (entity: any | null | undefined): string | null => {
  if (!entity) return null;
  const is =
    Boolean(entity.isScrolitha || entity.is_scrolitha) ||
    isScrolithaUsername(entity.username) ||
    String(entity.systemLabel || entity.system_label || '')
      .toLowerCase()
      .includes('ai assistant');
  if (!is) return null;
  return getScrolithaProfilePhotoUrl(entity.avatar || entity.avatarUrl || entity.profilePhotoUrl);
};
