import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

const jestBin = './node_modules/jest/bin/jest.js';
const jestTimeoutMs = Number.parseInt(process.env.JEST_TEST_TIMEOUT_MS || '60000', 10);
const groupTimeoutMs = Number.parseInt(process.env.JEST_GROUP_TIMEOUT_MS || '900000', 10);
const groupSize = Number.parseInt(process.env.JEST_GROUP_SIZE || '12', 10);

const listResult = spawnSync(
  process.execPath,
  [jestBin, '--config', 'jest.config.cjs', '--listTests', '--json'],
  { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 120000, shell: false }
);

if (listResult.error?.code === 'ETIMEDOUT' || listResult.status !== 0) {
  console.error('[jest] unable to enumerate test files within the bounded discovery window');
  process.exit(1);
}

const jestFiles = JSON.parse(listResult.stdout || '[]').sort();
const groups = [];
const isolatedFiles = jestFiles.filter((file) =>
  /integration[\\/]socket\.integration\.test\.[jt]sx?$/.test(file) ||
  /[\\/]gcoin[^\\/]*\.test\.[jt]sx?$/.test(file)
);
const regularFiles = jestFiles.filter((file) => !isolatedFiles.includes(file));
for (let index = 0; index < regularFiles.length; index += groupSize) {
  groups.push(regularFiles.slice(index, index + groupSize));
}
for (const file of isolatedFiles) {
  groups.push([file]);
}

const resultDir = mkdtempSync(join(tmpdir(), 'scrolith-jest-results-'));
const totals = {
  numTotalTestSuites: 0,
  numPassedTestSuites: 0,
  numFailedTestSuites: 0,
  numPendingTestSuites: 0,
  numTotalTests: 0,
  numPassedTests: 0,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0
};
const execution = {
  groupsStarted: 0,
  groupsCompleted: 0,
  timedOutGroups: 0,
  unreadableGroups: 0
};

const addTotals = (summary) => {
  for (const key of Object.keys(totals)) {
    totals[key] += Number(summary[key] || 0);
  }
};

const cleanupLocalRedis = async () => {
  if (process.env.REDIS_TEST_MODE !== 'local' || !process.env.REDIS_URL) return;
  let client;
  try {
    const { default: Redis } = await import('ioredis');
    client = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000
    });
    await client.connect();
    const keys = [];
    for (const pattern of ['gcoin:*', 'scrolith:ratelimit:*']) {
      let cursor = '0';
      do {
        const [nextCursor, found] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', '500');
        cursor = nextCursor;
        keys.push(...found);
      } while (cursor !== '0');
    }
    if (keys.length > 0) await client.del(...keys);
    await client.quit();
  } catch {
    client?.disconnect();
  }
};

let exitCode = 0;
for (const [index, files] of groups.entries()) {
  execution.groupsStarted += 1;
  const outputFile = join(resultDir, `group-${String(index + 1).padStart(3, '0')}.json`);
  console.log(`[jest] group ${index + 1}/${groups.length}: ${files.length} files`);
  const result = spawnSync(
    process.execPath,
    [
      '--max-old-space-size=4096',
      jestBin,
      '--config', 'jest.config.cjs',
      '--runInBand',
      '--detectOpenHandles',
      '--forceExit',
      '--testTimeout', String(jestTimeoutMs),
      '--json',
      '--outputFile', outputFile,
      '--runTestsByPath',
      ...files
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
      shell: false,
      timeout: groupTimeoutMs,
      killSignal: 'SIGTERM'
    }
  );

  if (result.error?.code === 'ETIMEDOUT') {
    console.error(`[jest] group ${index + 1} timed out after ${groupTimeoutMs}ms`);
    execution.timedOutGroups += 1;
    exitCode = 1;
    break;
  }

  try {
    addTotals(JSON.parse(readFileSync(outputFile, 'utf8')));
    execution.groupsCompleted += 1;
  } catch {
    console.error(`[jest] group ${index + 1} produced no readable result summary`);
    execution.unreadableGroups += 1;
    exitCode = 1;
  }

  await cleanupLocalRedis();

  if ((result.status ?? 1) !== 0) {
    exitCode = result.status ?? 1;
    break;
  }
}

const complete = execution.groupsCompleted === groups.length && execution.timedOutGroups === 0 && execution.unreadableGroups === 0;
console.log(`[jest] aggregate ${JSON.stringify({ ...totals, execution, complete })}`);
rmSync(resultDir, { recursive: true, force: true });
process.exit(complete ? exitCode : 1);
