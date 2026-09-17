import { jwtSecret, requiredSecret } from './requiredSecret';

describe('requiredSecret', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalKService = process.env.K_SERVICE;
  const originalSecret = process.env.TEST_SECURITY_SECRET;
  const originalJwt = process.env.JWT_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalKService === undefined) delete process.env.K_SERVICE;
    else process.env.K_SERVICE = originalKService;
    if (originalSecret === undefined) delete process.env.TEST_SECURITY_SECRET;
    else process.env.TEST_SECURITY_SECRET = originalSecret;
    if (originalJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwt;
  });

  it('uses the configured value in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.TEST_SECURITY_SECRET = 'configured-secret';
    expect(requiredSecret('TEST_SECURITY_SECRET', 'fallback')).toBe('configured-secret');
  });

  it('rejects a missing production secret', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.TEST_SECURITY_SECRET;
    expect(() => requiredSecret('TEST_SECURITY_SECRET', 'fallback')).toThrow('TEST_SECURITY_SECRET');
  });

  it('allows an explicit fallback outside production only', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.TEST_SECURITY_SECRET;
    expect(requiredSecret('TEST_SECURITY_SECRET', 'test-fallback')).toBe('test-fallback');
  });

  it('uses the JWT secret policy consistently', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'jwt-secret';
    expect(jwtSecret()).toBe('jwt-secret');
  });
});
