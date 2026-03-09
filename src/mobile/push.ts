import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { PushNotifications } from '@capacitor/push-notifications';
import api from '../services/api';
import { tokenStore } from '../services/tokenStore';
import { AppDistributionService } from '../services/appDistribution';
import { extractPathFromUrl } from './deeplinks';

let initialized = false;
let listenersAttached = false;
const TOKEN_KEY = 'push_device_token';
const REGISTER_RETRIES = 4;
const REGISTER_RETRY_DELAY_MS = 1200;
const MAX_NATIVE_REGISTER_RETRIES = 5;
const NATIVE_REGISTER_RETRY_BASE_MS = 4000;

let nativeRegisterRetryCount = 0;
let nativeRegisterRetryTimer: ReturnType<typeof setTimeout> | null = null;
let lastReportedPushError = '';
let lastReportedPushErrorAt = 0;

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

const reportPushTrackingEvent = async (event: 'push_registration_error' | 'push_token_registered', details: Record<string, any>) => {
  try {
    await AppDistributionService.trackEvent({
      event,
      platform: Capacitor.getPlatform() as any,
      deviceCategory: Capacitor.getPlatform() as any,
      sourcePath: '/mobile/push',
      details
    });
  } catch {
    // best effort only
  }
};

const scheduleNativeRegisterRetry = async (reason: string) => {
  if (!Capacitor.isNativePlatform()) return;
  if (nativeRegisterRetryCount >= MAX_NATIVE_REGISTER_RETRIES) return;
  if (nativeRegisterRetryTimer) return;

  nativeRegisterRetryCount += 1;
  const delayMs = NATIVE_REGISTER_RETRY_BASE_MS * nativeRegisterRetryCount;
  nativeRegisterRetryTimer = setTimeout(async () => {
    nativeRegisterRetryTimer = null;
    try {
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive !== 'granted') return;
      await PushNotifications.register();
    } catch (error) {
      console.error('Push retry registration failed', { reason, attempt: nativeRegisterRetryCount, error });
    }
  }, delayMs);
};

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

const buildForegroundPushPayload = (incoming: any) => {
  const notification = incoming?.notification && typeof incoming.notification === 'object'
    ? incoming.notification
    : incoming;
  const data = notification?.data && typeof notification.data === 'object'
    ? notification.data
    : {};
  const rawAction =
    data.deepLink ||
    data.deeplink ||
    data.link ||
    data.actionUrl ||
    data.action_url ||
    notification?.link ||
    notification?.actionUrl ||
    notification?.action_url;
  const actionUrl = rawAction ? extractPathFromUrl(String(rawAction)) || String(rawAction) : undefined;

  return {
    id: notification?.id || data.notificationId,
    type: data.type || notification?.type || 'system',
    title: notification?.title || 'Notification',
    body: notification?.body || notification?.message || '',
    message: notification?.body || notification?.message || '',
    actionUrl,
    data,
    metadata: data,
    conversationId: data.conversationId || data.conversation_id,
    messageId: data.messageId || data.message_id
  };
};

const attachPushListeners = (navigate?: (path: string) => void) => {
  if (listenersAttached) return;
  listenersAttached = true;

  PushNotifications.addListener('registration', async (token) => {
    try {
      nativeRegisterRetryCount = 0;
      if (nativeRegisterRetryTimer) {
        clearTimeout(nativeRegisterRetryTimer);
        nativeRegisterRetryTimer = null;
      }
      await storeToken(token.value);
      await registerTokenWithRetry(token.value);
      await reportPushTrackingEvent('push_token_registered', {
        tokenPrefix: String(token.value || '').slice(0, 12),
        platform: Capacitor.getPlatform()
      });
    } catch (e) {
      console.error('Failed to persist device token', e);
    }
  });

  PushNotifications.addListener('registrationError', async (err) => {
    console.error('Push registration error', err);
    const serialized = JSON.stringify(err || {});
    const now = Date.now();
    if (serialized && (serialized !== lastReportedPushError || now - lastReportedPushErrorAt > 30000)) {
      lastReportedPushError = serialized;
      lastReportedPushErrorAt = now;
      await reportPushTrackingEvent('push_registration_error', {
        platform: Capacitor.getPlatform(),
        error: serialized
      });
    }
    await scheduleNativeRegisterRetry('registration_error');
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    try {
      if (typeof window === 'undefined') return;
      window.dispatchEvent(new CustomEvent('mobile:push-notification-received', {
        detail: buildForegroundPushPayload(notification)
      }));
    } catch (error) {
      console.error('Failed to dispatch foreground push event', error);
    }
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
