import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prismaClient';
import { Role } from '@prisma/client';
import { defaultAuthPagesConfig, normalizeAuthPagesConfig } from '../utils/authPagesConfig';

type OAuthProviderKey = 'google' | 'facebook' | 'twitter' | 'linkedin';
type OAuthMode = 'login' | 'signup';
type ClientReturnTarget = 'web' | 'app';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const STATE_EXPIRES_IN = '10m';

const providerKeys: OAuthProviderKey[] = ['google', 'facebook', 'twitter', 'linkedin'];

const normalizeRole = (value?: string): Role => {
  const raw = (value || '').toString().toLowerCase();
  if (raw.includes('admin')) return Role.ADMIN;
  if (raw.includes('freelancer') || raw.includes('seller')) return Role.FREELANCER;
  if (raw.includes('employer') || raw.includes('client') || raw.includes('buyer')) return Role.EMPLOYER;
  return Role.EMPLOYER;
};

const resolveDashboardPath = (role?: Role | string) => {
  const normalized = (role || '').toString().toLowerCase();
  if (normalized.includes('admin')) return '/admin/dashboard';
  if (normalized.includes('freelancer')) return '/freelancer/dashboard';
  if (normalized.includes('employer') || normalized.includes('client')) return '/client/dashboard';
  return '/';
};

const sanitizeRedirect = (value?: string) => {
  const raw = (value || '').toString().trim();
  if (!raw) return '';
  if (raw.startsWith('/')) return raw;
  const frontend = process.env.FRONTEND_URL || '';
  if (frontend) {
    try {
      const frontendUrl = new URL(frontend);
      const incoming = new URL(raw);
      if (incoming.origin === frontendUrl.origin) {
        return `${incoming.pathname}${incoming.search}${incoming.hash}`;
      }
    } catch {}
  }
  return '';
};

const normalizeReturnTarget = (value?: string): ClientReturnTarget =>
  String(value || '').trim().toLowerCase() === 'app' ? 'app' : 'web';

const getBackendBaseUrl = (req: Request) => {
  const envBase = process.env.BACKEND_URL || process.env.API_BASE_URL;
  if (envBase) return String(envBase).replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost';
  return `${proto}://${host}`;
};

const getFrontendBaseUrl = () => {
  const envBase = process.env.FRONTEND_URL || process.env.CLIENT_URL;
  return (envBase || 'http://localhost:3000').replace(/\/$/, '');
};

const getNativeAppCallbackUrl = () =>
  String(process.env.MOBILE_APP_CALLBACK_URL || 'scrolith://auth/oauth/callback').trim();

const buildClientCallbackUrl = (params: URLSearchParams, returnTarget: ClientReturnTarget) => {
  if (returnTarget === 'app') {
    const appCallback = getNativeAppCallbackUrl();
    return `${appCallback}${appCallback.includes('?') ? '&' : '?'}${params.toString()}`;
  }
  return `${getFrontendBaseUrl()}/auth/oauth/callback?${params.toString()}`;
};

const getAuthPagesConfig = async () => {
  const existing = await prisma.appSetting.findUnique({ where: { scope: 'cms_auth_pages' } });
  const existingData = existing?.data ?? defaultAuthPagesConfig;
  return normalizeAuthPagesConfig(existingData, existingData);
};

const getProviderConfig = async (provider: OAuthProviderKey) => {
  const config = await getAuthPagesConfig();
  const social = config?.social_auth;
  const providerConfig = social?.providers?.[provider];
  return { config, social, providerConfig };
};

const createPkce = () => {
  const verifier = crypto.randomBytes(32).toString('hex');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return { verifier, challenge };
};

const buildState = (payload: Record<string, any>) => {
  return (jwt as any).sign(payload, JWT_SECRET, { expiresIn: STATE_EXPIRES_IN });
};

const decodeState = (state: string) => {
  return (jwt as any).verify(state, JWT_SECRET) as Record<string, any>;
};

const sendOAuthError = (
  res: Response,
  message: string,
  redirect?: string,
  returnTarget: ClientReturnTarget = 'web'
) => {
  const params = new URLSearchParams();
  params.set('error', encodeURIComponent(message));
  if (redirect) params.set('redirect', redirect);
  res.redirect(buildClientCallbackUrl(params, returnTarget));
};

const fetchJson = async (url: string, options: any) => {
  const response = await fetch(url, options);
  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message =
      (data && (data.error_description || data.error?.message || data.error || data.message)) ||
      `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
};

export const startOAuth = async (req: Request, res: Response) => {
  const provider = (req.params.provider || '').toLowerCase() as OAuthProviderKey;
  if (!providerKeys.includes(provider)) {
    return res.status(400).json({ error: 'Unsupported provider' });
  }

  const mode: OAuthMode = (req.query.mode as string) === 'signup' ? 'signup' : 'login';
  const requestedRole = normalizeRole(req.query.role as string);
  const redirect = sanitizeRedirect(req.query.redirect as string);
  const returnTarget = normalizeReturnTarget(
    (req.query.returnTarget as string) ||
    ((req.query.native as string) === '1' ? 'app' : '')
  );

  try {
    const { social, providerConfig } = await getProviderConfig(provider);
    if (!social?.enabled) return res.status(400).json({ error: 'Social login is disabled' });
    if (!providerConfig?.enabled) return res.status(400).json({ error: 'Provider is disabled' });
    if (!providerConfig.client_id) return res.status(400).json({ error: 'Provider client ID missing' });

    if (mode === 'login' && social.login_enabled === false) {
      return res.status(400).json({ error: 'Social login is disabled for login' });
    }
    if (mode === 'signup' && social.signup_enabled === false) {
      return res.status(400).json({ error: 'Social login is disabled for signup' });
    }
    if (mode === 'login' && providerConfig.login_enabled === false) {
      return res.status(400).json({ error: 'Provider disabled for login' });
    }
    if (mode === 'signup' && providerConfig.signup_enabled === false) {
      return res.status(400).json({ error: 'Provider disabled for signup' });
    }

    if (mode === 'signup') {
      const allowedRoles = providerConfig.allow_roles || [];
      if (allowedRoles.length && !allowedRoles.includes(requestedRole)) {
        return res.status(403).json({ error: 'Role not allowed for this provider' });
      }
    }

    const redirectUri =
      providerConfig.redirect_uri ||
      `${getBackendBaseUrl(req)}/api/auth/oauth/${provider}/callback`;

    const pkce = provider === 'twitter' ? createPkce() : null;
    const state = buildState({
      provider,
      mode,
      role: requestedRole,
      redirect,
      returnTarget,
      pkceVerifier: pkce?.verifier || null,
      nonce: crypto.randomBytes(8).toString('hex')
    });

    const params = new URLSearchParams();
    params.set('response_type', 'code');
    params.set('client_id', providerConfig.client_id);
    params.set('redirect_uri', redirectUri);
    params.set('scope', providerConfig.scopes || '');
    params.set('state', state);

    let authUrl = '';
    switch (provider) {
      case 'google':
        params.set('access_type', 'offline');
        params.set('prompt', 'consent');
        authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
        break;
      case 'facebook':
        authUrl = `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
        break;
      case 'linkedin':
        authUrl = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
        break;
      case 'twitter':
        if (pkce) {
          params.set('code_challenge', pkce.challenge);
          params.set('code_challenge_method', 'S256');
        }
        authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
        break;
    }

    return res.redirect(authUrl);
  } catch (error: any) {
    console.error('[oauth] start error', error?.message || error);
    return res.status(500).json({ error: 'Failed to start OAuth flow' });
  }
};

export const handleOAuthCallback = async (req: Request, res: Response) => {
  const provider = (req.params.provider || '').toLowerCase() as OAuthProviderKey;
  if (!providerKeys.includes(provider)) {
    return res.status(400).json({ error: 'Unsupported provider' });
  }

  const { code, state, error, error_description } = req.query as Record<string, string>;

  if (error) {
    let returnTarget: ClientReturnTarget = 'web';
    let redirect = sanitizeRedirect(req.query.redirect as string);
    if (state) {
      try {
        const statePayload = decodeState(state);
        returnTarget = normalizeReturnTarget(statePayload.returnTarget as string);
        redirect = sanitizeRedirect((statePayload.redirect as string) || redirect);
      } catch {}
    }
    return sendOAuthError(
      res,
      error_description || error || 'OAuth failed',
      redirect || '/auth/login',
      returnTarget
    );
  }

  if (!code || !state) {
    return sendOAuthError(res, 'Missing OAuth code or state', '/auth/login');
  }

  let statePayload: Record<string, any>;
  try {
    statePayload = decodeState(state);
  } catch (err) {
    return sendOAuthError(res, 'Invalid OAuth state', '/auth/login');
  }
  const returnTarget = normalizeReturnTarget(statePayload.returnTarget as string);

  if (statePayload.provider !== provider) {
    return sendOAuthError(res, 'OAuth provider mismatch', '/auth/login', returnTarget);
  }

  try {
    const { social, providerConfig } = await getProviderConfig(provider);
    if (!social?.enabled || !providerConfig?.enabled) {
      return sendOAuthError(res, 'Provider disabled', '/auth/login', returnTarget);
    }

    const mode: OAuthMode = statePayload.mode === 'signup' ? 'signup' : 'login';
    const redirectPath = sanitizeRedirect(statePayload.redirect as string);
    const requestedRole = normalizeRole(statePayload.role as string);

    if (mode === 'login' && social.login_enabled === false) {
      return sendOAuthError(res, 'Login disabled for social auth', '/auth/login', returnTarget);
    }
    if (mode === 'signup' && social.signup_enabled === false) {
      return sendOAuthError(res, 'Signup disabled for social auth', '/auth/login', returnTarget);
    }

    if (mode === 'signup') {
      const allowedRoles = providerConfig.allow_roles || [];
      if (allowedRoles.length && !allowedRoles.includes(requestedRole)) {
        return sendOAuthError(res, 'Role not allowed for this provider', '/auth/signup', returnTarget);
      }
    }

    const redirectUri =
      providerConfig.redirect_uri ||
      `${getBackendBaseUrl(req)}/api/auth/oauth/${provider}/callback`;

    // Exchange code for token
    let tokenData: any;
    if (provider === 'google') {
      const body = new URLSearchParams();
      body.set('code', code);
      body.set('client_id', providerConfig.client_id);
      body.set('client_secret', providerConfig.client_secret || '');
      body.set('redirect_uri', redirectUri);
      body.set('grant_type', 'authorization_code');
      tokenData = await fetchJson('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
    } else if (provider === 'facebook') {
      const tokenUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
      tokenUrl.searchParams.set('client_id', providerConfig.client_id);
      tokenUrl.searchParams.set('client_secret', providerConfig.client_secret || '');
      tokenUrl.searchParams.set('redirect_uri', redirectUri);
      tokenUrl.searchParams.set('code', code);
      tokenData = await fetchJson(tokenUrl.toString(), { method: 'GET' });
    } else if (provider === 'linkedin') {
      const body = new URLSearchParams();
      body.set('grant_type', 'authorization_code');
      body.set('code', code);
      body.set('client_id', providerConfig.client_id);
      body.set('client_secret', providerConfig.client_secret || '');
      body.set('redirect_uri', redirectUri);
      tokenData = await fetchJson('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
    } else if (provider === 'twitter') {
      const body = new URLSearchParams();
      body.set('grant_type', 'authorization_code');
      body.set('code', code);
      body.set('client_id', providerConfig.client_id);
      body.set('redirect_uri', redirectUri);
      body.set('code_verifier', statePayload.pkceVerifier || '');

      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded'
      };
      if (providerConfig.client_secret) {
        const basic = Buffer.from(`${providerConfig.client_id}:${providerConfig.client_secret}`).toString('base64');
        headers.Authorization = `Basic ${basic}`;
      }

      tokenData = await fetchJson('https://api.twitter.com/2/oauth2/token', {
        method: 'POST',
        headers,
        body
      });
    }

    const accessToken = tokenData?.access_token;
    if (!accessToken) {
      return sendOAuthError(res, 'Failed to obtain access token', '/auth/login');
    }

    // Fetch user profile
    let profile: any = {};
    if (provider === 'google') {
      profile = await fetchJson('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    } else if (provider === 'facebook') {
      const profileUrl = new URL('https://graph.facebook.com/me');
      profileUrl.searchParams.set('fields', 'id,name,email,picture.width(200).height(200)');
      profileUrl.searchParams.set('access_token', accessToken);
      profile = await fetchJson(profileUrl.toString(), { method: 'GET' });
    } else if (provider === 'linkedin') {
      profile = await fetchJson('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    } else if (provider === 'twitter') {
      profile = await fetchJson('https://api.twitter.com/2/users/me?user.fields=profile_image_url,name,username', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    }

    const normalizedProfile = (() => {
      if (provider === 'google') {
        return {
          id: profile.sub || profile.id,
          email: profile.email,
          name: profile.name,
          avatar: profile.picture
        };
      }
      if (provider === 'facebook') {
        return {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          avatar: profile.picture?.data?.url
        };
      }
      if (provider === 'linkedin') {
        return {
          id: profile.sub || profile.id,
          email: profile.email,
          name: profile.name || profile.localizedFirstName,
          avatar: profile.picture
        };
      }
      if (provider === 'twitter') {
        const data = profile.data || {};
        return {
          id: data.id,
          email: data.email,
          name: data.name || data.username,
          avatar: data.profile_image_url
        };
      }
      return { id: profile.id };
    })();

    if (!normalizedProfile.id) {
      return sendOAuthError(res, 'Provider did not return an account id', '/auth/login');
    }

    // Find or create user
    let user = null as any;
    const existingAccount = await prisma.authProviderAccount.findUnique({
      where: { provider_providerUserId: { provider, providerUserId: String(normalizedProfile.id) } },
      include: { user: true }
    });

    if (existingAccount?.user) {
      user = existingAccount.user;
    } else {
      if (normalizedProfile.email) {
        user = await prisma.user.findUnique({ where: { email: normalizedProfile.email } });
      }

      if (!user) {
        if (!normalizedProfile.email) {
          return sendOAuthError(res, 'Email permission required. Please add email scope.', '/auth/signup');
        }

        user = await prisma.user.create({
          data: {
            email: normalizedProfile.email,
            name: normalizedProfile.name || normalizedProfile.email.split('@')[0],
            role: requestedRole,
            avatar: normalizedProfile.avatar || null,
            isActive: true,
            isVerified: true,
            kycStatus: 'PENDING',
            followOnboardingRequired: mode === 'signup',
            followOnboardingCompletedAt: null
          }
        });
      } else if (mode === 'signup') {
        // Ensure requested role is honored for new signup if existing user was a guest
        if (user.role === Role.GUEST || user.role === Role.USER) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              role: requestedRole,
              followOnboardingRequired: true,
              followOnboardingCompletedAt: null
            }
          });
        }
      }

      await prisma.authProviderAccount.create({
        data: {
          provider,
          providerUserId: String(normalizedProfile.id),
          email: normalizedProfile.email || null,
          profile: profile || {},
          userId: user.id
        }
      });
    }

    if (normalizedProfile.avatar && !user.avatar) {
      try {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { avatar: normalizedProfile.avatar }
        });
      } catch (e) {
        console.warn('[oauth] failed to update avatar', e);
      }
    }

    try {
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    } catch {}

    const token = (jwt as any).sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as string }
    );

    res.cookie('Scrolith_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/'
    });

    const finalRedirect = mode === 'signup' ? '/' : redirectPath || resolveDashboardPath(user.role);
    const params = new URLSearchParams();
    params.set('token', token);
    params.set('redirect', finalRedirect);
    return res.redirect(buildClientCallbackUrl(params, returnTarget));
  } catch (err: any) {
    console.error('[oauth] callback error:', err?.message || err);
    return sendOAuthError(res, err?.message || 'OAuth failed', '/auth/login', returnTarget);
  }
};

