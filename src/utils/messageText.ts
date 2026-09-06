export const MAX_MESSAGE_WORDS = 500;

export const countMessageWords = (value: unknown): number => {
  const text = String(value ?? '').trim();
  return text ? text.split(/\s+/u).filter(Boolean).length : 0;
};

export const truncateMessageWords = (value: unknown, maxWords = MAX_MESSAGE_WORDS): string => {
  const text = String(value ?? '');
  const words = text.trim().split(/\s+/u).filter(Boolean);
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(' ')}…`;
};
