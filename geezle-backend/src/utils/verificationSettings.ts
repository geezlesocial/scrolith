export type VerificationLevelKey = 'standard' | 'pro' | 'business' | 'government';
export type VerificationAudienceRole = 'guest' | 'user' | 'freelancer' | 'employer' | 'business' | 'admin';

export type VerificationSettings = {
  enabled: boolean;
  showTooltips: boolean;
  levels: Record<VerificationLevelKey, boolean>;
  roles: Record<VerificationAudienceRole, boolean>;
};

const toBoolean = (value: unknown, fallback: boolean) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
};

export const DEFAULT_VERIFICATION_SETTINGS: VerificationSettings = {
  enabled: true,
  showTooltips: true,
  levels: {
    standard: true,
    pro: true,
    business: true,
    government: true
  },
  roles: {
    guest: true,
    user: true,
    freelancer: true,
    employer: true,
    business: true,
    admin: false
  }
};

export const normalizeVerificationSettings = (value: any): VerificationSettings => {
  const source = value && typeof value === 'object' ? value : {};
  const levelSource = source.levels && typeof source.levels === 'object' ? source.levels : {};
  const roleSource = source.roles && typeof source.roles === 'object' ? source.roles : {};

  return {
    enabled: toBoolean(source.enabled, DEFAULT_VERIFICATION_SETTINGS.enabled),
    showTooltips: toBoolean(source.showTooltips ?? source.show_tooltips, DEFAULT_VERIFICATION_SETTINGS.showTooltips),
    levels: {
      standard: toBoolean(levelSource.standard, DEFAULT_VERIFICATION_SETTINGS.levels.standard),
      pro: toBoolean(levelSource.pro, DEFAULT_VERIFICATION_SETTINGS.levels.pro),
      business: toBoolean(levelSource.business, DEFAULT_VERIFICATION_SETTINGS.levels.business),
      government: toBoolean(levelSource.government, DEFAULT_VERIFICATION_SETTINGS.levels.government)
    },
    roles: {
      guest: toBoolean(roleSource.guest, DEFAULT_VERIFICATION_SETTINGS.roles.guest),
      user: toBoolean(roleSource.user, DEFAULT_VERIFICATION_SETTINGS.roles.user),
      freelancer: toBoolean(roleSource.freelancer, DEFAULT_VERIFICATION_SETTINGS.roles.freelancer),
      employer: toBoolean(roleSource.employer, DEFAULT_VERIFICATION_SETTINGS.roles.employer),
      business: toBoolean(roleSource.business, DEFAULT_VERIFICATION_SETTINGS.roles.business),
      admin: toBoolean(roleSource.admin, DEFAULT_VERIFICATION_SETTINGS.roles.admin)
    }
  };
};

export const sanitizePublicVerificationSettings = (value: any): VerificationSettings =>
  normalizeVerificationSettings(value);
