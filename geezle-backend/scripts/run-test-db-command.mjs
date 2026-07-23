import { spawnSync } from 'node:child_process';

process.env.NODE_ENV = 'test';
process.env.APP_RUNTIME = 'test';
process.env.DISABLE_BACKGROUND_WORKERS = 'true';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://scrolith_test:local_test_password@127.0.0.1:55432/scrolith_test';
process.env.TEST_DB_KIND = process.env.TEST_DB_KIND || 'local-postgres';
process.env.TEST_DB_PROJECT = process.env.TEST_DB_PROJECT || 'local-only';
process.env.TEST_DB_INSTANCE = process.env.TEST_DB_INSTANCE || 'local-postgres-test';
process.env.TEST_DB_NAME = process.env.TEST_DB_NAME || 'scrolith_test';

try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: '.env.test', override: false });
} catch {
  // dotenv is best-effort for local test database commands.
}

await import('./test-db-guard.mjs');

const args = process.argv.slice(2);
if (args.length === 0 || (args.length === 1 && args[0] === '--guard-only')) {
  process.exit(0);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npx, ['prisma', ...args], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
  shell: false
});

process.exit(result.status ?? 1);
