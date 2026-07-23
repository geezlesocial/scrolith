import { MAX_PINNED_MESSAGES, GROUP_PIN_SERVICE_VERSION } from '../groupPinService';

describe('groupPinService policy constants', () => {
  it('caps pinned messages at 10', () => {
    expect(MAX_PINNED_MESSAGES).toBe(10);
  });

  it('exports service version for ops', () => {
    expect(String(GROUP_PIN_SERVICE_VERSION || '').length).toBeGreaterThan(0);
  });
});
