import { installSocketRedisAdapter } from '../services/realtime/socketRedisAdapter';

jest.mock('ioredis', () => {
  const runtime = globalThis as typeof globalThis & {
    __socketRedisClients?: Array<{
      status: string;
      connect: jest.Mock;
      quit: jest.Mock;
      disconnect: jest.Mock;
    }>;
  };
  runtime.__socketRedisClients = [];
  return jest.fn().mockImplementation(() => {
    const client = {
      status: 'ready',
      connect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn()
    };
    runtime.__socketRedisClients!.push(client);
    return client;
  });
});

jest.mock('@socket.io/redis-adapter', () => ({
  createAdapter: jest.fn().mockReturnValue(jest.fn())
}));

describe('Socket.IO Redis adapter lifecycle', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NODE_ENV;
    delete process.env.REALTIME_REDIS_REQUIRED;
    delete process.env.REALTIME_REDIS_URL;
    const runtime = globalThis as typeof globalThis & {
      __socketRedisClients?: Array<{
        status: string;
        connect: jest.Mock;
        quit: jest.Mock;
        disconnect: jest.Mock;
      }>;
    };
    runtime.__socketRedisClients = [];
    jest.requireMock('@socket.io/redis-adapter').createAdapter.mockClear();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('keeps local/test runtimes explicit when Redis is not configured', async () => {
    const io = { adapter: jest.fn() };
    const lifecycle = await installSocketRedisAdapter(io);

    expect(lifecycle.enabled).toBe(false);
    expect(io.adapter).not.toHaveBeenCalled();
  });

  test('fails closed when a required Redis URL is missing', async () => {
    process.env.REALTIME_REDIS_REQUIRED = 'true';

    await expect(installSocketRedisAdapter({ adapter: jest.fn() })).rejects.toThrow(
      'Realtime Redis is required'
    );
  });

  test('connects publisher/subscriber clients and installs the official adapter', async () => {
    process.env.REALTIME_REDIS_URL = 'rediss://qa.example.invalid:6380';
    const io = { adapter: jest.fn() };

    const lifecycle = await installSocketRedisAdapter(io);

    expect(lifecycle.enabled).toBe(true);
    const clients = (globalThis as typeof globalThis & {
      __socketRedisClients: Array<{
        status: string;
        connect: jest.Mock;
        quit: jest.Mock;
        disconnect: jest.Mock;
      }>;
    }).__socketRedisClients;
    expect(clients).toHaveLength(2);
    expect(clients[0].connect).toHaveBeenCalledTimes(1);
    expect(clients[1].connect).toHaveBeenCalledTimes(1);
    expect(jest.requireMock('@socket.io/redis-adapter').createAdapter).toHaveBeenCalledTimes(1);
    expect(io.adapter).toHaveBeenCalledWith(expect.any(Function));

    await lifecycle.close();
    expect(clients[0].quit).toHaveBeenCalledTimes(1);
    expect(clients[1].quit).toHaveBeenCalledTimes(1);
  });

  test('does not expose the Redis URL when optional initialization fails', async () => {
    process.env.REALTIME_REDIS_URL = 'rediss://secret-user:secret-password@qa.example.invalid:6380';
    process.env.REALTIME_REDIS_REQUIRED = 'false';
    const RedisMock = jest.requireMock('ioredis') as jest.Mock;
    RedisMock.mockImplementationOnce(() => ({
      status: 'ready',
      connect: jest.fn().mockRejectedValue(new Error('connection failed')),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn()
    }));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const lifecycle = await installSocketRedisAdapter({ adapter: jest.fn() });

    expect(lifecycle.enabled).toBe(false);
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('secret-password');
    errorSpy.mockRestore();
  });
});
