import { describe, expect, test } from '@jest/globals';
import {
  generateChallenge,
  hashAnswer,
  generatePublicToken,
  parseUserAgentBrowser
} from '../services/humanVerification/challengeEngine';
import {
  normalizeHumanVerificationSettings,
  isEndpointEnabled,
  enabledChallengeTypes,
  publicSettingsView
} from '../services/humanVerification/settings';
import {
  ALL_CHALLENGE_TYPES,
  DEFAULT_HUMAN_VERIFICATION_SETTINGS
} from '../services/humanVerification/types';

describe('Phase 30 — challenge engine', () => {
  test('generates challenges for every enabled type without leaking correctValue in options-only payload shape', () => {
    for (const type of ALL_CHALLENGE_TYPES) {
      const challenge = generateChallenge({
        enabledTypes: [type],
        difficulty: 'easy'
      });
      expect(challenge.challengeType).toBe(type);
      expect(challenge.options.length).toBeGreaterThanOrEqual(2);
      expect(challenge.correctValue).toBeTruthy();
      expect(challenge.prompt.instruction).toBeTruthy();
      const values = challenge.options.map((o) => o.value);
      expect(values).toContain(String(challenge.correctValue));
    }
  });

  test('answer hash is deterministic and case-insensitive', () => {
    const salt = 'abc123salt';
    expect(hashAnswer('Blue', salt)).toBe(hashAnswer('blue', salt));
    expect(hashAnswer('Blue', salt)).not.toBe(hashAnswer('blue', 'other'));
  });

  test('public tokens are unique-ish', () => {
    const a = generatePublicToken();
    const b = generatePublicToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(10);
  });

  test('browser parse', () => {
    expect(parseUserAgentBrowser('Mozilla/5.0 Chrome/120.0')).toBe('Chrome');
    expect(parseUserAgentBrowser('Mozilla/5.0 Firefox/118.0')).toBe('Firefox');
    expect(parseUserAgentBrowser('')).toBe('unknown');
  });

  test('difficulty automatic still produces valid challenge', () => {
    const c = generateChallenge({
      enabledTypes: ['arithmetic', 'common_sense'],
      difficulty: 'automatic',
      progressiveLevel: 3
    });
    expect(['hard', 'medium', 'easy', 'extreme']).toContain(c.difficulty);
  });
});

describe('Phase 30 — settings normalize', () => {
  test('defaults are safe (master off)', () => {
    const s = normalizeHumanVerificationSettings({});
    expect(s.masterEnabled).toBe(false);
    expect(s.emergencyDisabled).toBe(false);
    expect(s.endpoints.login).toBe(true);
    expect(s.difficulty).toBe('automatic');
  });

  test('endpoint gate respects master + emergency', () => {
    const off = normalizeHumanVerificationSettings({ masterEnabled: false });
    expect(isEndpointEnabled(off, 'login')).toBe(false);

    const on = normalizeHumanVerificationSettings({
      masterEnabled: true,
      endpoints: { ...DEFAULT_HUMAN_VERIFICATION_SETTINGS.endpoints, login: true }
    });
    expect(isEndpointEnabled(on, 'login')).toBe(true);

    const emergency = normalizeHumanVerificationSettings({
      masterEnabled: true,
      emergencyDisabled: true
    });
    expect(isEndpointEnabled(emergency, 'login')).toBe(false);
  });

  test('enabled challenge types filter', () => {
    const s = normalizeHumanVerificationSettings({
      challengeTypes: {
        ...DEFAULT_HUMAN_VERIFICATION_SETTINGS.challengeTypes,
        arithmetic: true,
        emoji: false
      }
    });
    const types = enabledChallengeTypes(s);
    expect(types).toContain('arithmetic');
    expect(types).not.toContain('emoji');
  });

  test('public settings omit secrets', () => {
    const s = normalizeHumanVerificationSettings({ masterEnabled: true });
    const pub = publicSettingsView(s);
    expect(pub.masterEnabled).toBe(true);
    expect(pub.branding).toBeDefined();
    expect((pub as any).timing).toBeUndefined();
    expect((pub as any).rateLimit).toBeUndefined();
  });
});
