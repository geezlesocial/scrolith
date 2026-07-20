/**
 * Phase 25C — OAuth exchange code security (namespace, single-use, shape).
 */
import crypto from 'crypto';

const mockCreate = jest.fn();
const mockFindUnique = jest.fn();
const mockUpdateMany = jest.fn();

jest.mock('../utils/prismaClient', () => ({
  __esModule: true,
  default: {
    passwordResetToken: {
      create: (...args: any[]) => mockCreate(...args),
      findUnique: (...args: any[]) => mockFindUnique(...args),
      updateMany: (...args: any[]) => mockUpdateMany(...args)
    }
  }
}));

import {
  consumeOAuthExchangeCode,
  createOAuthExchangeCode
} from '../services/oauthExchange.service';

describe('oauthExchange.service', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret-for-phase25c';
    process.env.JWT_EXPIRES_IN = '1h';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('createOAuthExchangeCode stores hash with oauth-exchange namespace prefix', async () => {
    mockCreate.mockResolvedValue({ id: 'row1' });
    const result = await createOAuthExchangeCode({
      userId: 'user-1',
      email: 'qa@example.com',
      role: 'EMPLOYER'
    });

    expect(result.code).toBeTruthy();
    expect(result.code.includes('.')).toBe(false); // not a JWT
    expect(result.code.length).toBeGreaterThanOrEqual(32);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const storedHash = mockCreate.mock.calls[0][0].data.tokenHash as string;
    const expected = crypto
      .createHash('sha256')
      .update(`oauth-exchange:${result.code}`)
      .digest('hex');
    expect(storedHash).toBe(expected);

    // Password-reset namespace uses raw sha256 without prefix — different hash.
    const passwordResetStyle = crypto.createHash('sha256').update(result.code).digest('hex');
    expect(storedHash).not.toBe(passwordResetStyle);
  });

  test('consume rejects missing / short codes', async () => {
    const r1 = await consumeOAuthExchangeCode('');
    expect(r1.ok).toBe(false);
    const r2 = await consumeOAuthExchangeCode('short');
    expect(r2.ok).toBe(false);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  test('consume rejects unknown code', async () => {
    mockFindUnique.mockResolvedValue(null);
    const r = await consumeOAuthExchangeCode('a'.repeat(40));
    expect(r).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/Invalid|expired/i) }));
  });

  test('consume rejects already used code (replay)', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'row1',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', email: 'a@b.com', role: 'EMPLOYER', isActive: true }
    });
    const r = await consumeOAuthExchangeCode('a'.repeat(40));
    expect(r).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/already used/i) }));
  });

  test('consume rejects expired code', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'row1',
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      user: { id: 'u1', email: 'a@b.com', role: 'EMPLOYER', isActive: true }
    });
    const r = await consumeOAuthExchangeCode('a'.repeat(40));
    expect(r).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/expired/i) }));
  });

  test('consume success marks single-use and returns session JWT', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'row1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', email: 'a@b.com', role: 'EMPLOYER', isActive: true }
    });
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const r = await consumeOAuthExchangeCode('a'.repeat(40));
    expect(r.ok).toBe(true);
    expect(r).toEqual(
      expect.objectContaining({
        ok: true,
        userId: 'u1',
        token: expect.stringMatching(/^[^.]+\.[^.]+\.[^.]+$/)
      })
    );
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'row1', usedAt: null }
      })
    );
  });

  test('consume race on single-use returns already used', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'row1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', email: 'a@b.com', role: 'EMPLOYER', isActive: true }
    });
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const r = await consumeOAuthExchangeCode('a'.repeat(40));
    expect(r).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/already used/i) }));
  });

  test('password-reset style hash is not found as oauth exchange', async () => {
    // Simulates looking up with wrong namespace: findUnique returns null
    mockFindUnique.mockResolvedValue(null);
    const passwordResetToken = 'reset-token-value-abcdefghijklmnopqrstuvwxyz';
    const r = await consumeOAuthExchangeCode(passwordResetToken);
    expect(r.ok).toBe(false);
    const lookupHash = mockFindUnique.mock.calls[0][0].where.tokenHash as string;
    const oauthNamespaced = crypto
      .createHash('sha256')
      .update(`oauth-exchange:${passwordResetToken}`)
      .digest('hex');
    expect(lookupHash).toBe(oauthNamespaced);
  });
});
