/**
 * Deep / component health checks for SRE probes.
 * Additive endpoints — does not change /api/health semantics.
 */

import net from 'net';
import { getPrismaConnectionState } from '../prismaClient';
import prisma from '../prismaClient';
import { recordDbMetric, recordRedisMetric } from './metricsRegistry';

export type ComponentStatus = 'up' | 'down' | 'degraded' | 'skipped';

export type ComponentCheck = {
  name: string;
  status: ComponentStatus;
  latencyMs?: number;
  detail?: string;
};

export type DeepHealthReport = {
  status: 'OK' | 'DEGRADED' | 'ERROR';
  timestamp: string;
  uptimeSeconds: number;
  components: ComponentCheck[];
};

const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const checkDatabase = async (): Promise<ComponentCheck> => {
  const started = Date.now();
  const state = getPrismaConnectionState();
  recordDbMetric({ event: 'pool', poolReady: state !== 'degraded' });
  if (state === 'degraded') {
    return { name: 'database', status: 'degraded', detail: 'prisma connection degraded' };
  }
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 2500, 'database');
    const latencyMs = Date.now() - started;
    recordDbMetric({ event: 'query', operation: 'health_select1', seconds: latencyMs / 1000 });
    return { name: 'database', status: 'up', latencyMs };
  } catch (error: any) {
    recordDbMetric({ event: 'error', operation: 'health_select1' });
    return {
      name: 'database',
      status: 'down',
      latencyMs: Date.now() - started,
      detail: String(error?.message || 'query failed').slice(0, 200)
    };
  }
};

const checkRedis = async (): Promise<ComponentCheck> => {
  const url = String(process.env.REDIS_URL || process.env.REDIS || '').trim();
  if (!url) {
    return { name: 'redis', status: 'skipped', detail: 'REDIS_URL not configured' };
  }
  const started = Date.now();
  try {
    // Lazy require to avoid hard dependency at boot when unused.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Redis = require('ioredis');
    const client = new Redis(url, {
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false
    });
    try {
      await withTimeout(client.connect(), 2000, 'redis-connect');
      const pong = await withTimeout(client.ping(), 1500, 'redis-ping');
      const latencyMs = Date.now() - started;
      recordRedisMetric({ result: 'ok', op: 'ping', latencyMs });
      await client.quit().catch(() => undefined);
      return {
        name: 'redis',
        status: String(pong).toUpperCase() === 'PONG' ? 'up' : 'degraded',
        latencyMs
      };
    } catch (error: any) {
      recordRedisMetric({ result: 'error', op: 'ping' });
      try {
        client.disconnect();
      } catch {
        // noop
      }
      return {
        name: 'redis',
        status: 'down',
        latencyMs: Date.now() - started,
        detail: String(error?.message || 'redis failed').slice(0, 200)
      };
    }
  } catch (error: any) {
    return {
      name: 'redis',
      status: 'down',
      detail: String(error?.message || 'ioredis unavailable').slice(0, 200)
    };
  }
};

const tcpProbe = (host: string, port: number, timeoutMs = 2000): Promise<number> =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const socket = new net.Socket();
    const done = (err?: Error) => {
      try {
        socket.destroy();
      } catch {
        // noop
      }
      if (err) reject(err);
      else resolve(Date.now() - started);
    };
    socket.setTimeout(timeoutMs);
    socket.once('error', (e) => done(e));
    socket.once('timeout', () => done(new Error('tcp timeout')));
    socket.connect(port, host, () => done());
  });

const checkTurn = async (): Promise<ComponentCheck> => {
  const raw =
    process.env.VOICE_ICE_TURN_URLS ||
    process.env.MESSENGER_ICE_TURN_URLS ||
    process.env.TURN_HOST ||
    '';
  const first = String(raw)
    .split(/[,\n]/)[0]
    ?.trim();
  if (!first) {
    return { name: 'turn', status: 'skipped', detail: 'TURN URLs not configured' };
  }
  // Parse turn:host:port or host:port
  let host = '';
  let port = 3478;
  try {
    const cleaned = first.replace(/^turns?:/i, '').split('?')[0];
    if (cleaned.includes(':')) {
      const parts = cleaned.split(':');
      host = parts[0];
      port = Number(parts[1]) || 3478;
    } else {
      host = cleaned;
    }
  } catch {
    return { name: 'turn', status: 'skipped', detail: 'unable to parse TURN host' };
  }
  if (!host) {
    return { name: 'turn', status: 'skipped', detail: 'empty TURN host' };
  }
  try {
    const latencyMs = await tcpProbe(host, port, 2500);
    return { name: 'turn', status: 'up', latencyMs, detail: `${host}:${port}` };
  } catch (error: any) {
    return {
      name: 'turn',
      status: 'down',
      detail: String(error?.message || 'tcp failed').slice(0, 200)
    };
  }
};

const checkSocket = (connectedClients: number): ComponentCheck => ({
  name: 'socket_io',
  status: 'up',
  detail: `connected=${connectedClients}`,
  latencyMs: 0
});

const checkStorage = (): ComponentCheck => {
  const bucket =
    process.env.GCS_BUCKET ||
    process.env.GOOGLE_CLOUD_STORAGE_BUCKET ||
    process.env.STORAGE_BUCKET ||
    '';
  if (!bucket) {
    return { name: 'storage', status: 'skipped', detail: 'bucket env not set' };
  }
  return { name: 'storage', status: 'up', detail: 'configured' };
};

const checkAi = (): ComponentCheck => {
  const hasKey = Boolean(
    process.env.OPENAI_API_KEY ||
      process.env.GOOGLE_AI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.SCROLITHA_AI_ENDPOINT
  );
  if (!hasKey) {
    return { name: 'ai', status: 'skipped', detail: 'AI provider env not set' };
  }
  return { name: 'ai', status: 'up', detail: 'provider configured' };
};

export const runDeepHealthChecks = async (options?: {
  socketConnected?: number;
}): Promise<DeepHealthReport> => {
  const [database, redis, turn] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkTurn()
  ]);
  const components: ComponentCheck[] = [
    database,
    redis,
    turn,
    checkSocket(Number(options?.socketConnected || 0)),
    checkStorage(),
    checkAi(),
    {
      name: 'api',
      status: 'up',
      detail: 'process serving'
    }
  ];

  const hardDown = components.some((c) => c.status === 'down' && c.name === 'database');
  const anyDown = components.some((c) => c.status === 'down');
  const anyDegraded = components.some((c) => c.status === 'degraded');

  let status: DeepHealthReport['status'] = 'OK';
  if (hardDown) status = 'ERROR';
  else if (anyDown || anyDegraded) status = 'DEGRADED';

  return {
    status,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    components
  };
};
