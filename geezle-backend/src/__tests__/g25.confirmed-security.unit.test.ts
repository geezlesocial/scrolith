import { validateHttpsOutboundUrl } from '../utils/security/safeOutboundUrl';
import { redactPayload } from '../utils/security/redactPayload';
import { scalarQuery } from '../utils/security/scalarQuery';

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
}));

describe('G2.5A confirmed security remediations', () => {
  test('requires an allowlisted HTTPS outbound host and rejects private targets', async () => {
    await expect(validateHttpsOutboundUrl('http://example.com/hook', new Set(['example.com']))).rejects.toThrow();
    await expect(validateHttpsOutboundUrl('https://127.0.0.1/hook', new Set(['127.0.0.1']))).rejects.toThrow();
    await expect(validateHttpsOutboundUrl('https://example.com/hook', new Set(['example.com']))).resolves.toBeInstanceOf(URL);
  });

  test('redacts secret-bearing settings recursively', () => {
    expect(redactPayload({ email: { password: 'hidden' }, region: 'test' })).toEqual({ email: { password: '[REDACTED]' }, region: 'test' });
  });

  test('rejects array-valued OAuth query parameters', () => {
    expect(scalarQuery(['one', 'two'])).toBe('');
    expect(scalarQuery('state-value')).toBe('state-value');
  });
});
