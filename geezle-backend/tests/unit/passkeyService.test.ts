const prismaMock = {
  passkeyChallenge: {
    deleteMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn()
  }
};

jest.mock('../../src/utils/prismaClient', () => ({ __esModule: true, default: prismaMock }));

import {
  consumePasskeyChallenge,
  createPasskeyChallenge,
  normalizePasskeyLabel
} from '../../src/services/passkey.service';

describe('passkey challenge service', () => {
  beforeEach(() => jest.clearAllMocks());

  test('stores only a hash and strips undefined metadata', async () => {
    prismaMock.passkeyChallenge.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.passkeyChallenge.create.mockResolvedValue({ id: 'challenge-1', expiresAt: new Date() });

    await createPasskeyChallenge({
      challenge: 'raw-challenge',
      purpose: 'AUTHENTICATION',
      metadata: { platform: 'web', userAgent: undefined }
    });

    const createCall = prismaMock.passkeyChallenge.create.mock.calls[0][0];
    expect(createCall.data.challengeHash).not.toBe('raw-challenge');
    expect(createCall.data.metadata).toEqual({ platform: 'web' });
  });

  test('consumes a valid challenge exactly once', async () => {
    const challenge = 'challenge-once';
    prismaMock.passkeyChallenge.findUnique.mockResolvedValue({
      id: 'challenge-1',
      userId: null,
      challengeHash: require('crypto').createHash('sha256').update(challenge).digest('hex'),
      purpose: 'AUTHENTICATION',
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null
    });
    prismaMock.passkeyChallenge.updateMany.mockResolvedValue({ count: 1 });

    const result = await consumePasskeyChallenge({
      id: 'challenge-1',
      challenge,
      purpose: 'AUTHENTICATION'
    });

    expect(result?.id).toBe('challenge-1');
    expect(prismaMock.passkeyChallenge.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'challenge-1', consumedAt: null })
    }));
  });

  test('normalizes labels without exposing unbounded user input', () => {
    expect(normalizePasskeyLabel('  My   phone  ')).toBe('My phone');
    expect(normalizePasskeyLabel('')).toBe('Scrolith passkey');
    expect(normalizePasskeyLabel('x'.repeat(100))).toHaveLength(80);
  });
});
