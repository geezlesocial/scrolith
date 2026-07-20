/**
 * Phase 23 — client-side Scroll moderation helpers (rate limit + validation).
 * Server remains authoritative.
 */

export type ScrollReportValidation =
  | { ok: true; reason: string }
  | { ok: false; error: string };

const REPORT_WINDOW_MS = 10 * 60 * 1000;
const REPORT_MAX_PER_WINDOW = 8;
const reportTimestamps: number[] = [];

export const validateScrollReportReason = (raw: unknown): ScrollReportValidation => {
  const reason = String(raw || '').trim();
  if (!reason) return { ok: false, error: 'A report reason is required.' };
  if (reason.length < 3) return { ok: false, error: 'Report reason is too short.' };
  if (reason.length > 500) return { ok: false, error: 'Report reason is too long.' };
  // Soft spam: all-caps walls / repeated chars
  if (/(.)\1{12,}/.test(reason)) return { ok: false, error: 'Report reason looks invalid.' };
  return { ok: true, reason };
};

export const canSubmitScrollReportNow = (now = Date.now()): { allowed: boolean; retryAfterMs?: number } => {
  while (reportTimestamps.length && now - reportTimestamps[0] > REPORT_WINDOW_MS) {
    reportTimestamps.shift();
  }
  if (reportTimestamps.length >= REPORT_MAX_PER_WINDOW) {
    const retryAfterMs = Math.max(0, REPORT_WINDOW_MS - (now - reportTimestamps[0]));
    return { allowed: false, retryAfterMs };
  }
  return { allowed: true };
};

export const markScrollReportSubmitted = (now = Date.now()) => {
  reportTimestamps.push(now);
  while (reportTimestamps.length > REPORT_MAX_PER_WINDOW) reportTimestamps.shift();
};

/** Lightweight abuse signal bag for safety logging (no message content). */
export const buildScrollAbuseSignal = (input: {
  scrollId: string;
  action: 'report' | 'hide' | 'not_interested' | 'spam_suspect';
  reasonCode?: string;
}) => ({
  surface: 'scroll',
  action: input.action,
  scrollId: String(input.scrollId || '').trim(),
  reasonCode: input.reasonCode || null,
  at: new Date().toISOString()
});
