import { User, UserRole } from '../types';
import { shouldUseMobileShellViewport } from '../mobile/home/mobileShellLayout';

export const FOLLOW_ONBOARDING_PATH = '/auth/follow-onboarding';

export const hasPendingFollowOnboarding = (user?: Pick<User, 'followOnboardingRequired' | 'follow_onboarding_required'> | null) =>
  Boolean(user?.followOnboardingRequired ?? user?.follow_onboarding_required);

const hasDesktopHomeOverride = () => {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('desktop') === '1' || params.get('view') === 'desktop';
  } catch {
    return false;
  }
};

const isNativeRuntime = () => {
  if (typeof window === 'undefined') return false;
  const runtime = (window as any)?.Capacitor;
  if (!runtime || typeof runtime.isNativePlatform !== 'function') return false;
  try {
    return Boolean(runtime.isNativePlatform());
  } catch {
    return false;
  }
};

const shouldUseMobileAuthenticatedHome = () => {
  if (hasDesktopHomeOverride()) return false;
  if (isNativeRuntime()) return true;
  return shouldUseMobileShellViewport();
};

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

export const resolveSignedInHomepagePath = () =>
  shouldUseMobileAuthenticatedHome() ? '/m/home' : '/member-home';

export const resolveAuthenticatedEntryPath = (
  user?: Pick<User, 'role' | 'followOnboardingRequired' | 'follow_onboarding_required'> | null
) => {
  if (hasPendingFollowOnboarding(user)) return FOLLOW_ONBOARDING_PATH;

  const normalizedRole = String(user?.role || '').trim().toLowerCase();
  if (normalizedRole === UserRole.ADMIN) return resolveDashboardPath(user?.role);

  // Use the canonical authenticated entry for every client. MemberHomeSection
  // and MobileHome select the appropriate responsive shell after the SPA has
  // bootstrapped. Keeping one stable URL avoids a transient server/static 404
  // when Android WebView or a mobile browser performs a post-auth reload.
  return '/member-home';
};
