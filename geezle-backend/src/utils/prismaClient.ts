import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __prismaSlowQueryListenerAttached: boolean | undefined;
  // eslint-disable-next-line no-var
  var __prismaRetryMiddlewareAttached: boolean | undefined;
  // eslint-disable-next-line no-var
  var __prismaConnectPromise: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var __prismaConnectionState: 'idle' | 'connecting' | 'ready' | 'degraded' | undefined;
}

const isLocalDev = process.env.NODE_ENV !== 'production';
const parseBooleanEnv = (value: string | undefined, fallback: boolean) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return fallback;
};
const parseIntegerEnv = (value: string | undefined, fallback: number, min = 1, max = 120) => {
  const numeric = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
};
const wait = (ms: number) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));
const prismaSlowQueryLoggingEnabled = parseBooleanEnv(process.env.PRISMA_SLOW_QUERY_LOGGING, true);
const prismaSlowQueryMs = Math.max(50, Number(process.env.PRISMA_SLOW_QUERY_MS || 350));
// Production: Cloud Run containerConcurrency is typically 80 with maxScale≈5.
// A 5-connection Prisma pool starves under full production traffic (P2024 pool timeout)
// even when Cloud SQL backends remain healthy. Size the pool for concurrent request
// handlers while staying within safe Cloud SQL capacity (5 instances × 15 = 75).
const defaultPrismaConnectionLimit = isLocalDev ? 12 : 15;
const defaultPrismaPoolTimeoutSeconds = isLocalDev ? 25 : 20;
const prismaConnectionLimit = parseIntegerEnv(process.env.PRISMA_CONNECTION_LIMIT, defaultPrismaConnectionLimit, 1, 80);
const prismaPoolTimeoutSeconds = parseIntegerEnv(
  process.env.PRISMA_POOL_TIMEOUT_SECONDS,
  defaultPrismaPoolTimeoutSeconds,
  5,
  120
);
const prismaConnectTimeoutSeconds = parseIntegerEnv(process.env.PRISMA_CONNECT_TIMEOUT_SECONDS, 15, 3, 120);
const prismaReadRetryCount = parseIntegerEnv(process.env.PRISMA_READ_RETRY_COUNT, 2, 0, 5);
const prismaReadRetryBaseDelayMs = parseIntegerEnv(process.env.PRISMA_READ_RETRY_BASE_DELAY_MS, 200, 50, 5_000);
const prismaStartupRetryCount = parseIntegerEnv(process.env.PRISMA_STARTUP_RETRY_COUNT, 4, 1, 12);
const prismaStartupRetryBaseDelayMs = parseIntegerEnv(process.env.PRISMA_STARTUP_RETRY_BASE_DELAY_MS, 400, 100, 10_000);

const resolveGeneratedClientPath = () => {
  const candidates = [
    path.resolve(process.cwd(), 'node_modules/.prisma/client/index.js'),
    path.resolve(__dirname, '../../node_modules/.prisma/client/index.js')
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
};

const detectEngineType = (): 'library' | 'binary' | 'client' | 'unknown' => {
  try {
    const generatedClientPath = resolveGeneratedClientPath();
    if (!generatedClientPath) return 'unknown';
    const source = fs.readFileSync(generatedClientPath, 'utf8');
    const match = source.match(/"engineType"\s*:\s*"([^"]+)"/);
    const value = String(match?.[1] || '').trim().toLowerCase();
    if (value === 'library' || value === 'binary' || value === 'client') return value;
    return 'unknown';
  } catch {
    return 'unknown';
  }
};

const hasPostgresScheme = (url: string) => /^postgres(ql)?:\/\//i.test(url);
const normalizePrismaDatabaseUrl = (rawUrl: string) => {
  const value = String(rawUrl || '').trim();
  if (!value || !hasPostgresScheme(value)) return value;
  try {
    const normalized = new URL(value);
    if (!normalized.searchParams.has('connection_limit')) {
      normalized.searchParams.set('connection_limit', String(prismaConnectionLimit));
    }
    if (!normalized.searchParams.has('pool_timeout')) {
      normalized.searchParams.set('pool_timeout', String(prismaPoolTimeoutSeconds));
    }
    if (!normalized.searchParams.has('connect_timeout')) {
      normalized.searchParams.set('connect_timeout', String(prismaConnectTimeoutSeconds));
    }
    return normalized.toString();
  } catch {
    return value;
  }
};
const assertPrismaEngineCompatibility = () => {
  if (!isLocalDev) return;
  if (String(process.env.PRISMA_ENGINE_GUARD || '').trim().toLowerCase() === 'off') return;

  const dbUrl = String(process.env.DATABASE_URL || '').trim();
  if (!dbUrl) return;

  const engineType = detectEngineType();
  const noEngineClient = engineType === 'client';
  const postgresUrl = hasPostgresScheme(dbUrl);

  if (!noEngineClient || !postgresUrl) return;

  const messageLines = [
    '[startup] Prisma client is generated in no-engine mode (engineType=client), but DATABASE_URL uses postgresql://.',
    '[startup] This combination causes runtime failures (P6001 / prisma:// protocol errors).',
    '[startup] Fix: run `npm run prisma:generate` (without --no-engine) and restart the backend.',
    '[startup] If you intentionally use Accelerate, switch DATABASE_URL to prisma:// or prisma+postgres://.'
  ];
  const message = messageLines.join('\n');
  throw new Error(message);
};

assertPrismaEngineCompatibility();
const normalizedDatabaseUrl = normalizePrismaDatabaseUrl(String(process.env.DATABASE_URL || '').trim());

const prismaLogConfig = prismaSlowQueryLoggingEnabled
  ? [
      { emit: 'event' as const, level: 'query' as const },
      { emit: 'stdout' as const, level: 'warn' as const },
      { emit: 'stdout' as const, level: 'error' as const }
    ]
  : [
      { emit: 'stdout' as const, level: 'warn' as const },
      { emit: 'stdout' as const, level: 'error' as const }
    ];

const databasePool = normalizedDatabaseUrl
  ? new Pool({
      connectionString: normalizedDatabaseUrl,
      max: prismaConnectionLimit,
      connectionTimeoutMillis: prismaConnectTimeoutSeconds * 1000,
      idleTimeoutMillis: prismaPoolTimeoutSeconds * 1000
    })
  : null;
const prismaAdapter = databasePool ? new PrismaPg(databasePool) : undefined;
const prisma = global.__prisma || new PrismaClient({
  adapter: prismaAdapter as any,
  log: prismaLogConfig
});

export const disconnectPrisma = async () => {
  await prisma.$disconnect();
  await databasePool?.end();
};

const prismaRetryableCodes = new Set(['P1001', 'P1002', 'P1017', 'P2024', 'P2037']);
const prismaRetryableMessagePatterns = [
  'too many connections',
  'connection pool timeout',
  'timed out fetching a new connection',
  'connection terminated unexpectedly',
  'server has closed the connection',
  'cannot reach database server',
  'can\'t reach database server',
  'remaining connection slots are reserved',
  'econnreset',
  'etimedout',
  'connection closed',
  'connection refused'
];
const prismaReadActions = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy'
]);

const isRetryablePrismaError = (error: unknown) => {
  const code = String((error as any)?.code || '').trim().toUpperCase();
  if (code && prismaRetryableCodes.has(code)) return true;
  const message = String((error as any)?.message || '').trim().toLowerCase();
  return prismaRetryableMessagePatterns.some((pattern) => message.includes(pattern));
};

export const getPrismaConnectionState = () => global.__prismaConnectionState || 'idle';

export const ensurePrismaReady = async () => {
  if (global.__prismaConnectionState === 'ready') return;
  if (global.__prismaConnectPromise) return global.__prismaConnectPromise;
  global.__prismaConnectionState = 'connecting';
  global.__prismaConnectPromise = (async () => {
    try {
      for (let attempt = 0; attempt < prismaStartupRetryCount; attempt += 1) {
        try {
          await prisma.$connect();
          global.__prismaConnectionState = 'ready';
          return;
        } catch (error) {
          global.__prismaConnectionState = 'degraded';
          const isLastAttempt = attempt === prismaStartupRetryCount - 1;
          console.warn(
            '[prisma:connect]',
            JSON.stringify({
              attempt: attempt + 1,
              maxAttempts: prismaStartupRetryCount,
              willRetry: !isLastAttempt,
              error: String((error as any)?.message || error || '').slice(0, 260)
            })
          );
          if (isLastAttempt) throw error;
          await wait(prismaStartupRetryBaseDelayMs * (attempt + 1));
        }
      }
    } finally {
      global.__prismaConnectPromise = undefined;
    }
  })();
  return global.__prismaConnectPromise;
};

if (prismaSlowQueryLoggingEnabled && !global.__prismaSlowQueryListenerAttached && typeof (prisma as any)?.$on === 'function') {
  (prisma as any).$on('query', (event: any) => {
    const duration = Number(event?.duration || 0);
    if (!Number.isFinite(duration) || duration < prismaSlowQueryMs) return;

    const query = String(event?.query || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 600);

    console.warn(
      '[prisma:slow-query]',
      JSON.stringify({
        durationMs: duration,
        target: String(event?.target || ''),
        query,
        paramsLength: String(event?.params || '').length,
        timestamp: new Date().toISOString()
      })
    );
  });
  global.__prismaSlowQueryListenerAttached = true;
}

if (!global.__prismaRetryMiddlewareAttached && typeof (prisma as any)?.$use === 'function') {
  (prisma as any).$use(async (params: any, next: (params: any) => Promise<any>) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const result = await next(params);
        if (global.__prismaConnectionState !== 'ready') {
          global.__prismaConnectionState = 'ready';
        }
        return result;
      } catch (error) {
        const action = String(params?.action || '').trim();
        const shouldRetry =
          attempt < prismaReadRetryCount &&
          prismaReadActions.has(action) &&
          isRetryablePrismaError(error);
        if (!shouldRetry) {
          global.__prismaConnectionState = 'degraded';
          throw error;
        }

        const delayMs = prismaReadRetryBaseDelayMs * (attempt + 1);
        console.warn(
          '[prisma:retry]',
          JSON.stringify({
            action,
            model: String(params?.model || ''),
            attempt: attempt + 1,
            maxRetries: prismaReadRetryCount,
            delayMs,
            error: String((error as any)?.message || error || '').slice(0, 220)
          })
        );
        await wait(delayMs);
        try {
          await prisma.$connect();
          global.__prismaConnectionState = 'ready';
        } catch (connectError) {
          global.__prismaConnectionState = 'degraded';
          console.warn(
            '[prisma:retry-connect]',
            JSON.stringify({
              action,
              attempt: attempt + 1,
              error: String((connectError as any)?.message || connectError || '').slice(0, 220)
            })
          );
        }
      }
    }
  });
  global.__prismaRetryMiddlewareAttached = true;
}

// Always retain the process-wide singleton (dev hot-reload and production).
global.__prisma = prisma;

if (process.env.NODE_ENV === 'production') {
  console.log(
    '[prisma:pool-config]',
    JSON.stringify({
      connectionLimit: prismaConnectionLimit,
      poolTimeoutSeconds: prismaPoolTimeoutSeconds,
      connectTimeoutSeconds: prismaConnectTimeoutSeconds,
      readRetryCount: prismaReadRetryCount,
      slowQueryLogging: prismaSlowQueryLoggingEnabled,
      slowQueryMs: prismaSlowQueryMs
    })
  );
}

export default prisma;
