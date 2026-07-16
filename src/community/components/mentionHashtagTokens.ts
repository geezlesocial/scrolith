/**
 * Pure mention/hashtag token helpers for composer autocomplete.
 * Kept free of React and API imports so unit tests and the editor share one implementation.
 */

export type ActiveToken = {
  kind: 'mention' | 'tag';
  query: string;
  replaceStart: number;
  replaceEnd: number;
};

const MAX_QUERY_LEN = 30;

/** Detect an in-progress @mention or #tag token at the caret. */
export const findActiveToken = (
  value: string,
  caret: number,
  opts: { mentionsEnabled: boolean; hashtagsEnabled: boolean }
): ActiveToken | null => {
  const before = value.slice(0, caret);

  // Mentions: @username (letters/numbers/underscore/dot). Keep conservative to avoid triggering in emails/URLs.
  const mentionMatch = before.match(/(^|[\s([{>])@([a-zA-Z0-9_.]{0,30})$/);
  if (mentionMatch && opts.mentionsEnabled) {
    const query = String(mentionMatch[2] || '').slice(0, MAX_QUERY_LEN);
    const replaceStart = Math.max(0, caret - query.length - 1);
    return { kind: 'mention', query, replaceStart, replaceEnd: caret };
  }

  // Tags: #tag (letters/numbers/underscore) aligned with backend normalize/extract rules.
  const tagMatch = before.match(/(^|[\s([{>])#([a-zA-Z0-9_]{0,40})$/);
  if (tagMatch && opts.hashtagsEnabled) {
    const query = String(tagMatch[2] || '').slice(0, 40);
    const replaceStart = Math.max(0, caret - query.length - 1);
    return { kind: 'tag', query, replaceStart, replaceEnd: caret };
  }

  return null;
};

/**
 * Apply a mention/tag suggestion into the editor value.
 * Returns the next controlled value and the caret position after the inserted token.
 */
export const applyMentionOrTagSuggestion = (params: {
  value: string;
  replaceStart: number;
  replaceEnd: number;
  kind: 'mention' | 'tag';
  tokenBody: string;
}): { nextValue: string; caret: number } => {
  const prefix = params.kind === 'mention' ? '@' : '#';
  const replacement = `${prefix}${params.tokenBody} `;
  const nextValue =
    params.value.slice(0, params.replaceStart) + replacement + params.value.slice(params.replaceEnd);
  return {
    nextValue,
    caret: params.replaceStart + replacement.length
  };
};
