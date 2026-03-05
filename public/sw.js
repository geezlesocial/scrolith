const VERSION = 'v3';
const STATIC_CACHE = `scrolith-static-${VERSION}`;
const API_CACHE = `scrolith-api-${VERSION}`;
const APP_SHELL = ['/', '/index.html'];
const FEED_PATH_HINTS = ['/api/community/feed', '/api/community/stories/feed', '/api/scroll/feed'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => undefined)
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
      fetch(request).catch(async () => {
        const cache = await caches.open(STATIC_CACHE);
        return (await cache.match('/index.html')) || Response.error();
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
