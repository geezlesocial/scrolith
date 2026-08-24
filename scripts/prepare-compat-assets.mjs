import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const origin = (process.env.COMPAT_ASSET_ORIGIN || '').trim().replace(/\/$/, '');
const distRoot = path.resolve(process.env.COMPAT_ASSET_OUTPUT || 'dist');
const assetRoot = path.join(distRoot, 'assets');
const maxAssets = 500;
const maxBytes = 80 * 1024 * 1024;
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.mjs', '.svg', '.txt']);

if (!origin) {
  console.log('Compatibility asset import skipped: COMPAT_ASSET_ORIGIN is not set.');
  process.exit(0);
}

const originUrl = new URL(origin);

const assetPathsFrom = (text) => {
  const paths = new Set();
  const pattern = /(?:https?:\/\/[^\s"'`<>]+)?(\/assets\/[A-Za-z0-9][A-Za-z0-9._/-]*)/g;

  for (const match of text.matchAll(pattern)) {
    const assetPath = match[1].split(/[?#]/, 1)[0];
    if (!assetPath.includes('..')) paths.add(assetPath);
  }

  return paths;
};

const fetchSameOrigin = async (assetPath) => {
  const url = new URL(assetPath, `${origin}/`);
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

const rootResponse = await fetchSameOrigin('/');
const queue = [...assetPathsFrom(rootResponse.toString('utf8'))];
const queued = new Set(queue);
const downloaded = [];
const failures = [];
let totalBytes = 0;

while (queue.length > 0) {
  if (downloaded.length >= maxAssets) throw new Error(`compatibility asset limit exceeded (${maxAssets})`);

  const assetPath = queue.shift();
  const localPath = path.join(distRoot, assetPath.replace(/^\//, '').split('/').join(path.sep));
  const existing = await readFile(localPath).catch(() => null);

  try {
    const body = existing || await fetchSameOrigin(assetPath);
    totalBytes += body.length;
    if (totalBytes > maxBytes) throw new Error(`compatibility asset size limit exceeded (${maxBytes} bytes)`);

    if (!existing) {
      await mkdir(path.dirname(localPath), { recursive: true });
      await writeFile(localPath, body);
      downloaded.push({ path: assetPath, bytes: body.length });
    }

    const extension = path.extname(assetPath).toLowerCase();
    if (textExtensions.has(extension)) {
      for (const nestedPath of assetPathsFrom(body.toString('utf8'))) {
        if (!queued.has(nestedPath)) {
          queued.add(nestedPath);
          queue.push(nestedPath);
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

console.log(`Imported ${downloaded.length} compatibility assets (${totalBytes} bytes) from ${origin}.`);
