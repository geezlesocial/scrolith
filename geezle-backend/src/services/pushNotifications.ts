import admin from 'firebase-admin';
import fs from 'fs';
import prisma from '../utils/prismaClient';

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

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument'
]);

let firebaseApp: admin.app.App | null = null;
let initAttempted = false;
let initErrorLogged = false;
let initSuccessLogged = false;

export type PushSendResult = {
  attempted: number;
  sent: number;
  failed: number;
  errors: Array<{ token?: string; code?: string; message?: string }>;
};

const readServiceAccount = (): admin.ServiceAccount | null => {
  const rawJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
  const rawB64 = process.env.FCM_SERVICE_ACCOUNT_B64;
  const rawPath = process.env.FCM_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;

  const parseJson = (input: string): admin.ServiceAccount | null => {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  };

  if (rawJson) {
    const parsed = parseJson(rawJson);
    if (parsed) return parsed;
  }

  if (rawB64) {
    try {
      const decoded = Buffer.from(rawB64, 'base64').toString('utf8');
      const parsed = parseJson(decoded);
      if (parsed) return parsed;
    } catch {
      // ignore
    }
  }

  if (rawPath) {
    try {
      const rawFile = fs.readFileSync(rawPath, 'utf8');
      const parsed = parseJson(rawFile);
      if (parsed) return parsed;
    } catch {
      // ignore
    }
  }

  return null;
};

const getFirebaseApp = (): admin.app.App | null => {
  if (firebaseApp) return firebaseApp;
  if (initAttempted) return null;
  initAttempted = true;

  try {
    const serviceAccount = readServiceAccount();
    if (serviceAccount) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      if (!initSuccessLogged) {
        initSuccessLogged = true;
        console.log('[push] Firebase Admin initialized');
      }
      return firebaseApp;
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.applicationDefault()
      });
      if (!initSuccessLogged) {
        initSuccessLogged = true;
        console.log('[push] Firebase Admin initialized');
      }
      return firebaseApp;
    }
  } catch (error) {
    if (!initErrorLogged) {
      initErrorLogged = true;
      console.warn('[push] Failed to initialize Firebase Admin:', error);
    }
  }

  if (!initErrorLogged) {
    initErrorLogged = true;
    console.warn('[push] Push notifications disabled: missing Firebase credentials.');
  }
  return null;
};

export const isPushEnabled = () => Boolean(getFirebaseApp());

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
  if (trimmed.startsWith('Scrolith://') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  const path = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  return `Scrolith://${path}`;
};

const buildPushMessage = (payload: PushNotificationPayload): PushMessage => {
  const title = payload.title || 'Notification';
  const body = payload.body || payload.message || '';
  const customData = payload.data || {};
  const rawLink =
    payload.deepLink ||
    customData.deepLink ||
    payload.link ||
    payload.actionUrl ||
    payload.action_url ||
    payload.meta?.deepLink ||
    payload.meta?.deeplink;
  const deepLink = normalizeDeepLink(rawLink);
  const entityId = customData.entityId || inferEntityId(payload.meta);
  const data = normalizeData({
    ...customData,
    notificationId: payload.id,
    type: payload.type || customData.type || 'system',
    deepLink,
    link: rawLink,
    entityId
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

const sendToTokens = async (tokens: string[], payload: PushNotificationPayload): Promise<PushSendResult> => {
  const app = getFirebaseApp();
  if (!app || tokens.length === 0) {
    return { attempted: tokens.length, sent: 0, failed: tokens.length, errors: app ? [] : [{ message: 'FCM not initialized' }] };
  }

  const message = buildPushMessage(payload);
  const messaging = admin.messaging(app);
  const summary: PushSendResult = { attempted: tokens.length, sent: 0, failed: 0, errors: [] };

  for (const batch of chunk(tokens, 500)) {
    try {
      const response = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: { title: message.title, body: message.body },
        data: message.data,
        android: { priority: 'high' },
        apns: { headers: { 'apns-priority': '10' } }
      });

      response.responses.forEach((res, idx) => {
        if (res.success) {
          summary.sent += 1;
          if (res.messageId) {
            console.log('[push] sent', { token: batch[idx], messageId: res.messageId });
          }
          return;
        }
        summary.failed += 1;
        const code = res.error?.code;
        summary.errors.push({ token: batch[idx], code, message: res.error?.message });
      });

      const invalidTokens = batch.filter((token, idx) => {
        const res = response.responses[idx];
        const code = res?.error?.code || '';
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

const uniqueTokens = (tokens: Array<{ token: string }>) =>
  Array.from(new Set(tokens.map((t) => t.token).filter(Boolean)));

export const sendPushToUser = async (userId: string, payload: PushNotificationPayload): Promise<PushSendResult> => {
  try {
    const tokens = await prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true }
    });
    const unique = uniqueTokens(tokens);
    return await sendToTokens(unique, payload);
  } catch (error) {
    console.warn('[push] Failed to send push to user', userId, error);
    return { attempted: 0, sent: 0, failed: 0, errors: [{ message: (error as any)?.message || 'Push send failed' }] };
  }
};

export const sendPushToAdmins = async (payload: PushNotificationPayload): Promise<PushSendResult> => {
  try {
    const tokens = await prisma.deviceToken.findMany({
      where: { user: { role: { in: ['ADMIN', 'MODERATOR'] }, isActive: true } },
      select: { token: true }
    });
    const unique = uniqueTokens(tokens);
    return await sendToTokens(unique, payload);
  } catch (error) {
    console.warn('[push] Failed to send push to admins', error);
    return { attempted: 0, sent: 0, failed: 0, errors: [{ message: (error as any)?.message || 'Push send failed' }] };
  }
};

