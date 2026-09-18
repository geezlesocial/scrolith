import { EventEmitter } from 'events';
import { connectRedisClient, createRedisClient, getRedisClientState, RedisUnavailableError } from '../entraRedis';

jest.mock('ioredis', () => {
  const MockRedis = jest.fn().mockImplementation((_: string, options: Record<string, unknown>) => {
    const client = new EventEmitter() as EventEmitter & { options: Record<string, unknown>; connect: jest.Mock };
    client.options = options || {};
    client.connect = jest.fn().mockResolvedValue(undefined);
    return client;
  });
  return { __esModule: true, default: MockRedis };
});

describe('Redis lifecycle resilience', () => {
  beforeEach(() => jest.clearAllMocks());

  test('attaches lifecycle handlers before a connection is attempted', () => {
    const client = createRedisClient('rediss://synthetic.invalid:10000');
    expect(client.listenerCount('error')).toBeGreaterThan(0);
    expect(client.listenerCount('end')).toBeGreaterThan(0);
    expect(client.listenerCount('close')).toBeGreaterThan(0);
    expect(client.listenerCount('reconnecting')).toBeGreaterThan(0);
    expect((client.options as any).enableOfflineQueue).toBe(false);
    expect((client.options as any).maxRetriesPerRequest).toBe(1);
    expect(getRedisClientState(client)).toBe('idle');
  });

  test('requires managed identity in protected runtimes before connecting', async () => {
    const client = createRedisClient('rediss://synthetic.invalid:10000');
    await expect(connectRedisClient(client, undefined, true)).rejects.toBeInstanceOf(RedisUnavailableError);
    expect((client as any).connect).not.toHaveBeenCalled();
  });

  test('converts connection refusal into a typed unavailable result', async () => {
    const client = createRedisClient('rediss://synthetic.invalid:10000');
    (client as any).connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(connectRedisClient(client, undefined)).rejects.toMatchObject({ code: 'REDIS_UNAVAILABLE' });
    expect(getRedisClientState(client)).toBe('unavailable');
  });

  test('error/end/close events do not escape as uncaught process errors', () => {
    const client = createRedisClient('rediss://synthetic.invalid:10000');
    expect(() => {
      client.emit('error', new Error('ENOTFOUND'));
      client.emit('end');
      client.emit('close');
    }).not.toThrow();
  });
});
