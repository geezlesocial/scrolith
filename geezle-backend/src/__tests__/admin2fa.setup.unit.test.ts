const mockPrisma = {
  appSetting: {
    findUnique: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn()
  },
  user: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  userSettings: {
    upsert: jest.fn()
  },
  staffUser: {
    findUnique: jest.fn()
  },
  $transaction: jest.fn()
};

const mockVerifyTotp = jest.fn();

jest.mock('../utils/prismaClient', () => ({ __esModule: true, default: mockPrisma }));
jest.mock('../services/systemControls.service', () => ({
  getSystemControls: jest.fn(async () => ({ admin2FA: true })),
  isAdminRole: (role: string) => role === 'ADMIN' || role === 'SUPER_ADMIN'
}));
jest.mock('../services/analystRole', () => ({
  isAnalystMfaRequiredByPolicy: (role: string, enabled: boolean) => enabled && role === 'ANALYST'
}));
jest.mock('../services/totp.service', () => ({
  buildOtpAuthUri: jest.fn(() => 'otpauth://totp/Scrolith:test'),
  generateBackupCodes: jest.fn(() => ['synthetic-backup-code']),
  generateBase32Secret: jest.fn(() => 'SYNTHETIC_SETUP_SECRET'),
  hashBackupCode: jest.fn((value: string) => `hash:${value}`),
  verifyTotp: mockVerifyTotp
}));

import {
  begin2FAEnrollmentFromSetup,
  confirm2FAEnrollmentFromSetup,
  evaluateAdmin2FAGate,
  getMy2FAStatus,
  verify2FALogin
} from '../controllers/admin2fa.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const challengeToken = 'a'.repeat(48);
const user = {
  id: 'user-admin-1',
  email: 'admin@example.invalid',
  role: 'ADMIN',
  isActive: true,
  twoFactorEnabled: false,
  twoFactorSecret: 'SYNTHETIC_EXISTING_SECRET',
  twoFactorWaivedUntil: null
};

const response = () => {
  const res: any = {
    status: jest.fn(),
    json: jest.fn(),
    cookie: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

const setupRequest = (body: Record<string, unknown> = {}) => ({
  body: { challengeToken, ...body }
} as any);

const validChallenge = (overrides: Record<string, unknown> = {}) => ({
  id: 'setting-1',
  scope: `2fa_challenge_${challengeToken}`,
  data: {
    userId: user.id,
    exp: Date.now() + 60_000,
    needsSetup: true,
    ...overrides
  }
});

describe('privileged MFA setup challenge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.appSetting.findUnique.mockResolvedValue(validChallenge());
    mockPrisma.user.findUnique.mockResolvedValue(user);
    mockPrisma.user.update.mockResolvedValue(user);
    mockPrisma.userSettings.upsert.mockResolvedValue({});
    mockPrisma.appSetting.update.mockResolvedValue({});
    mockPrisma.appSetting.upsert.mockResolvedValue({});
    mockPrisma.appSetting.delete.mockResolvedValue({});
    mockPrisma.staffUser.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      require2FA: false,
      role: { isActive: true }
    });
    mockVerifyTotp.mockReturnValue(true);
  });

  test('begins setup with a valid short-lived challenge without creating a session', async () => {
    const res = response();

    await begin2FAEnrollmentFromSetup(setupRequest(), res);

    expect(res.status).not.toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(res.cookie).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: user.id },
        data: expect.objectContaining({ twoFactorEnabled: false })
      })
    );
    expect(mockPrisma.appSetting.update).toHaveBeenCalled();
  });

  test('allows an Analyst under the same enforced setup policy', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ ...user, role: 'ANALYST' });
    const res = response();

    await begin2FAEnrollmentFromSetup(setupRequest(), res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(res.cookie).not.toHaveBeenCalled();
  });

  test('requires setup for an active Moderator whose staff policy requires MFA', async () => {
    mockPrisma.staffUser.findUnique.mockResolvedValueOnce({
      status: 'ACTIVE',
      require2FA: true,
      role: { isActive: true }
    });
    const gate = await evaluateAdmin2FAGate({
      id: user.id,
      role: 'MODERATOR',
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: [],
      twoFactorWaivedUntil: null
    });

    expect(gate.required).toBe(true);
    expect(mockPrisma.appSetting.upsert).toHaveBeenCalled();
  });

  test('does not require setup for staff without require2FA when global policy is off', async () => {
    const gate = await evaluateAdmin2FAGate({
      id: user.id,
      role: 'MODERATOR',
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: [],
      twoFactorWaivedUntil: null
    });

    expect(gate).toEqual({ required: false });
  });

  test('reports Moderator setup consistently with the effective MFA decision', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ ...user, role: 'MODERATOR' });
    mockPrisma.staffUser.findUnique.mockResolvedValueOnce({
      status: 'ACTIVE',
      require2FA: true,
      role: { isActive: true }
    });
    const res = response();

    await getMy2FAStatus({ user: { id: user.id } } as any, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        admin2FAPolicyEnforced: true,
        requiresSetup: true
      })
    }));
  });

  test('rejects expired or non-setup challenges before mutating MFA state', async () => {
    mockPrisma.appSetting.findUnique.mockResolvedValueOnce(validChallenge({ exp: Date.now() - 1 }));
    const expiredResponse = response();
    await begin2FAEnrollmentFromSetup(setupRequest(), expiredResponse);
    expect(expiredResponse.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();

    jest.clearAllMocks();
    mockPrisma.appSetting.findUnique.mockResolvedValueOnce(validChallenge({ needsSetup: false }));
    const enrolledResponse = response();
    await begin2FAEnrollmentFromSetup(setupRequest(), enrolledResponse);
    expect(enrolledResponse.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  test('confirms setup atomically and consumes the challenge before enabling MFA', async () => {
    mockPrisma.appSetting.findUnique.mockResolvedValueOnce(validChallenge({ setupStartedAt: Date.now() }));
    mockPrisma.user.findUnique.mockResolvedValueOnce({ ...user, role: 'MODERATOR' });
    mockPrisma.staffUser.findUnique.mockResolvedValueOnce({
      status: 'ACTIVE',
      require2FA: true,
      role: { isActive: true }
    });
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<void>) =>
      callback({
        appSetting: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        user: { update: jest.fn().mockResolvedValue(user) },
        userSettings: { upsert: jest.fn().mockResolvedValue({}) }
      })
    );
    const res = response();

    await confirm2FAEnrollmentFromSetup(setupRequest({ code: '654321' }), res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  test('valid MFA verification after enrollment creates the normal authenticated session', async () => {
    process.env.JWT_SECRET = 'local-test-only';
    mockPrisma.appSetting.findUnique.mockResolvedValueOnce({
      data: { userId: user.id, exp: Date.now() + 60_000, needsSetup: false }
    });
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      ...user,
      role: 'MODERATOR',
      twoFactorEnabled: true,
      twoFactorBackupCodes: []
    });
    const res = response();

    await verify2FALogin(setupRequest({ code: '654321' }), res);

    expect(res.cookie).toHaveBeenCalledWith('Scrolith_token', expect.any(String), expect.any(Object));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('rejects replay when the challenge cannot be atomically claimed', async () => {
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<void>) =>
      callback({
        appSetting: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        user: { update: jest.fn() },
        userSettings: { upsert: jest.fn() }
      })
    );
    const res = response();

    await confirm2FAEnrollmentFromSetup(setupRequest({ code: '654321' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'MFA_SETUP_CHALLENGE_INVALID' })
    );
  });

  test('does not mutate when the confirmation code is invalid', async () => {
    mockVerifyTotp.mockReturnValue(false);
    const res = response();

    await confirm2FAEnrollmentFromSetup(setupRequest({ code: '000000' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  test('does not accept the setup challenge as a bearer token', async () => {
    process.env.JWT_SECRET = 'local-test-only';
    process.env.ALLOW_DEV_AUTH_BYPASS = 'false';
    const res: any = response();
    const next = jest.fn();
    const req: any = { headers: { authorization: `Bearer ${challengeToken}` } };

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
