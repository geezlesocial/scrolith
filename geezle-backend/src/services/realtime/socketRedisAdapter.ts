import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';

type SocketServerLike = {
  adapter(factory: unknown): void;
};

export type SocketRedisAdapterLifecycle = {
  enabled: boolean;
  close: () => Promise<void>;
};

const truthy = (value: unknown): boolean =>
  ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());

const resolveRedisUrl = (): string =>
  String(
    process.env.REALTIME_REDIS_URL ||
      process.env.REDIS_URL ||
      process.env.REDIS_CONNECTION_STRING ||
      ''
  ).trim();

const redisIsRequired = (): boolean =>
  truthy(process.env.REALTIME_REDIS_REQUIRED) ||
  String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';

const closeClient = async (client: Redis): Promise<void> => {
  if (client.status === 'ready' || client.status === 'connecting') {
    await client.quit().catch(() => client.disconnect());
    return;
  }
  client.disconnect();
};

const disabledLifecycle = (): SocketRedisAdapterLifecycle => ({
  enabled: false,
  close: async () => undefined
});

const installedForServer = new WeakMap<object, SocketRedisAdapterLifecycle>();

/**
 * Installs the official Socket.IO Redis adapter for cross-replica broadcasts.
 * Engine.IO polling still requires Azure session affinity; the adapter only
 * distributes Socket.IO namespace/room events after a connection is bound.
 */
export async function installSocketRedisAdapter(
  io: SocketServerLike
): Promise<SocketRedisAdapterLifecycle> {
  const existing = installedForServer.get(io);
  if (existing) return existing;

  const redisUrl = resolveRedisUrl();
  if (!redisUrl) {
    if (redisIsRequired()) {
      throw new Error('Realtime Redis is required but no realtime Redis URL is configured.');
    }
    console.warn('[realtime] Redis adapter disabled; using process-local Socket.IO state.');
    const lifecycle = disabledLifecycle();
    installedForServer.set(io, lifecycle);
    return lifecycle;
  }

  const options = { lazyConnect: true, maxRetriesPerRequest: null };
  const pubClient = new Redis(redisUrl, options);
  const subClient = new Redis(redisUrl, options);

  try {
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));

    const lifecycle: SocketRedisAdapterLifecycle = {
      enabled: true,
      close: async () => {
        await Promise.all([closeClient(pubClient), closeClient(subClient)]);
      }
    };
    installedForServer.set(io, lifecycle);
    console.log('[realtime] Socket.IO Redis adapter enabled.');
    return lifecycle;
  } catch (error) {
    await Promise.all([closeClient(pubClient), closeClient(subClient)]);
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    console.error(`[realtime] Socket.IO Redis adapter initialization failed (${errorName}).`);
    if (redisIsRequired()) {
      throw new Error('Realtime Redis adapter initialization failed.');
    }
    const lifecycle = disabledLifecycle();
    installedForServer.set(io, lifecycle);
    return lifecycle;
  }
}

