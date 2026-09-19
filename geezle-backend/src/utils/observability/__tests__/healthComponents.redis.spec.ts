const mockConnectWithManagedIdentity = jest.fn();
const mockCreateRedisClient = jest.fn();
const mockConnectRedisClient = jest.fn();

jest.mock('../../../services/redis/entraRedis', () => ({
  createRedisClient: (...args: unknown[]) => mockCreateRedisClient(...args),
  connectRedisClient: (...args: unknown[]) => mockConnectRedisClient(...args)
}));
jest.mock('../../prismaClient', () => ({
  getPrismaConnectionState: () => 'ready',
  default: { $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]) }
}));
jest.mock('../metricsRegistry', () => ({
  recordDbMetric: jest.fn(),
  recordRedisMetric: jest.fn()
}));

describe('deep Redis health authentication', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      REDIS_URL: 'rediss://redis-staging.invalid:10000',
      REDIS_ENTRA_CLIENT_ID: 'staging-client-id',
      REDIS_ENTRA_OBJECT_ID: 'staging-object-id'
    };
    mockCreateRedisClient.mockReset();
    mockConnectRedisClient.mockResolvedValue(jest.fn());
  });

  afterEach(() => {
    mockCreateRedisClient.mockReset();
    mockConnectRedisClient.mockReset();
    jest.resetModules();
    jest.dontMock('ioredis');
    process.env = { ...originalEnv };
  });

  test('authenticates before PING and reports Redis up', async () => {
    const client = {
      on: jest.fn(),
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn()
    };
    mockCreateRedisClient.mockReturnValue(client);
    jest.doMock('ioredis', () => jest.fn().mockReturnValue(client));
    let runDeepHealthChecks!: () => Promise<any>;
    jest.isolateModules(() => ({ runDeepHealthChecks } = require('../healthComponents')));

    const report = await runDeepHealthChecks();
    expect(report.components.find((component: any) => component.name === 'redis')).toMatchObject({ status: 'up' });
    expect(mockCreateRedisClient).toHaveBeenCalledWith(
      'rediss://redis-staging.invalid:10000',
      { clientId: 'staging-client-id', requireManagedIdentity: true }
    );
    expect(mockConnectRedisClient).toHaveBeenCalledWith(
      expect.anything(),
      { clientId: 'staging-client-id', username: 'staging-object-id' },
      true
    );
    expect(client.ping).toHaveBeenCalledTimes(1);
  });

  test('reports authentication failure without throwing an unhandled client error', async () => {
    const client = { on: jest.fn(), ping: jest.fn(), quit: jest.fn(), disconnect: jest.fn() };
    jest.doMock('ioredis', () => jest.fn().mockReturnValue(client));
    mockConnectRedisClient.mockRejectedValue(new Error('NOAUTH Authentication required'));
    let runDeepHealthChecks!: () => Promise<any>;
    jest.isolateModules(() => ({ runDeepHealthChecks } = require('../healthComponents')));
    const report = await runDeepHealthChecks();
    expect(report.components.find((component: any) => component.name === 'redis')).toMatchObject({ status: 'down' });
  });
});
