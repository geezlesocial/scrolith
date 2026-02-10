import { getPlanById, planHasFeature, resolvePlanFeatureCodes } from '../services/planStore';

const normalizeKycStatus = (status?: string | null) => (status || '').toString().toUpperCase();

export const isKycVerified = (status?: string | null) => {
  const normalized = normalizeKycStatus(status);
  return normalized === 'VERIFIED' || normalized === 'APPROVED';
};

export const isPlanActive = (active?: boolean | null, expiresAt?: Date | string | null) => {
  if (!active) return false;
  if (!expiresAt) return true;
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return true;
  return expiry.getTime() > Date.now();
};

export const resolveUserProStatus = (user: any) => {
  const freelancerPlan = user?.freelancerPlanId ? getPlanById(user.freelancerPlanId) : null;
  const employerPlan = user?.employerPlanId ? getPlanById(user.employerPlanId) : null;

  const freelancerActive = isPlanActive(user?.freelancerPlanActive, user?.freelancerPlanExpiresAt);
  const employerActive = isPlanActive(user?.employerPlanActive, user?.employerPlanExpiresAt);
  const kycVerified = isKycVerified(user?.kycStatus);

  const freelancerPlanPrice = Number(freelancerPlan?.price ?? user?.freelancerPlanPrice ?? 0);
  const employerPlanPrice = Number(employerPlan?.price ?? user?.employerPlanPrice ?? 0);

  const freelancerIsPro =
    kycVerified &&
    freelancerActive &&
    freelancerPlanPrice > 0 &&
    planHasFeature(freelancerPlan, 'pro_verified_freelancer');

  const employerIsPro =
    kycVerified &&
    employerActive &&
    employerPlanPrice > 0 &&
    planHasFeature(employerPlan, 'pro_verified_employer');

  return {
    kycVerified,
    freelancerActive,
    employerActive,
    freelancerIsPro,
    employerIsPro,
    freelancerPlan,
    employerPlan
  };
};

export const buildUserPlanSnapshot = (user: any) => {
  const resolved = resolveUserProStatus(user);

  const freelancerPlan = resolved.freelancerPlan;
  const employerPlan = resolved.employerPlan;

  return {
    freelancer: {
      planId: user?.freelancerPlanId ?? null,
      planName: user?.freelancerPlanName ?? freelancerPlan?.name ?? null,
      interval: user?.freelancerPlanInterval ?? freelancerPlan?.interval ?? null,
      price: user?.freelancerPlanPrice ?? freelancerPlan?.price ?? null,
      currency: user?.freelancerPlanCurrency ?? freelancerPlan?.currency ?? null,
      purchasedAt: user?.freelancerPlanPurchasedAt ? new Date(user.freelancerPlanPurchasedAt).toISOString() : null,
      expiresAt: user?.freelancerPlanExpiresAt ? new Date(user.freelancerPlanExpiresAt).toISOString() : null,
      active: resolved.freelancerActive,
      isPro: resolved.freelancerIsPro,
      featureCodes: resolvePlanFeatureCodes(freelancerPlan)
    },
    employer: {
      planId: user?.employerPlanId ?? null,
      planName: user?.employerPlanName ?? employerPlan?.name ?? null,
      interval: user?.employerPlanInterval ?? employerPlan?.interval ?? null,
      price: user?.employerPlanPrice ?? employerPlan?.price ?? null,
      currency: user?.employerPlanCurrency ?? employerPlan?.currency ?? null,
      purchasedAt: user?.employerPlanPurchasedAt ? new Date(user.employerPlanPurchasedAt).toISOString() : null,
      expiresAt: user?.employerPlanExpiresAt ? new Date(user.employerPlanExpiresAt).toISOString() : null,
      active: resolved.employerActive,
      isPro: resolved.employerIsPro,
      featureCodes: resolvePlanFeatureCodes(employerPlan)
    },
    kycVerified: resolved.kycVerified
  };
};
