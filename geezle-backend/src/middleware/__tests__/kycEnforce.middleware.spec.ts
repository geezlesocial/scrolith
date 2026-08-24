import { isSensitiveWrite, SENSITIVE_WRITE_PREFIXES } from '../kycEnforce.middleware';

jest.mock('../../utils/prismaClient', () => ({
  __esModule: true,
  default: {}
}));

jest.mock('../../services/systemControls.service', () => ({
  getSystemControls: jest.fn(),
  isAdminRole: jest.fn(),
  isKycSatisfied: jest.fn()
}));

const request = (method: string, path: string) =>
  ({ method, baseUrl: '/api', path } as any);

describe('kycEnforceMiddleware policy boundaries', () => {
  it('does not gate job or gig publishing', () => {
    expect(isSensitiveWrite(request('POST', '/jobs'))).toBe(false);
    expect(isSensitiveWrite(request('POST', '/gigs'))).toBe(false);
  });

  it('gates payout and other financial writes when enforcement is enabled', () => {
    expect(isSensitiveWrite(request('POST', '/withdrawal/request'))).toBe(true);
    expect(isSensitiveWrite(request('POST', '/wallet/withdraw'))).toBe(true);
    expect(isSensitiveWrite(request('POST', '/gcoin/conversions'))).toBe(true);
  });

  it('does not gate reads or unrelated writes', () => {
    expect(isSensitiveWrite(request('GET', '/withdrawal/me'))).toBe(false);
    expect(isSensitiveWrite(request('POST', '/messages'))).toBe(false);
  });

  it('keeps the financial policy list explicit', () => {
    expect(SENSITIVE_WRITE_PREFIXES).not.toContain('/api/jobs');
    expect(SENSITIVE_WRITE_PREFIXES).not.toContain('/api/gigs');
    expect(SENSITIVE_WRITE_PREFIXES).toContain('/api/withdrawal');
  });
});
