/**
 * Phase 25B — frontend origin + internal redirect security tests
 */
import {
  getFrontendOrigin,
  isProductionRuntime,
  sanitizeInternalRedirect,
  validateAllowedFrontendOrigin
} from '../utils/frontendOrigin';
import { redactSensitiveQuery, redactAuthLogMessage } from '../utils/authLogRedaction';

describe('Phase 25B frontend origin', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    delete process.env.K_SERVICE;
    delete process.env.FRONTEND_ORIGIN;
    delete process.env.FRONTEND_URL;
    delete process.env.CLIENT_URL;
    delete process.env.PUBLIC_APP_URL;
    delete process.env.PLATFORM_URL;
    delete process.env.APP_URL;
    delete process.env.NODE_ENV;
  });

  test('validateAllowedFrontendOrigin accepts production allowlist', () => {
    process.env.NODE_ENV = 'production';
    expect(validateAllowedFrontendOrigin('https://scrolith.com')).toBe('https://scrolith.com');
    expect(validateAllowedFrontendOrigin('https://www.scrolith.com/')).toBe('https://www.scrolith.com');
    expect(validateAllowedFrontendOrigin('http://localhost:3000')).toBeNull();
    expect(validateAllowedFrontendOrigin('https://evil.example')).toBeNull();
    expect(validateAllowedFrontendOrigin('//scrolith.com')).toBeNull();
  });

  test('production never falls back to localhost when env missing', () => {
    process.env.NODE_ENV = 'production';
    process.env.K_SERVICE = 'scrolith-backend';
    delete process.env.FRONTEND_URL;
    delete process.env.FRONTEND_ORIGIN;
    delete process.env.CLIENT_URL;
    const origin = getFrontendOrigin();
    expect(origin).toBe('https://scrolith.com');
    expect(origin).not.toMatch(/localhost/i);
  });

  test('development may use localhost', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.K_SERVICE;
    delete process.env.FRONTEND_URL;
    expect(getFrontendOrigin()).toBe('http://localhost:3000');
  });

  test('configured FRONTEND_ORIGIN wins', () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_ORIGIN = 'https://www.scrolith.com';
    expect(getFrontendOrigin()).toBe('https://www.scrolith.com');
  });
});

describe('Phase 25B sanitizeInternalRedirect', () => {
  test('allows internal relative paths', () => {
    expect(sanitizeInternalRedirect('/')).toBe('/');
    expect(sanitizeInternalRedirect('/messages')).toBe('/messages');
    expect(sanitizeInternalRedirect('/scroll?scroll=abc')).toBe('/scroll?scroll=abc');
    expect(sanitizeInternalRedirect('/jobs/123')).toBe('/jobs/123');
  });

  test('rejects open redirects and schemes', () => {
    expect(sanitizeInternalRedirect('https://evil.example')).toBe('/');
    expect(sanitizeInternalRedirect('//evil.example')).toBe('/');
    expect(sanitizeInternalRedirect('javascript:alert(1)')).toBe('/');
    expect(sanitizeInternalRedirect('data:text/html,hi')).toBe('/');
    expect(sanitizeInternalRedirect('http://localhost:3000')).toBe('/');
    expect(sanitizeInternalRedirect('\\evil.example')).toBe('/');
    expect(sanitizeInternalRedirect('/\\evil')).toBe('/');
  });

  test('rejects auth callback loops', () => {
    expect(sanitizeInternalRedirect('/auth/oauth/callback')).toBe('/');
    expect(sanitizeInternalRedirect('/auth/oauth/callback?token=x')).toBe('/');
  });
});

describe('Phase 25B auth log redaction', () => {
  test('redacts JWT and token query params', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const url = `https://scrolith.com/auth/oauth/callback?token=${jwt}&redirect=%2F`;
    const redacted = redactSensitiveQuery(url);
    expect(redacted).not.toContain(jwt);
    expect(redacted).toMatch(/REDACTED/);
    expect(redactAuthLogMessage(`Bearer ${jwt}`)).not.toContain(jwt);
  });

  test('isProductionRuntime true when K_SERVICE set', () => {
    process.env.K_SERVICE = 'scrolith-backend';
    delete process.env.NODE_ENV;
    expect(isProductionRuntime()).toBe(true);
  });
});
