/**
 * Graceful degradation helpers for Scrolitha failure modes.
 */
export type DegradationResult<T> = {
  ok: boolean;
  degraded: boolean;
  reason?: string;
  data?: T;
};

export const degrade = <T>(reason: string, data?: T): DegradationResult<T> => ({
  ok: false,
  degraded: true,
  reason,
  data
});

export const okResult = <T>(data: T): DegradationResult<T> => ({
  ok: true,
  degraded: false,
  data
});

export const safeAsync = async <T>(
  fn: () => Promise<T>,
  reason: string,
  fallback?: T
): Promise<DegradationResult<T>> => {
  try {
    const data = await fn();
    return okResult(data);
  } catch (error: any) {
    return degrade(reason || String(error?.message || 'failure'), fallback);
  }
};

export const userFacingDegradationMessage = (reason: string) => {
  const r = String(reason || '').toLowerCase();
  if (r.includes('disabled') || r.includes('rollout')) {
    return 'Scrolitha is temporarily unavailable for this capability.';
  }
  if (r.includes('timeout')) {
    return 'Scrolitha took too long to respond. Please try again.';
  }
  if (r.includes('cancel')) {
    return 'Request cancelled.';
  }
  if (r.includes('rate') || r.includes('capacity')) {
    return 'Scrolitha is busy. Please try again shortly.';
  }
  return 'Scrolitha could not complete this request. Core platform features remain available.';
};
