export const CERT_ROUTES = {
  memberHome: '/',
  community: '/community',
  scroll: '/scroll',
  profile: '/profile',
  notifications: '/notifications',
  login: '/auth/login'
} as const;

export type CertSurface = keyof typeof CERT_ROUTES;

/** Authenticated destinations that count as success for profile/home navigation */
export const VALID_AUTH_HOME_OR_PROFILE =
  /\/(member-home|m\/home|m\/profile|profile|u\/|home|dashboard|notifications|community|scroll)(\/|$|\?)/i;

export const VALID_PROFILE_DEST =
  /\/(profile|u\/|member-home|m\/home|m\/profile|home)(\/|$|\?)/i;

export const VALID_NOTIFICATIONS_DEST =
  /\/(notifications|member-home|m\/home|m\/notifications|home)(\/|$|\?)/i;

export const ERROR_OR_UNRELATED =
  /\/(auth\/login|404|error|suspended|banned)(\/|$|\?)/i;

export function isValidAuthDestination(url: string, kind: 'profile' | 'notifications' | 'any' = 'any') {
  if (ERROR_OR_UNRELATED.test(url)) return false;
  if (kind === 'profile') return VALID_PROFILE_DEST.test(url) || VALID_AUTH_HOME_OR_PROFILE.test(url);
  if (kind === 'notifications') return VALID_NOTIFICATIONS_DEST.test(url) || VALID_AUTH_HOME_OR_PROFILE.test(url);
  return VALID_AUTH_HOME_OR_PROFILE.test(url) || !ERROR_OR_UNRELATED.test(url);
}
