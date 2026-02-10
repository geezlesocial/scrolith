// C:\Projects\Scrolith-backend\src\utils\authPagesConfig.ts
import { Role } from '@prisma/client';

const SECRET_MASK = '********';

const normalizeBool = (value: any, fallback: boolean) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return fallback;
};

const normalizeScopes = (value: any, fallback: string) => {
  if (Array.isArray(value)) return value.join(' ').trim();
  if (typeof value === 'string') return value.trim();
  return fallback;
};

const normalizeRoles = (value: any, fallback: Role[]) => {
  const asArray = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',').map((v) => v.trim()).filter(Boolean)
      : [];
  const seen = new Set<string>();
  const normalized = asArray
    .map((role) => String(role).toUpperCase())
    .filter(Boolean)
    .filter((role) => {
      if (seen.has(role)) return false;
      seen.add(role);
      return true;
    }) as Role[];
  return normalized.length ? normalized : fallback;
};

export const defaultAuthPagesConfig = {
  id: 'auth_pages',
  branding: {
    show_logo: true,
    logo_url: '',
    logo_link_url: '/'
  },
  login: {
    headline: 'Sign in to your account',
    subheadline: '',
    email_placeholder: 'Email address',
    password_placeholder: 'Password',
    submit_label: 'Sign in',
    footer_text: "Don't have an account?",
    footer_link_label: 'Sign up',
    footer_link_url: '/auth/signup'
  },
  signup: {
    headline: 'Join Our Community',
    subheadline: '',
    submit_label: 'Create Account',
    terms_url: '/p/terms',
    privacy_url: '/p/privacy',
    footer_text: 'Already have an account?',
    footer_link_label: 'Sign in here',
    footer_link_url: '/auth/login'
  },
  social_auth: {
    enabled: true,
    divider_text: 'Or continue with',
    login_enabled: true,
    signup_enabled: true,
    providers: {
      google: {
        enabled: false,
        client_id: '',
        client_secret: '',
        redirect_uri: '',
        scopes: 'openid profile email',
        button_label: 'Continue with Google',
        label_logo_url: '',
        login_enabled: true,
        signup_enabled: true,
        allow_roles: ['FREELANCER', 'EMPLOYER'] as Role[]
      },
      facebook: {
        enabled: false,
        client_id: '',
        client_secret: '',
        redirect_uri: '',
        scopes: 'public_profile email',
        button_label: 'Continue with Facebook',
        label_logo_url: '',
        login_enabled: true,
        signup_enabled: true,
        allow_roles: ['FREELANCER', 'EMPLOYER'] as Role[]
      },
      twitter: {
        enabled: false,
        client_id: '',
        client_secret: '',
        redirect_uri: '',
        scopes: 'tweet.read users.read offline.access',
        button_label: 'Continue with Twitter',
        label_logo_url: '',
        login_enabled: true,
        signup_enabled: true,
        allow_roles: ['FREELANCER', 'EMPLOYER'] as Role[]
      },
      linkedin: {
        enabled: false,
        client_id: '',
        client_secret: '',
        redirect_uri: '',
        scopes: 'openid profile email',
        button_label: 'Continue with LinkedIn',
        label_logo_url: '',
        login_enabled: true,
        signup_enabled: true,
        allow_roles: ['FREELANCER', 'EMPLOYER'] as Role[]
      }
    }
  },
  updated_at: new Date().toISOString()
};

const normalizeProvider = (
  providerKey: string,
  input: any,
  existing: any,
  defaults: any
) => {
  const incoming = input || {};
  const existingProvider = existing || {};

  const rawSecret = incoming.client_secret ?? incoming.clientSecret;
  const existingSecret = existingProvider.client_secret ?? existingProvider.clientSecret ?? defaults.client_secret;
  let nextSecret = existingSecret;

  if (typeof rawSecret === 'string') {
    const trimmed = rawSecret.trim();
    if (trimmed && trimmed !== SECRET_MASK) {
      nextSecret = trimmed;
    }
  }

  return {
    enabled: normalizeBool(incoming.enabled, existingProvider.enabled ?? defaults.enabled),
    client_id: (incoming.client_id ?? incoming.clientId ?? existingProvider.client_id ?? defaults.client_id ?? '').toString().trim(),
    client_secret: nextSecret,
    redirect_uri: (incoming.redirect_uri ?? incoming.redirectUri ?? existingProvider.redirect_uri ?? defaults.redirect_uri ?? '').toString().trim(),
    scopes: normalizeScopes(incoming.scopes ?? incoming.scope ?? existingProvider.scopes, defaults.scopes),
    button_label: (incoming.button_label ?? incoming.buttonLabel ?? existingProvider.button_label ?? defaults.button_label ?? '').toString(),
    label_logo_url: (incoming.label_logo_url ?? incoming.labelLogoUrl ?? existingProvider.label_logo_url ?? defaults.label_logo_url ?? '').toString(),
    login_enabled: normalizeBool(incoming.login_enabled ?? incoming.loginEnabled, existingProvider.login_enabled ?? defaults.login_enabled),
    signup_enabled: normalizeBool(incoming.signup_enabled ?? incoming.signupEnabled, existingProvider.signup_enabled ?? defaults.signup_enabled),
    allow_roles: normalizeRoles(incoming.allow_roles ?? incoming.allowRoles ?? existingProvider.allow_roles, defaults.allow_roles)
  };
};

export const normalizeAuthPagesConfig = (input: any, existing?: any) => {
  const brandingRaw = input?.branding || {};
  const loginRaw = input?.login || {};
  const signupRaw = input?.signup || {};
  const socialRaw = input?.social_auth || input?.socialAuth || {};
  const existingSocial = existing?.social_auth || existing?.socialAuth || defaultAuthPagesConfig.social_auth;

  const providerDefaults = defaultAuthPagesConfig.social_auth.providers;

  return {
    id: input?.id || defaultAuthPagesConfig.id,
    branding: {
      show_logo: brandingRaw.show_logo ?? brandingRaw.showLogo ?? defaultAuthPagesConfig.branding.show_logo,
      logo_url: brandingRaw.logo_url ?? brandingRaw.logoUrl ?? defaultAuthPagesConfig.branding.logo_url,
      logo_file_id: brandingRaw.logo_file_id ?? brandingRaw.logoFileId,
      logo_link_url: brandingRaw.logo_link_url ?? brandingRaw.logoLinkUrl ?? defaultAuthPagesConfig.branding.logo_link_url
    },
    login: {
      headline: loginRaw.headline ?? defaultAuthPagesConfig.login.headline,
      subheadline: loginRaw.subheadline ?? defaultAuthPagesConfig.login.subheadline,
      email_placeholder:
        loginRaw.email_placeholder ?? loginRaw.emailPlaceholder ?? defaultAuthPagesConfig.login.email_placeholder,
      password_placeholder:
        loginRaw.password_placeholder ?? loginRaw.passwordPlaceholder ?? defaultAuthPagesConfig.login.password_placeholder,
      submit_label: loginRaw.submit_label ?? loginRaw.submitLabel ?? defaultAuthPagesConfig.login.submit_label,
      footer_text: loginRaw.footer_text ?? loginRaw.footerText ?? defaultAuthPagesConfig.login.footer_text,
      footer_link_label:
        loginRaw.footer_link_label ?? loginRaw.footerLinkLabel ?? defaultAuthPagesConfig.login.footer_link_label,
      footer_link_url:
        loginRaw.footer_link_url ?? loginRaw.footerLinkUrl ?? defaultAuthPagesConfig.login.footer_link_url
    },
    signup: {
      headline: signupRaw.headline ?? defaultAuthPagesConfig.signup.headline,
      subheadline: signupRaw.subheadline ?? defaultAuthPagesConfig.signup.subheadline,
      submit_label: signupRaw.submit_label ?? signupRaw.submitLabel ?? defaultAuthPagesConfig.signup.submit_label,
      terms_url: signupRaw.terms_url ?? signupRaw.termsUrl ?? defaultAuthPagesConfig.signup.terms_url,
      privacy_url: signupRaw.privacy_url ?? signupRaw.privacyUrl ?? defaultAuthPagesConfig.signup.privacy_url,
      footer_text: signupRaw.footer_text ?? signupRaw.footerText ?? defaultAuthPagesConfig.signup.footer_text,
      footer_link_label:
        signupRaw.footer_link_label ?? signupRaw.footerLinkLabel ?? defaultAuthPagesConfig.signup.footer_link_label,
      footer_link_url:
        signupRaw.footer_link_url ?? signupRaw.footerLinkUrl ?? defaultAuthPagesConfig.signup.footer_link_url
    },
    social_auth: {
      enabled: normalizeBool(socialRaw.enabled, existingSocial?.enabled ?? defaultAuthPagesConfig.social_auth.enabled),
      divider_text:
        socialRaw.divider_text ?? socialRaw.dividerText ?? existingSocial?.divider_text ?? defaultAuthPagesConfig.social_auth.divider_text,
      login_enabled: normalizeBool(
        socialRaw.login_enabled ?? socialRaw.loginEnabled,
        existingSocial?.login_enabled ?? defaultAuthPagesConfig.social_auth.login_enabled
      ),
      signup_enabled: normalizeBool(
        socialRaw.signup_enabled ?? socialRaw.signupEnabled,
        existingSocial?.signup_enabled ?? defaultAuthPagesConfig.social_auth.signup_enabled
      ),
      providers: {
        google: normalizeProvider('google', socialRaw.providers?.google ?? socialRaw.google, existingSocial?.providers?.google, providerDefaults.google),
        facebook: normalizeProvider('facebook', socialRaw.providers?.facebook ?? socialRaw.facebook, existingSocial?.providers?.facebook, providerDefaults.facebook),
        twitter: normalizeProvider('twitter', socialRaw.providers?.twitter ?? socialRaw.twitter, existingSocial?.providers?.twitter, providerDefaults.twitter),
        linkedin: normalizeProvider('linkedin', socialRaw.providers?.linkedin ?? socialRaw.linkedin, existingSocial?.providers?.linkedin, providerDefaults.linkedin)
      }
    },
    updated_at: input?.updated_at || new Date().toISOString()
  };
};

export const sanitizeAuthPagesConfig = (config: any) => {
  const cloned = JSON.parse(JSON.stringify(config || defaultAuthPagesConfig));
  if (cloned?.social_auth?.providers) {
    Object.keys(cloned.social_auth.providers).forEach((key) => {
      if (cloned.social_auth.providers[key]) {
        cloned.social_auth.providers[key].client_secret = '';
      }
    });
  }
  return cloned;
};

export const SECRET_MASK_VALUE = SECRET_MASK;

