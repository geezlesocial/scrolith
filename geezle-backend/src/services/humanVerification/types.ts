export type HumanVerificationEndpoint =
  | 'login'
  | 'signup'
  | 'forgot_password'
  | 'password_reset'
  | 'support'
  | 'contact'
  | 'report'
  | 'feedback'
  | 'api'
  | 'marketplace'
  | 'jobs'
  | 'generic';

export type HumanVerificationDifficulty = 'easy' | 'medium' | 'hard' | 'extreme' | 'automatic';

export type HumanVerificationChallengeType =
  | 'arithmetic'
  | 'sequence'
  | 'shape_count'
  | 'icon_count'
  | 'largest_number'
  | 'smallest_number'
  | 'odd_even'
  | 'color'
  | 'emoji'
  | 'pattern'
  | 'logic'
  | 'time'
  | 'object'
  | 'word'
  | 'letter'
  | 'common_sense';

export type ChallengeOption = {
  id: string;
  label: string;
  value: string;
};

export type GeneratedChallenge = {
  challengeType: HumanVerificationChallengeType;
  difficulty: Exclude<HumanVerificationDifficulty, 'automatic'>;
  prompt: {
    title: string;
    instruction: string;
    display?: string;
    visual?: string | string[];
    kind: string;
  };
  options: ChallengeOption[];
  correctValue: string;
};

export type HumanVerificationSettingsData = {
  masterEnabled: boolean;
  emergencyDisabled: boolean;
  endpoints: Record<
    HumanVerificationEndpoint,
    boolean
  > & {
    login: boolean;
    signup: boolean;
    forgot_password: boolean;
    password_reset: boolean;
    support: boolean;
    contact: boolean;
    report: boolean;
    feedback: boolean;
    api: boolean;
    marketplace: boolean;
    jobs: boolean;
    generic: boolean;
  };
  difficulty: HumanVerificationDifficulty;
  challengeTypes: Record<HumanVerificationChallengeType, boolean>;
  timing: {
    expirationSeconds: number;
    verificationTtlSeconds: number;
    maxAttempts: number;
    cooldownSeconds: number;
    lockDurationSeconds: number;
  };
  behavior: {
    alwaysVerify: boolean;
    riskBased: boolean;
    rememberDevice: boolean;
    trustedDeviceDays: number;
    skipLoggedInUsers: boolean;
    skipVerifiedSession: boolean;
    progressiveDifficulty: boolean;
  };
  theme: {
    mode: 'light' | 'dark' | 'system';
    accentColor: string;
    shape: 'rounded' | 'square';
    animation: boolean;
  };
  branding: {
    showLogo: boolean;
    title: string;
    instructions: string;
    successMessage: string;
    failureMessage: string;
  };
  rateLimit: {
    createPerIpPerHour: number;
    verifyPerIpPerHour: number;
  };
};

export const ALL_CHALLENGE_TYPES: HumanVerificationChallengeType[] = [
  'arithmetic',
  'sequence',
  'shape_count',
  'icon_count',
  'largest_number',
  'smallest_number',
  'odd_even',
  'color',
  'emoji',
  'pattern',
  'logic',
  'time',
  'object',
  'word',
  'letter',
  'common_sense'
];

export const ALL_ENDPOINTS: HumanVerificationEndpoint[] = [
  'login',
  'signup',
  'forgot_password',
  'password_reset',
  'support',
  'contact',
  'report',
  'feedback',
  'api',
  'marketplace',
  'jobs',
  'generic'
];

export const DEFAULT_HUMAN_VERIFICATION_SETTINGS: HumanVerificationSettingsData = {
  masterEnabled: false,
  emergencyDisabled: false,
  endpoints: {
    login: true,
    signup: true,
    forgot_password: true,
    password_reset: true,
    support: true,
    contact: true,
    report: true,
    feedback: true,
    api: false,
    marketplace: false,
    jobs: false,
    generic: false
  },
  difficulty: 'automatic',
  challengeTypes: {
    arithmetic: true,
    sequence: true,
    shape_count: true,
    icon_count: true,
    largest_number: true,
    smallest_number: true,
    odd_even: true,
    color: true,
    emoji: true,
    pattern: true,
    logic: true,
    time: true,
    object: true,
    word: true,
    letter: true,
    common_sense: true
  },
  timing: {
    expirationSeconds: 300,
    verificationTtlSeconds: 600,
    maxAttempts: 5,
    cooldownSeconds: 30,
    lockDurationSeconds: 300
  },
  behavior: {
    alwaysVerify: true,
    riskBased: false,
    rememberDevice: true,
    trustedDeviceDays: 30,
    skipLoggedInUsers: false,
    skipVerifiedSession: true,
    progressiveDifficulty: true
  },
  theme: {
    mode: 'system',
    accentColor: '#2563eb',
    shape: 'rounded',
    animation: true
  },
  branding: {
    showLogo: true,
    title: 'Scrolith Human Verification',
    instructions: 'Please complete this quick check so we know you are human.',
    successMessage: 'Verified. You may continue.',
    failureMessage: 'That was not correct. Please try again.'
  },
  rateLimit: {
    createPerIpPerHour: 60,
    verifyPerIpPerHour: 120
  }
};
