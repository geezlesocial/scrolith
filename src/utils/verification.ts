export type VerificationLevel = 'standard' | 'pro' | 'business' | 'government';
export type VerificationSubjectRole = 'guest' | 'user' | 'freelancer' | 'employer' | 'business' | 'admin';
export type IdentityTrustState = 'verified' | 'pending' | 'needs_action' | 'unverified';

export type VerificationSettings = {
  enabled: boolean;
  showTooltips: boolean;
  levels: Record<VerificationLevel, boolean>;
  roles: Record<VerificationSubjectRole, boolean>;
};

const DEFAULT_VERIFICATION_SETTINGS: VerificationSettings = {
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

const truthy = (value: unknown) => {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
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

const normalizeRawLevel = (value: unknown): VerificationLevel | null => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return null;

  if (['standard', 'identity', 'verified', 'kyc'].includes(normalized)) return 'standard';
  if (['pro', 'professional', 'pro_verified', 'pro-verified'].includes(normalized)) return 'pro';
  if (['business', 'company', 'corporate', 'merchant'].includes(normalized)) return 'business';
  if (['government', 'gov', 'official', 'institutional'].includes(normalized)) return 'government';
  return null;
};

export const normalizeVerificationLevel = (value: unknown): VerificationLevel | null => normalizeRawLevel(value);

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

const readVerificationSettings = (source: any): VerificationSettings => {
  const systemVerification = source?.system?.verification ?? source?.verification;
  return normalizeVerificationSettings(systemVerification);
};

export const resolveVerificationSubjectRole = (
  entity: any,
  explicitRole?: unknown,
  explicitType?: unknown
): VerificationSubjectRole => {
  const type = String(explicitType ?? entity?.type ?? entity?.accountType ?? entity?.account_type ?? '')
    .trim()
    .toLowerCase();
  if (['business', 'company', 'merchant', 'corporate'].includes(type)) return 'business';

  const role = String(
    explicitRole ??
      entity?.role ??
      entity?.role_name ??
      entity?.accountRole ??
      entity?.account_role ??
      entity?.userRole ??
      entity?.user_role ??
      ''
  )
    .trim()
    .toLowerCase();

  if (role.includes('admin')) return 'admin';
  if (role.includes('business') || role.includes('company') || role.includes('merchant')) return 'business';
  if (role.includes('employer') || role.includes('client') || role.includes('recruiter')) return 'employer';
  if (role.includes('freelancer') || role.includes('seller') || role.includes('creator') || role.includes('talent')) return 'freelancer';
  if (role.includes('guest')) return 'guest';
  return 'user';
};

export const resolveVerificationLevel = (entity: any): VerificationLevel | null => {
  if (!entity) return null;

  const explicitLevel = normalizeRawLevel(
    entity.verificationLevel ||
      entity.verification_level ||
      entity.verificationTier ||
      entity.verification_tier ||
      entity.badgeType ||
      entity.badge_type
  );
  if (explicitLevel) return explicitLevel;

  const kycStatus = String(entity.kycStatus || entity.kyc_status || '')
    .trim()
    .toLowerCase();
  const isVerified = Boolean(
    truthy(entity.isVerified) ||
      truthy(entity.is_verified) ||
      truthy(entity.verified) ||
      truthy(entity?.flags?.isVerified) ||
      truthy(entity?.flags?.is_verified) ||
      truthy(entity.kycVerified) ||
      truthy(entity.kyc_verified) ||
      truthy(entity?.professionalIdentity?.isVerified) ||
      truthy(entity?.professional_identity?.is_verified) ||
      kycStatus === 'verified' ||
      kycStatus === 'approved'
  );

  if (!isVerified) return null;

  if (truthy(entity.isGovernmentVerified) || truthy(entity.is_government_verified)) return 'government';

  const type = String(entity.type || entity.accountType || entity.account_type || '')
    .trim()
    .toLowerCase();
  if (
    truthy(entity.isBusinessVerified) ||
    truthy(entity.is_business_verified) ||
    type === 'business' ||
    type === 'company'
  ) {
    return 'business';
  }

  if (
    truthy(entity.isProVerified) ||
    truthy(entity.is_pro_verified) ||
    truthy(entity.isPro) ||
    truthy(entity.is_pro) ||
    truthy(entity.isProFreelancer) ||
    truthy(entity.is_pro_freelancer) ||
    truthy(entity.isProEmployer) ||
    truthy(entity.is_pro_employer)
  ) {
    return 'pro';
  }

  return 'standard';
};

const readIdentityVerificationStatus = (entity: any) =>
  String(
    entity?.kycStatus ??
      entity?.kyc_status ??
      entity?.verificationStatus ??
      entity?.verification_status ??
      entity?.verificationState ??
      entity?.verification_state ??
      ''
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

/**
 * Normalize the status vocabulary returned by profile, post, job, and KYC APIs.
 * The UI can expose pending/action-needed states without treating them as verified.
 */
export const resolveIdentityTrustState = (entity: any): IdentityTrustState => {
  if (!entity) return 'unverified';

  const status = readIdentityVerificationStatus(entity);
  if (['pending', 'under_review', 'in_review', 'submitted', 'processing'].includes(status)) {
    return 'pending';
  }
  if (['requires_updates', 'needs_action', 'action_required', 'rejected', 'expired', 'revoked'].includes(status)) {
    return 'needs_action';
  }
  if (['verified', 'approved', 'complete', 'completed'].includes(status)) return 'verified';

  return resolveVerificationLevel(entity) ? 'verified' : 'unverified';
};

export const identityTrustStateLabel = (state: IdentityTrustState) => {
  switch (state) {
    case 'verified':
      return 'Verified identity';
    case 'pending':
      return 'Verification pending';
    case 'needs_action':
      return 'Verification needs attention';
    default:
      return 'Identity not verified';
  }
};

export const resolveVisibleVerificationLevel = (
  entity: any,
  options?: {
    settings?: any;
    role?: unknown;
    type?: unknown;
  }
): VerificationLevel | null => {
  const level = resolveVerificationLevel(entity);
  if (!level) return null;

  const settings = readVerificationSettings(options?.settings || {});
  if (!settings.enabled || !settings.levels[level]) return null;

  const subjectRole = resolveVerificationSubjectRole(entity, options?.role, options?.type);
  if (!settings.roles[subjectRole]) return null;

  return level;
};

export const shouldShowVerificationTooltip = (settings?: any) => readVerificationSettings(settings).showTooltips;
