import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __prismaSlowQueryListenerAttached: boolean | undefined;
}

const isLocalDev = process.env.NODE_ENV !== 'production';
const parseBooleanEnv = (value: string | undefined, fallback: boolean) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return fallback;
};
const prismaSlowQueryLoggingEnabled = parseBooleanEnv(process.env.PRISMA_SLOW_QUERY_LOGGING, true);
const prismaSlowQueryMs = Math.max(50, Number(process.env.PRISMA_SLOW_QUERY_MS || 350));

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

const prisma = global.__prisma || new PrismaClient({ log: prismaLogConfig });

if (prismaSlowQueryLoggingEnabled && !global.__prismaSlowQueryListenerAttached) {
  prisma.$on('query', (event: any) => {
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

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

export default prisma;
