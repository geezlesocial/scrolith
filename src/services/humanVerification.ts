import api from './api';

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

export type HumanVerificationOption = {
  id: string;
  label: string;
  value: string;
};

export type HumanVerificationChallenge = {
  challengeToken: string;
  endpoint: string;
  challengeType: string;
  difficulty: string;
  prompt: {
    title: string;
    instruction: string;
    display?: string;
    visual?: string | string[];
    kind: string;
  };
  options: HumanVerificationOption[];
  expiresAt: string;
  maxAttempts: number;
};

export type HumanVerificationPublicSettings = {
  masterEnabled: boolean;
  theme?: {
    mode?: 'light' | 'dark' | 'system';
    accentColor?: string;
    shape?: 'rounded' | 'square';
    animation?: boolean;
  };
  branding?: {
    showLogo?: boolean;
    title?: string;
    instructions?: string;
    successMessage?: string;
    failureMessage?: string;
  };
  endpoints?: Record<string, boolean>;
};

export type CreateChallengeResult = {
  success: boolean;
  required: boolean;
  reason?: string;
  challenge?: HumanVerificationChallenge;
  publicSettings?: HumanVerificationPublicSettings;
  error?: string;
  code?: string;
  retryAfter?: number;
};

export type VerifyChallengeResult = {
  success: boolean;
  verificationToken?: string;
  expiresAt?: string;
  endpoint?: string;
  message?: string;
  error?: string;
  code?: string;
  attemptsRemaining?: number;
};

const fingerprint = (): string => {
  try {
    const parts = [
      navigator.userAgent,
      navigator.language,
      String(screen.width),
      String(screen.height),
      String(new Date().getTimezoneOffset())
    ];
    let hash = 0;
    const s = parts.join('|');
    for (let i = 0; i < s.length; i += 1) {
      hash = (hash << 5) - hash + s.charCodeAt(i);
      hash |= 0;
    }
    return `fp_${Math.abs(hash)}`;
  } catch {
    return 'fp_unknown';
  }
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });

const isTransientNetworkError = (err: any) => {
  const status = Number(err?.response?.status || 0);
  if (status) return status >= 500 || status === 408 || status === 429;
  const message = String(err?.message || '').toLowerCase();
  const code = String(err?.code || '').toUpperCase();
  return (
    message.includes('network error') ||
    message.includes('timeout') ||
    code === 'ECONNABORTED' ||
    Boolean(err?.request)
  );
};

const withTransientRetry = async <T,>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (firstError: any) {
    if (!isTransientNetworkError(firstError)) throw firstError;
    await wait(450);
    return operation();
  }
};

export class HumanVerificationService {
  static getFingerprint() {
    return fingerprint();
  }

  static async getConfig(endpoint: HumanVerificationEndpoint): Promise<{
    required: boolean;
    publicSettings?: HumanVerificationPublicSettings;
  }> {
    try {
      const res = await withTransientRetry(() =>
        api.get('/human-verification/config', {
          params: { endpoint },
          __skipRetry: true
        } as any)
      );
      const data = res?.data || {};
      return {
        required: Boolean(data.required),
        publicSettings: data.publicSettings
      };
    } catch {
      return { required: false };
    }
  }

  static async createChallenge(endpoint: HumanVerificationEndpoint): Promise<CreateChallengeResult> {
    try {
      const res = await withTransientRetry(() =>
        api.post(
          '/human-verification/create',
          {
            endpoint,
            fingerprint: fingerprint()
          },
          { __skipRetry: true } as any
        )
      );
      return res?.data as CreateChallengeResult;
    } catch (err: any) {
      const data = err?.response?.data || {};
      return {
        success: false,
        required: true,
        error: data.error || err?.message || 'Failed to create challenge',
        code: data.code,
        retryAfter: data.retryAfter
      };
    }
  }

  static async verifyChallenge(params: {
    challengeToken: string;
    answer?: string;
    optionId?: string;
    startedAt?: number;
  }): Promise<VerifyChallengeResult> {
    try {
      const res = await withTransientRetry(() =>
        api.post(
          '/human-verification/verify',
          {
            ...params,
            fingerprint: fingerprint()
          },
          { __skipRetry: true } as any
        )
      );
      return res?.data as VerifyChallengeResult;
    } catch (err: any) {
      const data = err?.response?.data || {};
      return {
        success: false,
        error: data.error || err?.message || 'Verification failed',
        code: data.code,
        attemptsRemaining: data.attemptsRemaining
      };
    }
  }

  static async getAdminSettings() {
    const res = await api.get('/admin/security/human-verification/settings');
    return res?.data?.data ?? res?.data;
  }

  static async updateAdminSettings(payload: Record<string, unknown>) {
    const res = await api.patch('/admin/security/human-verification/settings', payload);
    return res?.data?.data ?? res?.data;
  }

  static async getAdminAnalytics(days = 30) {
    const res = await api.get('/admin/security/human-verification/analytics', {
      params: { days }
    });
    return res?.data?.data ?? res?.data;
  }

  static async getAdminAudit(limit = 50) {
    const res = await api.get('/admin/security/human-verification/audit', {
      params: { limit }
    });
    return res?.data?.data ?? res?.data;
  }
}

export default HumanVerificationService;
