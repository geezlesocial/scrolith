/**
 * Shared Scrolitha backend error classification.
 * Safe user-facing messages only — never leak hosts, secrets, or provider internals.
 */
import { sanitizeScrolithaUserMessage } from './scrolitha.ollama';

export type ScrolithaErrorKind =
  | 'timeout'
  | 'network'
  | 'rollout_disabled'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'validation'
  | 'policy_blocked'
  | 'empty_result'
  | 'unexpected';

export type ScrolithaClassifiedError = {
  kind: ScrolithaErrorKind;
  message: string;
  retryable: boolean;
  /** Suggested HTTP status for controllers that opt in; default handlers may still use 500. */
  statusCode: number;
};

const asText = (value: unknown) => String(value ?? '').trim();

const readStatus = (error: any): number | null => {
  const status = Number(error?.statusCode || error?.status || error?.response?.status || 0);
  return Number.isFinite(status) && status > 0 ? status : null;
};

const readRawMessage = (error: any) =>
  asText(error?.response?.data?.message || error?.response?.data?.error || error?.message || error?.code || '');

/**
 * Classify backend Scrolitha errors for logging, metrics, and safe API error bodies.
 */
export const classifyScrolithaError = (
  error: unknown,
  fallback = 'Scrolitha could not complete this request. Please try again.'
): ScrolithaClassifiedError => {
  const err = error as any;
  const status = readStatus(err);
  const raw = readRawMessage(err);
  const lower = raw.toLowerCase();
  const code = asText(err?.code || err?.response?.data?.code).toUpperCase();

  if (
    code === 'SCROLITHA_PROMPT_POLICY_BLOCKED' ||
    lower.includes('prompt policy') ||
    lower.includes('blocked by policy')
  ) {
    return {
      kind: 'policy_blocked',
      message: sanitizeScrolithaUserMessage(raw || 'This request was blocked by safety policy.', fallback),
      retryable: false,
      statusCode: 400
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
      statusCode: 504
    };
  }

  if (
    code === 'ERR_NETWORK' ||
    lower.includes('network error') ||
    lower.includes('failed to fetch') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound')
  ) {
    return {
      kind: 'network',
      message: 'Network connection issue. Please try again shortly.',
      retryable: true,
      statusCode: 503
    };
  }

  if (
    status === 403 ||
    code === 'SCROLITHA_CAPABILITY_DISABLED' ||
    lower.includes('disabled by rollout') ||
    (lower.includes('rollout') && lower.includes('disabled'))
  ) {
    return {
      kind: 'rollout_disabled',
      message: 'Scrolitha is temporarily unavailable for this capability.',
      retryable: false,
      statusCode: 403
    };
  }

  if (status === 401 || lower.includes('unauthorized')) {
    return {
      kind: 'unauthorized',
      message: 'Please sign in again to use Scrolitha.',
      retryable: false,
      statusCode: 401
    };
  }

  if (status === 429 || lower.includes('too many requests') || lower.includes('rate limit')) {
    return {
      kind: 'rate_limited',
      message: 'Scrolitha is busy. Please try again shortly.',
      retryable: true,
      statusCode: 429
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
      statusCode: 503
    };
  }

  if (status === 400 || lower.includes('required') || lower.includes('validation') || lower.includes('invalid')) {
    return {
      kind: 'validation',
      message: sanitizeScrolithaUserMessage(raw || 'Invalid Scrolitha request.', fallback),
      retryable: false,
      statusCode: 400
    };
  }

  if (lower.includes('empty result') || lower.includes('empty response')) {
    return {
      kind: 'empty_result',
      message: 'Scrolitha returned an empty result. Please try again.',
      retryable: true,
      statusCode: 502
    };
  }

  return {
    kind: 'unexpected',
    message: sanitizeScrolithaUserMessage(raw || fallback, fallback),
    retryable: true,
    statusCode: status && status >= 400 && status < 600 ? status : 500
  };
};

/**
 * Structured console warning without secrets or raw prompts.
 */
export const logScrolithaWarn = (
  label: string,
  error?: unknown,
  details?: Record<string, unknown>
) => {
  const classified = error !== undefined ? classifyScrolithaError(error) : null;
  console.warn(`[scrolitha] ${label}`, {
    ...(details || {}),
    ...(classified
      ? {
          kind: classified.kind,
          retryable: classified.retryable,
          error: classified.message
        }
      : {})
  });
};

/**
 * Historical public-controller status mapping.
 * Preserves pre-Wave-3 HTTP status contracts (does not use classified.statusCode).
 */
export type LegacyScrolithaStatusMode = 'chat' | 'execute' | 'feedback' | 'workos' | 'default';

export const mapLegacyScrolithaHttpStatus = (
  error: unknown,
  mode: LegacyScrolithaStatusMode = 'default'
): number => {
  const raw = readRawMessage(error).toLowerCase();
  if (mode === 'chat') {
    if (raw.includes('required') || raw.includes('invalid') || raw.includes('forbidden')) return 400;
    if (raw.includes('rate limit')) return 429;
    return 500;
  }
  if (mode === 'execute') {
    if (raw.includes('required') || raw.includes('invalid') || raw.includes('not allowed')) return 400;
    if (raw.includes('rate limit')) return 429;
    return 500;
  }
  if (mode === 'feedback') {
    if (raw.includes('required') || raw.includes('rating')) return 400;
    return 500;
  }
  if (mode === 'workos') {
    if (raw.includes('required')) return 400;
    return 500;
  }
  return 500;
};
