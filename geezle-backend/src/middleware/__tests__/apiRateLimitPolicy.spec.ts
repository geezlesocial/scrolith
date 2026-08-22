import { classifyApiRateLimitRoute } from '../apiRateLimitPolicy';

describe('API rate-limit route isolation', () => {
  test('isolates file content reads from the general API bucket', () => {
    expect(
      classifyApiRateLimitRoute({ originalUrl: '/api/files/content/file-id?v=1' })
    ).toBe('media');
  });

  test('isolates app telemetry from the general API bucket', () => {
    expect(classifyApiRateLimitRoute({ path: '/apps/track' })).toBe('telemetry');
  });

  test('keeps unrelated API paths in the default bucket', () => {
    expect(classifyApiRateLimitRoute({ originalUrl: '/api/cms/homepage' })).toBe('default');
  });
});

