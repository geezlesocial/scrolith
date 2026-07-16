/**
 * Shared HTTP/request helpers for Scrolitha controllers.
 * Preserves existing JSON response envelopes.
 */
import type { Response } from 'express';
import {
  classifyScrolithaError,
  logScrolithaWarn,
  mapLegacyScrolithaHttpStatus,
  type LegacyScrolithaStatusMode
} from './scrolitha.errors';
import { sanitizeScrolithaUserMessage } from './scrolitha.ollama';
import { recordOpsCounter } from './scrolitha.opsMetrics';

export const asText = (value: unknown, fallback = '') => String(value ?? fallback).trim();

export const parseLineList = (source: string, fallback: string[] = [], max = 12) => {
  const cleaned = String(source || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*\d.]+\s*/, '').trim())
    .filter(Boolean);
  if (cleaned.length) return cleaned.slice(0, max);
  return fallback;
};

export const buildScrolithaMeta = (result: any) => ({
  provider: 'scrolitha',
  model: 'Scrolitha',
  usedFallback: Boolean(result?.usedFallback ?? result?.fallbackUsed ?? result?.usedBackupProcessing),
  warning: result?.warning || null,
  warningCode: result?.warningCode || null
});

/**
 * Canonical multi-field rewrite payload used by public task endpoints.
 * Field names preserved for frontend compatibility.
 */
export const buildRewriteDataPayload = (text: string, extra?: Record<string, unknown>) => {
  const value = String(text || '').trim();
  return {
    rewrittenText: value,
    enhancedText: value,
    rewrite: value,
    text: value,
    ...(extra || {})
  };
};

type SendErrorOptions = {
  status?: number;
  logLabel?: string;
  recordFailure?: boolean;
  /** Task-style envelope includes data:null (default true). Public chat omits data. */
  includeDataNull?: boolean;
};

const recordFailureMetrics = (kind: string) => {
  try {
    recordOpsCounter('failures', 1);
    if (kind === 'timeout') recordOpsCounter('timeouts', 1);
  } catch {
    // metrics must never break responses
  }
};

/**
 * Task/admin-style error envelope: { success:false, data:null, message, error }
 * Status defaults to 500 to preserve historical controller behavior unless override is set.
 */
export const sendScrolithaError = (
  res: Response,
  message: string,
  error: unknown,
  options?: SendErrorOptions
) => {
  const classified = classifyScrolithaError(error, message);
  if (options?.logLabel) {
    logScrolithaWarn(options.logLabel, error, { message });
  }
  if (options?.recordFailure !== false) {
    recordFailureMetrics(classified.kind);
  }

  const status = options?.status ?? 500;
  const body: Record<string, unknown> = {
    success: false,
    message,
    error: sanitizeScrolithaUserMessage(classified.message, message)
  };
  if (options?.includeDataNull !== false) {
    body.data = null;
  }
  return res.status(status).json(body);
};

/**
 * Public Scrolitha controller error: { success:false, message, error } (no data field).
 * Uses legacy status mapping so HTTP codes stay contract-compatible.
 */
export const sendScrolithaPublicError = (
  res: Response,
  message: string,
  error: unknown,
  options?: {
    statusMode?: LegacyScrolithaStatusMode;
    status?: number;
    logLabel?: string;
    recordFailure?: boolean;
  }
) => {
  const status =
    options?.status ?? mapLegacyScrolithaHttpStatus(error, options?.statusMode || 'default');
  return sendScrolithaError(res, message, error, {
    status,
    logLabel: options?.logLabel || message,
    recordFailure: options?.recordFailure,
    includeDataNull: false
  });
};
