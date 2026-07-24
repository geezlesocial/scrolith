/**
 * ICE / STUN / TURN configuration for messenger WebRTC voice calls.
 * Secrets stay server-side; clients receive only ephemeral (or scoped) ICE credentials.
 *
 * Env:
 * - VOICE_ICE_STUN_URLS
 * - VOICE_ICE_TURN_URLS (turn: / turns:)
 * - VOICE_ICE_TURN_USERNAME + VOICE_ICE_TURN_CREDENTIAL (static long-lived — avoid in prod)
 * - VOICE_ICE_TURN_SECRET (coturn static-auth-secret → time-limited username/credential)
 * - VOICE_ICE_TURN_TTL_SECONDS (default 3600, min 300, max 86400)
 * - VOICE_ICE_FORCE_RELAY=true
 */

import { createHmac } from 'crypto';

export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const splitList = (raw: string): string[] =>
  String(raw || '')
    .split(/[\n,]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);

const isTruthy = (raw: string | undefined | null) =>
  ['1', 'true', 'yes', 'on'].includes(String(raw || '').trim().toLowerCase());

const isTurnUrl = (url: string) => {
  const u = String(url || '').toLowerCase();
  return u.startsWith('turn:') || u.startsWith('turns:');
};

/**
 * coturn REST / static-auth-secret credentials:
 * username = `${expiryUnix}:${userId}`
 * password = base64(hmac-sha1(secret, username))
 */
export const buildTimeLimitedTurnCredentials = (params: {
  secret: string;
  userId?: string;
  ttlSeconds?: number;
}): { username: string; credential: string; expiresAt: number } => {
  const ttl = Math.max(300, Math.min(86_400, Number(params.ttlSeconds || 3600) || 3600));
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;
  const subject = String(params.userId || 'scrolith').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'scrolith';
  const username = `${expiresAt}:${subject}`;
  const credential = createHmac('sha1', params.secret).update(username).digest('base64');
  return { username, credential, expiresAt };
};

/**
 * Build RTCConfiguration.iceServers for authenticated clients only.
 */
export const resolveMessengerIceServers = (options?: {
  userId?: string | null;
}): {
  iceServers: IceServerConfig[];
  iceTransportPolicy?: 'all' | 'relay';
  source: 'env' | 'default' | 'env-time-limited';
  hasTurn: boolean;
  turnCredentialMode: 'none' | 'static' | 'time-limited';
  turnExpiresAt?: number;
} => {
  const stunUrls = splitList(
    process.env.VOICE_ICE_STUN_URLS ||
      process.env.MESSENGER_ICE_STUN_URLS ||
      'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302'
  );
  const turnUrls = splitList(
    process.env.VOICE_ICE_TURN_URLS || process.env.MESSENGER_ICE_TURN_URLS || ''
  );
  const staticUser = String(
    process.env.VOICE_ICE_TURN_USERNAME || process.env.MESSENGER_ICE_TURN_USERNAME || ''
  ).trim();
  const staticCredential = String(
    process.env.VOICE_ICE_TURN_CREDENTIAL || process.env.MESSENGER_ICE_TURN_CREDENTIAL || ''
  ).trim();
  const turnSecret = String(
    process.env.VOICE_ICE_TURN_SECRET || process.env.MESSENGER_ICE_TURN_SECRET || ''
  ).trim();
  const ttlSeconds = Number(
    process.env.VOICE_ICE_TURN_TTL_SECONDS || process.env.MESSENGER_ICE_TURN_TTL_SECONDS || 3600
  );
  const forceRelay = isTruthy(
    process.env.VOICE_ICE_FORCE_RELAY || process.env.MESSENGER_ICE_FORCE_RELAY
  );

  const iceServers: IceServerConfig[] = [];
  if (stunUrls.length && !forceRelay) {
    iceServers.push({ urls: stunUrls.length === 1 ? stunUrls[0] : stunUrls });
  }

  let turnCredentialMode: 'none' | 'static' | 'time-limited' = 'none';
  let turnExpiresAt: number | undefined;
  let source: 'env' | 'default' | 'env-time-limited' = turnUrls.length ? 'env' : 'default';

  if (turnUrls.length) {
    if (turnSecret) {
      const minted = buildTimeLimitedTurnCredentials({
        secret: turnSecret,
        userId: options?.userId || undefined,
        ttlSeconds
      });
      iceServers.push({
        urls: turnUrls.length === 1 ? turnUrls[0] : turnUrls,
        username: minted.username,
        credential: minted.credential
      });
      turnCredentialMode = 'time-limited';
      turnExpiresAt = minted.expiresAt;
      source = 'env-time-limited';
    } else if (staticUser && staticCredential) {
      iceServers.push({
        urls: turnUrls.length === 1 ? turnUrls[0] : turnUrls,
        username: staticUser,
        credential: staticCredential
      });
      turnCredentialMode = 'static';
    }
  }

  if (!iceServers.length) {
    iceServers.push({ urls: 'stun:stun.l.google.com:19302' });
  }

  const hasTurn = iceServers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => isTurnUrl(String(url))) && Boolean(server.username && server.credential);
  });

  return {
    iceServers,
    ...(forceRelay && hasTurn ? { iceTransportPolicy: 'relay' as const } : {}),
    source,
    hasTurn,
    turnCredentialMode,
    ...(turnExpiresAt ? { turnExpiresAt } : {})
  };
};

/** Client-safe payload (never includes raw TURN secret). */
export const getMessengerIceClientPayload = (options?: { userId?: string | null }) => {
  const resolved = resolveMessengerIceServers(options);
  return {
    iceServers: resolved.iceServers,
    iceTransportPolicy: resolved.iceTransportPolicy || 'all',
    hasTurn: resolved.hasTurn,
    source: resolved.source,
    turnCredentialMode: resolved.turnCredentialMode,
    ...(resolved.turnExpiresAt
      ? { turnExpiresAt: new Date(resolved.turnExpiresAt * 1000).toISOString() }
      : {})
  };
};
