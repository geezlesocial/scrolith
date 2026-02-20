export type VerificationLevel = 'standard' | 'pro' | 'business' | 'government';

const truthy = (value: unknown) => {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
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
      truthy(entity.kycVerified) ||
      truthy(entity.kyc_verified) ||
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
