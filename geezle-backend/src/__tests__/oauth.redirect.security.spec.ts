/**
 * Phase 25B — OAuth redirect construction security (unit)
 */
import {
  getProviderOAuthCallbackUrl,
  getFrontendOrigin,
  sanitizeInternalRedirect
} from '../utils/frontendOrigin';

describe('OAuth URL construction', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    delete process.env.K_SERVICE;
  });

  test('provider callbacks stay on api host in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.K_SERVICE = 'scrolith-backend';
    process.env.BACKEND_URL = 'https://api.scrolith.com';
    expect(getProviderOAuthCallbackUrl('google')).toBe(
      'https://api.scrolith.com/api/auth/oauth/google/callback'
    );
    expect(getProviderOAuthCallbackUrl('linkedin')).toBe(
      'https://api.scrolith.com/api/auth/oauth/linkedin/callback'
    );
  });

  test('explicit GOOGLE_OAUTH_CALLBACK_URL is honored', () => {
    process.env.NODE_ENV = 'production';
    process.env.GOOGLE_OAUTH_CALLBACK_URL =
      'https://api.scrolith.com/api/auth/oauth/google/callback';
    expect(getProviderOAuthCallbackUrl('google')).toBe(
      'https://api.scrolith.com/api/auth/oauth/google/callback'
    );
  });

  test('completion origin never localhost in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.K_SERVICE = 'scrolith-backend';
    delete process.env.FRONTEND_URL;
    delete process.env.FRONTEND_ORIGIN;
    delete process.env.CLIENT_URL;
    const origin = getFrontendOrigin();
    const completion = `${origin}/auth/oauth/callback?status=success&redirect=${encodeURIComponent(sanitizeInternalRedirect('/messages'))}`;
    expect(completion).toContain('https://scrolith.com');
    expect(completion).not.toMatch(/localhost/i);
    expect(completion).not.toContain('token=');
  });
});
