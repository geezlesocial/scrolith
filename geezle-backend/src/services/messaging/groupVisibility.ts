/**
 * Phase 29.1 — visibility / join policy helpers.
 * SECRET is a first-class ConversationVisibility value (additive enum), not an alias of UNLISTED.
 */

export type GroupVisibility = 'PRIVATE' | 'PUBLIC' | 'UNLISTED' | 'SECRET';
export type JoinPolicy = 'OPEN' | 'REQUEST' | 'INVITE_ONLY';

export const normalizeGroupVisibility = (value: unknown): GroupVisibility => {
  const v = String(value || 'PRIVATE').trim().toUpperCase();
  if (v === 'PUBLIC' || v === 'PRIVATE' || v === 'UNLISTED' || v === 'SECRET') return v;
  return 'PRIVATE';
};

export const normalizeJoinPolicy = (value: unknown): JoinPolicy => {
  const v = String(value || 'INVITE_ONLY').trim().toUpperCase();
  if (v === 'OPEN' || v === 'REQUEST' || v === 'INVITE_ONLY') return v;
  return 'INVITE_ONLY';
};

/** Discoverable in search / directory */
export const isGroupDiscoverable = (visibility: GroupVisibility | string): boolean =>
  normalizeGroupVisibility(visibility) === 'PUBLIC';

/** Link/social previews allowed */
export const isGroupPreviewAllowed = (visibility: GroupVisibility | string, invitePreviewDisabled?: boolean): boolean => {
  if (invitePreviewDisabled) return false;
  const v = normalizeGroupVisibility(visibility);
  return v !== 'SECRET';
};

/**
 * SECRET groups force invite-only join policy.
 * PUBLIC may be OPEN / REQUEST / INVITE_ONLY.
 * PRIVATE / UNLISTED default invite-only unless explicitly set.
 */
export const resolveJoinPolicyForVisibility = (
  visibility: GroupVisibility | string,
  requested?: JoinPolicy | string | null
): JoinPolicy => {
  const v = normalizeGroupVisibility(visibility);
  if (v === 'SECRET') return 'INVITE_ONLY';
  if (requested) return normalizeJoinPolicy(requested);
  if (v === 'PUBLIC') return 'OPEN';
  return 'INVITE_ONLY';
};

export const GROUP_VISIBILITY_VERSION = '29.1';
