export const redactPayload = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    const sensitive = /secret|token|password|private|credential|api.?key|authorization/i.test(key);
    return [key, sensitive ? '[REDACTED]' : typeof item === 'object' ? redactPayload(item) : item];
  }));
};
