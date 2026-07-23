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
process.env.JWT_SECRET = process.env.JWT_SECRET || 'local_test_jwt_secret';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
process.env.FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
process.env.NOTIFICATION_DIGEST_CRON_ENABLED = process.env.NOTIFICATION_DIGEST_CRON_ENABLED || 'false';
process.env.NOTIFICATION_RETENTION_PURGE_ENABLED = process.env.NOTIFICATION_RETENTION_PURGE_ENABLED || 'false';
process.env.ALLOW_DEV_AUTH_BYPASS = process.env.ALLOW_DEV_AUTH_BYPASS || 'true';
process.env.ALLOW_DEV_ADMIN_BYPASS = process.env.ALLOW_DEV_ADMIN_BYPASS || 'true';

await import('./test-db-guard.mjs');

const nodeTestResult = spawnSync(
  process.execPath,
  ['scripts/run-node-test-files.mjs'],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false
  }
);

if ((nodeTestResult.status ?? 1) !== 0) {
  process.exit(nodeTestResult.status ?? 1);
}

const result = spawnSync(
  process.execPath,
  ['--max-old-space-size=4096', './node_modules/jest/bin/jest.js', '--config', 'jest.config.cjs', '--runInBand', '--detectOpenHandles'],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false
  }
);

process.exit(result.status ?? 1);
