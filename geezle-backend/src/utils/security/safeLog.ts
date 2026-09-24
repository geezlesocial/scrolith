const SENSITIVE_KEY = /(password|secret|token|authorization|cookie|credential|privatekey|apikey|email|body|content|query|params)/i;

/** Convert untrusted values into bounded, single-line diagnostic metadata. */
export const safeLogValue = (value: unknown, depth = 0): unknown => {
  if (depth > 2) return '[nested]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.replace(/[\r\n\t]/g, ' ').slice(0, 160);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => safeLogValue(entry, depth + 1));
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      output[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : safeLogValue(entry, depth + 1);
    }
    return output;
  }
  return typeof value;
};

/** Serialize diagnostic metadata as one bounded line for text log sinks. */
export const safeLogLine = (value: unknown): string => {
  const sanitized = safeLogValue(value);
  if (typeof sanitized === 'string') return sanitized;
  try {
    return JSON.stringify(sanitized).replace(/[\r\n\t]/g, ' ').slice(0, 800);
  } catch {
    return '[unserializable]';
  }
};
