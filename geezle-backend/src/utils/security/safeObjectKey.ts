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

export const setSafeObjectValue = <T>(target: Record<string, T>, key: unknown, value: T, allowedKeys?: ReadonlySet<string>): boolean => {
  if (!isSafeObjectKey(key)) return false;
  const normalizedKey = key.trim();
  if (allowedKeys && !allowedKeys.has(normalizedKey)) return false;
  const safeEntry = Object.fromEntries([[normalizedKey, value]]) as Record<string, T>;
  Object.assign(target, safeEntry);
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
