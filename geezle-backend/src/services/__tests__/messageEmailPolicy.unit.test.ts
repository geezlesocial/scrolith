/**
 * Message alert email: offline-only + once per rolling day.
 */
import {
  clearMessageAlertEmailThrottleForTests,
  evaluateMessageAlertEmail,
  hasRecentMessageAlertEmail,
  isUserOnlineForMessageAlert,
  markMessageAlertEmailSent,
  MESSAGE_ALERT_EMAIL_COOLDOWN_MS
} from '../messaging/messageEmailPolicy';
import { presenceStore } from '../messaging/presenceStore';

jest.mock('../../utils/prismaClient', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn()
    },
    notification: {
      findFirst: jest.fn(),
      findMany: jest.fn()
    }
  }
}));

import prisma from '../../utils/prismaClient';

const prismaMock = prisma as unknown as {
  user: { findUnique: jest.Mock };
  notification: { findFirst: jest.Mock; findMany: jest.Mock };
};

describe('messageEmailPolicy', () => {
  const userId = 'user-msg-email-1';

  beforeEach(() => {
    clearMessageAlertEmailThrottleForTests();
    presenceStore.delete(userId);
    jest.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ isOnline: false, lastSeenAt: null });
    prismaMock.notification.findFirst.mockResolvedValue(null);
    prismaMock.notification.findMany.mockResolvedValue([]);
  });

  test('blocks email when presence store marks user online', async () => {
    presenceStore.markConnect(userId);
    expect(await isUserOnlineForMessageAlert(userId)).toBe(true);
    const decision = await evaluateMessageAlertEmail(userId);
    expect(decision).toEqual({ allow: false, reason: 'online' });
  });

  test('blocks email when DB isOnline is fresh', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      isOnline: true,
      lastSeenAt: new Date()
    });
    const decision = await evaluateMessageAlertEmail(userId);
    expect(decision).toEqual({ allow: false, reason: 'online' });
  });

  test('allows email when offline and no prior dispatch', async () => {
    const decision = await evaluateMessageAlertEmail(userId);
    expect(decision).toEqual({ allow: true, reason: 'allowed' });
  });

  test('treats stale isOnline flag as offline', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      isOnline: true,
      lastSeenAt: new Date(Date.now() - 60 * 60 * 1000)
    });
    expect(await isUserOnlineForMessageAlert(userId)).toBe(false);
    const decision = await evaluateMessageAlertEmail(userId);
    expect(decision.allow).toBe(true);
  });

  test('blocks second email within cooldown via memory mark', async () => {
    expect((await evaluateMessageAlertEmail(userId)).allow).toBe(true);
    markMessageAlertEmailSent(userId);
    const second = await evaluateMessageAlertEmail(userId);
    expect(second).toEqual({ allow: false, reason: 'daily_limit' });
  });

  test('blocks when durable notification shows emailDispatched in window', async () => {
    prismaMock.notification.findFirst.mockResolvedValue({
      id: 'n1',
      createdAt: new Date(Date.now() - 60_000)
    });
    expect(await hasRecentMessageAlertEmail(userId)).toBe(true);
    const decision = await evaluateMessageAlertEmail(userId);
    expect(decision).toEqual({ allow: false, reason: 'daily_limit' });
  });

  test('allows again after cooldown elapses (memory)', async () => {
    markMessageAlertEmailSent(userId, Date.now() - MESSAGE_ALERT_EMAIL_COOLDOWN_MS - 1_000);
    prismaMock.notification.findFirst.mockResolvedValue(null);
    const decision = await evaluateMessageAlertEmail(userId);
    expect(decision).toEqual({ allow: true, reason: 'allowed' });
  });

  test('no_user when empty id', async () => {
    expect(await evaluateMessageAlertEmail('')).toEqual({ allow: false, reason: 'no_user' });
  });
});
