import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { PushNotifications, type Channel } from '@capacitor/push-notifications';
import api from '../services/api';
import { tokenStore } from '../services/tokenStore';
import { type AppDistributionEvent } from '../services/appDistribution';
import { trackMobileRuntimeEvent } from './mobileTelemetry';
import { extractPathFromAppUrl } from './runtime/deepLinkUtils';
import {
  ANDROID_CHANNEL_DEFINITIONS,
  ANDROID_CHANNEL_IDS,
  buildEnterprisePushDeepLink
} from '../utils/notificationTaxonomy';

let initialized = false;
let listenersAttached = false;
let forceRegisterInFlight: Promise<boolean> | null = null;
let lastForceRegisterAt = 0;
const CUSTOM_SCHEME = 'scrolith';
const TOKEN_KEY = 'push_device_token';
const TOKEN_PROJECT_KEY = 'push_device_token_project';
const DEVICE_ID_KEY = 'push_device_id';
const PUSH_TOKEN_PROJECT_ID = String(import.meta.env.VITE_FIREBASE_PROJECT_ID || 'scrolith-platform').trim();
const REGISTER_RETRIES = 4;
const REGISTER_RETRY_DELAY_MS = 1200;
const MAX_NATIVE_REGISTER_RETRIES = 5;
const NATIVE_REGISTER_RETRY_BASE_MS = 4000;
const FORCE_REGISTER_COOLDOWN_MS = 15000;
const PUSH_LOG_PREFIX = '[ScrolithPush]';

/**
 * Phase 25 — Enterprise channel map.
 * Ids must match FCM android.notification.channelId + backend notificationAndroidChannels.
 */
export const ANDROID_NOTIFICATION_CHANNELS = {
  alerts: ANDROID_CHANNEL_IDS.alerts,
  general: ANDROID_CHANNEL_IDS.system,
  messages: ANDROID_CHANNEL_IDS.messages,
  community: ANDROID_CHANNEL_IDS.community,
  marketplace: ANDROID_CHANNEL_IDS.marketplace,
  jobs: ANDROID_CHANNEL_IDS.jobs,
  gigs: ANDROID_CHANNEL_IDS.gigs,
  freelancing: ANDROID_CHANNEL_IDS.gigs,
  scroll: ANDROID_CHANNEL_IDS.scroll,
  stories: ANDROID_CHANNEL_IDS.stories,
  posts: ANDROID_CHANNEL_IDS.posts,
  follows: ANDROID_CHANNEL_IDS.follows,
  mentions: ANDROID_CHANNEL_IDS.mentions,
  comments: ANDROID_CHANNEL_IDS.comments,
  orders: ANDROID_CHANNEL_IDS.orders,
  admin: ANDROID_CHANNEL_IDS.admin,
  scrolitha: ANDROID_CHANNEL_IDS.scrolitha,
  system: ANDROID_CHANNEL_IDS.system,
  security: ANDROID_CHANNEL_IDS.security,
  social: ANDROID_CHANNEL_IDS.social,
  campaigns: ANDROID_CHANNEL_IDS.system
} as const;

let nativeRegisterRetryCount = 0;
let nativeRegisterRetryTimer: ReturnType<typeof setTimeout> | null = null;
let lastReportedPushError = '';
let lastReportedPushErrorAt = 0;
let navigateToPath: ((path: string) => void) | undefined;

const summarizeToken = (token: string) => {
  const value = String(token || '');
  if (!value) return 'none';
  const prefix = value.slice(0, 8);
  const suffix = value.slice(-6);
  return `${prefix}...${suffix} (len=${value.length})`;
};

const getAllowedHosts = () => {
  const envHost = String(import.meta.env.VITE_APP_DOMAIN || '').trim();
  const envAltHost = String(import.meta.env.VITE_PUBLIC_APP_DOMAIN || '').trim();
  const base = ['scrolith.com', 'www.scrolith.com'];
  if (envHost) base.push(envHost);
  if (envAltHost) base.push(envAltHost);
  return new Set(base.map((h) => String(h).trim().toLowerCase()).filter(Boolean));
};

const extractPushPathFromUrl = (url: string): string | null =>
  extractPathFromAppUrl(url, getAllowedHosts(), CUSTOM_SCHEME);

const normalizePushActionPath = (raw?: unknown): string | null => {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (value.startsWith('/')) return normalizePushPathAliases(value);
  const fromUrl = extractPushPathFromUrl(value);
  return fromUrl ? normalizePushPathAliases(fromUrl) : null;
};

const normalizePushPathAliases = (path: string): string => {
  const raw = String(path || '').trim();
  if (!raw.startsWith('/')) return raw;
  try {
    const url = new URL(raw, 'https://scrolith.com');
    let pathname = url.pathname || '/';
    // Phase 25 canonical aliases → production React routes
    const threadMatch = pathname.match(/^\/messages\/thread\/([^/]+)\/?$/i);
    if (threadMatch) pathname = `/messages/${threadMatch[1]}`;
    const groupMatch = pathname.match(/^\/community\/group\/([^/]+)\/?$/i);
    if (groupMatch) {
      url.searchParams.set('group', groupMatch[1]);
      pathname = '/community/clubs';
    }
    const storyMatch = pathname.match(/^\/story\/([^/]+)\/?$/i);
    if (storyMatch) {
      url.searchParams.set('story', storyMatch[1]);
      pathname = '/community';
    }
    const jobAppMatch = pathname.match(/^\/jobs\/application\/([^/]+)\/?$/i);
    if (jobAppMatch) {
      url.searchParams.set('application', jobAppMatch[1]);
      pathname = `/jobs/${jobAppMatch[1]}`;
    }
    const gigOrderMatch = pathname.match(/^\/gigs\/orders\/([^/]+)\/?$/i);
    if (gigOrderMatch) pathname = `/gigs/${gigOrderMatch[1]}`;
    const qs = url.searchParams.toString();
    return `${pathname}${qs ? `?${qs}` : ''}${url.hash || ''}`;
  } catch {
    return raw
      .replace(/^\/messages\/thread\//i, '/messages/')
      .replace(/^\/community\/group\//i, '/community/clubs?group=')
      .replace(/^\/story\//i, '/community?story=')
      .replace(/^\/jobs\/application\//i, '/jobs/')
      .replace(/^\/gigs\/orders\//i, '/gigs/');
  }
};

const buildFallbackPathFromPushData = (data: any): string | null => {
  const fromTaxonomy = buildEnterprisePushDeepLink(data && typeof data === 'object' ? data : {});
  if (fromTaxonomy) return normalizePushPathAliases(fromTaxonomy);

  const type = String(data?.type || data?.notificationType || data?.category || '').trim().toLowerCase();
  const conversationId = String(data?.conversationId || data?.conversation_id || '').trim();
  const postId = String(data?.postId || data?.post_id || data?.entityId || data?.entity_id || '').trim();
  const campaignId = String(data?.campaignId || data?.campaign_id || '').trim();
  const listingId = String(data?.listingId || data?.listing_id || '').trim();
  const jobId = String(data?.jobId || data?.job_id || '').trim();
  const communityId = String(data?.communityId || data?.community_id || data?.groupId || data?.group_id || '').trim();

  if ((type === 'message' || type === 'new_message' || type.includes('message')) && conversationId) {
    return `/messages/${encodeURIComponent(conversationId)}`;
  }
  if ((type.includes('post') || type.includes('comment') || type.includes('mention') || type.includes('reaction') || type.includes('reply')) && postId) {
    return `/post/${encodeURIComponent(postId)}`;
  }
  if (type.includes('marketplace') && listingId) {
    return `/marketplace/listing/${encodeURIComponent(listingId)}`;
  }
  if ((type.includes('job') || type.includes('application')) && jobId) {
    return `/jobs/${encodeURIComponent(jobId)}`;
  }
  if (type.includes('community') && communityId) {
    return `/community/clubs?group=${encodeURIComponent(communityId)}`;
  }
  if (type.includes('scrolitha')) {
    return '/scrolitha';
  }
  if (type === 'app_campaign' || type === 'campaign') {
    return campaignId ? `/m/notifications?campaignId=${encodeURIComponent(campaignId)}` : '/m/notifications';
  }
  // Never invent home as a push destination when type is unknown without ids.
  return null;
};

const ensureAndroidNotificationChannels = async () => {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;

  // Phase 25/27 multi-channel taxonomy (Android 8+).
  // Importance: 5=MAX, 4=HIGH, 3=DEFAULT.
  // Visibility 0=private (lock-screen content hidden) · 1=public.
  // Channel ids are stable — never recreate with new ids casually.
  // Users can mute individual channels without losing DMs.
  const channels: Channel[] = [
    ...ANDROID_CHANNEL_DEFINITIONS.map((def) => ({
      id: def.id,
      name: def.name,
      description: def.description,
      sound: 'scrolith.wav',
      importance: def.importance,
      visibility: def.visibility,
      vibration: true
    })),
    // Legacy short-id channels retained so history/OS settings remain valid.
    {
      id: 'general',
      name: 'Scrolith notifications (legacy)',
      description: 'Legacy notification channel retained for compatibility.',
      importance: 3,
      visibility: 1,
      vibration: true
    },
    {
      id: 'messages',
      name: 'Messages (legacy)',
      description: 'Legacy messages channel retained for compatibility.',
      importance: 3,
      visibility: 1,
      vibration: true
    },
    {
      id: 'posts',
      name: 'Posts and community (legacy)',
      description: 'Legacy posts channel retained for compatibility.',
      importance: 3,
      visibility: 1,
      vibration: true
    },
    {
      id: 'campaigns_scrolith_v2',
      name: 'Scrolith campaigns (legacy)',
      description: 'Legacy campaigns channel retained for compatibility.',
      importance: 3,
      visibility: 1,
      vibration: true
    }
  ];

  for (const channel of channels) {
    try {
      await PushNotifications.createChannel(channel);
    } catch (error) {
      console.warn('Failed to create Android notification channel', {
        channelId: channel.id,
        error: (error as any)?.message || error
      });
    }
  }
};

const storeToken = async (token: string) => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Preferences.set({ key: TOKEN_KEY, value: token });
    await Preferences.set({ key: TOKEN_PROJECT_KEY, value: PUSH_TOKEN_PROJECT_ID });
  } catch {}
};

const ensureStoredTokenProject = async () => {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const { value } = await Preferences.get({ key: TOKEN_PROJECT_KEY });
    if (!value) {
      const existingToken = await Preferences.get({ key: TOKEN_KEY });
      if (existingToken.value) {
        await Preferences.remove({ key: TOKEN_KEY });
        await reportPushTrackingEvent('push_token_project_reset', {
          platform: Capacitor.getPlatform()
        });
      }
      await Preferences.set({ key: TOKEN_PROJECT_KEY, value: PUSH_TOKEN_PROJECT_ID });
      return !existingToken.value;
    }
    if (value === PUSH_TOKEN_PROJECT_ID) return true;
    await Preferences.remove({ key: TOKEN_KEY });
    await Preferences.set({ key: TOKEN_PROJECT_KEY, value: PUSH_TOKEN_PROJECT_ID });
    await reportPushTrackingEvent('push_token_project_reset', {
      platform: Capacitor.getPlatform()
    });
    return false;
  } catch {
    return true;
  }
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

const buildDeviceId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {}
  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const getOrCreateDeviceId = async () => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const existing = await Preferences.get({ key: DEVICE_ID_KEY });
    if (existing.value) return existing.value;
    const created = buildDeviceId();
    await Preferences.set({ key: DEVICE_ID_KEY, value: created });
    return created;
  } catch {
    return buildDeviceId();
  }
};

const clearToken = async () => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Preferences.remove({ key: TOKEN_KEY });
    await Preferences.remove({ key: TOKEN_PROJECT_KEY });
  } catch {}
};

const registerTokenWithBackend = async (token: string) => {
  if (!token) return false;
  try {
    const authToken = await tokenStore.get();
    if (!authToken) {
      console.info(`${PUSH_LOG_PREFIX} registerDeviceToken skipped: missing auth token`);
      return false;
    }
    const deviceId = await getOrCreateDeviceId();
    console.info(`${PUSH_LOG_PREFIX} registerDeviceToken start`, {
      platform: Capacitor.getPlatform(),
      token: summarizeToken(token),
      hasDeviceId: Boolean(deviceId)
    });
    await api.post('/notifications/device/register', {
      platform: Capacitor.getPlatform(),
      token,
      deviceId
    }, {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });
    console.info(`${PUSH_LOG_PREFIX} registerDeviceToken success`, {
      platform: Capacitor.getPlatform(),
      token: summarizeToken(token)
    });
    return true;
  } catch (e) {
    const status = (e as any)?.response?.status;
    const message = (e as any)?.message || 'registration request failed';
    console.error(`${PUSH_LOG_PREFIX} registerDeviceToken failed`, {
      status,
      message,
      platform: Capacitor.getPlatform(),
      token: summarizeToken(token)
    });
    console.error('Failed to register device token', {
      status,
      message
    });
    await reportPushTrackingEvent('push_token_sync_failed', {
      platform: Capacitor.getPlatform(),
      tokenPrefix: String(token || '').slice(0, 12)
    });
    return false;
  }
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const reportPushTrackingEvent = async (
  event: AppDistributionEvent,
  details: Record<string, any>
) => {
  await trackMobileRuntimeEvent(event, details, {
    sourcePath: '/mobile/push'
  });
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
    data.url ||
    notification?.link ||
    notification?.actionUrl ||
    notification?.action_url ||
    notification?.url;
  const actionUrl = normalizePushActionPath(rawAction) || buildFallbackPathFromPushData(data) || undefined;

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
  if (navigate) {
    navigateToPath = navigate;
  }
  if (listenersAttached) return;
  listenersAttached = true;

  PushNotifications.addListener('registration', async (token) => {
    try {
      console.info(`${PUSH_LOG_PREFIX} PushNotifications registration event`, {
        platform: Capacitor.getPlatform(),
        token: summarizeToken(token.value)
      });
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
      void reportPushTrackingEvent('push_notification_received', {
        type: notification?.data?.type || notification?.notification?.data?.type || 'system',
        notificationId: notification?.id || notification?.data?.notificationId || null
      });
      if (typeof window === 'undefined') return;
      window.dispatchEvent(new CustomEvent('mobile:push-notification-received', {
        detail: buildForegroundPushPayload(notification)
      }));
    } catch (error) {
      console.error('Failed to dispatch foreground push event', error);
    }
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    const notificationData = (event.notification?.data as any) || {};
    const action =
      notificationData?.deepLink ||
      notificationData?.deeplink ||
      notificationData?.link ||
      notificationData?.actionUrl ||
      notificationData?.action_url ||
      notificationData?.url ||
      event.notification?.link;
    const path = normalizePushActionPath(action) || buildFallbackPathFromPushData(notificationData);
    void reportPushTrackingEvent('push_notification_opened', {
      notificationId: event.notification?.id || (event.notification?.data as any)?.notificationId || null,
      path: path || String(action || '') || null
    });
    if (!path || !navigateToPath) {
      void reportPushTrackingEvent('push_notification_open_failed', {
        notificationId: event.notification?.id || notificationData?.notificationId || null,
        reason: !action ? 'missing_deeplink' : !path ? 'invalid_path' : 'navigate_unavailable',
        path: String(action || '') || null
      });
      return;
    }
    navigateToPath(path);
  });
};

export const syncStoredPushToken = async () => {
  if (!Capacitor.isNativePlatform()) {
    console.info(`${PUSH_LOG_PREFIX} syncStoredPushToken skipped: non-native platform`);
    return false;
  }
  const projectOk = await ensureStoredTokenProject();
  if (!projectOk) {
    console.info(`${PUSH_LOG_PREFIX} syncStoredPushToken skipped: token project reset`);
    return false;
  }
  const stored = await readToken();
  if (!stored) {
    console.info(`${PUSH_LOG_PREFIX} syncStoredPushToken skipped: no stored token`);
    return false;
  }
  console.info(`${PUSH_LOG_PREFIX} syncStoredPushToken start`, {
    token: summarizeToken(stored)
  });
  const synced = await registerTokenWithRetry(stored);
  console.info(`${PUSH_LOG_PREFIX} syncStoredPushToken result`, {
    synced,
    token: summarizeToken(stored)
  });
  return synced;
};

export const initPushNotifications = async (navigate?: (path: string) => void) => {
  if (!Capacitor.isNativePlatform()) return;
  attachPushListeners(navigate);
  await ensureAndroidNotificationChannels();

  if (initialized) {
    await syncStoredPushToken();
    return;
  }

  const authToken = await tokenStore.get();
  if (!authToken) return;
  await ensureStoredTokenProject();

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') {
    await reportPushTrackingEvent('push_permission_denied', {
      receive: perm.receive
    });
    return;
  }

  await PushNotifications.register();
  initialized = true;
  await syncStoredPushToken();
};

export const forcePushRegistrationAfterAuth = async (navigate?: (path: string) => void) => {
  if (!Capacitor.isNativePlatform()) {
    console.info(`${PUSH_LOG_PREFIX} forcePushRegistrationAfterAuth skipped: non-native platform`);
    return false;
  }

  if (forceRegisterInFlight) {
    console.info(`${PUSH_LOG_PREFIX} forcePushRegistrationAfterAuth skipped: in-flight`);
    return forceRegisterInFlight;
  }

  const now = Date.now();
  if (lastForceRegisterAt && now - lastForceRegisterAt < FORCE_REGISTER_COOLDOWN_MS) {
    console.info(`${PUSH_LOG_PREFIX} forcePushRegistrationAfterAuth skipped: cooldown active`, {
      cooldownMs: FORCE_REGISTER_COOLDOWN_MS
    });
    return syncStoredPushToken();
  }

  forceRegisterInFlight = (async () => {
    try {
      console.info(`${PUSH_LOG_PREFIX} forcePushRegistrationAfterAuth start`, {
        platform: Capacitor.getPlatform()
      });
      attachPushListeners(navigate);
      await ensureAndroidNotificationChannels();

      const authToken = await tokenStore.get();
      if (!authToken) {
        console.info(`${PUSH_LOG_PREFIX} forcePushRegistrationAfterAuth aborted: missing auth token`);
        return false;
      }
      console.info(`${PUSH_LOG_PREFIX} forcePushRegistrationAfterAuth auth token present`);

      await ensureStoredTokenProject();
      const checkedPerm = await PushNotifications.checkPermissions();
      console.info(`${PUSH_LOG_PREFIX} push permission check`, { receive: checkedPerm.receive });

      let perm = checkedPerm;
      if (perm.receive !== 'granted') {
        perm = await PushNotifications.requestPermissions();
        console.info(`${PUSH_LOG_PREFIX} push permission request result`, { receive: perm.receive });
      }

      if (perm.receive !== 'granted') {
        console.warn(`${PUSH_LOG_PREFIX} forcePushRegistrationAfterAuth aborted: permission denied`, {
          receive: perm.receive
        });
        return false;
      }

      try {
        console.info(`${PUSH_LOG_PREFIX} PushNotifications.register start`);
        await PushNotifications.register();
        initialized = true;
        console.info(`${PUSH_LOG_PREFIX} PushNotifications.register success`);
      } catch (error) {
        const message = (error as any)?.message || String(error);
        console.error(`${PUSH_LOG_PREFIX} PushNotifications.register failed`, {
          message
        });
        await scheduleNativeRegisterRetry('force_register_after_auth');
      }

      return syncStoredPushToken();
    } finally {
      lastForceRegisterAt = Date.now();
      forceRegisterInFlight = null;
    }
  })();

  return forceRegisterInFlight;
};

export const unregisterPushNotifications = async () => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const token = await readToken();
    if (token) {
      await api.post('/notifications/device/unregister', { token });
    }
  } catch (e) {
    console.warn('Failed to unregister push token', {
      status: (e as any)?.response?.status,
      message: (e as any)?.message || 'unregister request failed'
    });
  } finally {
    await clearToken();
    initialized = false;
  }
};
