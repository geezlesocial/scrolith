export const CARD_TEXT_PREVIEW_LIMIT = 94;

export const buildTextPreview = (text?: string | null, limit = CARD_TEXT_PREVIEW_LIMIT) => {
  const source = String(text ?? '');
  const characters = Array.from(source);
  if (characters.length <= limit) {
    return {
      text: source,
      isTruncated: false
    };
  }

  return {
    text: `${characters.slice(0, limit).join('').trimEnd()}...`,
    isTruncated: true
  };
};
