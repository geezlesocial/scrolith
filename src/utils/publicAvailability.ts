export type PublicAvailabilityAccountType = 'freelancer' | 'client' | 'employer' | string | null | undefined;

export type PublicAvailabilityBadge = 'available-for-hire' | 'we-are-hiring' | null;

type PublicAvailabilityInput = {
  status?: string | null;
  isActive?: boolean | null;
  visibility?: string | null;
  expiresAt?: string | null;
};

const isFutureOrUnset = (expiresAt?: string | null) => {
  if (!expiresAt) return true;
  const timestamp = new Date(expiresAt).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
};

export const isPubliclyActiveAvailability = (value?: PublicAvailabilityInput | null) => Boolean(
  value &&
    String(value.status || '').toUpperCase() === 'ACTIVE' &&
    value.isActive === true &&
    String(value.visibility || '').toUpperCase() === 'PUBLIC' &&
    isFutureOrUnset(value.expiresAt)
);

/** Select one ring when both statuses are active so the supplied artwork never overlaps. */
export const resolvePublicAvailabilityBadge = (input: {
  availableForHire?: boolean;
  weAreHiring?: boolean;
  accountType?: PublicAvailabilityAccountType;
}): PublicAvailabilityBadge => {
  const accountType = String(input.accountType || '').toLowerCase();
  if (accountType === 'client' || accountType === 'employer') {
    if (input.weAreHiring) return 'we-are-hiring';
    if (input.availableForHire) return 'available-for-hire';
    return null;
  }
  if (input.availableForHire) return 'available-for-hire';
  if (input.weAreHiring) return 'we-are-hiring';
  return null;
};
