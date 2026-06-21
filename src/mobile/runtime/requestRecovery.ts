const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

const getStatusCode = (error: any) => {
  const status = Number(error?.response?.status || error?.status || 0);
  return Number.isFinite(status) ? status : 0;
};

const getErrorMessage = (error: any) =>
  String(error?.message || error?.response?.data?.error || error?.response?.data?.message || '').toLowerCase();

const getErrorCode = (error: any) => String(error?.code || error?.response?.data?.code || '').toUpperCase();

export const isOfflineRuntime = () => {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
};

export const isOfflineLikeError = (error: any) => {
  if (error?.isOffline) return true;
  if (isOfflineRuntime()) return true;
  const code = getErrorCode(error);
  const message = getErrorMessage(error);
  return (
    code === 'OFFLINE' ||
    code === 'ERR_NETWORK' ||
    message.includes('offline') ||
    message.includes('network error') ||
    message.includes('failed to fetch')
  );
};

export const isTimeoutLikeError = (error: any) => {
  const code = getErrorCode(error);
  const message = getErrorMessage(error);
  return code === 'ECONNABORTED' || message.includes('timeout');
};

export const isRetryableWriteError = (error: any) => {
  if (isOfflineLikeError(error) || isTimeoutLikeError(error)) return true;
  const status = getStatusCode(error);
  return RETRYABLE_STATUS_CODES.has(status);
};

export const annotateRecoverableError = (
  error: any,
  overrides?: {
    code?: string;
    message?: string;
    retryable?: boolean;
    isOffline?: boolean;
    status?: number;
  }
) => {
  const base =
    error instanceof Error
      ? error
      : new Error(
          String(overrides?.message || getErrorMessage(error) || 'Request failed')
        );

  const typed = base as Error & {
    code?: string;
    retryable?: boolean;
    isOffline?: boolean;
    status?: number;
  };

  if (overrides?.message) {
    typed.message = overrides.message;
  }

  typed.code = overrides?.code || typed.code || getErrorCode(error) || undefined;
  typed.status =
    overrides?.status ?? typed.status ?? getStatusCode(error) ?? undefined;
  typed.isOffline = Boolean(overrides?.isOffline ?? typed.isOffline ?? isOfflineLikeError(error));
  typed.retryable = Boolean(
    overrides?.retryable ??
      typed.retryable ??
      (typed.isOffline ? true : undefined) ??
      isRetryableWriteError(error)
  );

  return typed;
};

export const createOfflineRecoveryError = (message?: string) =>
  annotateRecoverableError(new Error(message || 'You are offline.'), {
    code: 'OFFLINE',
    message:
      message ||
      'You are offline. Scrolith will retry when your connection returns or you can retry manually.',
    retryable: true,
    isOffline: true,
    status: 0
  });

export const getRecoverableActionMessage = (actionLabel: string, error: any) => {
  const action = String(actionLabel || 'This action').trim() || 'This action';
  if (isOfflineLikeError(error)) {
    return `${action} is paused while you are offline. Retry when your connection returns.`;
  }
  if (isTimeoutLikeError(error)) {
    return `${action} took too long to finish. Retry in a moment.`;
  }
  if (isRetryableWriteError(error)) {
    return `${action} hit a temporary network problem. Retry in a moment.`;
  }
  return (
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    `${action} failed.`
  );
};
