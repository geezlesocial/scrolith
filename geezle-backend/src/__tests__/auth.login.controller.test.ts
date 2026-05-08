import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { login, getCurrentUser } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import prisma from '../utils/prismaClient';

jest.mock('../utils/prismaClient', () => {
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn()
    },
    staffUser: {
      findUnique: jest.fn(),
      update: jest.fn()
    },
    authAuditLog: {
      create: jest.fn()
    }
  };

  return {
    __esModule: true,
    default: mockPrisma
  };
});

const mockPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  staffUser: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
};

const createResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  return res;
};

const createUser = async (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  email: 'valid@example.com',
  name: 'Valid User',
  username: 'validuser',
  role: 'EMPLOYER',
  isActive: true,
  passwordHash: await bcrypt.hash('correct-password', 4),
  followOnboardingRequired: false,
  followOnboardingCompletedAt: null,
  ...overrides
});

describe('auth login controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'dev_jwt_secret';
    mockPrisma.staffUser.findUnique.mockResolvedValue(null);
    mockPrisma.user.update.mockResolvedValue({});
  });

  test('missing login fields returns 400', async () => {
    const res = createResponse();

    await login({ body: { email: 'valid@example.com' } } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'MISSING_CREDENTIALS' })
    );
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  test('unknown user returns 401 instead of 500', async () => {
    const res = createResponse();
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await login({ body: { email: 'missing@example.com', password: 'wrong-password' } } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'INVALID_CREDENTIALS' })
    );
  });

  test('user with missing password hash returns 401 instead of 500', async () => {
    const res = createResponse();
    mockPrisma.user.findUnique.mockResolvedValue(await createUser({ passwordHash: null }));

    await login({ body: { email: 'valid@example.com', password: 'wrong-password' } } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'INVALID_CREDENTIALS' })
    );
  });

  test('existing user with wrong password returns 401 instead of 500', async () => {
    const res = createResponse();
    mockPrisma.user.findUnique.mockResolvedValue(await createUser());

    await login({ body: { email: 'valid@example.com', password: 'wrong-password' } } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'INVALID_CREDENTIALS' })
    );
    expect(mockPrisma.staffUser.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  test('disabled user returns 403', async () => {
    const res = createResponse();
    mockPrisma.user.findUnique.mockResolvedValue(await createUser({ isActive: false }));

    await login({ body: { email: 'valid@example.com', password: 'correct-password' } } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'ACCOUNT_DISABLED' })
    );
  });

  test('successful login returns token, accessToken, and user', async () => {
    const res = createResponse();
    mockPrisma.user.findUnique.mockResolvedValue(await createUser());

    await login({ body: { email: 'valid@example.com', password: 'correct-password' } } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.token).toEqual(expect.any(String));
    expect(payload.accessToken).toBe(payload.token);
    expect(payload.user).toEqual(expect.objectContaining({ id: 'user-1', email: 'valid@example.com' }));
    expect(res.cookie).toHaveBeenCalledWith('Scrolith_token', payload.token, expect.any(Object));
  });

  test('/auth/me accepts Bearer token and returns the current user', async () => {
    const token = jwt.sign(
      { id: 'user-1', email: 'valid@example.com', role: 'EMPLOYER' },
      'dev_jwt_secret',
      { expiresIn: '1h' }
    );
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ id: 'user-1', email: 'valid@example.com', role: 'EMPLOYER', isActive: true })
      .mockResolvedValueOnce(await createUser());

    const req: any = {
      headers: { authorization: `Bearer ${token}` }
    };
    const authRes = createResponse();
    const next = jest.fn();

    await authMiddleware(req, authRes as any, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual(expect.objectContaining({ id: 'user-1' }));

    const meRes = createResponse();
    await getCurrentUser(req, meRes as any);

    expect(meRes.status).toHaveBeenCalledWith(200);
    expect(meRes.json).toHaveBeenCalledWith({
      user: expect.objectContaining({ id: 'user-1', email: 'valid@example.com' })
    });
  });
});
