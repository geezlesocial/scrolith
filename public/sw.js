/* Scrolith Instant Graph Phase 1 service worker.
 * Scope is intentionally limited to public navigation/media caching. Authenticated
 * API responses and private message media are never cached here.
 */
const VERSION = 'scrolith-instant-shell-v2';
const MEDIA_CACHE = 'scrolith-instant-media-v1';
const MEDIA_META_CACHE = 'scrolith-instant-media-meta-v1';
const MEDIA_LIMIT = 80;
const MEDIA_MAX_BYTES = 60 * 1024 * 1024;
const MEDIA_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATIC_CACHE = 'scrolith-static-v16-instant-delivery';
const API_CACHE = 'scrolith-api-v16-instant-delivery';
const SHELL_CACHE = 'scrolith-shell-v2';
const FEED_PATH_HINTS = ['/api/community/feed', '/api/community/stories/feed', '/api/scroll/feed'];
const OFFLINE_DOCUMENT = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Scrolith Offline</title>
    <meta name="theme-color" content="#0f6b4f" />
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: 'Segoe UI', system-ui, sans-serif;
        background: linear-gradient(180deg, #f7f4ee 0%, #f2ede3 100%);
        color: #0b0b0a;
      }
      .card {
        width: min(100%, 420px);
        border-radius: 24px;
        border: 1px solid rgba(15, 23, 42, 0.08);
        background: rgba(255, 255, 255, 0.94);
        box-shadow: 0 18px 48px rgba(15, 23, 42, 0.12);
        padding: 24px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 1.1rem;
      }
      p {
        margin: 0 0 16px;
        color: #475569;
        line-height: 1.45;
      }
      button {
        border: 0;
        border-radius: 999px;
        background: #0f6b4f;
        color: #fff;
        font: inherit;
        font-weight: 600;
        padding: 10px 16px;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Scrolith is temporarily offline.</h1>
      <p>The network did not return a fresh app shell. Reconnect and reload to continue.</p>
      <button type="button" onclick="window.location.reload()">Reload App</button>
    </div>
  </body>
</html>`;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(['/','/index.html','/manifest.webmanifest','/preloader-logo-64.png']
      .map((url) => cache.add(url).catch(() => undefined)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => ![STATIC_CACHE, API_CACHE, MEDIA_CACHE, MEDIA_META_CACHE, SHELL_CACHE].includes(key))
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

const isPublicMedia = (url) => {
  if (!/^https?:$/.test(url.protocol)) return false;
  const path = url.pathname.toLowerCase();
  const allowedOrigin = url.origin === self.location.origin || /(^|\.)api\.scrolith\.com$/i.test(url.hostname);
  return allowedOrigin &&
    (path.includes('/api/files/content/') || /\.(avif|gif|jpe?g|png|webp)$/.test(path));
};

const isFeedRequest = (url) => FEED_PATH_HINTS.some((path) => url.pathname.includes(path));
const shouldCacheStaticAsset = (request, url) =>
  request.method === 'GET' && request.destination !== 'document' && url.origin === self.location.origin &&
  ['style', 'script', 'font', 'image'].includes(request.destination);

const staleWhileRevalidate = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then((response) => {
    if (response?.ok) cache.put(request, response.clone()).catch(() => undefined);
    return response;
  }).catch(() => undefined);
  return cached || (await networkPromise);
};

const networkFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response?.ok) cache.put(request, response.clone()).catch(() => undefined);
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error('network_failed');
  }
};

const mediaMetaRequest = (request) => new Request(
  `${self.location.origin}/__scrolith_media_meta__?key=${encodeURIComponent(request.url)}`
);

const readMediaMeta = async (request) => {
  try {
    const metaCache = await caches.open(MEDIA_META_CACHE);
    const response = await metaCache.match(mediaMetaRequest(request));
    return response ? await response.json() : null;
  } catch {
    return null;
  }
};

const writeMediaMeta = async (request, byteSize, previous) => {
  try {
    const metaCache = await caches.open(MEDIA_META_CACHE);
    await metaCache.put(mediaMetaRequest(request), new Response(JSON.stringify({
      byteSize: Math.max(0, Number(byteSize) || Number(previous?.byteSize) || 262144),
      createdAt: Number(previous?.createdAt) || Date.now(),
      lastAccessAt: Date.now()
    }), { headers: { 'content-type': 'application/json' } }));
  } catch {
    // Cache metadata is advisory; media delivery must remain functional.
  }
};

const deleteMediaEntry = async (cache, request) => {
  await cache.delete(request);
  try {
    const metaCache = await caches.open(MEDIA_META_CACHE);
    await metaCache.delete(mediaMetaRequest(request));
  } catch {
    // ignore metadata cleanup failures
  }
};

const trimMediaCache = async (cache) => {
  const requests = await cache.keys();
  const now = Date.now();
  const entries = [];
  for (const request of requests) {
    const meta = await readMediaMeta(request);
    entries.push({
      request,
      byteSize: Math.max(0, Number(meta?.byteSize) || 262144),
      createdAt: Number(meta?.createdAt) || now,
      lastAccessAt: Number(meta?.lastAccessAt) || 0
    });
  }
  const expired = entries.filter((entry) => now - entry.createdAt > MEDIA_TTL_MS);
  const survivors = entries.filter((entry) => !expired.includes(entry));
  let totalBytes = survivors.reduce((sum, entry) => sum + entry.byteSize, 0);
  const evict = [...expired, ...survivors.sort((a, b) => a.lastAccessAt - b.lastAccessAt)];
  const toDelete = [];
  for (const entry of evict) {
    if (toDelete.includes(entry)) continue;
    const survivorCount = survivors.length - toDelete.filter((item) => survivors.includes(item)).length;
    if (survivorCount <= MEDIA_LIMIT && totalBytes <= MEDIA_MAX_BYTES && !expired.includes(entry)) break;
    toDelete.push(entry);
    totalBytes -= entry.byteSize;
  }
  await Promise.all(toDelete.map((entry) => deleteMediaEntry(cache, entry.request)));
};

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (isPublicMedia(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(MEDIA_CACHE);
      const cached = await cache.match(request);
      const cachedMeta = cached ? await readMediaMeta(request) : null;
      const cachedIsFresh = cached && Date.now() - Number(cachedMeta?.createdAt || 0) <= MEDIA_TTL_MS;
      if (cachedIsFresh) {
        event.waitUntil(writeMediaMeta(request, cachedMeta?.byteSize, cachedMeta));
        return cached;
      }
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
          await writeMediaMeta(request, response.headers.get('content-length'), cachedMeta);
          await trimMediaCache(cache);
        }
        return response;
      } catch {
        return cached || Response.error();
      }
    })());
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const shell = await caches.open(SHELL_CACHE);
      try {
        const response = await fetch(request);
        if (response?.ok) await shell.put('/index.html', response.clone());
        return response;
      } catch {
        const cached = await shell.match(request) || await shell.match('/index.html') || await shell.match('/');
        return cached || new Response(OFFLINE_DOCUMENT, {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store' }
        });
      }
    })());
    return;
  }
  if (isFeedRequest(url)) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }
  if (shouldCacheStaticAsset(request, url)) event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
});
