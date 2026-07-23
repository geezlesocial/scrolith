import { spawnSync } from 'node:child_process';

const command = process.argv.slice(2);

if (command.length === 0) {
  throw new Error('Usage: node scripts/run-cloudbuild-test-command.mjs <command> [...args]');
}

Object.assign(process.env, {
  NODE_ENV: 'test',
  APP_RUNTIME: 'test',
  DISABLE_BACKGROUND_WORKERS: 'true',
  DATABASE_URL: 'postgresql://scrolith_test@postgres-test:5432/scrolith_test',
  TEST_DB_KIND: 'cloudbuild-postgres',
  TEST_DB_PROJECT: 'cloudbuild-ephemeral',
  TEST_DB_INSTANCE: 'cloudbuild-ephemeral-postgres-test',
  TEST_DB_NAME: 'scrolith_test',
  TEST_DB_HOST: 'postgres-test',
  TEST_DB_PORT: '5432',
  JWT_SECRET: 'local_test_jwt_secret',
  JWT_EXPIRES_IN: '1h',
  FRONTEND_URL: 'http://localhost:3000',
  FRONTEND_ORIGIN: 'http://localhost:3000',
  NOTIFICATION_DIGEST_CRON_ENABLED: 'false',
  NOTIFICATION_RETENTION_PURGE_ENABLED: 'false',
  ALLOW_DEV_AUTH_BYPASS: 'true',
  ALLOW_DEV_ADMIN_BYPASS: 'true'
});

const executable = command[0];
const useShell = process.platform === 'win32';
const result = spawnSync(executable, command.slice(1), {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
  shell: useShell
});

if (result.error) {
  console.error(result.error);
}

process.exit(result.status ?? 1);
