/**
 * Metrics facade.
 * Preserves gcoin recompute metrics and merges Phase 1 observability registry.
 */

import {
  ensureObservabilityMetrics,
  getObservabilityRegistry,
  isMetricsEnabled
} from './observability/metricsRegistry';

let promClient: any = null;
let StatsD: any = null;
let legacyRegistry: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  promClient = require('prom-client');
} catch {
  promClient = null;
}

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  StatsD = require('hot-shots');
} catch {
  StatsD = null;
}

let statsdClient: any = null;
if (StatsD) {
  try {
    statsdClient = new StatsD();
  } catch {
    statsdClient = null;
  }
}

// Prefer shared observability registry so /metrics is a single scrape target.
const sharedRegistry = getObservabilityRegistry();
if (sharedRegistry) {
  legacyRegistry = sharedRegistry;
} else if (promClient) {
  legacyRegistry = new promClient.Registry();
}

let recomputeCounter: any = null;
let recomputeChangedGauge: any = null;
let recomputeDurationGauge: any = null;

if (promClient && legacyRegistry) {
  try {
    recomputeCounter = new promClient.Counter({
      name: 'gcoin_recompute_runs_total',
      help: 'Total recompute runs',
      registers: [legacyRegistry]
    });
    recomputeChangedGauge = new promClient.Gauge({
      name: 'gcoin_recompute_changed_count',
      help: 'Number of wallets changed in last recompute',
      registers: [legacyRegistry]
    });
    recomputeDurationGauge = new promClient.Gauge({
      name: 'gcoin_recompute_duration_ms',
      help: 'Duration of last recompute in ms',
      registers: [legacyRegistry]
    });
  } catch {
    // Metrics may already be registered when module reloads in tests.
    try {
      recomputeCounter = legacyRegistry.getSingleMetric?.('gcoin_recompute_runs_total') || null;
      recomputeChangedGauge = legacyRegistry.getSingleMetric?.('gcoin_recompute_changed_count') || null;
      recomputeDurationGauge = legacyRegistry.getSingleMetric?.('gcoin_recompute_duration_ms') || null;
    } catch {
      // ignore
    }
  }
}

export const recordRecomputeMetrics = async ({
  wallets = 0,
  changed = 0,
  durationMs = 0
}: {
  wallets?: number;
  changed?: number;
  durationMs?: number;
}) => {
  try {
    ensureObservabilityMetrics();
    if (recomputeCounter) recomputeCounter.inc();
    if (recomputeChangedGauge) recomputeChangedGauge.set(changed);
    if (recomputeDurationGauge) recomputeDurationGauge.set(durationMs);
    if (statsdClient) {
      try {
        statsdClient.increment('gcoin.recompute.runs');
      } catch {
        // ignore
      }
      try {
        statsdClient.gauge('gcoin.recompute.changed', changed);
      } catch {
        // ignore
      }
      try {
        statsdClient.timing('gcoin.recompute.duration_ms', durationMs);
      } catch {
        // ignore
      }
    }
  } catch {
    // swallow
  }
};

export const getPromRegistry = () => {
  ensureObservabilityMetrics();
  return legacyRegistry || getObservabilityRegistry();
};

export const metricsEnabled = () => isMetricsEnabled() || Boolean(legacyRegistry);

export default { recordRecomputeMetrics, getPromRegistry, metricsEnabled };
