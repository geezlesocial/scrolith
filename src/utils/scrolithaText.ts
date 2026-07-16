/**
 * Shared Scrolitha response text extraction.
 * Normalizes heterogeneous rewrite/improve payload shapes without API changes.
 */

export const extractScrolithaRewrittenText = (payload: unknown): string => {
  if (payload == null) return '';
  if (typeof payload === 'string') return String(payload).trim();
  const source = payload as Record<string, unknown>;
  return String(
    source.rewrittenText ||
      source.enhancedText ||
      source.rewrite ||
      source.improved ||
      source.text ||
      source.reply ||
      ''
  ).trim();
};

export const extractScrolithaWarning = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') return '';
  return String((payload as Record<string, unknown>).warning || '').trim();
};
