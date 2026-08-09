import crypto from 'crypto';

const mockTrustedDevice = {
  count: jest.fn(),
  upsert: jest.fn(),
  findFirst: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  findMany: jest.fn()
};

const mockLoginApprovalAttempt = {
  create: jest.fn(),
  updateMany: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn()
};

const mockPrisma = {
  trustedDevice: mockTrustedDevice,
  loginApprovalAttempt: mockLoginApprovalAttempt,
  notification: {
    create: jest.fn()
  },
  authAuditLog: {
    create: jest.fn()
  },
  user: {
    findUnique: jest.fn()
  }
};

const mockEmitToUser = jest.fn();
const mockSendPushToUser = jest.fn();

jest.mock('../utils/prismaClient', () => ({
  __esModule: true,
  default: mockPrisma
}));

jest.mock('../utils/realtime', () => ({
  __esModule: true,
  default: {
    emitToUser: (...args: any[]) => mockEmitToUser(...args)
  }
}));

jest.mock('../services/pushNotifications', () => ({
  sendPushToUser: (...args: any[]) => mockSendPushToUser(...args)
}));

import {
  approveLoginAttempt,
  consumeApprovedLogin,
  evaluateLoginDevice,
  getApprovalStatus,
  rejectLoginAttempt
} from '../services/deviceSecurity.service';

const requestForDevice = (deviceId = 'device-1') =>
  ({
    body: {
      device: {
        deviceId,
        publicKey: 'public-key',
        platform: 'android',
        deviceType: 'mobile',
        deviceModel: 'Pixel',
        appVersion: '1.1.70'
      }
    },
    headers: {
      'user-agent': 'Scrolith Android',
      'x-forwarded-for': '203.0.113.10'
    },
    ip: '127.0.0.1'
  }) as any;

const user = {
  id: 'user-1',
  email: 'user@example.com',
  role: 'EMPLOYER'
};

describe('deviceSecurity.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.authAuditLog.create.mockResolvedValue({});
    mockPrisma.notification.create.mockResolvedValue({ id: 'notification-1' });
    mockSendPushToUser.mockResolvedValue(undefined);
    mockLoginApprovalAttempt.updateMany.mockResolvedValue({ count: 0 });
  });

  test('bootstraps the first authenticated device as trusted', async () => {
    mockTrustedDevice.count.mockResolvedValue(0);
    mockTrustedDevice.upsert.mockResolvedValue({ id: 'trusted-1' });

    const result = await evaluateLoginDevice(user, requestForDevice('first-device'));

    expect(result).toEqual(expect.objectContaining({ approved: true, bootstrapped: true }));
    expect(mockTrustedDevice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_deviceId: { userId: 'user-1', deviceId: 'first-device' } },
        create: expect.objectContaining({ userId: 'user-1', deviceId: 'first-device' })
      })
    );
    expect(mockPrisma.authAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event: 'login.device_trust_bootstrap' })
      })
    );
  });

  test('creates a pending approval for an untrusted device when trusted devices exist', async () => {
    mockTrustedDevice.count.mockResolvedValue(1);
    mockTrustedDevice.findFirst.mockResolvedValue(null);
    mockLoginApprovalAttempt.create.mockResolvedValue({
      id: 'attempt-1',
      newDeviceId: 'new-device',
      platform: 'android',
      deviceModel: 'Pixel',
      expiresAt: new Date(Date.now() + 60_000)
    });

    const result = await evaluateLoginDevice(user, requestForDevice('new-device'));

    expect(result.approved).toBe(false);
    expect(result.attempt).toEqual(
      expect.objectContaining({
        id: 'attempt-1',
        approvalToken: expect.any(String),
        challenge: expect.any(String)
      })
    );
    const storedHash = mockLoginApprovalAttempt.create.mock.calls[0][0].data.approvalTokenHash;
    expect(storedHash).toBe(
      crypto.createHash('sha256').update(result.attempt.approvalToken).digest('hex')
    );
    expect(mockEmitToUser).toHaveBeenCalledWith(
      'user-1',
      'security:login_approval_required',
      expect.objectContaining({ attemptId: 'attempt-1' })
    );
  });

  test('approve uses a single pending-row update before notifying', async () => {
    mockLoginApprovalAttempt.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    mockLoginApprovalAttempt.findFirst.mockResolvedValue({ id: 'attempt-1', status: 'APPROVED' });

    const result = await approveLoginAttempt('user-1', 'attempt-1');

    expect(result).toEqual(expect.objectContaining({ status: 'APPROVED' }));
    expect(mockLoginApprovalAttempt.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'attempt-1', userId: 'user-1', status: 'PENDING' }),
        data: expect.objectContaining({ status: 'APPROVED', approvedById: 'user-1' })
      })
    );
    expect(mockEmitToUser).toHaveBeenCalledWith(
      'user-1',
      'security:login_approval_updated',
      { attemptId: 'attempt-1', status: 'APPROVED' }
    );
  });

  test('reject returns null when no pending row is updated', async () => {
    mockLoginApprovalAttempt.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(rejectLoginAttempt('user-1', 'attempt-1')).resolves.toBeNull();
    expect(mockEmitToUser).not.toHaveBeenCalledWith(
      'user-1',
      'security:login_approval_updated',
      expect.anything()
    );
  });

  test('status lookup requires the approval token hash', async () => {
    mockLoginApprovalAttempt.findFirst.mockResolvedValue({ id: 'attempt-1', status: 'PENDING' });

    const result = await getApprovalStatus('attempt-1', 'approval-token');

    expect(result).toEqual(expect.objectContaining({ status: 'PENDING' }));
    expect(mockLoginApprovalAttempt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'attempt-1',
          approvalTokenHash: crypto.createHash('sha256').update('approval-token').digest('hex')
        }
      })
    );
  });

  test('approved login exchange is single-use and does not trust the device after replay', async () => {
    mockLoginApprovalAttempt.findFirst.mockResolvedValue({
      id: 'attempt-1',
      userId: 'user-1',
      newDeviceId: 'new-device',
      status: 'APPROVED',
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000)
    });
    mockLoginApprovalAttempt.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });

    const result = await consumeApprovedLogin('attempt-1', 'approval-token', requestForDevice('new-device'));

    expect(result).toBeNull();
    expect(mockTrustedDevice.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });
});
