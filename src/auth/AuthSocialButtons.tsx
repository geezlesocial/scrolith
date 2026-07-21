import React from 'react';
import { AuthProviderKey, SocialAuthConfig, UserRole } from '../types';
import { getApiBaseUrl } from '../utils/apiBase';
import { resolveResponsiveAssetUrl } from '../utils/assetUrl';

type AuthSocialButtonsProps = {
  mode: 'login' | 'signup';
  role?: UserRole;
  config?: SocialAuthConfig | null;
  redirectTo?: string;
};

/** Stable brand icons (data URIs) — never depend on uploaded file IDs that may 404. */
const GOOGLE_LOGO_DATA_URI =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.3l-6.3-5.3C29.3 35.3 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1 2.9-3.1 5.2-5.7 6.7l.1.1 6.3 5.3C37.3 41.3 44 36 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>'
  );

const LINKEDIN_LOGO_DATA_URI =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path fill="#0288D1" d="M42 37c0 2.8-2.2 5-5 5H11c-2.8 0-5-2.2-5-5V11c0-2.8 2.2-5 5-5h26c2.8 0 5 2.2 5 5v26z"/><path fill="#FFF" d="M12 19h5v17h-5zm2.5-8C13.1 11 12 12.1 12 13.5S13.1 16 14.5 16 17 14.9 17 13.5 15.9 11 14.5 11zM36 36h-5v-8.2c0-2.3-.9-3.5-2.7-3.5-1.7 0-2.8 1.2-2.8 3.5V36h-5V19h5v2.3c.8-1.3 2.5-2.6 5.1-2.6 3.7 0 5.4 2.3 5.4 6.7V36z"/></svg>'
  );

const FACEBOOK_LOGO_DATA_URI =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path fill="#1877F2" d="M42 24c0-9.9-8.1-18-18-18S6 14.1 6 24c0 9 6.6 16.5 15.2 17.8V29.9h-4.6V24h4.6v-4.5c0-4.5 2.7-7 6.8-7 2 0 4 .3 4 .3v4.4h-2.2c-2.2 0-2.9 1.4-2.9 2.8V24h4.9l-.8 5.9h-4.1v11.9C35.4 40.5 42 33 42 24z"/><path fill="#FFF" d="M31.2 29.9l.8-5.9h-4.9v-3.8c0-1.4.7-2.8 2.9-2.8h2.2v-4.4s-2-.3-4-.3c-4.1 0-6.8 2.5-6.8 7V24h-4.6v5.9h4.6v11.9c.9.1 1.9.2 2.8.2s1.9-.1 2.8-.2V29.9h4.2z"/></svg>'
  );

const defaultSocialConfig: SocialAuthConfig = {
  enabled: true,
  divider_text: 'Or continue with',
  login_enabled: true,
  signup_enabled: true,
  providers: {
    google: {
      enabled: true,
      client_id: '202175637855-os6h55m0ce5ak149b1mup83eh4sbn88e.apps.googleusercontent.com',
      client_secret: '',
      redirect_uri: 'https://api.scrolith.com/api/auth/oauth/google/callback',
      scopes: 'openid profile email',
      button_label: 'Continue with Google',
      // Prefer durable brand SVG; CMS may override with a working URL.
      label_logo_url: GOOGLE_LOGO_DATA_URI,
      login_enabled: true,
      signup_enabled: true,
      allow_roles: [UserRole.FREELANCER, UserRole.EMPLOYER]
    },
    facebook: {
      enabled: false,
      client_id: '',
      client_secret: '',
      scopes: 'public_profile email',
      button_label: 'Continue with Facebook',
      label_logo_url: FACEBOOK_LOGO_DATA_URI,
      login_enabled: true,
      signup_enabled: true,
      allow_roles: [UserRole.FREELANCER, UserRole.EMPLOYER]
    },
    twitter: {
      enabled: false,
      client_id: '',
      client_secret: '',
      scopes: 'tweet.read users.read offline.access',
      button_label: 'Continue with Twitter',
      label_logo_url: '',
      login_enabled: true,
      signup_enabled: true,
      allow_roles: [UserRole.FREELANCER, UserRole.EMPLOYER]
    },
    linkedin: {
      enabled: true,
      client_id: '86ymbf5i6ity93',
      client_secret: '',
      redirect_uri: 'https://api.scrolith.com/api/auth/oauth/linkedin/callback',
      scopes: 'openid profile email',
      button_label: 'Continue with LinkedIn',
      label_logo_url: LINKEDIN_LOGO_DATA_URI,
      login_enabled: true,
      signup_enabled: true,
      allow_roles: [UserRole.FREELANCER, UserRole.EMPLOYER]
    }
  }
};

const PROVIDER_FALLBACK_LOGO: Partial<Record<AuthProviderKey, string>> = {
  google: GOOGLE_LOGO_DATA_URI,
  linkedin: LINKEDIN_LOGO_DATA_URI,
  facebook: FACEBOOK_LOGO_DATA_URI
};

const providerOrder: AuthProviderKey[] = ['google', 'linkedin', 'facebook', 'twitter'];

const providerLabels: Record<AuthProviderKey, string> = {
  google: 'Google',
  facebook: 'Facebook',
  twitter: 'Twitter',
  linkedin: 'LinkedIn'
};

const providerStyle: Record<AuthProviderKey, string> = {
  google: 'border-gray-300 text-gray-700 hover:bg-gray-50',
  facebook: 'border-blue-600 text-blue-700 hover:bg-blue-50',
  twitter: 'border-sky-500 text-sky-700 hover:bg-sky-50',
  linkedin: 'border-blue-700 text-blue-800 hover:bg-blue-50'
};

const providerBadge: Record<AuthProviderKey, string> = {
  google: 'bg-white text-gray-700 border border-gray-300',
  facebook: 'bg-blue-600 text-white',
  twitter: 'bg-sky-500 text-white',
  linkedin: 'bg-blue-700 text-white'
};

const isNativePlatform = () => {
  try {
    const runtime = typeof window !== 'undefined' ? (window as any)?.Capacitor : null;
    return Boolean(runtime && typeof runtime.isNativePlatform === 'function' && runtime.isNativePlatform());
  } catch {
    return false;
  }
};

const firstDefined = <T,>(...values: T[]): T | undefined => values.find((value) => value !== undefined && value !== null);

const toBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', 'enabled', 'active'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', 'disabled', 'inactive'].includes(normalized)) return false;
  }
  return fallback;
};

const toRoleList = (value: unknown, fallback: UserRole[]) => {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((role) => String(role).toUpperCase()) as UserRole[];
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((role) => role.trim().toUpperCase())
      .filter(Boolean) as UserRole[];
  }
  return fallback;
};

const normalizeProviderConfig = (
  provider: AuthProviderKey,
  rawProvider: Record<string, unknown> | undefined,
  rawConfig: Record<string, unknown>
) => {
  const fallback = defaultSocialConfig.providers[provider];
  const providerEnabled = firstDefined(
    rawProvider?.enabled,
    rawProvider?.isEnabled,
    rawProvider?.is_enabled,
    rawProvider?.active,
    rawConfig[`${provider}Enabled`],
    rawConfig[`${provider}_enabled`]
  );

  return {
    ...fallback,
    ...(rawProvider || {}),
    enabled: toBoolean(providerEnabled, fallback.enabled),
    client_id: String(firstDefined(rawProvider?.client_id, rawProvider?.clientId, fallback.client_id) || ''),
    client_secret: String(firstDefined(rawProvider?.client_secret, rawProvider?.clientSecret, fallback.client_secret) || ''),
    redirect_uri: String(firstDefined(rawProvider?.redirect_uri, rawProvider?.redirectUri, fallback.redirect_uri) || ''),
    scopes: String(firstDefined(rawProvider?.scopes, fallback.scopes) || ''),
    button_label: String(firstDefined(rawProvider?.button_label, rawProvider?.buttonLabel, rawProvider?.label, fallback.button_label) || ''),
    label_logo_url: (() => {
      const configured = String(
        firstDefined(
          rawProvider?.label_logo_url,
          rawProvider?.labelLogoUrl,
          rawProvider?.logoUrl,
          rawProvider?.iconUrl,
          fallback.label_logo_url
        ) || ''
      ).trim();
      // Prefer durable fallback when CMS still points at missing uploaded file content ids.
      if (
        configured &&
        /\/api\/files\/content\//i.test(configured) &&
        PROVIDER_FALLBACK_LOGO[provider]
      ) {
        return PROVIDER_FALLBACK_LOGO[provider] as string;
      }
      return configured || String(PROVIDER_FALLBACK_LOGO[provider] || fallback.label_logo_url || '');
    })(),
    login_enabled: toBoolean(firstDefined(rawProvider?.login_enabled, rawProvider?.loginEnabled), fallback.login_enabled !== false),
    signup_enabled: toBoolean(firstDefined(rawProvider?.signup_enabled, rawProvider?.signupEnabled), fallback.signup_enabled !== false),
    allow_roles: toRoleList(firstDefined(rawProvider?.allow_roles, rawProvider?.allowRoles, rawProvider?.roles), fallback.allow_roles || [])
  };
};

const normalizeSocialAuthConfig = (input?: SocialAuthConfig | null): SocialAuthConfig => {
  const rawConfig = (input || {}) as unknown as Record<string, unknown>;
  const rawProviders = firstDefined(rawConfig.providers, rawConfig.socialProviders, rawConfig.provider_config, rawConfig.providerConfig);
  const providerMap = Array.isArray(rawProviders)
    ? rawProviders.reduce<Record<string, Record<string, unknown>>>((acc, item) => {
        const rawItem = (item || {}) as Record<string, unknown>;
        const key = String(firstDefined(rawItem.key, rawItem.provider, rawItem.name) || '').toLowerCase();
        if (key) acc[key] = rawItem;
        return acc;
      }, {})
    : ((rawProviders || {}) as Record<string, Record<string, unknown>>);

  const providers = providerOrder.reduce<SocialAuthConfig['providers']>((acc, provider) => {
    const rawProvider = ((providerMap[provider] || rawConfig[provider]) as Record<string, unknown> | undefined) || undefined;
    acc[provider] = normalizeProviderConfig(provider, rawProvider, rawConfig);
    return acc;
  }, {} as SocialAuthConfig['providers']);

  return {
    ...defaultSocialConfig,
    ...(input || {}),
    enabled: toBoolean(firstDefined(rawConfig.enabled, rawConfig.isEnabled, rawConfig.is_enabled, rawConfig.active), defaultSocialConfig.enabled),
    divider_text: String(firstDefined(rawConfig.divider_text, rawConfig.dividerText, defaultSocialConfig.divider_text) || 'Or continue with'),
    login_enabled: toBoolean(firstDefined(rawConfig.login_enabled, rawConfig.loginEnabled), defaultSocialConfig.login_enabled !== false),
    signup_enabled: toBoolean(firstDefined(rawConfig.signup_enabled, rawConfig.signupEnabled), defaultSocialConfig.signup_enabled !== false),
    providers
  };
};

const shouldShowProvider = (
  config: SocialAuthConfig,
  provider: AuthProviderKey,
  mode: 'login' | 'signup',
  role?: UserRole
) => {
  const p = config.providers?.[provider];
  if (!config.enabled || !p.enabled) return false;
  if (mode === 'login' && config.login_enabled === false) return false;
  if (mode === 'signup' && config.signup_enabled === false) return false;
  if (mode === 'login' && p.login_enabled === false) return false;
  if (mode === 'signup' && p.signup_enabled === false) return false;

  if (role && Array.isArray(p.allow_roles) && p.allow_roles.length) {
    const normalizedRole = role.toString().toLowerCase();
    const allowed = p.allow_roles.some((r) => r?.toString().toLowerCase() === normalizedRole);
    if (!allowed) return false;
  }
  return true;
};

const buildOAuthUrl = (
  provider: AuthProviderKey,
  mode: 'login' | 'signup',
  role?: UserRole,
  redirectTo?: string
) => {
  const params = new URLSearchParams();
  params.set('mode', mode);
  if (role) params.set('role', role);
  if (redirectTo) params.set('redirect', redirectTo);
  if (isNativePlatform()) params.set('returnTarget', 'app');
  const query = params.toString();
  return `${getApiBaseUrl()}/auth/oauth/${provider}${query ? `?${query}` : ''}`;
};

const openOAuthUrl = async (url: string) => {
  if (isNativePlatform()) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
      return;
    } catch {
      try {
        const opened = window.open(url, '_system', 'noopener,noreferrer');
        if (opened) return;
      } catch {
        // Fall back to same-window navigation below.
      }
    }
  }

  window.location.assign(url);
};

const AuthSocialButtons: React.FC<AuthSocialButtonsProps> = ({ mode, role, config, redirectTo }) => {
  const resolved = normalizeSocialAuthConfig(config);
  const providers = providerOrder.filter((provider) =>
    shouldShowProvider(resolved, provider, mode, role)
  );
  const [brokenLogos, setBrokenLogos] = React.useState<Partial<Record<AuthProviderKey, boolean>>>({});

  if (!providers.length) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <div className="flex-grow border-t border-gray-200" />
        <span className="px-3 text-xs uppercase tracking-widest text-gray-500">
          {resolved.divider_text || 'Or continue with'}
        </span>
        <div className="flex-grow border-t border-gray-200" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {providers.map((provider) => {
          const p = resolved.providers[provider];
          const label = p.button_label || `Continue with ${providerLabels[provider]}`;
          const configuredLogo = String(p.label_logo_url || '').trim();
          const stableFallback = PROVIDER_FALLBACK_LOGO[provider] || '';
          // Never pass data: URIs through responsive transforms; they break.
          const rawLogo =
            brokenLogos[provider] || !configuredLogo
              ? stableFallback
              : configuredLogo.startsWith('data:')
                ? configuredLogo
                : resolveResponsiveAssetUrl(configuredLogo, {
                    width: 40,
                    height: 40,
                    fit: 'contain',
                    quality: 85
                  }) || configuredLogo;
          const logoUrl = rawLogo || stableFallback;
          return (
            <button
              key={provider}
              type="button"
              aria-label={label}
              onClick={() => {
                void openOAuthUrl(buildOAuthUrl(provider, mode, role, redirectTo));
              }}
              className={`flex items-center justify-center gap-3 px-4 py-2.5 border rounded-lg text-sm font-semibold transition-all ${providerStyle[provider]}`}
            >
              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${providerBadge[provider]}`}>
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={`${providerLabels[provider]} logo`}
                    width={20}
                    height={20}
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                    className="w-5 h-5 object-contain"
                    onError={() => {
                      // First failure: swap to durable SVG data URI (if not already).
                      if (logoUrl !== stableFallback && stableFallback) {
                        setBrokenLogos((current) =>
                          current[provider] ? current : { ...current, [provider]: true }
                        );
                        return;
                      }
                      setBrokenLogos((current) =>
                        current[provider] ? current : { ...current, [provider]: true }
                      );
                    }}
                  />
                ) : (
                  providerLabels[provider].slice(0, 2).toUpperCase()
                )}
              </span>
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AuthSocialButtons;
