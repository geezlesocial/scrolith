export {};

const mockPrisma: any = {
  loginTrustedDevice: {
    findUnique: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn()
  },
  loginApprovalAttempt: {
    updateMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn()
  }
};

jest.mock('../../utils/prismaClient', () => ({ __esModule: true, default: mockPrisma }));
jest.mock('../notificationCenter/NotificationService', () => ({
  NotificationService: { emitToUser: jest.fn().mockResolvedValue({ createdCount: 1 }) }
}));
jest.mock('../../utils/realtime', () => ({
  __esModule: true,
  default: { emitToUser: jest.fn() }
}));

describe('loginApproval.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.loginTrustedDevice.findUnique.mockResolvedValue(null);
    mockPrisma.loginTrustedDevice.count.mockResolvedValue(1);
    mockPrisma.loginTrustedDevice.upsert.mockResolvedValue({ id: 'trusted-1' });
    mockPrisma.loginTrustedDevice.findMany.mockResolvedValue([]);
    mockPrisma.loginTrustedDevice.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.loginApprovalAttempt.updateMany.mockResolvedValue({ count: 0 });
  });

  test('normalizes only safe device metadata fields', async () => {
    const service = await import('../loginApproval.service');
    expect(service.normalizeLoginDeviceMetadata({
      deviceId: 'device-1',
      browserName: 'Chrome',
      possessionProof: { signature: 'must-not-persist' },
      secret: 'must-not-persist'
    })).toEqual(expect.objectContaining({ deviceId: 'device-1', browserName: 'Chrome' }));
    expect(service.normalizeLoginDeviceMetadata({})).not.toHaveProperty('secret');
  });

  test('creates a password-verified approval request for an untrusted device', async () => {
    mockPrisma.loginApprovalAttempt.create.mockResolvedValue({
      id: 'approval-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 600000),
      createdAt: new Date(),
      deviceMetadata: { browserName: 'Chrome', platform: 'web' }
    });
    const service = await import('../loginApproval.service');
    const result = await service.evaluateLoginDevice(
      'user-1',
      { deviceId: 'device-2', browserName: 'Chrome', platform: 'web' },
      { ip: '203.0.113.10', userAgent: 'test-agent' }
    );

    expect(result.required).toBe(true);
    expect(result).toEqual(expect.objectContaining({ attemptId: 'approval-1' }));
    expect(mockPrisma.loginApprovalAttempt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'user-1',
        requestedDeviceId: 'device-2',
        challenge: expect.any(String),
        status: 'PENDING',
        requestedIp: '203.0.113.10'
      })
    }));
  });

  test('bootstraps the first device without blocking the account', async () => {
    mockPrisma.loginTrustedDevice.count.mockResolvedValue(0);
    const service = await import('../loginApproval.service');
    const result = await service.evaluateLoginDevice('user-1', { deviceId: 'device-1', platform: 'web' }, {});
    expect(result).toEqual({ required: false, bootstrapped: true });
    expect(mockPrisma.loginTrustedDevice.upsert).toHaveBeenCalled();
  });

  test('lists safe trusted-device metadata without public keys', async () => {
    mockPrisma.loginTrustedDevice.findMany.mockResolvedValue([{
      id: 'trusted-1',
      deviceId: 'device-1',
      browserName: 'Chrome',
      deviceModel: 'Web browser',
      platform: 'web',
      deviceType: 'browser',
      osVersion: 'test os',
      appVersion: 'web',
      isTrusted: true,
      createdAt: new Date('2026-08-20T00:00:00Z'),
      lastSeenAt: new Date('2026-08-21T00:00:00Z')
    }]);
    const service = await import('../loginApproval.service');
    const result = await service.listTrustedDevices('user-1');
    expect(result[0]).toEqual(expect.objectContaining({ id: 'trusted-1', trustStatus: 'TRUSTED' }));
    expect(result[0]).not.toHaveProperty('publicKey');
  });

  test('revokes only the owner-scoped trusted-device record', async () => {
    mockPrisma.loginTrustedDevice.updateMany.mockResolvedValue({ count: 1 });
    const service = await import('../loginApproval.service');
    await expect(service.revokeTrustedDevice('user-1', 'trusted-1')).resolves.toEqual({ count: 1 });
    expect(mockPrisma.loginTrustedDevice.updateMany).toHaveBeenCalledWith({
      where: { id: 'trusted-1', userId: 'user-1', isTrusted: true },
      data: { isTrusted: false }
    });
  });
});
