import { User, UserRole } from '../types';

export const FOLLOW_ONBOARDING_PATH = '/auth/follow-onboarding';

export const hasPendingFollowOnboarding = (user?: Pick<User, 'followOnboardingRequired' | 'follow_onboarding_required'> | null) =>
  Boolean(user?.followOnboardingRequired ?? user?.follow_onboarding_required);

export const resolveDashboardPath = (role?: UserRole | string) => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  switch (normalizedRole) {
    case UserRole.ADMIN:
      return '/admin/dashboard';
    case UserRole.FREELANCER:
      return '/freelancer/dashboard';
    case UserRole.EMPLOYER:
      return '/client/dashboard';
    default:
      return '/';
  }
};

export const resolveAuthenticatedEntryPath = (
  user?: Pick<User, 'role' | 'followOnboardingRequired' | 'follow_onboarding_required'> | null
) => (hasPendingFollowOnboarding(user) ? FOLLOW_ONBOARDING_PATH : resolveDashboardPath(user?.role));
