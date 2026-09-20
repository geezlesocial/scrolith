import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const collectNodeTestFiles = (dir) => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') {
        files.push(...collectNodeTestFiles(fullPath));
      }
      continue;
    }
    if (!/\.(test|spec)\.ts$/.test(entry.name)) {
      continue;
    }
    const source = readFileSync(fullPath, 'utf8');
    if (source.includes("from 'node:test'") || source.includes('from "node:test"')) {
      files.push(relative(process.cwd(), fullPath));
    }
  }
  return files;
};

const nodeTestFiles = ['src', 'tests']
  .filter((dir) => statSync(dir, { throwIfNoEntry: false })?.isDirectory())
  .flatMap(collectNodeTestFiles);

const testTimeoutMs = Number.parseInt(process.env.NODE_TEST_TIMEOUT_MS || '120000', 10);

for (const file of nodeTestFiles) {
  console.log(`[node:test] ${file}`);
  // These files are runtime node:test contracts. Type-checking every isolated
  // child process makes the aggregate runner appear hung; `build` and
  // `build:prod` provide the type-safety gate separately.
  const result = spawnSync(process.execPath, ['--require', 'ts-node/register/transpile-only', file], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false,
    timeout: testTimeoutMs,
    killSignal: 'SIGTERM'
  });

  if (result.error?.code === 'ETIMEDOUT') {
    console.error(`[node:test] timed out after ${testTimeoutMs}ms: ${file}`);
    process.exit(1);
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}
