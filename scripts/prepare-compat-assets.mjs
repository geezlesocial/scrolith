import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const origins = (process.env.COMPAT_ASSET_ORIGINS || process.env.COMPAT_ASSET_ORIGIN || '')
  .split(',')
  .map((value) => value.trim().replace(/\/$/, ''))
  .filter(Boolean);
const distRoot = path.resolve(process.env.COMPAT_ASSET_OUTPUT || 'dist');
const assetRoot = path.join(distRoot, 'assets');
const maxAssets = Number.parseInt(process.env.COMPAT_MAX_ASSETS || '1000', 10);
const maxBytes = Number.parseInt(process.env.COMPAT_MAX_BYTES || String(160 * 1024 * 1024), 10);
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.mjs', '.svg', '.txt']);

if (origins.length === 0) {
  console.log('Compatibility asset import skipped: COMPAT_ASSET_ORIGIN is not set.');
  process.exit(0);
}

const originUrls = origins.map((origin) => new URL(origin));

const assetPathsFrom = (text) => {
  const paths = new Set();
  const pattern = /(?:https?:\/\/[^\s"'`<>]+)?(\/assets\/[A-Za-z0-9][A-Za-z0-9._/-]*)/g;

  for (const match of text.matchAll(pattern)) {
    const assetPath = match[1].split(/[?#]/, 1)[0];
    if (!assetPath.includes('..')) paths.add(assetPath);
  }

  // Vite's dynamic-import manifest stores lazy chunks as bare asset names in
  // the main bundle. Resolve those names from the shared assets directory so
  // an older HTML shell can still load its route chunks during a split.
  const bareAssetPattern = /["'`](?:\.\/)?(?:assets\/)?([A-Za-z0-9][A-Za-z0-9._-]*\.(?:css|js|json|mjs|svg|txt))["'`]/g;
  for (const match of text.matchAll(bareAssetPattern)) {
    paths.add(`/assets/${match[1]}`);
  }

  return paths;
};

const fetchSameOrigin = async (originUrl, assetPath) => {
  const url = new URL(assetPath, `${originUrl.origin}/`);
  const response = await fetch(url, { redirect: 'follow' });

  if (new URL(response.url).origin !== originUrl.origin) {
    throw new Error(`redirected off compatibility origin: ${assetPath}`);
  }
  if (!response.ok) {
    throw new Error(`${assetPath} returned HTTP ${response.status}`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  if (body.length === 0) throw new Error(`${assetPath} returned an empty body`);
  return body;
};

const roots = await Promise.all(
  originUrls.map(async (originUrl) => ({
    originUrl,
    body: await fetchSameOrigin(originUrl, '/'),
  })),
);
const queue = roots.flatMap(({ originUrl, body }) =>
  [...assetPathsFrom(body.toString('utf8'))].map((assetPath) => ({ originUrl, assetPath })),
);
const queued = new Set(queue.map(({ originUrl, assetPath }) => `${originUrl.origin}\0${assetPath}`));
const downloaded = [];
const failures = [];
let totalBytes = 0;
const assetSources = new Map();

while (queue.length > 0) {
  if (downloaded.length >= maxAssets) throw new Error(`compatibility asset limit exceeded (${maxAssets})`);

  const { originUrl, assetPath } = queue.shift();
  const localPath = path.join(distRoot, assetPath.replace(/^\//, '').split('/').join(path.sep));
  const existing = await readFile(localPath).catch(() => null);

  try {
    const body = await fetchSameOrigin(originUrl, assetPath);
    totalBytes += body.length;
    if (totalBytes > maxBytes) throw new Error(`compatibility asset size limit exceeded (${maxBytes} bytes)`);

    const previousSource = assetSources.get(localPath);
    if (previousSource && !previousSource.equals(body)) {
      throw new Error(`asset collision across compatibility origins: ${assetPath}`);
    }
    if (existing && !existing.equals(body)) {
      throw new Error(`existing asset differs from compatibility origin: ${assetPath}`);
    }
    if (!existing) {
      await mkdir(path.dirname(localPath), { recursive: true });
      await writeFile(localPath, body);
      downloaded.push({ path: assetPath, bytes: body.length });
    }
    assetSources.set(localPath, body);

    const extension = path.extname(assetPath).toLowerCase();
    if (textExtensions.has(extension)) {
      for (const nestedPath of assetPathsFrom(body.toString('utf8'))) {
        const nestedKey = `${originUrl.origin}\0${nestedPath}`;
        if (!queued.has(nestedKey)) {
          queued.add(nestedKey);
          queue.push({ originUrl, assetPath: nestedPath });
        }
      }
    }
  } catch (error) {
    failures.push(`${assetPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  throw new Error(`compatibility asset import failed:\n${failures.join('\n')}`);
}

console.log(`Imported ${downloaded.length} compatibility assets (${totalBytes} bytes) from ${origins.join(', ')}.`);
