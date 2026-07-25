/**
 * Structured JSON logging with correlation fields and secret redaction.
 * Does not replace console in all codepaths; use for new operational logs.
 */

import { randomUUID } from 'crypto';

export type LogSeverity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

export type LogContext = {
  requestId?: string | null;
  correlationId?: string | null;
  traceId?: string | null;
  spanId?: string | null;
  userId?: string | null;
  conversationId?: string | null;
  callId?: string | null;
  component?: string | null;
  action?: string | null;
  [key: string]: unknown;
};

const SECRET_KEY =
  /(password|passwd|secret|token|authorization|cookie|credential|jwt|private[_-]?key|turn[_-]?secret|api[_-]?key)/i;

const REDACT_VALUE =
  /(Bearer\s+[A-Za-z0-9\-._~+/]+=*|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g;

export const redactSecrets = (input: unknown, depth = 0): unknown => {
  if (depth > 6) return '[MaxDepth]';
  if (input == null) return input;
  if (typeof input === 'string') {
    return input.replace(REDACT_VALUE, '[REDACTED]').slice(0, 4000);
  }
  if (typeof input === 'number' || typeof input === 'boolean') return input;
  if (input instanceof Error) {
    return {
      name: input.name,
      message: String(input.message || '').replace(REDACT_VALUE, '[REDACTED]'),
      stack: process.env.NODE_ENV === 'production' ? undefined : input.stack
    };
  }
  if (Array.isArray(input)) {
    return input.slice(0, 50).map((entry) => redactSecrets(entry, depth + 1));
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactSecrets(value, depth + 1);
      }
    }
    return out;
  }
  return String(input);
};

/** Never log message bodies / private chat content. */
export const stripPrivateContent = (ctx: LogContext): LogContext => {
  const clone = { ...ctx };
  delete (clone as any).messageText;
  delete (clone as any).messageBody;
  delete (clone as any).text;
  delete (clone as any).body;
  delete (clone as any).content;
  delete (clone as any).password;
  delete (clone as any).token;
  delete (clone as any).authorization;
  return clone;
};

export const createCorrelationIds = (incoming?: {
  requestId?: string | null;
  correlationId?: string | null;
  traceId?: string | null;
}) => {
  const requestId = String(incoming?.requestId || '').trim() || randomUUID();
  const correlationId =
    String(incoming?.correlationId || '').trim() || requestId;
  const traceId = String(incoming?.traceId || '').trim() || correlationId;
  return { requestId, correlationId, traceId };
};

export const structuredLog = (
  severity: LogSeverity,
  message: string,
  context: LogContext = {}
) => {
  const safeCtx = redactSecrets(stripPrivateContent(context)) as LogContext;
  const payload = {
    severity,
    time: new Date().toISOString(),
    message: String(message || '').replace(REDACT_VALUE, '[REDACTED]').slice(0, 2000),
    service: process.env.K_SERVICE || process.env.SERVICE_NAME || 'scrolith-backend',
    revision: process.env.K_REVISION || process.env.GIT_SHA || undefined,
    ...safeCtx
  };
  const line = JSON.stringify(payload);
  if (severity === 'ERROR') console.error(line);
  else if (severity === 'WARNING') console.warn(line);
  else if (severity === 'DEBUG') {
    if (String(process.env.LOG_LEVEL || '').toLowerCase() === 'debug') console.debug(line);
  } else console.log(line);
};

export const logInfo = (message: string, context?: LogContext) =>
  structuredLog('INFO', message, context || {});
export const logWarn = (message: string, context?: LogContext) =>
  structuredLog('WARNING', message, context || {});
export const logError = (message: string, context?: LogContext) =>
  structuredLog('ERROR', message, context || {});
export const logDebug = (message: string, context?: LogContext) =>
  structuredLog('DEBUG', message, context || {});
