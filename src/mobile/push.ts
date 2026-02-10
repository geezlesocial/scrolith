import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { PushNotifications } from '@capacitor/push-notifications';
import api from '../services/api';
import { extractPathFromUrl } from './deeplinks';

let initialized = false;
const TOKEN_KEY = 'push_device_token';

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

export const initPushNotifications = async (navigate?: (path: string) => void) => {
  if (initialized) return;
  if (!Capacitor.isNativePlatform()) return;
  initialized = true;

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return;

  await PushNotifications.register();

  PushNotifications.addListener('registration', async (token) => {
    try {
      await storeToken(token.value);
      await api.post('/notifications/device/register', {
        platform: Capacitor.getPlatform(),
        token: token.value
      });
    } catch (e) {
      console.error('Failed to register device token', e);
    }
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('Push registration error', err);
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    const deepLink = (event.notification?.data as any)?.deepLink || (event.notification?.data as any)?.deeplink;
    if (!deepLink || !navigate) return;
    const path = extractPathFromUrl(String(deepLink));
    if (path) navigate(path);
  });
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
  }
};
