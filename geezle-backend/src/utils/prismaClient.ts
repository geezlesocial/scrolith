import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const isLocalDev = process.env.NODE_ENV !== 'production';

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

const prisma = global.__prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

export default prisma;
