/**
 * Graceful degradation helpers for Scrolitha failure modes.
 * User-facing copy is centralized via scrolitha.errors classification.
 */
import { classifyScrolithaError } from './scrolitha.errors';

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
  if (r.includes('cancel')) {
    return 'Request cancelled.';
  }
  // Shared classifier keeps timeout/rollout/rate-limit wording consistent across surfaces.
  return classifyScrolithaError(new Error(String(reason || '')), 
    'Scrolitha could not complete this request. Core platform features remain available.'
  ).message;
};
