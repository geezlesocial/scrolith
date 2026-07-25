/**
 * HTTP observability middleware: correlation headers + request metrics.
 * Additive only — does not alter business responses.
 */

import type { Request, Response, NextFunction } from 'express';
import { recordHttpRequest } from '../utils/observability/metricsRegistry';
import { createCorrelationIds } from '../utils/observability/structuredLog';

const routeLabel = (req: Request): string => {
  try {
    const base = String((req as any).baseUrl || '');
    const path = String((req as any).route?.path || req.path || 'unknown');
    const combined = `${base}${path}`.replace(/\/+/g, '/') || 'unknown';
    // Avoid high-cardinality IDs in metric labels
    return combined
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
        ':id'
      )
      .replace(/\/[a-z0-9_-]{20,}/gi, '/:id')
      .slice(0, 120);
  } catch {
    return 'unknown';
  }
};

/**
 * Ensure request/correlation/trace ids exist and are reflected on the response.
 * Safe to use even if an earlier middleware already set requestId.
 */
export const correlationMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const existingRequestId = String((req as any).requestId || '').trim();
  const ids = createCorrelationIds({
    requestId: existingRequestId || String(req.headers['x-request-id'] || '').trim(),
    correlationId: String(req.headers['x-correlation-id'] || '').trim(),
    traceId: String(req.headers['x-cloud-trace-context'] || req.headers['traceparent'] || '')
      .split('/')[0]
      .trim()
  });
  (req as any).requestId = ids.requestId;
  (req as any).correlationId = ids.correlationId;
  (req as any).traceId = ids.traceId;
  res.setHeader('x-request-id', ids.requestId);
  res.setHeader('x-correlation-id', ids.correlationId);
  next();
};

/** Record Prometheus HTTP metrics after response finishes. */
export const httpMetricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    try {
      const ended = process.hrtime.bigint();
      const durationMs = Number(ended - started) / 1e6;
      recordHttpRequest({
        method: req.method,
        route: routeLabel(req),
        statusCode: res.statusCode || 0,
        durationMs
      });
    } catch {
      // never break response path
    }
  });
  next();
};
