describe('Gcoin Redis authentication and failure safety', () => {
  const originalEnv = { ...process.env };
  const mockClients: Array<{
    on: jest.Mock;
    eval: jest.Mock;
    disconnect: jest.Mock;
  }> = [];

  beforeEach(() => {
    jest.resetModules();
    mockClients.length = 0;
    process.env = {
      ...originalEnv,
      NODE_ENV: 'staging',
      REDIS_URL: 'rediss://redis-staging.invalid:10000',
      REDIS_ENTRA_CLIENT_ID: 'staging-client-id',
      REDIS_ENTRA_OBJECT_ID: 'staging-object-id'
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };
    jest.dontMock('ioredis');
    jest.dontMock('../services/redis/entraRedis');
  });

  test('authenticates before executing transfer protection in Redis', async () => {
    jest.doMock('ioredis', () => jest.fn().mockImplementation(() => {
      const client = {
        on: jest.fn(),
        eval: jest.fn().mockResolvedValue(1),
        disconnect: jest.fn()
      };
      mockClients.push(client);
      return client;
    }));
    jest.doMock('../services/redis/entraRedis', () => ({
      createRedisClient: jest.fn().mockImplementation(() => {
        const client = {
          on: jest.fn(),
          eval: jest.fn().mockResolvedValue(1),
          disconnect: jest.fn()
        };
        mockClients.push(client);
        return client;
      }),
      connectRedisClient: jest.fn().mockResolvedValue(jest.fn())
    }));

    let tryRecordTransfer!: (userId: string) => Promise<boolean>;
    let createRedisClient!: jest.Mock;
    let connectRedisClient!: jest.Mock;
    jest.isolateModules(() => {
      ({ tryRecordTransfer } = require('../middleware/gcoinLimits'));
      ({ createRedisClient, connectRedisClient } = require('../services/redis/entraRedis'));
    });

    await expect(tryRecordTransfer('synthetic-user')).resolves.toBe(true);
    expect(createRedisClient).toHaveBeenCalledWith(
      'rediss://redis-staging.invalid:10000',
      { clientId: 'staging-client-id', requireManagedIdentity: true }
    );
    expect(connectRedisClient).toHaveBeenCalledWith(
      mockClients[0],
      { clientId: 'staging-client-id', username: 'staging-object-id' },
      true
    );
    expect(mockClients[0].eval).toHaveBeenCalledTimes(1);
  });

  test('denies transfer and conversion when Entra authentication fails', async () => {
    jest.doMock('ioredis', () => jest.fn().mockImplementation(() => {
      const client = { on: jest.fn(), eval: jest.fn(), disconnect: jest.fn() };
      mockClients.push(client);
      return client;
    }));
    jest.doMock('../services/redis/entraRedis', () => ({
      createRedisClient: jest.fn().mockImplementation(() => {
        const client = { on: jest.fn(), eval: jest.fn(), disconnect: jest.fn() };
        mockClients.push(client);
        return client;
      }),
      connectRedisClient: jest.fn().mockRejectedValue(new Error('NOAUTH Authentication required'))
    }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    let tryRecordTransfer!: (userId: string) => Promise<boolean>;
    let tryRecordConversion!: (userId: string) => Promise<boolean>;
    jest.isolateModules(() => {
      ({ tryRecordTransfer, tryRecordConversion } = require('../middleware/gcoinLimits'));
    });

    await expect(tryRecordTransfer('synthetic-user')).resolves.toBe(false);
    await expect(tryRecordConversion('synthetic-user')).resolves.toBe(false);
    expect(mockClients[0].eval).not.toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(' ')).not.toContain('staging-client-id');
    expect(warn.mock.calls.flat().join(' ')).not.toContain('rediss://');
  });

  test('denies conversion when an authenticated Redis command returns NOAUTH', async () => {
    jest.doMock('ioredis', () => jest.fn().mockImplementation(() => {
      const client = {
        on: jest.fn(),
        eval: jest.fn().mockRejectedValue(new Error('NOAUTH Authentication required')),
        disconnect: jest.fn()
      };
      mockClients.push(client);
      return client;
    }));
    jest.doMock('../services/redis/entraRedis', () => ({
      createRedisClient: jest.fn().mockReturnValue({
        on: jest.fn(),
        eval: jest.fn().mockRejectedValue(new Error('NOAUTH Authentication required')),
        disconnect: jest.fn()
      }),
      connectRedisClient: jest.fn().mockResolvedValue(jest.fn())
    }));

    let tryRecordConversion!: (userId: string) => Promise<boolean>;
    jest.isolateModules(() => {
      ({ tryRecordConversion } = require('../middleware/gcoinLimits'));
    });

    await expect(tryRecordConversion('synthetic-user')).resolves.toBe(false);
  });
});
