/**
 * Normalize API error payloads for user-facing copy.
 * Backend often returns `{ success: false, error: string }` rather than `message`.
 */
export const getApiErrorMessage = (error: any, fallback = 'Something went wrong.'): string => {
  const data = error?.response?.data;
  const candidates = [
    data?.message,
    data?.error,
    data?.errors?.[0]?.message,
    data?.errors?.[0],
    typeof data === 'string' ? data : null,
    error?.message
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      const text = candidate.trim();
      if (text.startsWith('Request failed with status code')) continue;
      return text;
    }
  }
  return fallback;
};

export const isUnauthorizedError = (error: any): boolean =>
  Number(error?.response?.status) === 401 || Number(error?.response?.status) === 403;
