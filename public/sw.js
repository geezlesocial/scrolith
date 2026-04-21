const VERSION = 'v8-20260421-story-avatar-file-id';
const STATIC_CACHE = `scrolith-static-${VERSION}`;
const API_CACHE = `scrolith-api-${VERSION}`;
const APP_SHELL = [];
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
  event.waitUntil(
    Promise.resolve()
      .then(() => {
        if (!APP_SHELL.length) return undefined;
        return caches
          .open(STATIC_CACHE)
          .then((cache) => cache.addAll(APP_SHELL))
          .catch(() => undefined);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== API_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

const isFeedRequest = (url) => FEED_PATH_HINTS.some((path) => url.pathname.includes(path));

const shouldCacheStaticAsset = (request, url) => {
  if (request.method !== 'GET') return false;
  if (request.destination === 'document') return false;
  if (url.origin !== self.location.origin) return false;
  return ['style', 'script', 'font', 'image'].includes(request.destination);
};

const staleWhileRevalidate = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone()).catch(() => undefined);
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) return cached;
  const network = await networkPromise;
  return network || cached;
};

const networkFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => undefined);
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error('network_failed');
  }
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(OFFLINE_DOCUMENT, {
          status: 503,
          headers: {
            'Content-Type': 'text/html; charset=UTF-8',
            'Cache-Control': 'no-store',
          },
        });
      })
    );
    return;
  }

  if (isFeedRequest(url)) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (shouldCacheStaticAsset(request, url)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});
