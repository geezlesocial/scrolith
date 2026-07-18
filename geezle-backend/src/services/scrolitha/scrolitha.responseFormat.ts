/**
 * Phase 20.7.4 — Canonical Scrolitha response format: plain user-facing prose.
 * Ordinary conversational replies must never expose raw Markdown markers.
 * Contract: Option A (plain text). Structured Markdown only if user explicitly asks.
 */

const CODE_FENCE = /```[\s\S]*?```/g;
const INLINE_CODE = /`([^`\n]+)`/g;

/**
 * Convert ordinary Markdown emphasis/headings/bullets to clean plain text.
 * Preserves code fences/content; does not treat bare * as multiplication.
 */
export const markdownToPlainProse = (input: string): string => {
  let text = String(input || '').replace(/\r\n/g, '\n');
  if (!text.trim()) return '';

  // Protect fenced code blocks
  const fences: string[] = [];
  text = text.replace(CODE_FENCE, (block) => {
    const i = fences.length;
    fences.push(block);
    return `\u0000FENCE${i}\u0000`;
  });

  // Protect inline code
  const inlines: string[] = [];
  text = text.replace(INLINE_CODE, (_m, code: string) => {
    const i = inlines.length;
    inlines.push(String(code));
    return `\u0000CODE${i}\u0000`;
  });

  // Headings → plain text line
  text = text.replace(/^#{1,6}\s+/gm, '');

  // Bold / underline emphasis (paired markers only)
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '$1');
  text = text.replace(/__([^_\n]+)__/g, '$1');

  // Italic: single * or _ around a word/phrase (not bare *)
  text = text.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1$2');
  text = text.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, '$1$2');

  // Strikethrough
  text = text.replace(/~~([^~\n]+)~~/g, '$1');

  // Links [label](url) → label (url) or just label for relative
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, url: string) => {
    const lab = String(label || '').trim();
    const u = String(url || '').trim();
    if (!lab) return u;
    if (/^https?:\/\//i.test(u)) return `${lab} (${u})`;
    return lab;
  });

  // Images ![alt](url) → alt
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

  // Unordered list markers at line start
  text = text.replace(/^(\s*)[-*+]\s+/gm, '$1• ');

  // Ordered lists keep numbers
  text = text.replace(/^(\s*)\d+\.\s+/gm, (m) => m);

  // Strip leftover unmatched emphasis markers that look like Markdown residue
  // only when they appear as **word** remnants or lone ** pairs around short tokens
  text = text.replace(/\*\*/g, '');
  // Single underscore emphasis leftovers around words (not snake_case mid-word)
  text = text.replace(/(^|[\s])_([^_\s][^_\n]*)_([\s.,!?:;]|$)/g, '$1$2$3');

  // Collapse horizontal rules
  text = text.replace(/^\s*([-*_]\s*){3,}\s*$/gm, '');

  // Blockquote markers
  text = text.replace(/^>\s?/gm, '');

  // Restore inline code as plain content (no backticks in ordinary mode)
  text = text.replace(/\u0000CODE(\d+)\u0000/g, (_m, idx) => inlines[Number(idx)] || '');

  // Restore fences as plain preformatted blocks without ``` fences
  text = text.replace(/\u0000FENCE(\d+)\u0000/g, (_m, idx) => {
    const block = fences[Number(idx)] || '';
    return block
      .replace(/^```[a-zA-Z0-9]*\n?/, '')
      .replace(/\n?```$/, '')
      .trim();
  });

  // Whitespace: max one blank line between paragraphs
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Strip raw HTML tags if any slipped in
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, '');

  return text;
};

/** True when user explicitly asks for Markdown/code formatting. */
export const userRequestedMarkdown = (userMessage: string): boolean => {
  const m = String(userMessage || '').toLowerCase();
  return (
    m.includes('in markdown') ||
    m.includes('as markdown') ||
    m.includes('use markdown') ||
    m.includes('markdown format') ||
    m.includes('code block') ||
    m.includes('fenced code') ||
    /\bformat as code\b/.test(m)
  );
};

/**
 * Final presentation pass for ordinary Scrolitha replies (plain-text contract).
 */
export const toCanonicalUserFacingProse = (
  text: string,
  options?: { preserveMarkdown?: boolean }
): string => {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (options?.preserveMarkdown) {
    return raw
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return markdownToPlainProse(raw);
};
