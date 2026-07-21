import type {
  HumanVerificationChallengeType,
  HumanVerificationEndpoint,
  HumanVerificationSettingsData
} from './types';
import {
  ALL_CHALLENGE_TYPES,
  ALL_ENDPOINTS,
  DEFAULT_HUMAN_VERIFICATION_SETTINGS
} from './types';

const asBool = (v: unknown, fallback: boolean) =>
  typeof v === 'boolean' ? v : fallback;

const asNumber = (v: unknown, fallback: number, min = 0, max = 1_000_000) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const asString = (v: unknown, fallback: string) =>
  typeof v === 'string' && v.trim() ? v.trim() : fallback;

export function normalizeHumanVerificationSettings(
  raw?: Partial<HumanVerificationSettingsData> | Record<string, any> | null
): HumanVerificationSettingsData {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const defaults = DEFAULT_HUMAN_VERIFICATION_SETTINGS;

  const endpoints = { ...defaults.endpoints };
  for (const ep of ALL_ENDPOINTS) {
    const fromNested = src.endpoints?.[ep];
    const fromFlat = src[`enable_${ep}`] ?? src[`enable${ep}`];
    endpoints[ep] = asBool(fromNested ?? fromFlat, defaults.endpoints[ep]);
  }

  const challengeTypes = { ...defaults.challengeTypes };
  for (const t of ALL_CHALLENGE_TYPES) {
    challengeTypes[t as HumanVerificationChallengeType] = asBool(
      src.challengeTypes?.[t],
      defaults.challengeTypes[t as HumanVerificationChallengeType]
    );
  }

  const difficultyRaw = String(src.difficulty || defaults.difficulty).toLowerCase();
  const difficulty = (
    ['easy', 'medium', 'hard', 'extreme', 'automatic'].includes(difficultyRaw)
      ? difficultyRaw
      : defaults.difficulty
  ) as HumanVerificationSettingsData['difficulty'];

  const timingSrc = src.timing || {};
  const behaviorSrc = src.behavior || {};
  const themeSrc = src.theme || {};
  const brandingSrc = src.branding || {};
  const rateSrc = src.rateLimit || {};

  return {
    masterEnabled: asBool(src.masterEnabled ?? src.enabled, defaults.masterEnabled),
    emergencyDisabled: asBool(src.emergencyDisabled, defaults.emergencyDisabled),
    endpoints,
    difficulty,
    challengeTypes,
    timing: {
      expirationSeconds: asNumber(
        timingSrc.expirationSeconds ?? src.expirationSeconds,
        defaults.timing.expirationSeconds,
        30,
        3600
      ),
      verificationTtlSeconds: asNumber(
        timingSrc.verificationTtlSeconds ?? src.verificationTtlSeconds,
        defaults.timing.verificationTtlSeconds,
        30,
        7200
      ),
      maxAttempts: asNumber(
        timingSrc.maxAttempts ?? src.maxAttempts,
        defaults.timing.maxAttempts,
        1,
        20
      ),
      cooldownSeconds: asNumber(
        timingSrc.cooldownSeconds ?? src.cooldownSeconds,
        defaults.timing.cooldownSeconds,
        0,
        3600
      ),
      lockDurationSeconds: asNumber(
        timingSrc.lockDurationSeconds ?? src.lockDurationSeconds,
        defaults.timing.lockDurationSeconds,
        0,
        86400
      )
    },
    behavior: {
      alwaysVerify: asBool(behaviorSrc.alwaysVerify, defaults.behavior.alwaysVerify),
      riskBased: asBool(behaviorSrc.riskBased, defaults.behavior.riskBased),
      rememberDevice: asBool(behaviorSrc.rememberDevice, defaults.behavior.rememberDevice),
      trustedDeviceDays: asNumber(
        behaviorSrc.trustedDeviceDays,
        defaults.behavior.trustedDeviceDays,
        1,
        365
      ),
      skipLoggedInUsers: asBool(
        behaviorSrc.skipLoggedInUsers,
        defaults.behavior.skipLoggedInUsers
      ),
      skipVerifiedSession: asBool(
        behaviorSrc.skipVerifiedSession,
        defaults.behavior.skipVerifiedSession
      ),
      progressiveDifficulty: asBool(
        behaviorSrc.progressiveDifficulty,
        defaults.behavior.progressiveDifficulty
      )
    },
    theme: {
      mode: (['light', 'dark', 'system'].includes(String(themeSrc.mode))
        ? themeSrc.mode
        : defaults.theme.mode) as 'light' | 'dark' | 'system',
      accentColor: asString(themeSrc.accentColor, defaults.theme.accentColor),
      shape: (themeSrc.shape === 'square' ? 'square' : 'rounded') as 'rounded' | 'square',
      animation: asBool(themeSrc.animation, defaults.theme.animation)
    },
    branding: {
      showLogo: asBool(brandingSrc.showLogo, defaults.branding.showLogo),
      title: asString(brandingSrc.title, defaults.branding.title),
      instructions: asString(brandingSrc.instructions, defaults.branding.instructions),
      successMessage: asString(brandingSrc.successMessage, defaults.branding.successMessage),
      failureMessage: asString(brandingSrc.failureMessage, defaults.branding.failureMessage)
    },
    rateLimit: {
      createPerIpPerHour: asNumber(
        rateSrc.createPerIpPerHour,
        defaults.rateLimit.createPerIpPerHour,
        5,
        10000
      ),
      verifyPerIpPerHour: asNumber(
        rateSrc.verifyPerIpPerHour,
        defaults.rateLimit.verifyPerIpPerHour,
        5,
        10000
      )
    }
  };
}

export function isEndpointEnabled(
  settings: HumanVerificationSettingsData,
  endpoint: HumanVerificationEndpoint
): boolean {
  if (settings.emergencyDisabled) return false;
  if (!settings.masterEnabled) return false;
  return Boolean(settings.endpoints[endpoint]);
}

export function enabledChallengeTypes(
  settings: HumanVerificationSettingsData
): HumanVerificationChallengeType[] {
  return ALL_CHALLENGE_TYPES.filter((t) => settings.challengeTypes[t]);
}

export function publicSettingsView(settings: HumanVerificationSettingsData) {
  return {
    masterEnabled: settings.masterEnabled && !settings.emergencyDisabled,
    theme: settings.theme,
    branding: settings.branding,
    endpoints: settings.endpoints
  };
}
