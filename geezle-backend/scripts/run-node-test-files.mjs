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

for (const file of nodeTestFiles) {
  console.log(`[node:test] ${file}`);
  const result = spawnSync(process.execPath, ['--require', 'ts-node/register', file], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false
  });

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}
