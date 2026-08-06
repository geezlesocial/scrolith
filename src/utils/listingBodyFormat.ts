/**
 * Enterprise listing body formatting for Jobs and Gigs.
 * Preserves author line breaks / paragraphs while remaining safe for plain text and light HTML.
 */

const HTML_TAG_RE = /<\/?[a-z][\s\S]*>/i;
const BLOCK_CLOSE_RE = /<\/(p|div|h[1-6]|li|tr|section|article|blockquote)>/gi;
const BR_RE = /<br\s*\/?>/gi;
const LIST_ITEM_OPEN_RE = /<li[^>]*>/gi;

/** True when content looks like intentional HTML markup (not just angle brackets in prose). */
export const listingBodyLooksLikeHtml = (value: unknown): boolean => {
  const raw = String(value ?? '');
  if (!raw.trim()) return false;
  return HTML_TAG_RE.test(raw);
};

/** Strip tags and normalize whitespace for card previews / line-clamps. */
export const listingBodyToPlainPreview = (value: unknown, maxLen = 220): string => {
  let text = String(value ?? '');
  if (!text.trim()) return '';

  text = text
    .replace(BR_RE, '\n')
    .replace(BLOCK_CLOSE_RE, '\n')
    .replace(LIST_ITEM_OPEN_RE, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  if (maxLen > 0 && text.length > maxLen) {
    return `${text.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
  }
  return text;
};

/**
 * Light sanitization for trusted listing HTML (gig rich text / job pasted HTML).
 * Removes scripts/handlers while keeping structural tags used for professional layout.
 */
export const sanitizeListingHtml = (value: unknown): string => {
  let html = String(value ?? '');
  if (!html.trim()) return '';

  html = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '');

  return html.trim();
};

/** Normalize plain-text line endings for professional multi-paragraph display. */
export const normalizeListingPlainText = (value: unknown): string => {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
