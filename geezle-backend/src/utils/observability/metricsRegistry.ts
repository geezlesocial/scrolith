/**
 * Scrolith Phase 1 observability — Prometheus metric registry.
 * Additive: preserves existing gcoin recompute metrics via utils/metrics.ts.
 * Safe when prom-client is unavailable (tests / lean images).
 */

type LabelMap = Record<string, string | number | undefined | null>;

let promClient: any = null;
let registry: any = null;
let defaultMetricsStarted = false;
let domainMetricsRegistered = false;

const counters = new Map<string, any>();
const histograms = new Map<string, any>();
const gauges = new Map<string, any>();

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  promClient = require('prom-client');
  registry = new promClient.Registry();
} catch {
  promClient = null;
  registry = null;
}

const normalizeLabels = (labels?: LabelMap): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!labels) return out;
  for (const [key, value] of Object.entries(labels)) {
    if (value === undefined || value === null) continue;
    out[key] = String(value).slice(0, 120);
  }
  return out;
};

const ensureDefaultMetrics = () => {
  if (!promClient || !registry || defaultMetricsStarted) return;
  try {
    promClient.collectDefaultMetrics({
      register: registry,
      prefix: 'scrolith_process_'
    });
    defaultMetricsStarted = true;
  } catch {
    // already registered in another module
  }
};

const counter = (name: string, help: string, labelNames: string[] = []) => {
  if (!promClient || !registry) return null;
  if (counters.has(name)) return counters.get(name);
  const metric = new promClient.Counter({
    name,
    help,
    labelNames,
    registers: [registry]
  });
  counters.set(name, metric);
  return metric;
};

const histogram = (
  name: string,
  help: string,
  labelNames: string[] = [],
  buckets?: number[]
) => {
  if (!promClient || !registry) return null;
  if (histograms.has(name)) return histograms.get(name);
  const metric = new promClient.Histogram({
    name,
    help,
    labelNames,
    buckets: buckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    registers: [registry]
  });
  histograms.set(name, metric);
  return metric;
};

const gauge = (name: string, help: string, labelNames: string[] = []) => {
  if (!promClient || !registry) return null;
  if (gauges.has(name)) return gauges.get(name);
  const metric = new promClient.Gauge({
    name,
    help,
    labelNames,
    registers: [registry]
  });
  gauges.set(name, metric);
  return metric;
};

/** Register domain metrics once (idempotent). */
export const ensureObservabilityMetrics = () => {
  if (!promClient || !registry) return { enabled: false as const };
  ensureDefaultMetrics();
  if (domainMetricsRegistered) return { enabled: true as const, registry };
  domainMetricsRegistered = true;

  // Platform HTTP
  counter('scrolith_http_requests_total', 'HTTP requests', ['method', 'route', 'status_class']);
  histogram('scrolith_http_request_duration_seconds', 'HTTP request duration', ['method', 'route', 'status_class']);
  counter('scrolith_http_errors_total', 'HTTP 5xx responses', ['method', 'route']);

  // Messaging
  counter('scrolith_messages_sent_total', 'Messages accepted for delivery', ['channel']);
  counter('scrolith_messages_failed_total', 'Message send failures', ['reason']);
  histogram('scrolith_message_latency_seconds', 'Message processing latency', ['channel']);
  counter('scrolith_socket_reconnects_total', 'Socket.IO reconnect observations', ['namespace']);
  counter('scrolith_upload_failures_total', 'Upload failures', ['kind']);

  // Voice / video calling
  counter('scrolith_call_attempts_total', 'Call initiate attempts', ['call_type', 'media_mode']);
  counter('scrolith_call_outcomes_total', 'Call terminal outcomes', [
    'outcome',
    'call_type',
    'media_mode'
  ]);
  histogram('scrolith_call_setup_seconds', 'Time from initiate to active (when known)', [
    'call_type',
    'media_mode'
  ]);
  histogram('scrolith_call_duration_seconds', 'Active call duration', ['call_type', 'media_mode']);
  counter('scrolith_call_ice_events_total', 'ICE-related events from clients/server', ['event']);
  counter('scrolith_call_turn_events_total', 'TURN-related events', ['event']);
  gauge('scrolith_calls_active', 'Active calls (best-effort in-process)', ['media_mode']);

  // Auth
  counter('scrolith_auth_login_total', 'Login attempts', ['result']);
  counter('scrolith_auth_token_total', 'Token validation events', ['result']);
  counter('scrolith_auth_oauth_total', 'OAuth events', ['result']);

  // Data plane
  histogram('scrolith_db_query_seconds', 'Database query duration samples', ['operation']);
  counter('scrolith_db_errors_total', 'Database errors', ['operation']);
  gauge('scrolith_db_pool_state', 'Prisma connection state (1=ready,0=degraded)', []);
  counter('scrolith_redis_ops_total', 'Redis operations', ['result']);
  histogram('scrolith_redis_latency_seconds', 'Redis op latency', ['op']);

  // AI
  counter('scrolith_ai_requests_total', 'AI service requests', ['provider', 'result']);
  histogram('scrolith_ai_latency_seconds', 'AI request latency', ['provider']);

  // Notifications
  counter('scrolith_notifications_total', 'Notification pipeline events', ['channel', 'result']);

  return { enabled: true as const, registry };
};

export const getObservabilityRegistry = () => {
  ensureObservabilityMetrics();
  return registry;
};

export const isMetricsEnabled = () => Boolean(promClient && registry);

const inc = (name: string, labels?: LabelMap, value = 1) => {
  ensureObservabilityMetrics();
  const metric = counters.get(name);
  if (!metric) return;
  try {
    const l = normalizeLabels(labels);
    if (Object.keys(l).length) metric.inc(l, value);
    else metric.inc(value);
  } catch {
    // swallow
  }
};

const observe = (name: string, seconds: number, labels?: LabelMap) => {
  ensureObservabilityMetrics();
  const metric = histograms.get(name);
  if (!metric || !Number.isFinite(seconds)) return;
  try {
    const l = normalizeLabels(labels);
    if (Object.keys(l).length) metric.observe(l, seconds);
    else metric.observe(seconds);
  } catch {
    // swallow
  }
};

const setGauge = (name: string, value: number, labels?: LabelMap) => {
  ensureObservabilityMetrics();
  const metric = gauges.get(name);
  if (!metric || !Number.isFinite(value)) return;
  try {
    const l = normalizeLabels(labels);
    if (Object.keys(l).length) metric.set(l, value);
    else metric.set(value);
  } catch {
    // swallow
  }
};

/** HTTP middleware helper */
export const recordHttpRequest = (params: {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}) => {
  const statusClass = `${Math.floor((params.statusCode || 0) / 100)}xx`;
  const method = String(params.method || 'GET').toUpperCase();
  const route = String(params.route || 'unknown').slice(0, 120);
  const labels = { method, route, status_class: statusClass };
  inc('scrolith_http_requests_total', labels);
  observe('scrolith_http_request_duration_seconds', Math.max(0, params.durationMs) / 1000, labels);
  if (params.statusCode >= 500) {
    inc('scrolith_http_errors_total', { method, route });
  }
};

export const recordMessageMetric = (params: {
  event: 'sent' | 'failed' | 'latency';
  channel?: string;
  reason?: string;
  latencyMs?: number;
}) => {
  if (params.event === 'sent') {
    inc('scrolith_messages_sent_total', { channel: params.channel || 'direct' });
  } else if (params.event === 'failed') {
    inc('scrolith_messages_failed_total', { reason: params.reason || 'unknown' });
  } else if (params.event === 'latency' && params.latencyMs != null) {
    observe('scrolith_message_latency_seconds', params.latencyMs / 1000, {
      channel: params.channel || 'direct'
    });
  }
};

export const recordCallMetric = (params: {
  event:
    | 'attempt'
    | 'outcome'
    | 'setup'
    | 'duration'
    | 'ice'
    | 'turn'
    | 'active';
  callType?: string;
  mediaMode?: string;
  outcome?: string;
  seconds?: number;
  iceEvent?: string;
  turnEvent?: string;
  activeCount?: number;
}) => {
  const callType = String(params.callType || 'direct').toLowerCase();
  const mediaMode = String(params.mediaMode || 'audio').toLowerCase();
  if (params.event === 'attempt') {
    inc('scrolith_call_attempts_total', { call_type: callType, media_mode: mediaMode });
  } else if (params.event === 'outcome') {
    inc('scrolith_call_outcomes_total', {
      outcome: params.outcome || 'unknown',
      call_type: callType,
      media_mode: mediaMode
    });
  } else if (params.event === 'setup' && params.seconds != null) {
    observe('scrolith_call_setup_seconds', params.seconds, {
      call_type: callType,
      media_mode: mediaMode
    });
  } else if (params.event === 'duration' && params.seconds != null) {
    observe('scrolith_call_duration_seconds', params.seconds, {
      call_type: callType,
      media_mode: mediaMode
    });
  } else if (params.event === 'ice') {
    inc('scrolith_call_ice_events_total', { event: params.iceEvent || 'unknown' });
  } else if (params.event === 'turn') {
    inc('scrolith_call_turn_events_total', { event: params.turnEvent || 'unknown' });
  } else if (params.event === 'active' && params.activeCount != null) {
    setGauge('scrolith_calls_active', params.activeCount, { media_mode: mediaMode });
  }
};

export const recordAuthMetric = (params: {
  kind: 'login' | 'token' | 'oauth';
  result: 'success' | 'failure' | string;
}) => {
  if (params.kind === 'login') inc('scrolith_auth_login_total', { result: params.result });
  else if (params.kind === 'token') inc('scrolith_auth_token_total', { result: params.result });
  else inc('scrolith_auth_oauth_total', { result: params.result });
};

export const recordDbMetric = (params: {
  event: 'query' | 'error' | 'pool';
  operation?: string;
  seconds?: number;
  poolReady?: boolean;
}) => {
  if (params.event === 'query' && params.seconds != null) {
    observe('scrolith_db_query_seconds', params.seconds, {
      operation: params.operation || 'query'
    });
  } else if (params.event === 'error') {
    inc('scrolith_db_errors_total', { operation: params.operation || 'query' });
  } else if (params.event === 'pool') {
    setGauge('scrolith_db_pool_state', params.poolReady ? 1 : 0);
  }
};

export const recordRedisMetric = (params: {
  result: 'hit' | 'miss' | 'error' | 'ok';
  op?: string;
  latencyMs?: number;
}) => {
  inc('scrolith_redis_ops_total', { result: params.result });
  if (params.latencyMs != null) {
    observe('scrolith_redis_latency_seconds', params.latencyMs / 1000, {
      op: params.op || 'cmd'
    });
  }
};

export const recordAiMetric = (params: {
  provider?: string;
  result: 'success' | 'failure' | string;
  latencyMs?: number;
}) => {
  const provider = params.provider || 'default';
  inc('scrolith_ai_requests_total', { provider, result: params.result });
  if (params.latencyMs != null) {
    observe('scrolith_ai_latency_seconds', params.latencyMs / 1000, { provider });
  }
};

export const recordNotificationMetric = (params: {
  channel?: string;
  result: 'success' | 'failure' | string;
}) => {
  inc('scrolith_notifications_total', {
    channel: params.channel || 'push',
    result: params.result
  });
};

export const recordSocketReconnect = (namespace = '/community') => {
  inc('scrolith_socket_reconnects_total', { namespace });
};

/** Metrics catalog metadata for docs / admin introspection */
export const METRICS_CATALOG = [
  { name: 'scrolith_http_requests_total', domain: 'platform', type: 'counter' },
  { name: 'scrolith_http_request_duration_seconds', domain: 'platform', type: 'histogram' },
  { name: 'scrolith_http_errors_total', domain: 'platform', type: 'counter' },
  { name: 'scrolith_messages_sent_total', domain: 'messaging', type: 'counter' },
  { name: 'scrolith_messages_failed_total', domain: 'messaging', type: 'counter' },
  { name: 'scrolith_message_latency_seconds', domain: 'messaging', type: 'histogram' },
  { name: 'scrolith_socket_reconnects_total', domain: 'messaging', type: 'counter' },
  { name: 'scrolith_call_attempts_total', domain: 'voice_video', type: 'counter' },
  { name: 'scrolith_call_outcomes_total', domain: 'voice_video', type: 'counter' },
  { name: 'scrolith_call_setup_seconds', domain: 'voice_video', type: 'histogram' },
  { name: 'scrolith_call_duration_seconds', domain: 'voice_video', type: 'histogram' },
  { name: 'scrolith_call_ice_events_total', domain: 'voice_video', type: 'counter' },
  { name: 'scrolith_call_turn_events_total', domain: 'voice_video', type: 'counter' },
  { name: 'scrolith_calls_active', domain: 'voice_video', type: 'gauge' },
  { name: 'scrolith_auth_login_total', domain: 'auth', type: 'counter' },
  { name: 'scrolith_auth_token_total', domain: 'auth', type: 'counter' },
  { name: 'scrolith_db_query_seconds', domain: 'database', type: 'histogram' },
  { name: 'scrolith_db_errors_total', domain: 'database', type: 'counter' },
  { name: 'scrolith_redis_ops_total', domain: 'redis', type: 'counter' },
  { name: 'scrolith_ai_requests_total', domain: 'ai', type: 'counter' },
  { name: 'scrolith_notifications_total', domain: 'notifications', type: 'counter' },
  { name: 'scrolith_process_*', domain: 'process', type: 'default' },
  { name: 'gcoin_recompute_*', domain: 'gcoin', type: 'legacy' }
] as const;
