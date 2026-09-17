import Redis from 'ioredis';
import { ManagedIdentityCredential } from '@azure/identity';

const DEFAULT_AUDIENCE = 'https://redis.azure.com/.default';
const REFRESH_BEFORE_MS = 3 * 60_000;

type ManagedIdentityToken = { access_token: string; expires_in: number };

async function acquireToken(credential: ManagedIdentityCredential): Promise<ManagedIdentityToken> {
  const token = await credential.getToken(DEFAULT_AUDIENCE);
  if (!token?.token || !Number.isFinite(token.expiresOnTimestamp)) {
    throw new Error('Managed identity token response invalid');
  }
  return {
    access_token: token.token,
    expires_in: Math.max(30, Math.floor((token.expiresOnTimestamp - Date.now()) / 1000))
  };
}

export type EntraRedisConfig = {
  clientId: string;
  username?: string;
  audience?: string;
};

/**
 * Authenticates an ioredis connection with the staging user-assigned managed
 * identity. Tokens are held in memory only and refreshed before expiry.
 */
export async function connectWithManagedIdentity(redis: Redis, config: EntraRedisConfig): Promise<() => void> {
  const username = String(config.username || config.clientId).trim();
  if (!username) throw new Error('Redis Entra username is required');
  const credential = new ManagedIdentityCredential(config.clientId);
  const token = await acquireToken(credential);
  // Azure Managed Redis accepts the Redis resource token as the password.
  // The audience is fixed by the provider contract; keep the option explicit
  // so callers cannot silently select an unrelated resource.
  if ((config.audience || DEFAULT_AUDIENCE) !== DEFAULT_AUDIENCE) throw new Error('Unsupported Redis Entra audience');
  redis.options.username = username;
  redis.options.password = token.access_token;
  await redis.connect();

  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const schedule = (expiresInSeconds: number) => {
    const jitter = Math.floor(Math.random() * 30_000);
    const delay = Math.max(30_000, expiresInSeconds * 1000 - REFRESH_BEFORE_MS - jitter);
    timer = setTimeout(async () => {
      if (stopped) return;
      try {
        const next = await acquireToken(credential);
        await redis.auth(username, next.access_token);
        schedule(next.expires_in);
      } catch {
        schedule(Math.min(60, Math.max(30, expiresInSeconds / 2)));
      }
    }, delay);
    timer.unref?.();
  };
  schedule(token.expires_in);
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
