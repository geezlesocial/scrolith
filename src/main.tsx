import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import App from './App'
import './index.css'

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
)

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

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
    return Capacitor.isNativePlatform();
  } catch {
    try {
      const runtime = (window as any)?.Capacitor;
      if (runtime && typeof runtime.isNativePlatform === 'function') {
        return Boolean(runtime.isNativePlatform());
      }
    } catch {
      // ignore runtime checks
    }
    return false;
  }
};

const clearNativeWebCaches = async () => {
  if (!isNative()) return;
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch (err) {
    console.warn('Native cache cleanup (service worker) failed', err);
  }

  try {
    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    }
  } catch (err) {
    console.warn('Native cache cleanup (CacheStorage) failed', err);
  }
};

if (!isNative() && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => registration.update().catch(() => undefined))
      .catch((err) => {
        console.warn('Service worker registration failed', err);
      });
  });
} else if (isNative()) {
  void clearNativeWebCaches();
}
