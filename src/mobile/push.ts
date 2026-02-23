import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { PushNotifications } from '@capacitor/push-notifications';
import api from '../services/api';
import { tokenStore } from '../services/tokenStore';
import { extractPathFromUrl } from './deeplinks';

let initialized = false;
let listenersAttached = false;
const TOKEN_KEY = 'push_device_token';
const REGISTER_RETRIES = 4;
const REGISTER_RETRY_DELAY_MS = 1200;

const storeToken = async (token: string) => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Preferences.set({ key: TOKEN_KEY, value: token });
  } catch {}
};

const readToken = async () => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { value } = await Preferences.get({ key: TOKEN_KEY });
    return value || null;
  } catch {
    return null;
  }
};

const clearToken = async () => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Preferences.remove({ key: TOKEN_KEY });
  } catch {}
};

const registerTokenWithBackend = async (token: string) => {
  if (!token) return false;
  try {
    const authToken = await tokenStore.get();
    if (!authToken) return false;
    await api.post('/notifications/device/register', {
      platform: Capacitor.getPlatform(),
      token
    }, {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });
    return true;
  } catch (e) {
    console.error('Failed to register device token', e);
    return false;
  }
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const registerTokenWithRetry = async (token: string) => {
  for (let attempt = 0; attempt <= REGISTER_RETRIES; attempt += 1) {
    const ok = await registerTokenWithBackend(token);
    if (ok) return true;
    if (attempt < REGISTER_RETRIES) {
      await wait(REGISTER_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  return false;
};

const attachPushListeners = (navigate?: (path: string) => void) => {
  if (listenersAttached) return;
  listenersAttached = true;

  PushNotifications.addListener('registration', async (token) => {
    try {
      await storeToken(token.value);
      await registerTokenWithRetry(token.value);
    } catch (e) {
      console.error('Failed to persist device token', e);
    }
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('Push registration error', err);
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    const deepLink =
      (event.notification?.data as any)?.deepLink || (event.notification?.data as any)?.deeplink;
    if (!deepLink || !navigate) return;
    const path = extractPathFromUrl(String(deepLink));
    if (path) navigate(path);
  });
};

export const syncStoredPushToken = async () => {
  if (!Capacitor.isNativePlatform()) return false;
  const stored = await readToken();
  if (!stored) return false;
  return registerTokenWithRetry(stored);
};

export const initPushNotifications = async (navigate?: (path: string) => void) => {
  if (!Capacitor.isNativePlatform()) return;
  attachPushListeners(navigate);

  if (initialized) {
    await syncStoredPushToken();
    return;
  }

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return;

  await PushNotifications.register();
  initialized = true;
  await syncStoredPushToken();
};

export const unregisterPushNotifications = async () => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const token = await readToken();
    if (token) {
      await api.post('/notifications/device/unregister', { token });
    }
  } catch (e) {
    console.warn('Failed to unregister push token', e);
  } finally {
    await clearToken();
    initialized = false;
  }
};
