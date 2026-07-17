/**
 * Content-safe discovery metrics (no prompts, no private content).
 */
import { discoveryCache } from './discoveryEngine.cache';

type Counters = Record<string, number>;

const KEY = 'discovery:ops:counters';

const read = (): Counters => discoveryCache.get<Counters>(KEY) || {};
const write = (c: Counters) => discoveryCache.set(KEY, c, 24 * 60 * 60_000);

export const recordDiscoveryMetric = (name: string, delta = 1) => {
  const c = read();
  c[name] = Math.max(0, (c[name] || 0) + delta);
  write(c);
};

export const getDiscoveryMetricsSnapshot = () => {
  const counters = read();
  return {
    counters,
    cache: discoveryCache.stats(),
    privacy: 'No recommendation content, prompts, or private user payloads are stored in metrics.',
    generatedAt: new Date().toISOString()
  };
};

export const logDiscoveryLifecycle = (event: {
  requestId: string;
  phase: string;
  surface?: string;
  latencyMs?: number;
  itemCount?: number;
  fallbackUsed?: boolean;
  generatorsFailed?: number;
}) => {
  if (process.env.NODE_ENV === 'production' && process.env.DISCOVERY_ENGINE_VERBOSE !== 'true') {
    return;
  }
  console.info('[discovery-engine]', {
    requestId: event.requestId,
    phase: event.phase,
    surface: event.surface,
    latencyMs: event.latencyMs,
    itemCount: event.itemCount,
    fallbackUsed: event.fallbackUsed,
    generatorsFailed: event.generatorsFailed
  });
};
