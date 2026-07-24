/**
 * ICE / STUN / TURN configuration for messenger WebRTC voice calls.
 * Reads platform env — never exposes secrets beyond ephemeral ICE credentials.
 */

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

/**
 * Build RTCConfiguration.iceServers for clients.
 *
 * Env (optional):
 * - VOICE_ICE_STUN_URLS (comma/newline, default Google STUN)
 * - VOICE_ICE_TURN_URLS
 * - VOICE_ICE_TURN_USERNAME
 * - VOICE_ICE_TURN_CREDENTIAL
 * - VOICE_ICE_FORCE_RELAY=true → iceTransportPolicy relay
 */
export const resolveMessengerIceServers = (): {
  iceServers: IceServerConfig[];
  iceTransportPolicy?: 'all' | 'relay';
  source: 'env' | 'default';
} => {
  const stunUrls = splitList(
    process.env.VOICE_ICE_STUN_URLS ||
      process.env.MESSENGER_ICE_STUN_URLS ||
      'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302'
  );
  const turnUrls = splitList(
    process.env.VOICE_ICE_TURN_URLS || process.env.MESSENGER_ICE_TURN_URLS || ''
  );
  const turnUsername = String(
    process.env.VOICE_ICE_TURN_USERNAME || process.env.MESSENGER_ICE_TURN_USERNAME || ''
  ).trim();
  const turnCredential = String(
    process.env.VOICE_ICE_TURN_CREDENTIAL || process.env.MESSENGER_ICE_TURN_CREDENTIAL || ''
  ).trim();
  const forceRelay = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.VOICE_ICE_FORCE_RELAY || process.env.MESSENGER_ICE_FORCE_RELAY || '')
      .trim()
      .toLowerCase()
  );

  const iceServers: IceServerConfig[] = [];
  if (stunUrls.length) {
    iceServers.push({ urls: stunUrls.length === 1 ? stunUrls[0] : stunUrls });
  }
  if (turnUrls.length && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrls.length === 1 ? turnUrls[0] : turnUrls,
      username: turnUsername,
      credential: turnCredential
    });
  }

  if (!iceServers.length) {
    iceServers.push({ urls: 'stun:stun.l.google.com:19302' });
  }

  return {
    iceServers,
    ...(forceRelay ? { iceTransportPolicy: 'relay' as const } : {}),
    source: turnUrls.length ? 'env' : 'default'
  };
};

export const getMessengerIceClientPayload = () => {
  const resolved = resolveMessengerIceServers();
  return {
    iceServers: resolved.iceServers,
    iceTransportPolicy: resolved.iceTransportPolicy || 'all',
    hasTurn: resolved.iceServers.some((server) => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      return urls.some((url) => String(url).toLowerCase().includes('turn:'));
    }),
    source: resolved.source
  };
};
