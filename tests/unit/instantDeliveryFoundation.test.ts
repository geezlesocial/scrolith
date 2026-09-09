import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const projectRoot = join(import.meta.dirname, '..', '..');

test('instant delivery service worker keeps an offline shell and bounded media cache', () => {
  const worker = readFileSync(join(projectRoot, 'public', 'sw.js'), 'utf8');

  assert.match(worker, /const SHELL_CACHE = 'scrolith-shell-v2'/);
  assert.match(worker, /cache\.add\(url\)/);
  assert.match(worker, /shell\.match\('\/index\.html'\)/);
  assert.match(worker, /const MEDIA_MAX_BYTES = 60 \* 1024 \* 1024/);
  assert.match(worker, /const MEDIA_TTL_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(worker, /deleteMediaEntry/);
});

test('instant graph refreshes its remote gate without caching private responses', () => {
  const runtime = readFileSync(join(projectRoot, 'src', 'services', 'instantGraph.ts'), 'utf8');

  assert.match(runtime, /INSTANT_GRAPH_VERSION = 'phase1\.1\.0'/);
  assert.match(runtime, /Date\.now\(\) - configFetchedAt < 60_000/);
  assert.match(runtime, /credentials: 'omit'/);
  assert.match(runtime, /includeFeed: 'false'/);
});
