import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Hotfix 2026-07-24: bust Vite entry hash after canary poisoned immutable 404 caches.
const WEB_CACHE_RESET_RELOAD_KEY = 'scrolith:web-cache-reset-reloaded-v7'
const FORCE_BROWSER_CACHE_RESET =
  import.meta.env.VITE_FORCE_BROWSER_CACHE_RESET === 'true' ||
  (typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('resetAppShell') === '1');
const INSTANT_GRAPH_BUILD_ENABLED = import.meta.env.VITE_INSTANT_GRAPH_ENABLED === 'true';

const runWhenIdle = (callback: () => void, timeout = 1200) => {
  const idleCallback = (window as any).requestIdleCallback;
  if (typeof idleCallback === 'function') {
    const id = idleCallback(callback, { timeout });
    return () => {
      const cancelIdleCallback = (window as any).cancelIdleCallback;
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id);
    };
  }

  const id = window.setTimeout(callback, timeout);
  return () => window.clearTimeout(id);
};

const runAfterLoadIdle = (callback: () => void, timeout = 1200) => {
  const run = () => {
    runWhenIdle(callback, timeout);
  };

  if (document.readyState === 'complete') {
    run();
    return;
  }

  window.addEventListener('load', run, { once: true });
};

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
)

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

runWhenIdle(() => {
  void import('./mobile/runtime/mobileObservability')
    .then(({ installMobileObservability }) => installMobileObservability())
    .catch(() => {});
}, 900);

const isNative = () => {
  try {
    const protocol = String(window.location?.protocol || '').toLowerCase();
    const host = String(window.location?.hostname || '').toLowerCase();
    if (import.meta.env.PROD && protocol === 'https:' && host === 'localhost') {
      return true;
    }
    if (protocol === 'capacitor:' || protocol === 'ionic:' || protocol === 'file:') {
      return true;
    }
  } catch {
    // ignore window-location checks
  }

  try {
    const runtime = (window as any)?.Capacitor;
    if (runtime && typeof runtime.isNativePlatform === 'function') {
      return Boolean(runtime.isNativePlatform());
    }
  } catch {
    // ignore runtime checks
  }
  return false;
};

const clearBrowserCaches = async () => {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch (err) {
    console.warn('Browser cache cleanup (service worker) failed', err);
  }

  try {
    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    }
  } catch (err) {
    console.warn('Browser cache cleanup (CacheStorage) failed', err);
  }
};

const resetBrowserRuntimeOnce = async () => {
  try {
    if (window.sessionStorage.getItem(WEB_CACHE_RESET_RELOAD_KEY) === '1') return;
  } catch {
    // Ignore session storage failures and continue with cache cleanup.
  }

  await clearBrowserCaches();

  try {
    window.sessionStorage.setItem(WEB_CACHE_RESET_RELOAD_KEY, '1');
  } catch {
    // Ignore session storage failures.
  }

  window.location.reload();
};

if (import.meta.env.PROD && FORCE_BROWSER_CACHE_RESET && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (isNative()) return;
    runWhenIdle(() => {
      void resetBrowserRuntimeOnce();
    });
  });
}

// Phase 1: keep the native WebView HTTP cache intact between launches. The old
// startup cleanup erased precisely the shell/media cache needed for offline
// repeat opens. The explicit resetAppShell escape hatch above remains intact.
if (INSTANT_GRAPH_BUILD_ENABLED && !isNative() && import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    runWhenIdle(() => {
      void navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then(() => {
          void import('./services/instantGraph').then(({ trackInstantGraphMetric }) => {
            trackInstantGraphMetric('sw_registered');
          });
        })
        .catch(() => {});
    }, 1000);
  }, { once: true });
}

// Preserve the legacy native cache-reset behavior for builds that do not carry
// the Instant Graph candidate. Candidate builds intentionally retain WebView
// cache between launches so the new offline shell can work.
if (!INSTANT_GRAPH_BUILD_ENABLED && isNative()) {
  runAfterLoadIdle(() => {
    void clearBrowserCaches();
  }, 1800);
}
