/**
 * Phase 33.0 — Circuit breakers, bounded retries, timeouts.
 */
import type { AIProviderId } from './types';

type BreakerState = {
  failures: number;
  openUntil: number;
  halfOpen: boolean;
};

const breakers = new Map<AIProviderId, BreakerState>();
const FAILURE_THRESHOLD = 5;
const OPEN_MS = 60_000;

export function isCircuitOpen(provider: AIProviderId): boolean {
  const b = breakers.get(provider);
  if (!b) return false;
  if (b.openUntil > Date.now()) return true;
  if (b.openUntil && b.openUntil <= Date.now()) {
    b.halfOpen = true;
    b.openUntil = 0;
  }
  return false;
}

export function recordProviderSuccess(provider: AIProviderId) {
  breakers.set(provider, { failures: 0, openUntil: 0, halfOpen: false });
}

export function recordProviderFailure(provider: AIProviderId) {
  const b = breakers.get(provider) || { failures: 0, openUntil: 0, halfOpen: false };
  b.failures += 1;
  if (b.failures >= FAILURE_THRESHOLD) {
    b.openUntil = Date.now() + OPEN_MS;
    b.halfOpen = false;
  }
  breakers.set(provider, b);
}

export function getCircuitSnapshot() {
  const out: Record<string, unknown> = {};
  for (const [k, v] of breakers.entries()) {
    out[k] = {
      failures: v.failures,
      open: v.openUntil > Date.now(),
      openUntil: v.openUntil || null,
      halfOpen: v.halfOpen
    };
  }
  return out;
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label = 'timeout'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error(label)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number; maxMs?: number } = {}
): Promise<T> {
  const retries = opts.retries ?? 1;
  const baseMs = opts.baseMs ?? 200;
  const maxMs = opts.maxMs ?? 2000;
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === retries) break;
      const delay = Math.min(maxMs, baseMs * Math.pow(2, i));
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export default {
  isCircuitOpen,
  recordProviderSuccess,
  recordProviderFailure,
  getCircuitSnapshot,
  withTimeout,
  withBackoff
};
