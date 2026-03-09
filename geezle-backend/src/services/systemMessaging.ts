import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { sendSystemEmail } from './email.service';
import { sendPushToUser } from './pushNotifications';
import {
  SystemMessagesConfig,
  defaultSystemMessagesConfig,
  normalizeSystemMessagesConfig
} from '../utils/systemMessagesConfig';

type UserIdentity = { id: string; name?: string | null; email?: string | null };

type SystemMessageContext = Record<string, any> & {
  user?: { id?: string; name?: string; email?: string };
  platform?: { name?: string; url?: string };
};

export type SendSystemMessageInput = {
  templateKey: string;
  userId?: string | null;
  user?: UserIdentity | null;
  email?: string | null;
  actorId?: string | null;
  context?: SystemMessageContext;
  actionUrl?: string;
  typeOverride?: string;
  meta?: Record<string, any>;
  forceNotification?: boolean;
  forcePush?: boolean;
};

type SendSystemMessageResult = {
  emailSent: boolean;
  notificationCreated: boolean;
  pushSent: boolean;
  skipped?: boolean;
};

const CONFIG_CACHE_MS = 30_000;
let cachedConfig: { loadedAt: number; config: SystemMessagesConfig } | null = null;

const interpolateTemplate = (template?: string, context?: Record<string, any>) => {
  if (!template) return '';
  const ctx = context || {};
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, path) => {
    const value = path.split('.').reduce((acc: any, key: string) => (acc ? acc[key] : undefined), ctx);
    if (value === undefined || value === null) return '';
    return String(value);
  });
};

const loadSystemMessagesConfig = async (): Promise<SystemMessagesConfig> => {
  if (cachedConfig && Date.now() - cachedConfig.loadedAt < CONFIG_CACHE_MS) {
    return cachedConfig.config;
  }
  const latest = await prisma.cMSConfig.findFirst({
    where: { target: 'GLOBAL' as any },
    orderBy: { version: 'desc' }
  });
  const data = (latest?.data as Record<string, unknown>) || {};
  const raw =
    (data['system_messages'] as any) ||
    (data['systemMessages'] as any) ||
    (data['id'] === defaultSystemMessagesConfig.id ? data : null) ||
    defaultSystemMessagesConfig;
  const normalized = normalizeSystemMessagesConfig(raw);
  cachedConfig = { loadedAt: Date.now(), config: normalized };
  return normalized;
};

const resolveUserIdentity = async (userId?: string | null, user?: UserIdentity | null): Promise<UserIdentity | null> => {
  if (user && user.id) return user;
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true }
  }) as unknown as UserIdentity | null;
};

const resolveUserSettings = async (userId?: string | null) => {
  if (!userId) return null;
  return prisma.userSettings.findUnique({ where: { userId } });
};

const buildContext = (
  base: SystemMessageContext | undefined,
  user: UserIdentity | null,
  actionUrl?: string
): SystemMessageContext => {
  const platform = {
    name: process.env.PLATFORM_NAME || 'Scrolith',
    url: process.env.PLATFORM_URL || 'https://Scrolith.com'
  };
  return {
    ...(base || {}),
    platform: { ...platform, ...(base?.platform || {}) },
    user: {
      id: user?.id,
      name: user?.name || user?.email || 'Scrolith User',
      email: user?.email
    },
    notification: {
      ...(base?.notification || {}),
      link: base?.notification?.link || actionUrl
    }
  };
};

export const sendSystemMessage = async (input: SendSystemMessageInput): Promise<SendSystemMessageResult> => {
  const config = await loadSystemMessagesConfig();
  const template = config.templates[input.templateKey];
  if (!template || template.enabled === false) {
    return { emailSent: false, notificationCreated: false, pushSent: false, skipped: true };
  }

  const user = await resolveUserIdentity(input.userId, input.user);
  const targetUserId = input.userId || user?.id || null;
  const settings = await resolveUserSettings(targetUserId);
  const context = buildContext(input.context, user, input.actionUrl);
  const isMessageNotification =
    input.templateKey === 'new_message' || String(input.typeOverride || '').trim().toLowerCase() === 'message';
  const contextualPreview = String(context?.message?.preview || '').trim();
  const contextualTitle = String(context?.sender?.name || '').trim();
  const fallbackTitle = isMessageNotification
    ? `New message${contextualTitle ? ` from ${contextualTitle}` : ''}`
    : template.label;
  const fallbackMessage = isMessageNotification ? contextualPreview || 'You received a new message.' : '';
  const actionUrl = input.actionUrl || context?.notification?.link;
  const notificationMeta = {
    ...(input.meta && typeof input.meta === 'object' ? input.meta : {}),
    ...(actionUrl ? { actionUrl } : {})
  };

  const emailAllowed =
    input.templateKey === 'password_reset' || settings?.emailNotifications !== false;
  const inAppAllowed = settings?.inAppNotifications !== false;

  let emailSent = false;
  let notificationCreated = false;
  let pushSent = false;

  if (template.email?.enabled && emailAllowed) {
    const to = input.email || user?.email;
    if (to) {
      const subject = interpolateTemplate(template.email.subject, context);
      const html = interpolateTemplate(template.email.html, context);
      const text = interpolateTemplate(template.email.text, context);
      const result = await sendSystemEmail({ to, subject, html, text });
      emailSent = result.success;
    }
  }

  let createdNotification: { id: string; createdAt: Date; meta: unknown } | null = null;

  if (targetUserId && (input.forceNotification || (template.notification?.enabled && inAppAllowed))) {
    const title = interpolateTemplate(template.notification.title, context) || fallbackTitle;
    const message = isMessageNotification
      ? fallbackMessage || interpolateTemplate(template.notification.message, context) || 'You received a new message.'
      : interpolateTemplate(template.notification.message, context);

    const created = await prisma.notification.create({
      data: {
        userId: targetUserId,
        actorId: input.actorId || null,
        type: input.typeOverride || input.templateKey,
        title,
        body: message,
        meta: Object.keys(notificationMeta).length ? notificationMeta : undefined
      }
    });
    createdNotification = created;

    realtime.emitToUser(targetUserId, 'notifications:new', {
      id: created.id,
      type: input.typeOverride || input.templateKey,
      title,
      body: message,
      actionUrl,
      createdAt: created.createdAt.toISOString(),
      meta: created.meta
    });

    notificationCreated = true;
  }

  if (targetUserId && (input.forcePush || template.push?.enabled)) {
    const baseTitle =
      createdNotification && notificationCreated
        ? undefined
        : interpolateTemplate(template.notification.title, context) || fallbackTitle;
    const baseMessage =
      createdNotification && notificationCreated
        ? undefined
        : isMessageNotification
          ? fallbackMessage || interpolateTemplate(template.notification.message, context) || 'You received a new message.'
          : interpolateTemplate(template.notification.message, context);
    const pushTitle =
      isMessageNotification
        ? fallbackTitle
        : interpolateTemplate(template.push.title, context) || baseTitle || fallbackTitle;
    const pushMessage =
      isMessageNotification
        ? fallbackMessage || baseMessage || 'You received a new message.'
        : interpolateTemplate(template.push.message, context) || baseMessage || '';
    const pushResult = await sendPushToUser(targetUserId, {
      id: createdNotification?.id,
      title: pushTitle,
      body: pushMessage,
      type: input.typeOverride || input.templateKey,
      actionUrl,
      meta: Object.keys(notificationMeta).length ? notificationMeta : undefined
    });
    pushSent = pushResult.sent > 0;
  }

  return { emailSent, notificationCreated, pushSent };
};

export const getSystemMessagesConfig = loadSystemMessagesConfig;

export const invalidateSystemMessagesConfigCache = () => {
  cachedConfig = null;
};


