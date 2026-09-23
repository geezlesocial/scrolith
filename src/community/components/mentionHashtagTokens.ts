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

/** Phase 20.2.4 special tokens shown in autocomplete (server validates fan-out). */
export const MENTION_SPECIAL_SUGGESTIONS = [
  { username: 'everyone', name: 'Everyone (your followers)', mentionKind: 'EVERYONE' },
  { username: 'moderators', name: 'Community moderators', mentionKind: 'MODERATORS' },
  { username: 'admins', name: 'Community admins', mentionKind: 'ADMINS' },
  { username: 'Scrolitha', name: 'Scrolitha AI', mentionKind: 'SCROLITHA' }
] as const;

const RECENT_MENTIONS_KEY = 'scrolith.mentions.recent.v1'; // gitleaks:allow — stable browser storage key, not credential material

export const loadRecentMentions = (): string[] => {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = JSON.parse(localStorage.getItem(RECENT_MENTIONS_KEY) || '[]');
    return Array.isArray(raw) ? raw.map((v) => String(v || '')).filter(Boolean).slice(0, 12) : [];
  } catch {
    return [];
  }
};

export const rememberRecentMention = (username: string) => {
  const value = String(username || '').replace(/^@+/, '').trim();
  if (!value || typeof localStorage === 'undefined') return;
  try {
    const prev = loadRecentMentions().filter((u) => u.toLowerCase() !== value.toLowerCase());
    localStorage.setItem(RECENT_MENTIONS_KEY, JSON.stringify([value, ...prev].slice(0, 12)));
  } catch {
    /* ignore */
  }
};

/** Detect an in-progress @mention or #tag token at the caret. */
export const findActiveToken = (
  value: string,
  caret: number,
  opts: { mentionsEnabled: boolean; hashtagsEnabled: boolean }
): ActiveToken | null => {
  const before = value.slice(0, caret);

  // Mentions: @token (letters/numbers/underscore/dot). 0–30 chars so bare @ opens picker.
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
