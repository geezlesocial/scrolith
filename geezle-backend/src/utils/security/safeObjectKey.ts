const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Writes data derived from a request into a plain record without permitting
 * prototype-pollution keys. Callers should still apply a domain allowlist when
 * the key represents a field, provider, feature, or other finite vocabulary.
 */
export const isSafeObjectKey = (value: unknown, maxLength = 128): value is string => {
  if (typeof value !== 'string') return false;
  const key = value.trim();
  return key.length > 0 && key.length <= maxLength && !FORBIDDEN_KEYS.has(key);
};

export const setSafeObjectValue = <T>(target: Record<string, T>, key: unknown, value: T): boolean => {
  if (!isSafeObjectKey(key)) return false;
  const normalizedKey = key.trim();
  Object.defineProperty(target, normalizedKey, { value, enumerable: true, configurable: true, writable: true });
  return true;
};

export const getAllowedObjectValue = <T>(
  target: Record<string, T> | null | undefined,
  key: unknown,
  allowedKeys: ReadonlySet<string>
): T | undefined => {
  if (!isSafeObjectKey(key) || !allowedKeys.has(key)) return undefined;
  return target?.[key];
};
