import { Capacitor } from '@capacitor/core';

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
  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    // Fall back to runtime globals below.
  }
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

export const resolveAuthenticatedEntryPath = (
  user?: Pick<User, 'role' | 'followOnboardingRequired' | 'follow_onboarding_required'> | null
) => {
  if (hasPendingFollowOnboarding(user)) return FOLLOW_ONBOARDING_PATH;

  const normalizedRole = String(user?.role || '').trim().toLowerCase();
  if (normalizedRole === UserRole.ADMIN) return resolveDashboardPath(user?.role);

  return shouldUseMobileAuthenticatedHome() ? '/m/home' : '/member-home';
};
