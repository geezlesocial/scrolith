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
      label_logo_url: 'https://api.scrolith.com/api/files/content/9c7e50a1-12d1-4b20-9655-54cd30b0961b',
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
      label_logo_url: '',
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
      label_logo_url: 'https://api.scrolith.com/api/files/content/09f765e3-cd49-4772-a133-6a1500d224e8',
      login_enabled: true,
      signup_enabled: true,
      allow_roles: [UserRole.FREELANCER, UserRole.EMPLOYER]
    }
  }
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
    label_logo_url: String(
      firstDefined(rawProvider?.label_logo_url, rawProvider?.labelLogoUrl, rawProvider?.logoUrl, rawProvider?.iconUrl, fallback.label_logo_url) || ''
    ),
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
          const logoUrl = !brokenLogos[provider] && p.label_logo_url
            ? resolveResponsiveAssetUrl(p.label_logo_url, { width: 40, height: 40, fit: 'contain', quality: 70 })
            : '';
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
                    loading="lazy"
                    decoding="async"
                    className="w-5 h-5 object-contain"
                    onError={() =>
                      setBrokenLogos((current) => (
                        current[provider]
                          ? current
                          : { ...current, [provider]: true }
                      ))
                    }
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
