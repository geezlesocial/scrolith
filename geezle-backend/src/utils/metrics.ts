let promClient: any = null;
let StatsD: any = null;
let registry: any = null;

try {
  // try require so tests without the packages still run
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  promClient = require('prom-client');
  registry = new promClient.Registry();
} catch (e) {
  promClient = null;
}

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  StatsD = require('hot-shots');
} catch (e) {
  StatsD = null;
}

const noop = () => {};

let statsdClient: any = null;
if (StatsD) {
  try {
    statsdClient = new StatsD();
  } catch (e) {
    statsdClient = null;
  }
}

// Prometheus metrics
let recomputeCounter: any = null;
let recomputeChangedGauge: any = null;
let recomputeDurationGauge: any = null;
if (promClient && registry) {
  recomputeCounter = new promClient.Counter({ name: 'gcoin_recompute_runs_total', help: 'Total recompute runs' });
  recomputeChangedGauge = new promClient.Gauge({ name: 'gcoin_recompute_changed_count', help: 'Number of wallets changed in last recompute' });
  recomputeDurationGauge = new promClient.Gauge({ name: 'gcoin_recompute_duration_ms', help: 'Duration of last recompute in ms' });
  registry.registerMetric(recomputeCounter);
  registry.registerMetric(recomputeChangedGauge);
  registry.registerMetric(recomputeDurationGauge);
}

export const recordRecomputeMetrics = async ({ wallets = 0, changed = 0, durationMs = 0 }: { wallets?: number; changed?: number; durationMs?: number }) => {
  try {
    if (recomputeCounter) recomputeCounter.inc();
    if (recomputeChangedGauge) recomputeChangedGauge.set(changed);
    if (recomputeDurationGauge) recomputeDurationGauge.set(durationMs);
    if (statsdClient) {
      try { statsdClient.increment('gcoin.recompute.runs'); } catch (e) {}
      try { statsdClient.gauge('gcoin.recompute.changed', changed); } catch (e) {}
      try { statsdClient.timing('gcoin.recompute.duration_ms', durationMs); } catch (e) {}
    }
  } catch (e) {
    // swallow
  }
};

export const getPromRegistry = () => registry;

export default { recordRecomputeMetrics, getPromRegistry };
