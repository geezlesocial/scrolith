/** Rejects oversized attacker-controlled text before any pattern matching. */
export const isBoundedText = (value: unknown, maxLength: number): value is string =>
  typeof value === 'string' && value.length <= maxLength;

export const isLikelyEmail = (value: unknown): boolean => {
  if (!isBoundedText(value, 254)) return false;
  const input = value.trim();
  const at = input.indexOf('@');
  const dot = input.lastIndexOf('.');
  return at > 0 && at === input.lastIndexOf('@') && at < input.length - 1 && dot > at + 1 && dot < input.length - 1 && !/\s/.test(input);
};
