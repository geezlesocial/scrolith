/**
 * Phase 22.2 — @mention helpers for composer and bubble rendering.
 */

export const extractMentionUsernames = (text: string): string[] => {
  const matches = String(text || '').match(/@([a-zA-Z0-9._-]{2,40})/g) || [];
  return Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase())));
};

/** Highlight @mentions in plain text for React (returns segments). */
export const splitTextWithMentions = (
  text: string
): Array<{ type: 'text' | 'mention'; value: string }> => {
  const raw = String(text || '');
  const re = /@([a-zA-Z0-9._-]{2,40})/g;
  const parts: Array<{ type: 'text' | 'mention'; value: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    if (m.index > last) parts.push({ type: 'text', value: raw.slice(last, m.index) });
    parts.push({ type: 'mention', value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < raw.length) parts.push({ type: 'text', value: raw.slice(last) });
  return parts.length ? parts : [{ type: 'text', value: raw }];
};

export const MENTION_TOKEN_HINT = 'Type @username to mention a member';
