/**
 * Message alert email policy:
 * - Email only when the recipient is not online
 * - At most one message-alert email per recipient per rolling 24 hours
 * - Push / in-app notifications are unaffected (gated elsewhere)
 */

import prisma from '../../utils/prismaClient';
import { presenceStore, PRESENCE_THRESHOLDS } from './presenceStore';

/** Rolling window for "once a day" message-alert emails. */
export const MESSAGE_ALERT_EMAIL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Treat DB isOnline as stale after this (aligned with presence offline threshold). */
export const MESSAGE_ALERT_ONLINE_STALE_MS = Math.max(
  60_000,
  Number(process.env.MESSAGE_ALERT_ONLINE_STALE_MS || PRESENCE_THRESHOLDS.OFFLINE_AFTER_MS || 300_000)
);

const MESSAGE_ALERT_TYPES = ['message', 'new_message'] as const;

/** Process-local fast path; durable check uses Notification.meta.emailDispatched. */
const lastEmailAtByUser = new Map<string, number>();

export type MessageAlertEmailDecision = {
  allow: boolean;
  reason: 'allowed' | 'online' | 'daily_limit' | 'no_user';
};

export const clearMessageAlertEmailThrottleForTests = () => {
  lastEmailAtByUser.clear();
};

/**
 * True when the user appears actively connected (memory presence and/or fresh DB flag).
 */
export const isUserOnlineForMessageAlert = async (userId: string, now = Date.now()): Promise<boolean> => {
  const id = String(userId || '').trim();
  if (!id) return false;

  const mem = presenceStore.get(id);
  if (mem?.isOnline) return true;

  try {
    const row = await prisma.user.findUnique({
      where: { id },
      select: { isOnline: true, lastSeenAt: true }
    });
    if (!row) return false;
    if (!row.isOnline) return false;
    if (!row.lastSeenAt) {
      // Flag set without heartbeat age — treat as online to avoid spam while connected.
      return true;
    }
    const age = now - new Date(row.lastSeenAt).getTime();
    if (Number.isFinite(age) && age > MESSAGE_ALERT_ONLINE_STALE_MS) {
      return false;
    }
    return true;
  } catch {
    // Fail open on presence lookup errors? Prefer not spamming: fail closed only for online check.
    return false;
  }
};

/**
 * Whether a message-alert email was already dispatched within the cooldown window.
 */
export const hasRecentMessageAlertEmail = async (userId: string, now = Date.now()): Promise<boolean> => {
  const id = String(userId || '').trim();
  if (!id) return false;

  const memAt = lastEmailAtByUser.get(id);
  if (typeof memAt === 'number' && now - memAt < MESSAGE_ALERT_EMAIL_COOLDOWN_MS) {
    return true;
  }

  const since = new Date(now - MESSAGE_ALERT_EMAIL_COOLDOWN_MS);
  try {
    const recent = await prisma.notification.findFirst({
      where: {
        userId: id,
        type: { in: [...MESSAGE_ALERT_TYPES] },
        createdAt: { gte: since },
        meta: {
          path: ['emailDispatched'],
          equals: true
        }
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
    if (recent?.createdAt) {
      lastEmailAtByUser.set(id, new Date(recent.createdAt).getTime());
      return true;
    }
  } catch {
    // If JSON path query fails (driver/version), fall back to scanning recent message notifs.
    try {
      const rows = await prisma.notification.findMany({
        where: {
          userId: id,
          type: { in: [...MESSAGE_ALERT_TYPES] },
          createdAt: { gte: since }
        },
        select: { id: true, createdAt: true, meta: true },
        orderBy: { createdAt: 'desc' },
        take: 40
      });
      const hit = rows.find((row) => {
        const meta = row.meta && typeof row.meta === 'object' ? (row.meta as Record<string, unknown>) : null;
        return Boolean(meta && (meta.emailDispatched === true || meta.email_dispatched === true));
      });
      if (hit?.createdAt) {
        lastEmailAtByUser.set(id, new Date(hit.createdAt).getTime());
        return true;
      }
    } catch {
      /* ignore */
    }
  }

  return false;
};

/**
 * Gate for new_message email channel only.
 */
export const evaluateMessageAlertEmail = async (
  userId?: string | null,
  now = Date.now()
): Promise<MessageAlertEmailDecision> => {
  const id = String(userId || '').trim();
  if (!id) return { allow: false, reason: 'no_user' };

  if (await isUserOnlineForMessageAlert(id, now)) {
    return { allow: false, reason: 'online' };
  }

  if (await hasRecentMessageAlertEmail(id, now)) {
    return { allow: false, reason: 'daily_limit' };
  }

  return { allow: true, reason: 'allowed' };
};

/** Call after a successful message-alert email send (memory + caller sets Notification.meta). */
export const markMessageAlertEmailSent = (userId: string, at = Date.now()) => {
  const id = String(userId || '').trim();
  if (!id) return;
  lastEmailAtByUser.set(id, at);
};

export const MESSAGE_EMAIL_POLICY_VERSION = '1.0';
