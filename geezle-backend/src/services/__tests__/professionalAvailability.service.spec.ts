import { normalizeAvailabilityInput, serializeProfessionalAvailability } from '../professionalAvailability.service';

describe('professional availability', () => {
  test('normalizes supported values and removes duplicate labels', () => {
    const value = normalizeAvailabilityInput({
      status: 'active',
      isActive: true,
      availabilityTypes: ['freelance', 'FREELANCE'],
      services: ['Design', ' Design '],
      workPreference: 'remote',
      timing: 'available_now',
      visibility: 'public'
    });

    expect(value).toMatchObject({
      status: 'ACTIVE',
      isActive: true,
      availabilityTypes: ['FREELANCE'],
      services: ['Design'],
      workPreference: 'REMOTE',
      timing: 'AVAILABLE_NOW',
      visibility: 'PUBLIC'
    });
  });

  test('rejects invalid or contradictory availability state', () => {
    expect(() => normalizeAvailabilityInput({ workPreference: 'anywhere' })).toThrow('Invalid workPreference');
    expect(() => normalizeAvailabilityInput({ status: 'ACTIVE', isActive: false })).toThrow('Active availability must be enabled');
    expect(() => normalizeAvailabilityInput({ status: 'PAUSED', isActive: true })).toThrow('Only active availability can be enabled');
  });

  test('does not expose hidden or expired availability publicly', () => {
    const hidden = {
      status: 'ACTIVE', availabilityTypes: [], services: [], workPreference: 'REMOTE', timing: 'FLEXIBLE',
      availableFrom: null, expiresAt: null, visibility: 'HIDDEN', isActive: true
    };
    expect(serializeProfessionalAvailability(hidden, { publicOnly: true })).toBeNull();

    const expired = { ...hidden, visibility: 'PUBLIC', expiresAt: new Date(Date.now() - 1000) };
    expect(serializeProfessionalAvailability(expired, { publicOnly: true })).toBeNull();
  });

  test('preserves the owner state when visibility is hidden', () => {
    const hidden = {
      status: 'ACTIVE', availabilityTypes: [], services: [], workPreference: 'REMOTE', timing: 'FLEXIBLE',
      availableFrom: null, expiresAt: null, visibility: 'HIDDEN', isActive: true
    };
    expect(serializeProfessionalAvailability(hidden)).toMatchObject({ status: 'ACTIVE', isActive: true });
    expect(serializeProfessionalAvailability(hidden, { publicOnly: true })).toBeNull();
  });
});
