/**
 * Phase 26B — pure helpers for follow-onboarding progress and gates.
 * Business rules (source of truth):
 * - Min languages understood: 1 (Phase 26)
 * - Min follows (people + pages): server minimumRequired (default 1)
 * - Max follows in this step: 6 total (3 users + 3 pages presentation caps)
 * - Continue requires languages + follows; completion endpoint is server-authoritative for follows
 */

export const FOLLOW_ONBOARDING_MIN_LANGUAGES = 1;
export const FOLLOW_ONBOARDING_MAX_USERS = 3;
export const FOLLOW_ONBOARDING_MAX_PAGES = 3;
export const FOLLOW_ONBOARDING_MAX_TOTAL = 6;

export type FollowOnboardingProgressInput = {
  languageCount: number;
  followedCount: number;
  minimumRequired?: number;
  maxTotal?: number;
};

export const resolveFollowMinimum = (minimumRequired?: number) =>
  Math.max(1, Number(minimumRequired || 1) || 1);

export const languagesSatisfied = (languageCount: number, min = FOLLOW_ONBOARDING_MIN_LANGUAGES) =>
  Number(languageCount || 0) >= min;

export const followsSatisfied = (followedCount: number, minimumRequired?: number) =>
  Number(followedCount || 0) >= resolveFollowMinimum(minimumRequired);

/** Client continue gate: languages min + server follow min. */
export const canContinueOnboarding = (input: FollowOnboardingProgressInput) =>
  languagesSatisfied(input.languageCount) &&
  followsSatisfied(input.followedCount, input.minimumRequired);

/**
 * Progress bar: 50% languages step + 50% follow minimum (not max of 6).
 * Floor 8 so the bar is always visible; cap 100 when both steps done.
 */
export const computeOnboardingProgressPercent = (input: FollowOnboardingProgressInput) => {
  const followMin = resolveFollowMinimum(input.minimumRequired);
  const langOk = languagesSatisfied(input.languageCount) ? 1 : 0;
  const followShare = Math.min(Number(input.followedCount || 0), followMin) / followMin;
  const raw = Math.round(((langOk + followShare) / 2) * 100);
  return Math.max(8, Math.min(100, raw));
};

export const buildOnboardingMissingHint = (input: FollowOnboardingProgressInput) => {
  if (!languagesSatisfied(input.languageCount)) {
    return 'Select at least 1 language you understand';
  }
  const followMin = resolveFollowMinimum(input.minimumRequired);
  if (Number(input.followedCount || 0) < followMin) {
    return `Follow at least ${followMin} person or page`;
  }
  return 'Ready to continue';
};

export type FollowCapCheck = {
  ok: boolean;
  error?: string;
};

/** Pre-follow client caps for this onboarding step only. */
export const checkFollowCaps = (opts: {
  targetType: 'user' | 'page';
  followedTotal: number;
  selectedUsers: number;
  selectedPages: number;
  maxTotal?: number;
  maxUsers?: number;
  maxPages?: number;
}): FollowCapCheck => {
  const maxTotal = opts.maxTotal ?? FOLLOW_ONBOARDING_MAX_TOTAL;
  const maxUsers = opts.maxUsers ?? FOLLOW_ONBOARDING_MAX_USERS;
  const maxPages = opts.maxPages ?? FOLLOW_ONBOARDING_MAX_PAGES;
  if (opts.followedTotal >= maxTotal) {
    return { ok: false, error: `You can follow up to ${maxTotal} total recommendations in this step.` };
  }
  if (opts.targetType === 'page' && opts.selectedPages >= maxPages) {
    return { ok: false, error: `You can follow up to ${maxPages} pages during onboarding.` };
  }
  if (opts.targetType === 'user' && opts.selectedUsers >= maxUsers) {
    return { ok: false, error: `You can follow up to ${maxUsers} user accounts during onboarding.` };
  }
  return { ok: true };
};
