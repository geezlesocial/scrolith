import React from 'react';
import { AuthProviderKey, SocialAuthConfig, UserRole } from '../types';
import { getApiBaseUrl } from '../utils/apiBase';

type AuthSocialButtonsProps = {
  mode: 'login' | 'signup';
  role?: UserRole;
  config?: SocialAuthConfig;
  redirectTo?: string;
};

const defaultSocialConfig: SocialAuthConfig = {
  enabled: true,
  divider_text: 'Or continue with',
  login_enabled: true,
  signup_enabled: true,
  providers: {
    google: {
      enabled: false,
      client_id: '',
      client_secret: '',
      scopes: 'openid profile email',
      button_label: 'Continue with Google',
      label_logo_url: '',
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
      enabled: false,
      client_id: '',
      client_secret: '',
      scopes: 'openid profile email',
      button_label: 'Continue with LinkedIn',
      label_logo_url: '',
      login_enabled: true,
      signup_enabled: true,
      allow_roles: [UserRole.FREELANCER, UserRole.EMPLOYER]
    }
  }
};

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

const shouldShowProvider = (
  config: SocialAuthConfig,
  provider: AuthProviderKey,
  mode: 'login' | 'signup',
  role?: UserRole
) => {
  const p = config.providers[provider];
  if (!config.enabled || !p.enabled) return false;
  if (!p.client_id) return false;
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

const buildOAuthUrl = (provider: AuthProviderKey, mode: 'login' | 'signup', role?: UserRole, redirectTo?: string) => {
  const params = new URLSearchParams();
  params.set('mode', mode);
  if (role) params.set('role', role);
  if (redirectTo) params.set('redirect', redirectTo);
  const query = params.toString();
  return `${getApiBaseUrl()}/auth/oauth/${provider}${query ? `?${query}` : ''}`;
};

const AuthSocialButtons: React.FC<AuthSocialButtonsProps> = ({ mode, role, config, redirectTo }) => {
  const resolved = config || defaultSocialConfig;
  const providers = (Object.keys(resolved.providers) as AuthProviderKey[]).filter((provider) =>
    shouldShowProvider(resolved, provider, mode, role)
  );

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
          const logoUrl = p.label_logo_url || '';
          return (
            <button
              key={provider}
              type="button"
              onClick={() => {
                window.location.href = buildOAuthUrl(provider, mode, role, redirectTo);
              }}
              className={`flex items-center justify-center gap-3 px-4 py-2.5 border rounded-lg text-sm font-semibold transition-all ${providerStyle[provider]}`}
            >
              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${providerBadge[provider]}`}>
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={`${providerLabels[provider]} logo`}
                    className="w-5 h-5 object-contain"
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
