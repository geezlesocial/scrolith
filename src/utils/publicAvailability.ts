export type PublicAvailabilityAccountType = 'freelancer' | 'client' | 'employer' | string | null | undefined;

export type PublicAvailabilityBadge = 'available-for-hire' | 'we-are-hiring' | null;

export type PublicAvailabilityFlags = {
  availableForHire: boolean;
  weAreHiring: boolean;
};

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

/**
 * Resolve the public hiring signals carried by any user-like API payload.
 * Payloads may expose the serialized status object or the compact boolean
 * projection used by feeds, posts, search, and messaging participants.
 */
export const resolvePublicAvailabilityFlags = (source: any): PublicAvailabilityFlags => ({
  availableForHire: Boolean(
    source?.availableForHire ??
      source?.available_for_hire ??
      isPubliclyActiveAvailability(source?.availability ?? source?.professionalAvailability)
  ),
  weAreHiring: Boolean(
    source?.weAreHiring ??
      source?.we_are_hiring ??
      isPubliclyActiveAvailability(source?.hiring ?? source?.clientHiringStatus ?? source?.client_hiring_status)
  )
});

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
