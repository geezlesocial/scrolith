import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prismaClient';
import { Role } from '@prisma/client';
import { defaultAuthPagesConfig, normalizeAuthPagesConfig } from '../utils/authPagesConfig';
import {
  getApiPublicOrigin,
  getFrontendOrigin,
  getProviderOAuthCallbackUrl,
  sanitizeInternalRedirect
} from '../utils/frontendOrigin';
import { redactAuthLogMessage, safeOAuthLog } from '../utils/authLogRedaction';
import {
  consumeOAuthExchangeCode,
  createOAuthExchangeCode
} from '../services/oauthExchange.service';
import { jwtSecret } from '../utils/security/requiredSecret';
import { scalarQuery } from '../utils/security/scalarQuery';

type OAuthProviderKey = 'google' | 'facebook' | 'twitter' | 'linkedin';
type OAuthMode = 'login' | 'signup';
type ClientReturnTarget = 'web' | 'app';

const JWT_SECRET = jwtSecret();
const STATE_EXPIRES_IN = '10m';
const OAUTH_SUCCESS_PATH = String(process.env.OAUTH_SUCCESS_PATH || '/auth/oauth/callback').trim() || '/auth/oauth/callback';

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

const normalizeReturnTarget = (value?: string): ClientReturnTarget =>
  String(value || '').trim().toLowerCase() === 'app' ? 'app' : 'web';

const getBackendBaseUrl = (req: Request) => {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost';
  return getApiPublicOrigin(`${proto}://${host}`);
};

const getNativeAppCallbackUrl = () =>
  String(process.env.MOBILE_APP_CALLBACK_URL || 'scrolith://auth/oauth/callback').trim();

/**
 * Final browser completion URL (frontend), never the provider callback.
 * Production always resolves via getFrontendOrigin() — never localhost fallback.
 */
const buildClientCallbackUrl = (params: URLSearchParams, returnTarget: ClientReturnTarget) => {
  if (returnTarget === 'app') {
    const appCallback = getNativeAppCallbackUrl();
    const joiner = appCallback.includes('?') ? '&' : '?';
    return `${appCallback}${joiner}${params.toString()}`;
  }
  const origin = getFrontendOrigin();
  const path = OAUTH_SUCCESS_PATH.startsWith('/') ? OAUTH_SUCCESS_PATH : `/${OAUTH_SUCCESS_PATH}`;
  return `${origin}${path}?${params.toString()}`;
};

const resolveProviderCallbackUri = (
  provider: OAuthProviderKey,
  req: Request,
  providerConfig: { redirect_uri?: string } | null | undefined
) => {
  const configured = String(providerConfig?.redirect_uri || '').trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      // Production: force HTTPS API host; reject localhost provider callbacks in prod runtime.
      if (getFrontendOrigin().startsWith('https://') || process.env.K_SERVICE) {
        if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
          return getProviderOAuthCallbackUrl(provider, getBackendBaseUrl(req));
        }
      }
      return configured.replace(/\/$/, '');
    } catch {
      // fall through
    }
  }
  return getProviderOAuthCallbackUrl(provider, getBackendBaseUrl(req));
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
  params.set('error', message.slice(0, 200));
  params.set('status', 'error');
  const safeRedirect = sanitizeInternalRedirect(redirect, '/auth/login');
  params.set('redirect', safeRedirect);
  safeOAuthLog('warn', 'oauth_callback_failed', {
    message: redactAuthLogMessage(message),
    redirect: safeRedirect,
    returnTarget
  });
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
    throw new Error(String(message));
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
  const redirect = sanitizeInternalRedirect(req.query.redirect as string, '');
  const returnTarget = normalizeReturnTarget(
    (req.query.returnTarget as string) || ((req.query.native as string) === '1' ? 'app' : '')
  );

  try {
    // Ensure production origin is resolvable before starting (surfaces misconfig early).
    getFrontendOrigin();

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

    const redirectUri = resolveProviderCallbackUri(provider, req, providerConfig);

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

    safeOAuthLog('info', 'oauth_start', {
      provider,
      mode,
      returnTarget,
      redirect: redirect || '/',
      providerCallbackHost: (() => {
        try {
          return new URL(redirectUri).host;
        } catch {
          return 'invalid';
        }
      })()
    });

    return res.redirect(authUrl);
  } catch (error: any) {
    safeOAuthLog('error', 'oauth_start_error', {
      provider,
      message: redactAuthLogMessage(error?.message || error)
    });
    return res.status(500).json({ error: 'Failed to start OAuth flow' });
  }
};

export const handleOAuthCallback = async (req: Request, res: Response) => {
  const provider = (req.params.provider || '').toLowerCase() as OAuthProviderKey;
  if (!providerKeys.includes(provider)) {
    return res.status(400).json({ error: 'Unsupported provider' });
  }

  const code = scalarQuery(req.query.code);
  const state = scalarQuery(req.query.state);
  const error = scalarQuery(req.query.error);
  const errorDescription = scalarQuery(req.query.error_description);

  if (error) {
    let returnTarget: ClientReturnTarget = 'web';
    let redirect = sanitizeInternalRedirect(scalarQuery(req.query.redirect), '/auth/login');
    if (state) {
      try {
        const statePayload = decodeState(state);
        returnTarget = normalizeReturnTarget(statePayload.returnTarget as string);
        redirect = sanitizeInternalRedirect((statePayload.redirect as string) || redirect, '/auth/login');
      } catch {
        // ignore invalid state on provider error
      }
    }
    safeOAuthLog('warn', 'oauth_provider_error', {
      provider,
      error: redactAuthLogMessage(errorDescription || error)
    });
    return sendOAuthError(
      res,
      errorDescription || error || 'OAuth failed',
      redirect || '/auth/login',
      returnTarget
    );
  }

  if (!code || !state) {
    safeOAuthLog('warn', 'oauth_invalid_state', { provider, reason: 'missing_code_or_state' });
    return sendOAuthError(res, 'Missing OAuth code or state', '/auth/login');
  }

  let statePayload: Record<string, any>;
  try {
    statePayload = decodeState(state);
  } catch {
    safeOAuthLog('warn', 'oauth_invalid_state', { provider, reason: 'state_verify_failed' });
    return sendOAuthError(res, 'Invalid OAuth state', '/auth/login');
  }
  const returnTarget = normalizeReturnTarget(statePayload.returnTarget as string);

  if (statePayload.provider !== provider) {
    safeOAuthLog('warn', 'oauth_invalid_state', { provider, reason: 'provider_mismatch' });
    return sendOAuthError(res, 'OAuth provider mismatch', '/auth/login', returnTarget);
  }

  try {
    const { social, providerConfig } = await getProviderConfig(provider);
    if (!social?.enabled || !providerConfig?.enabled) {
      return sendOAuthError(res, 'Provider disabled', '/auth/login', returnTarget);
    }

    const mode: OAuthMode = statePayload.mode === 'signup' ? 'signup' : 'login';
    const redirectPath = sanitizeInternalRedirect(statePayload.redirect as string, '');
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

    const redirectUri = resolveProviderCallbackUri(provider, req, providerConfig);

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
      return sendOAuthError(res, 'Failed to obtain access token', '/auth/login', returnTarget);
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
      return sendOAuthError(res, 'Provider did not return an account id', '/auth/login', returnTarget);
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
          return sendOAuthError(
            res,
            'Email permission required. Please add email scope.',
            '/auth/signup',
            returnTarget
          );
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
        safeOAuthLog('warn', 'oauth_avatar_update_failed', { provider });
      }
    }

    try {
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    } catch {
      // non-fatal
    }

    // Phase 25B: one-time exchange code instead of long-lived JWT in the browser URL.
    const exchange = await createOAuthExchangeCode({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Cookie is scoped to the API host; SPA on scrolith.com still needs exchange.
    // Kept as defense-in-depth for same-site API cookie consumers only.
    res.cookie('Scrolith_token', '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE),
      path: '/',
      maxAge: 0
    });

    const finalRedirect =
      mode === 'signup' ? sanitizeInternalRedirect('/', '/') : redirectPath || resolveDashboardPath(user.role);

    const params = new URLSearchParams();
    params.set('status', 'success');
    params.set('code', exchange.code);
    params.set('redirect', finalRedirect);

    const completionUrl = buildClientCallbackUrl(params, returnTarget);
    // Assert no localhost leak in production completion URLs.
    if ((process.env.NODE_ENV === 'production' || process.env.K_SERVICE) && /localhost|127\.0\.0\.1/i.test(completionUrl)) {
      safeOAuthLog('error', 'oauth_localhost_redirect_blocked', { provider });
      return res.status(500).send('OAuth misconfiguration: production frontend origin is invalid.');
    }

    safeOAuthLog('info', 'oauth_callback_success', {
      provider,
      mode,
      returnTarget,
      redirect: finalRedirect,
      frontendOrigin: getFrontendOrigin()
    });

    return res.redirect(completionUrl);
  } catch (err: any) {
    safeOAuthLog('error', 'oauth_callback_error', {
      provider,
      message: redactAuthLogMessage(err?.message || err)
    });
    return sendOAuthError(res, err?.message || 'OAuth failed', '/auth/login', returnTarget);
  }
};

/**
 * POST /auth/oauth/exchange
 * Body: { code: string }
 * Returns: { success, token }
 *
 * Completes OAuth without placing the session JWT in browser history.
 */
export const exchangeOAuthCode = async (req: Request, res: Response) => {
  try {
    const result = await consumeOAuthExchangeCode(req.body?.code ?? req.query?.code);
    if (result.ok === false) {
      safeOAuthLog('warn', 'oauth_exchange_failed', { error: result.error });
      return res.status(result.status).json({ success: false, error: result.error });
    }

    safeOAuthLog('info', 'oauth_frontend_completion', { userId: result.userId });
    return res.json({
      success: true,
      token: result.token,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    safeOAuthLog('error', 'oauth_exchange_error', {
      message: redactAuthLogMessage(error?.message || error)
    });
    return res.status(500).json({ success: false, error: 'Exchange failed' });
  }
};
