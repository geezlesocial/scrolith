import Redis from 'ioredis';
import { ManagedIdentityCredential } from '@azure/identity';
import { connectWithManagedIdentity } from '../entraRedis';

jest.mock('@azure/identity', () => ({
  ManagedIdentityCredential: jest.fn()
}));

describe('Entra Redis token refresh contract', () => {
  afterEach(() => jest.useRealTimers());

  test('refreshes before expiry with jitter and reauthenticates without replacing the client', async () => {
    jest.useFakeTimers();
    const getToken = jest.fn()
      .mockResolvedValueOnce({ token: 'token-one', expiresOnTimestamp: Date.now() + 31_000 })
      .mockResolvedValueOnce({ token: 'token-two', expiresOnTimestamp: Date.now() + 300_000 });
    (ManagedIdentityCredential as unknown as jest.Mock).mockImplementation(() => ({ getToken }));
    const redis = {
      options: {} as Record<string, unknown>,
      connect: jest.fn().mockResolvedValue(undefined),
      auth: jest.fn().mockResolvedValue('OK')
    } as unknown as Redis;

    const stop = await connectWithManagedIdentity(redis, {
      clientId: 'client-id',
      username: 'object-id'
    });
    expect(redis.options.username).toBe('object-id');
    expect(redis.options.password).toBe('token-one');
    expect(redis.connect).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(30_000);
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(redis.auth).toHaveBeenCalledWith('object-id', 'token-two');
    expect(redis.connect).toHaveBeenCalledTimes(1);
    stop();
  });

  test('does not write token material to logs', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const getToken = jest.fn().mockResolvedValue({ token: 'secret-token', expiresOnTimestamp: Date.now() + 300_000 });
    (ManagedIdentityCredential as unknown as jest.Mock).mockImplementation(() => ({ getToken }));
    const redis = { options: {}, connect: jest.fn().mockResolvedValue(undefined) } as unknown as Redis;
    const stop = await connectWithManagedIdentity(redis, { clientId: 'client-id', username: 'object-id' });
    expect(`${log.mock.calls}\n${warn.mock.calls}`).not.toContain('secret-token');
    stop();
    log.mockRestore();
    warn.mockRestore();
  });
});
