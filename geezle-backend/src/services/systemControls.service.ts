/**
 * Runtime readers for General System Settings toggles (cached, fail-open where safe).
 */
import prisma from '../utils/prismaClient';

export type MaintenancePageConfig = {
  slug: string;
  title: string;
  message: string;
  eta: string | null;
  contactEmail: string;
  showCountdown: boolean;
  ctaLabel: string;
  ctaUrl: string;
};

export type SystemControls = {
  maintenanceMode: boolean;
  registrationsEnabled: boolean;
  kycEnforced: boolean;
  admin2FA: boolean;
  maintenancePage: MaintenancePageConfig;
};

const DEFAULT_MAINTENANCE_PAGE: MaintenancePageConfig = {
  slug: 'maintenance',
  title: 'We’ll be back soon',
  message:
    'Scrolith is undergoing scheduled maintenance to improve reliability and security. Admins can still access the control plane. Please try again shortly.',
  eta: null,
  contactEmail: 'support@scrolith.com',
  showCountdown: false,
  ctaLabel: 'Contact support',
  ctaUrl: 'mailto:support@scrolith.com'
};

export const DEFAULT_SYSTEM_CONTROLS: SystemControls = {
  maintenanceMode: false,
  registrationsEnabled: true,
  kycEnforced: false,
  admin2FA: false,
  maintenancePage: { ...DEFAULT_MAINTENANCE_PAGE }
};

type CacheEntry = { value: SystemControls; expiresAt: number };
let cache: CacheEntry | null = null;
const TTL_MS = Number(process.env.SYSTEM_CONTROLS_CACHE_TTL_MS || 4000);

const asBool = (value: unknown, fallback: boolean): boolean => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const n = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(n)) return true;
    if (['false', '0', 'no', 'off'].includes(n)) return false;
  }
  if (typeof value === 'number') return value !== 0;
  return Boolean(value);
};

export const normalizeMaintenancePage = (raw: any): MaintenancePageConfig => {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    slug: String(src.slug || DEFAULT_MAINTENANCE_PAGE.slug).trim() || 'maintenance',
    title: String(src.title || DEFAULT_MAINTENANCE_PAGE.title).trim() || DEFAULT_MAINTENANCE_PAGE.title,
    message:
      String(src.message || DEFAULT_MAINTENANCE_PAGE.message).trim() || DEFAULT_MAINTENANCE_PAGE.message,
    eta: src.eta ? String(src.eta) : null,
    contactEmail:
      String(src.contactEmail || src.contact_email || DEFAULT_MAINTENANCE_PAGE.contactEmail).trim() ||
      DEFAULT_MAINTENANCE_PAGE.contactEmail,
    showCountdown: asBool(src.showCountdown ?? src.show_countdown, false),
    ctaLabel:
      String(src.ctaLabel || src.cta_label || DEFAULT_MAINTENANCE_PAGE.ctaLabel).trim() ||
      DEFAULT_MAINTENANCE_PAGE.ctaLabel,
    ctaUrl:
      String(src.ctaUrl || src.cta_url || DEFAULT_MAINTENANCE_PAGE.ctaUrl).trim() ||
      DEFAULT_MAINTENANCE_PAGE.ctaUrl
  };
};

export const normalizeSystemControls = (raw: any): SystemControls => {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    maintenanceMode: asBool(src.maintenanceMode ?? src.maintenance_mode, false),
    registrationsEnabled: asBool(src.registrationsEnabled ?? src.registrations_enabled, true),
    kycEnforced: asBool(src.kycEnforced ?? src.kyc_enforced, false),
    admin2FA: asBool(src.admin2FA ?? src.admin_2fa, false),
    maintenancePage: normalizeMaintenancePage(src.maintenancePage ?? src.maintenance_page)
  };
};

export const invalidateSystemControlsCache = () => {
  cache = null;
};

export const getSystemControls = async (): Promise<SystemControls> => {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;
  try {
    const record = await prisma.appSetting.findUnique({
      where: { scope: 'system' },
      select: { data: true }
    });
    const value = normalizeSystemControls(record?.data || {});
    cache = { value, expiresAt: now + TTL_MS };
    return value;
  } catch {
    const value = { ...DEFAULT_SYSTEM_CONTROLS };
    cache = { value, expiresAt: now + TTL_MS };
    return value;
  }
};

export const isAdminRole = (role?: string | null): boolean => {
  const r = String(role || '').toUpperCase();
  return r === 'ADMIN' || r === 'SUPER_ADMIN' || r.includes('ADMIN');
};

export const isKycSatisfied = (user: { kycStatus?: string | null; isVerified?: boolean | null }): boolean => {
  if (user?.isVerified === true) return true;
  const status = String(user?.kycStatus || '').toUpperCase();
  return status === 'VERIFIED' || status === 'APPROVED';
};
