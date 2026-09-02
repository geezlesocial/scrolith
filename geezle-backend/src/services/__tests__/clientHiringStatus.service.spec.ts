import {
  isClientOrEmployerRole,
  normalizeClientHiringInput,
  serializeClientHiringStatus
} from '../clientHiringStatus.service';

describe('client hiring status', () => {
  test('accepts client and employer roles only', () => {
    expect(isClientOrEmployerRole('CLIENT')).toBe(true);
    expect(isClientOrEmployerRole('employer')).toBe(true);
    expect(isClientOrEmployerRole('FREELANCER')).toBe(false);
  });

  test('normalizes and deduplicates hiring fields', () => {
    expect(normalizeClientHiringInput({
      status: 'active',
      isActive: true,
      hiringTypes: ['freelance', 'FREELANCE'],
      focusAreas: ['Product', ' Product '],
      timing: 'available_now'
    })).toMatchObject({
      status: 'ACTIVE',
      isActive: true,
      hiringTypes: ['FREELANCE'],
      focusAreas: ['Product'],
      timing: 'AVAILABLE_NOW'
    });
  });

  test('does not expose hidden, expired, or non-employer hiring status publicly', () => {
    const status = {
      status: 'ACTIVE', hiringTypes: [], focusAreas: [], timing: 'FLEXIBLE', visibility: 'PUBLIC',
      isActive: true, expiresAt: null
    };
    expect(serializeClientHiringStatus(status, { publicOnly: true, targetRole: 'FREELANCER' })).toBeNull();
    expect(serializeClientHiringStatus({ ...status, visibility: 'HIDDEN' }, { publicOnly: true, targetRole: 'CLIENT' })).toBeNull();
    expect(serializeClientHiringStatus({ ...status, expiresAt: new Date(Date.now() - 1000) }, { publicOnly: true, targetRole: 'EMPLOYER' })).toBeNull();
    expect(serializeClientHiringStatus(status, { publicOnly: true, targetRole: 'EMPLOYER' })).toMatchObject({ status: 'ACTIVE', isActive: true });
  });

  test('returns the owner state without applying public role filtering', () => {
    const status = {
      status: 'ACTIVE', hiringTypes: [], focusAreas: [], timing: 'FLEXIBLE', visibility: 'PUBLIC',
      isActive: true, expiresAt: null
    };
    expect(serializeClientHiringStatus(status, { targetRole: 'FREELANCER' })).toMatchObject({ status: 'ACTIVE', isActive: true });
  });
});
