/**
 * Phase 3B.4.2 — OIDC verification for Cloud Tasks → media worker.
 * Injectable verifier for unit tests. Production uses google-auth-library.
 */

import { OAuth2Client } from 'google-auth-library';

export type OidcIdentity = {
  email?: string;
  sub?: string;
  aud?: string | string[];
};

export type OidcVerifier = (
  idToken: string,
  audience: string
) => Promise<OidcIdentity | null>;

const truthy = (v: unknown) =>
  ['1', 'true', 'yes', 'on'].includes(String(v ?? '').trim().toLowerCase());

let injectedVerifier: OidcVerifier | null | undefined = undefined;

export const setMediaWorkerOidcVerifierForTests = (
  verifier: OidcVerifier | null | undefined
) => {
  injectedVerifier = verifier;
};

export const getMediaWorkerOidcAudience = (
  env: NodeJS.ProcessEnv = process.env
): string => {
  const explicit = String(env.MEDIA_WORKER_OIDC_AUDIENCE || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const workerUrl = String(env.MEDIA_WORKER_URL || env.MEDIA_WORKER_PUBLIC_URL || '')
    .trim()
    .replace(/\/+$/, '');
  return workerUrl;
};

/**
 * When true, skip OIDC (local/dev only). Hard-blocked when NODE_ENV=production
 * unless MEDIA_WORKER_OIDC_ALLOW_INSECURE=1 is also set (still logged).
 */
export const isMediaWorkerOidcBypassEnabled = (
  env: NodeJS.ProcessEnv = process.env
): boolean => {
  if (!truthy(env.MEDIA_WORKER_OIDC_DISABLE)) return false;
  if (String(env.NODE_ENV || '').toLowerCase() === 'production') {
    return truthy(env.MEDIA_WORKER_OIDC_ALLOW_INSECURE);
  }
  return true;
};

const defaultVerifier: OidcVerifier = async (idToken, audience) => {
  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({
    idToken,
    audience
  });
  const payload = ticket.getPayload();
  if (!payload) return null;
  return {
    email: payload.email,
    sub: payload.sub,
    aud: payload.aud
  };
};

export const verifyMediaWorkerBearerToken = async (
  authorizationHeader: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ ok: true; identity: OidcIdentity | { bypass: true } } | { ok: false; reason: string }> => {
  if (isMediaWorkerOidcBypassEnabled(env)) {
    return { ok: true, identity: { bypass: true } };
  }

  const audience = getMediaWorkerOidcAudience(env);
  if (!audience) {
    return { ok: false, reason: 'OIDC_AUDIENCE_MISSING' };
  }

  const header = String(authorizationHeader || '').slice(0, 4096).trim();
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]) {
    return { ok: false, reason: 'MISSING_BEARER' };
  }

  const token = match[1].trim();
  if (!token) {
    return { ok: false, reason: 'MISSING_BEARER' };
  }

  const verifier =
    injectedVerifier !== undefined ? injectedVerifier : defaultVerifier;
  if (!verifier) {
    return { ok: false, reason: 'OIDC_VERIFIER_UNAVAILABLE' };
  }

  try {
    const identity = await verifier(token, audience);
    if (!identity) {
      return { ok: false, reason: 'OIDC_INVALID' };
    }
    return { ok: true, identity };
  } catch {
    return { ok: false, reason: 'OIDC_VERIFY_FAILED' };
  }
};
