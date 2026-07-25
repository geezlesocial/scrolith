import {
  ensureObservabilityMetrics,
  getObservabilityRegistry,
  isMetricsEnabled,
  recordHttpRequest,
  recordCallMetric,
  recordMessageMetric,
  recordAuthMetric,
  METRICS_CATALOG
} from '../utils/observability/metricsRegistry';
import {
  redactSecrets,
  createCorrelationIds,
  stripPrivateContent
} from '../utils/observability/structuredLog';
import { runDeepHealthChecks } from '../utils/observability/healthComponents';

describe('observability phase1 metrics', () => {
  test('metrics catalog is non-empty and covers core domains', () => {
    const domains = new Set(METRICS_CATALOG.map((m) => m.domain));
    expect(domains.has('platform')).toBe(true);
    expect(domains.has('messaging')).toBe(true);
    expect(domains.has('voice_video')).toBe(true);
    expect(domains.has('auth')).toBe(true);
    expect(domains.has('database')).toBe(true);
  });

  test('ensureObservabilityMetrics registers without throwing', () => {
    const result = ensureObservabilityMetrics();
    expect(result).toBeTruthy();
    if (isMetricsEnabled()) {
      expect(getObservabilityRegistry()).toBeTruthy();
    }
  });

  test('record helpers are safe no-ops or record when enabled', () => {
    expect(() =>
      recordHttpRequest({ method: 'GET', route: '/api/health', statusCode: 200, durationMs: 12 })
    ).not.toThrow();
    expect(() =>
      recordCallMetric({ event: 'attempt', callType: 'direct', mediaMode: 'audio' })
    ).not.toThrow();
    expect(() =>
      recordCallMetric({ event: 'outcome', outcome: 'ended', callType: 'direct', mediaMode: 'audio' })
    ).not.toThrow();
    expect(() => recordMessageMetric({ event: 'sent', channel: 'direct' })).not.toThrow();
    expect(() => recordAuthMetric({ kind: 'login', result: 'success' })).not.toThrow();
  });

  test('prometheus registry exposes scrolith metrics when prom-client present', async () => {
    if (!isMetricsEnabled()) {
      expect(true).toBe(true);
      return;
    }
    recordHttpRequest({ method: 'GET', route: '/api/test', statusCode: 500, durationMs: 40 });
    recordCallMetric({ event: 'attempt', callType: 'direct', mediaMode: 'video' });
    const registry = getObservabilityRegistry();
    const body = await registry.metrics();
    expect(body).toContain('scrolith_http_requests_total');
    expect(body).toContain('scrolith_call_attempts_total');
  });
});

describe('observability structured log redaction', () => {
  test('redacts bearer tokens and password fields', () => {
    const redacted = redactSecrets({
      authorization: 'Bearer abc.def.ghi',
      password: 'super-secret',
      nested: { turn_secret: 'xyz', ok: 1 },
      note: 'token=eyJhbGciOiJIUzI1NiJ9.aaa.bbb'
    }) as any;
    expect(redacted.authorization).toBe('[REDACTED]');
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.nested.turn_secret).toBe('[REDACTED]');
    expect(redacted.nested.ok).toBe(1);
    expect(String(redacted.note)).toContain('[REDACTED]');
  });

  test('stripPrivateContent removes message bodies', () => {
    const cleaned = stripPrivateContent({
      userId: 'u1',
      messageText: 'private',
      text: 'private',
      callId: 'c1'
    });
    expect((cleaned as any).messageText).toBeUndefined();
    expect((cleaned as any).text).toBeUndefined();
    expect(cleaned.callId).toBe('c1');
  });

  test('createCorrelationIds falls back consistently', () => {
    const ids = createCorrelationIds({});
    expect(ids.requestId).toBeTruthy();
    expect(ids.correlationId).toBe(ids.requestId);
    expect(ids.traceId).toBe(ids.correlationId);
  });
});

describe('observability deep health', () => {
  test('runDeepHealthChecks returns component list', async () => {
    const report = await runDeepHealthChecks({ socketConnected: 0 });
    expect(['OK', 'DEGRADED', 'ERROR']).toContain(report.status);
    expect(Array.isArray(report.components)).toBe(true);
    const names = report.components.map((c) => c.name);
    expect(names).toContain('database');
    expect(names).toContain('api');
    expect(names).toContain('socket_io');
    expect(names).toContain('redis');
    expect(names).toContain('turn');
  }, 15000);
});
