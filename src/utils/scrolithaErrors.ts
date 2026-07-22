/**
 * Scrolitha frontend error classification — production-safe user messages.
 * Does not enable capabilities; only maps transport/API failures to recovery copy.
 */

export type ScrolithaClientErrorKind =
  | 'timeout'
  | 'network'
  | 'rollout_disabled'
  | 'unauthorized'
  | 'forbidden'
  | 'consent_required'
  | 'allowlist_required'
  | 'feature_disabled'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'empty_result'
  | 'validation'
  | 'unexpected';

export type ScrolithaClientError = {
  kind: ScrolithaClientErrorKind;
  message: string;
  retryable: boolean;
  statusCode?: number | null;
};

const asText = (value: unknown) => String(value || '').trim();

const readStatus = (error: any): number | null => {
  const status = Number(error?.response?.status || error?.status || error?.statusCode || 0);
  return Number.isFinite(status) && status > 0 ? status : null;
};

const readRawMessage = (error: any) =>
  asText(
    error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      error?.code ||
      ''
  );

export const classifyScrolithaClientError = (
  error: unknown,
  fallback = 'Scrolitha could not complete this request. Please try again.'
): ScrolithaClientError => {
  const err = error as any;
  const status = readStatus(err);
  const raw = readRawMessage(err);
  const lower = raw.toLowerCase();
  const code = asText(err?.code || err?.response?.data?.code).toUpperCase();

  if (code === 'USER_NOT_IN_BETA_ALLOWLIST') {
    return {
      kind: 'allowlist_required',
      message: 'Scrolitha is available to an approved beta cohort only.',
      retryable: false,
      statusCode: status
    };
  }

  if (code === 'AI_CONSENT_REQUIRED' || code === 'CONSENT_PRIVATE_CONTENT_DENIED') {
    return {
      kind: 'consent_required',
      message: 'Enable Scrolitha AI suggestions in AI settings before continuing.',
      retryable: false,
      statusCode: status
    };
  }

  if (code === 'COPILOT_FEATURE_DISABLED') {
    return {
      kind: 'feature_disabled',
      message: 'Scrolitha is disabled for this surface.',
      retryable: false,
      statusCode: status
    };
  }

  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    status === 408 ||
    status === 504
  ) {
    return {
      kind: 'timeout',
      message: 'Scrolitha took too long to respond. Please try again.',
      retryable: true,
      statusCode: status
    };
  }

  if (
    code === 'ERR_NETWORK' ||
    lower.includes('network error') ||
    lower.includes('failed to fetch') ||
    lower.includes('offline')
  ) {
    return {
      kind: 'network',
      message: 'Network connection issue. Check your connection and try again.',
      retryable: true,
      statusCode: status
    };
  }

  if (
    status === 403 ||
    code === 'SCROLITHA_CAPABILITY_DISABLED' ||
    lower.includes('disabled by rollout') ||
    lower.includes('rollout')
  ) {
    return {
      kind: 'rollout_disabled',
      message: 'Scrolitha is temporarily unavailable for this action.',
      retryable: false,
      statusCode: status
    };
  }

  if (status === 401 || lower.includes('unauthorized')) {
    return {
      kind: 'unauthorized',
      message: 'Please sign in again to use Scrolitha.',
      retryable: false,
      statusCode: status
    };
  }

  if (status === 429 || lower.includes('too many requests') || lower.includes('rate limit')) {
    return {
      kind: 'rate_limited',
      message: 'Scrolitha is busy. Please wait a moment and try again.',
      retryable: true,
      statusCode: status
    };
  }

  if (
    status === 502 ||
    status === 503 ||
    lower.includes('unavailable') ||
    lower.includes('provider') ||
    lower.includes('core is unavailable')
  ) {
    return {
      kind: 'provider_unavailable',
      message: 'Scrolitha is temporarily unavailable. Please try again shortly.',
      retryable: true,
      statusCode: status
    };
  }

  if (lower.includes('empty result') || lower.includes('empty response')) {
    return {
      kind: 'empty_result',
      message: 'Scrolitha returned an empty result. Please try again.',
      retryable: true,
      statusCode: status
    };
  }

  if (status === 400 || lower.includes('enough context') || lower.includes('validation')) {
    return {
      kind: 'validation',
      message: raw || 'Add a little more detail so Scrolitha can help.',
      retryable: false,
      statusCode: status
    };
  }

  return {
    kind: 'unexpected',
    message: raw || fallback,
    retryable: true,
    statusCode: status
  };
};
