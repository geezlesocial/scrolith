import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import prisma from '../utils/prismaClient';
import { buildNotificationActionUrl, normalizeNotificationActionUrl } from './notificationActionUrl.service';
import {
  formatNotificationTitleWithCategory,
  resolveAndroidChannelId,
  resolveNotificationCategory,
  getNotificationCategoryLabel,
  resolveAndroidNotificationTag,
  SCROLITH_NOTIFICATION_SOUND,
  SCROLITH_NOTIFICATION_SMALL_ICON,
  ANDROID_CHANNEL_IDS
} from './notificationAndroidChannels';
import {
  resolveRichActions,
  serializeActionsForPush
} from './notificationCenter/richActions';

export type PushNotificationPayload = {
  id?: string;
  type?: string;
  title?: string;
  body?: string;
  message?: string;
  link?: string;
  actionUrl?: string;
  action_url?: string;
  deepLink?: string;
  data?: Record<string, any>;
  meta?: Record<string, any>;
};

type PushMessage = {
  title: string;
  body: string;
  data: Record<string, string>;
};

type PushCredentialSource =
  | 'env_json'
  | 'env_b64'
  | 'env_path'
  | 'default_path'
  | 'application_default'
  | null;

type ResolvedServiceAccount = {
  serviceAccount: admin.ServiceAccount | null;
  source: PushCredentialSource;
  sourcePath?: string | null;
};

type DeviceTokenRow = {
  userId: string;
  token: string;
  platform: string;
};

export type PushSendOptions = {
  targetPlatform?: 'all' | 'android' | 'desktop';
};

export type PushSendResult = {
  attempted: number;
  sent: number;
  failed: number;
  eligibleUsers?: number;
  eligibleTokens?: number;
  errors: Array<{ token?: string; code?: string; message?: string }>;
};

export type PushRuntimeStatus = {
  enabled: boolean;
  initialized: boolean;
  credentialSource: PushCredentialSource;
  credentialPath?: string | null;
  projectId?: string | null;
  clientEmail?: string | null;
  error?: string | null;
};

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument'
]);
/** Default / migration fallback channel (FCM manifest default). */
const SCROLITH_ANDROID_CHANNEL_ID = ANDROID_CHANNEL_IDS.alerts;
/** Scrolith notification sound resource (no extension). Pronunciation: "Scroll it". */
const SCROLITH_ANDROID_SOUND = SCROLITH_NOTIFICATION_SOUND;
/** Phase 25 monochrome status icon (drawable name without extension). */
const SCROLITH_ANDROID_SMALL_ICON = SCROLITH_NOTIFICATION_SMALL_ICON;
/** Brand primary #0B5FFF */
const SCROLITH_ANDROID_COLOR = '#0B5FFF';

let firebaseApp: admin.app.App | null = null;
let initAttempted = false;
let initErrorLogged = false;
let initSuccessLogged = false;
let firebaseInitError: string | null = null;
let firebaseCredentialSource: PushCredentialSource = null;
let firebaseCredentialPath: string | null = null;
let firebaseProjectId: string | null = null;
let firebaseClientEmail: string | null = null;

const parseServiceAccount = (input: string): admin.ServiceAccount | null => {
  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== 'object') return null;
    const serviceAccount = parsed as admin.ServiceAccount & Record<string, any>;
    if (typeof serviceAccount.private_key === 'string') {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    return serviceAccount;
  } catch {
    return null;
  }
};

const defaultServiceAccountPaths = () => {
  const cwd = process.cwd();
  return [
    path.resolve(cwd, 'secrets', 'fcm-service-account.json'),
    path.resolve(cwd, 'fcm-service-account.json'),
    path.resolve(cwd, 'secrets', 'firebase-adminsdk.json')
  ];
};

const readServiceAccount = (): ResolvedServiceAccount => {
  const rawJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
  const rawB64 = process.env.FCM_SERVICE_ACCOUNT_B64;
  const rawPath = process.env.FCM_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (rawJson) {
    const parsed = parseServiceAccount(rawJson);
    if (parsed) {
      return { serviceAccount: parsed, source: 'env_json' };
    }
  }

  if (rawB64) {
    try {
      const decoded = Buffer.from(rawB64, 'base64').toString('utf8');
      const parsed = parseServiceAccount(decoded);
      if (parsed) {
        return { serviceAccount: parsed, source: 'env_b64' };
      }
    } catch {
      // ignore
    }
  }

  const pathCandidates = [
    ...(rawPath ? [rawPath] : []),
    ...defaultServiceAccountPaths()
  ];
  for (const candidate of pathCandidates) {
    const resolved = path.resolve(candidate);
    if (!fs.existsSync(resolved)) continue;
    try {
      const rawFile = fs.readFileSync(resolved, 'utf8');
      const parsed = parseServiceAccount(rawFile);
      if (parsed) {
        return {
          serviceAccount: parsed,
          source: rawPath && path.resolve(rawPath) === resolved ? 'env_path' : 'default_path',
          sourcePath: resolved
        };
      }
    } catch {
      // ignore
    }
  }

  return {
    serviceAccount: null,
    source: rawPath ? 'env_path' : null,
    sourcePath: rawPath ? path.resolve(rawPath) : null
  };
};

const setCredentialMetadata = (
  source: PushCredentialSource,
  serviceAccount?: admin.ServiceAccount | null,
  credentialPath?: string | null
) => {
  firebaseCredentialSource = source;
  firebaseCredentialPath = credentialPath || null;
  firebaseProjectId =
    serviceAccount?.projectId ||
    (serviceAccount as any)?.project_id ||
    process.env.FIREBASE_PROJECT_ID ||
    null;
  firebaseClientEmail =
    serviceAccount?.clientEmail ||
    (serviceAccount as any)?.client_email ||
    null;
};

/**
 * Resolve the Firebase Admin default app for FCM.
 *
 * Important: storage uses a *named* app (`scrolith-storage`). Checking
 * `admin.apps.length > 0` then calling `admin.app()` throws
 * "The default Firebase app does not exist" when only named apps exist.
 * That previously 500'd admin app analytics on every request.
 */
/** Must match mobile google-services.json project_id (Android FCM tokens). */
const EXPECTED_FIREBASE_PROJECT_ID = String(
  process.env.FIREBASE_PROJECT_ID || process.env.FCM_PROJECT_ID || 'scrolith-platform'
)
  .trim()
  .toLowerCase();

const PUSH_APP_NAME = 'scrolith-push';

const getExistingPushApp = (): admin.app.App | null => {
  try {
    const apps = Array.isArray(admin.apps) ? admin.apps.filter(Boolean) : [];
    const named = apps.find((app) => app?.name === PUSH_APP_NAME);
    if (named) return named;
  } catch {
    // ignore
  }
  return null;
};

const resolveServiceAccountProjectId = (serviceAccount?: admin.ServiceAccount | null) =>
  String(
    serviceAccount?.projectId ||
      (serviceAccount as any)?.project_id ||
      process.env.FIREBASE_PROJECT_ID ||
      ''
  )
    .trim()
    .toLowerCase();

/**
 * Initialize a *named* Firebase app dedicated to FCM.
 * Never reuse ADC / Cloud Run SA (GCP project scrolith-500821) for Android tokens
 * from Firebase project scrolith-platform — that causes messaging/mismatched-credential.
 */
const initializePushFirebaseApp = (
  credential: admin.credential.Credential,
  source: PushCredentialSource,
  serviceAccount?: admin.ServiceAccount | null,
  credentialPath?: string | null
): admin.app.App => {
  setCredentialMetadata(source, serviceAccount || null, credentialPath);
  const projectId = resolveServiceAccountProjectId(serviceAccount);
  if (projectId && EXPECTED_FIREBASE_PROJECT_ID && projectId !== EXPECTED_FIREBASE_PROJECT_ID) {
    const msg = `FCM credential project "${projectId}" does not match required Firebase project "${EXPECTED_FIREBASE_PROJECT_ID}". Android tokens will fail with messaging/mismatched-credential.`;
    firebaseInitError = msg;
    throw new Error(msg);
  }

  try {
    const existing = getExistingPushApp();
    if (existing) {
      firebaseApp = existing;
      firebaseInitError = null;
      return existing;
    }
    firebaseApp = admin.initializeApp(
      {
        credential,
        projectId: projectId || EXPECTED_FIREBASE_PROJECT_ID || undefined
      },
      PUSH_APP_NAME
    );
  } catch (error: any) {
    const message = String(error?.message || error || '');
    if (/already exists/i.test(message)) {
      firebaseApp = getExistingPushApp() || admin.app(PUSH_APP_NAME);
    } else {
      throw error;
    }
  }
  firebaseInitError = null;
  if (!initSuccessLogged) {
    initSuccessLogged = true;
    console.log('[push] Firebase Admin initialized for FCM', {
      source,
      projectId: firebaseProjectId || projectId || EXPECTED_FIREBASE_PROJECT_ID,
      credentialPath: firebaseCredentialPath,
      appName: firebaseApp?.name,
      expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID
    });
  }
  return firebaseApp as admin.app.App;
};

const getFirebaseApp = (): admin.app.App | null => {
  if (firebaseApp) return firebaseApp;

  const existingNamed = getExistingPushApp();
  if (existingNamed) {
    firebaseApp = existingNamed;
    return firebaseApp;
  }

  if (initAttempted) return null;
  initAttempted = true;

  try {
    const { serviceAccount, source, sourcePath } = readServiceAccount();
    if (serviceAccount) {
      return initializePushFirebaseApp(
        admin.credential.cert(serviceAccount),
        source,
        serviceAccount,
        sourcePath
      );
    }

    // Do NOT fall back to Cloud Run ADC — wrong GCP project vs Firebase Android tokens.
    firebaseInitError =
      'Missing FCM_SERVICE_ACCOUNT_JSON for Firebase project scrolith-platform. ' +
      'Configure Secret Manager FCM_SERVICE_ACCOUNT_JSON (firebase-adminsdk for scrolith-platform).';
  } catch (error) {
    firebaseInitError = (error as any)?.message || 'Firebase initialization failed';
    if (!initErrorLogged) {
      initErrorLogged = true;
      console.warn('[push] Failed to initialize Firebase Admin:', error);
    }
    return null;
  }

  if (!initErrorLogged) {
    initErrorLogged = true;
    console.warn('[push] Push notifications disabled:', firebaseInitError);
  }
  return null;
};

export const isPushEnabled = () => {
  try {
    return Boolean(getFirebaseApp());
  } catch {
    return false;
  }
};

export const getPushRuntimeStatus = (): PushRuntimeStatus => {
  try {
    const app = getFirebaseApp();
    return {
      enabled: Boolean(app),
      initialized: initAttempted || Boolean(app),
      credentialSource: firebaseCredentialSource,
      credentialPath: firebaseCredentialPath,
      projectId: firebaseProjectId,
      clientEmail: firebaseClientEmail,
      error: app ? null : firebaseInitError
    };
  } catch (error: any) {
    return {
      enabled: false,
      initialized: initAttempted,
      credentialSource: firebaseCredentialSource,
      credentialPath: firebaseCredentialPath,
      projectId: firebaseProjectId,
      clientEmail: firebaseClientEmail,
      error: error?.message || firebaseInitError || 'Firebase runtime status unavailable'
    };
  }
};

const normalizeData = (data?: Record<string, any>) => {
  const normalized: Record<string, string> = {};
  if (!data) return normalized;
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'string') {
      normalized[key] = value;
      return;
    }
    try {
      normalized[key] = JSON.stringify(value);
    } catch {
      normalized[key] = String(value);
    }
  });
  return normalized;
};

const inferEntityId = (meta?: Record<string, any>) => {
  if (!meta) return undefined;
  return (
    meta.orderId ||
    meta.order_id ||
    meta.withdrawalId ||
    meta.withdrawal_id ||
    meta.conversionId ||
    meta.conversion_id ||
    meta.requestId ||
    meta.request_id ||
    meta.ticketId ||
    meta.ticket_id ||
    meta.conversationId ||
    meta.conversation_id ||
    meta.messageId ||
    meta.message_id ||
    meta.userId ||
    meta.user_id
  );
};

const normalizeDeepLink = (raw?: string) => {
  if (!raw) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;
  if (
    trimmed.startsWith('Scrolith://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  ) {
    return trimmed;
  }
  const pathValue = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  return `Scrolith://${pathValue}`;
};

const tagSafe = (value: unknown) =>
  String(value || 'scrolith')
    .replace(/[^a-zA-Z0-9:_-]/g, '_')
    .slice(0, 64);

const buildPushMessage = (payload: PushNotificationPayload): PushMessage => {
  const categoryInput = {
    type: payload.type || payload.data?.type,
    category: payload.data?.category || payload.meta?.category,
    entityType: payload.data?.entityType || payload.meta?.entityType,
    title: payload.title,
    data: payload.data,
    meta: payload.meta
  };
  const category = resolveNotificationCategory(categoryInput);
  const categoryLabel = getNotificationCategoryLabel(categoryInput);
  const title = formatNotificationTitleWithCategory(payload.title || 'Notification', categoryInput);
  const body = payload.body || payload.message || '';
  const customData = payload.data || {};
  const fallbackLink = buildNotificationActionUrl(payload.type || 'system', {
    ...(payload.meta && typeof payload.meta === 'object' ? payload.meta : {}),
    ...(customData && typeof customData === 'object' ? customData : {})
  });
  const rawLink =
    payload.deepLink ||
    customData.deepLink ||
    payload.link ||
    payload.actionUrl ||
    payload.action_url ||
    payload.meta?.deepLink ||
    payload.meta?.deeplink ||
    fallbackLink;
  const normalizedLink = normalizeNotificationActionUrl(rawLink) || rawLink;
  const deepLink = normalizeDeepLink(normalizedLink);
  const entityId = customData.entityId || inferEntityId(payload.meta);
  const channelId = resolveAndroidChannelId(categoryInput);
  // Phase 32.3 — rich actions + conversation grouping + badge hooks
  const conversationId =
    customData.conversationId ||
    customData.conversation_id ||
    payload.meta?.conversationId ||
    payload.meta?.conversation_id ||
    null;
  const richActions = resolveRichActions({
    type: payload.type || customData.type,
    category,
    deepLink: normalizedLink || deepLink,
    conversationId,
    entityType: customData.entityType || payload.meta?.entityType,
    entityId
  });
  const data = normalizeData({
    ...customData,
    notificationId: payload.id,
    type: payload.type || customData.type || 'system',
    category,
    categoryLabel,
    channelId,
    deepLink,
    link: normalizedLink,
    entityId,
    conversationId: conversationId || undefined,
    actions: serializeActionsForPush(richActions),
    groupKey: conversationId
      ? `conv:${conversationId}`
      : entityId
        ? `${category}:${entityId}`
        : tagSafe(payload.id || category),
    // Client may override with live unread; emit path can inject badgeCount
    badgeCount: customData.badgeCount ?? customData.unreadCount ?? payload.meta?.badgeCount,
    schemaVersion: '32.3'
  });
  return { title, body, data };
};

const chunk = <T,>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

const matchesPushTargetPlatform = (
  tokenPlatformInput: unknown,
  targetPlatform: 'all' | 'android' | 'desktop'
) => {
  const tokenPlatform = String(tokenPlatformInput || '').trim().toLowerCase();
  if (!tokenPlatform) return false;
  if (targetPlatform === 'all') return true;
  if (targetPlatform === 'android') {
    return tokenPlatform === 'android' || tokenPlatform === 'ios';
  }
  return tokenPlatform === 'web' || tokenPlatform === 'desktop' || tokenPlatform === 'browser';
};

const uniqueTokens = (tokens: Array<{ token: string }>) =>
  Array.from(new Set(tokens.map((token) => token.token).filter(Boolean)));

const isIncomingCallPayload = (payload?: PushNotificationPayload) =>
  String(payload?.type || payload?.data?.type || '').trim().toLowerCase() === 'call_ringing';

const buildAndroidPushConfig = (payload?: PushNotificationPayload): admin.messaging.AndroidConfig => {
  const channelId = payload
    ? resolveAndroidChannelId({
        type: payload.type || payload.data?.type,
        category: payload.data?.category || payload.meta?.category,
        entityType: payload.data?.entityType || payload.meta?.entityType,
        title: payload.title,
        data: payload.data,
        meta: payload.meta
      })
    : SCROLITH_ANDROID_CHANNEL_ID;
  const category = payload
    ? resolveNotificationCategory({
        type: payload.type || payload.data?.type,
        category: payload.data?.category || payload.meta?.category,
        data: payload.data,
        meta: payload.meta
      })
    : 'system';
  // All interactive Scrolith pushes use high priority for reliable wake on Android Doze.
  const priority: 'high' | 'normal' = 'high';
  const tag = resolveAndroidNotificationTag({
    type: payload?.type || payload?.data?.type,
    data: payload?.data,
    meta: payload?.meta,
    id: payload?.id
  });
  // Messaging-style grouping: same conversation collapses into one notification slot.
  const collapseKey =
    category === 'message'
      ? String(payload?.data?.conversationId || payload?.data?.conversation_id || tag).slice(0, 64)
      : tag;
  const config: admin.messaging.AndroidConfig = {
    priority,
    collapseKey
  };

  // Incoming calls are handled by the Android app's native FCM service. A
  // data-only message is required so Android can wake that service while the
  // WebView is backgrounded or terminated. Other notification categories
  // retain the existing system-managed notification behavior.
  if (!isIncomingCallPayload(payload)) {
    config.notification = {
      channelId,
      sound: SCROLITH_ANDROID_SOUND,
      icon: SCROLITH_ANDROID_SMALL_ICON,
      color: SCROLITH_ANDROID_COLOR,
      // Tag by conversation/entity for intelligent grouping (replaces prior notify).
      tag,
      // Click routing uses data.deepLink / data.link consumed by Capacitor push listeners.
      // Messages / wallet / payments: private lock-screen (preview privacy).
      visibility:
        category === 'message' ||
        category === 'admin' ||
        category === 'security' ||
        category === 'wallet' ||
        category === 'payment'
          ? 'private'
          : 'public',
      notificationCount:
        typeof payload?.data?.badgeCount === 'number'
          ? payload.data.badgeCount
          : typeof payload?.data?.unreadCount === 'number'
          ? payload.data.unreadCount
            : undefined
    };
  }

  return config;
};

const loadEligibleDeviceTokens = async (
  userIds: string[],
  targetPlatform: 'all' | 'android' | 'desktop'
): Promise<DeviceTokenRow[]> => {
  if (!userIds.length) return [];
  const rows = await prisma.deviceToken.findMany({
    where: { userId: { in: Array.from(new Set(userIds)) } },
    select: { userId: true, token: true, platform: true }
  });
  return rows
    .map((row) => ({
      userId: row.userId,
      token: row.token,
      platform: String(row.platform || '').toLowerCase()
    }))
    .filter((row) => matchesPushTargetPlatform(row.platform, targetPlatform));
};

const sendToTokens = async (
  tokens: string[],
  payload: PushNotificationPayload
): Promise<PushSendResult> => {
  const app = getFirebaseApp();
  if (!app || tokens.length === 0) {
    return {
      attempted: tokens.length,
      sent: 0,
      failed: tokens.length,
      errors: app ? [] : [{ message: firebaseInitError || 'FCM not initialized' }]
    };
  }

  const message = buildPushMessage(payload);
  const messaging = admin.messaging(app);
  const summary: PushSendResult = { attempted: tokens.length, sent: 0, failed: 0, errors: [] };
  const runtime = getPushRuntimeStatus();

  for (const batch of chunk(tokens, 500)) {
    try {
      const fcmMessage: admin.messaging.MulticastMessage = {
        tokens: batch,
        data: message.data,
        android: buildAndroidPushConfig(payload),
        apns: { headers: { 'apns-priority': '10' } }
      };
      if (!isIncomingCallPayload(payload)) {
        fcmMessage.notification = { title: message.title, body: message.body };
      }

      const response = await messaging.sendEachForMulticast(fcmMessage);

      response.responses.forEach((res, idx) => {
        if (res.success) {
          summary.sent += 1;
          if (res.messageId) {
            console.log('[push] sent', {
              messageId: res.messageId,
              projectId: runtime.projectId || EXPECTED_FIREBASE_PROJECT_ID
            });
          }
          return;
        }
        summary.failed += 1;
        const code = res.error?.code;
        const errMessage = res.error?.message || 'Push send failed';
        // Surface credential mismatch clearly for admin campaign UI.
        if (String(code || '').includes('mismatched-credential')) {
          summary.errors.push({
            token: batch[idx],
            code,
            message: `${errMessage} (FCM project must be ${EXPECTED_FIREBASE_PROJECT_ID}; active=${runtime.projectId || 'unknown'})`
          });
        } else {
          summary.errors.push({ token: batch[idx], code, message: errMessage });
        }
      });

      const invalidTokens = batch.filter((token, idx) => {
        const responseItem = response.responses[idx];
        const code = responseItem?.error?.code || '';
        return code && INVALID_TOKEN_CODES.has(code);
      });

      if (invalidTokens.length > 0) {
        await prisma.deviceToken.deleteMany({ where: { token: { in: invalidTokens } } });
      }
    } catch (error) {
      summary.failed += batch.length;
      summary.errors.push({ message: (error as any)?.message || 'Push send failed' });
      console.warn('[push] send failed:', error);
    }
  }

  summary.attempted = tokens.length;
  return summary;
};

export const sendPushToUsers = async (
  userIds: string[],
  payload: PushNotificationPayload,
  options: PushSendOptions = {}
): Promise<PushSendResult> => {
  try {
    const targetPlatform = options.targetPlatform || 'all';
    const eligibleDeviceTokens = await loadEligibleDeviceTokens(userIds, targetPlatform);
    const eligibleUsers = new Set(eligibleDeviceTokens.map((row) => row.userId));
    const tokens = uniqueTokens(eligibleDeviceTokens);
    const summary = await sendToTokens(tokens, payload);
    summary.eligibleUsers = eligibleUsers.size;
    summary.eligibleTokens = tokens.length;
    return summary;
  } catch (error) {
    console.warn('[push] Failed to send push to users', userIds.length, error);
    return {
      attempted: 0,
      sent: 0,
      failed: 0,
      errors: [{ message: (error as any)?.message || 'Push send failed' }]
    };
  }
};

export const sendPushToUser = async (
  userId: string,
  payload: PushNotificationPayload,
  options: PushSendOptions = {}
): Promise<PushSendResult> => {
  return sendPushToUsers([userId], payload, options);
};

export const sendPushToAdmins = async (
  payload: PushNotificationPayload,
  options: PushSendOptions = {}
): Promise<PushSendResult> => {
  try {
    const admins = await prisma.deviceToken.findMany({
      where: { user: { role: { in: ['ADMIN', 'MODERATOR'] }, isActive: true } },
      select: { userId: true }
    });
    const adminIds: string[] = Array.from(
      new Set(
        admins
          .map((row) => String(row.userId || '').trim())
          .filter(Boolean)
      )
    );
    return await sendPushToUsers(adminIds, payload, options);
  } catch (error) {
    console.warn('[push] Failed to send push to admins', error);
    return {
      attempted: 0,
      sent: 0,
      failed: 0,
      errors: [{ message: (error as any)?.message || 'Push send failed' }]
    };
  }
};
