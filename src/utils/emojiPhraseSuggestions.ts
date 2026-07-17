/**
 * Phase 20.2.3 — local phrase-to-emoji suggestion engine.
 * Never auto-inserts; consumers must require explicit user selection.
 * No external network. No private draft transmission.
 */

export type EmojiSuggestion = {
  emoji: string;
  label: string;
  score: number;
};

export type EmojiPhraseGroup = {
  id: string;
  phrases: string[];
  emojis: Array<{ emoji: string; label: string }>;
};

/** Curated Scrolith phrase groups (v1). Extend carefully; keep respectful. */
export const EMOJI_PHRASE_GROUPS: EmojiPhraseGroup[] = [
  {
    id: 'celebrate',
    phrases: ['congrats', 'congratulations', 'well done', 'proud of you', 'kudos', 'bravo'],
    emojis: [
      { emoji: '🎉', label: 'Party' },
      { emoji: '🥳', label: 'Celebrate' },
      { emoji: '👏', label: 'Clap' },
      { emoji: '🙌', label: 'Raise hands' },
      { emoji: '🎊', label: 'Confetti' }
    ]
  },
  {
    id: 'funny',
    phrases: ['haha', 'hahaha', 'lol', 'lmao', 'funny', 'hilarious', 'rofl'],
    emojis: [
      { emoji: '😂', label: 'Joy' },
      { emoji: '🤣', label: 'Rolling laugh' },
      { emoji: '😆', label: 'Grin' },
      { emoji: '😹', label: 'Cat laugh' }
    ]
  },
  {
    id: 'love',
    phrases: ['love', 'amazing', 'beautiful', 'wonderful', 'adore', 'heart'],
    emojis: [
      { emoji: '❤️', label: 'Heart' },
      { emoji: '😍', label: 'Heart eyes' },
      { emoji: '🥰', label: 'Smiling hearts' },
      { emoji: '💖', label: 'Sparkling heart' }
    ]
  },
  {
    id: 'fire',
    phrases: ['fire', 'awesome', 'great', 'lit', 'epic', 'excellent'],
    emojis: [
      { emoji: '🔥', label: 'Fire' },
      { emoji: '🚀', label: 'Rocket' },
      { emoji: '⭐', label: 'Star' },
      { emoji: '💯', label: 'Hundred' }
    ]
  },
  {
    id: 'support',
    phrases: ['sad', 'sorry', 'condolences', 'sympathy', 'miss you', 'thinking of you'],
    emojis: [
      { emoji: '💙', label: 'Blue heart' },
      { emoji: '🙏', label: 'Prayer' },
      { emoji: '🤍', label: 'White heart' },
      { emoji: '🕊️', label: 'Dove' }
    ]
  },
  {
    id: 'thanks',
    phrases: ['thanks', 'thank you', 'thx', 'grateful', 'appreciate'],
    emojis: [
      { emoji: '🙏', label: 'Thanks' },
      { emoji: '😊', label: 'Smile' },
      { emoji: '✨', label: 'Sparkles' }
    ]
  },
  {
    id: 'agree',
    phrases: ['agree', 'exactly', 'true', 'facts', 'this'],
    emojis: [
      { emoji: '👍', label: 'Thumbs up' },
      { emoji: '✅', label: 'Check' },
      { emoji: '💯', label: 'Hundred' }
    ]
  }
];

const normalizeToken = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Collapse elongated laughter / emphasis: hahahaha → haha, sooo → so */
export const collapseRepeatedLetters = (token: string) => {
  const raw = String(token || '').toLowerCase();
  if (!raw) return '';
  // Keep short tokens; collapse runs of 3+ identical letters to 2.
  const collapsed = raw.replace(/(.)\1{2,}/g, '$1$1');
  // Special-case laughter clusters → haha
  if (/^(ha)+h?$/.test(collapsed) || collapsed === 'lol' || collapsed === 'loll' || collapsed === 'lmao') {
    if (/^(ha)+h?$/.test(collapsed)) return 'haha';
    if (collapsed.startsWith('lol')) return 'lol';
    return collapsed;
  }
  return collapsed;
};

/**
 * Find the active word (or short phrase tail) before the caret for suggestion matching.
 */
export const findEmojiSuggestionQuery = (text: string, caret: number): { query: string; start: number; end: number } | null => {
  const value = String(text || '');
  const pos = Math.max(0, Math.min(typeof caret === 'number' ? caret : value.length, value.length));
  const before = value.slice(0, pos);
  // Colon search: :fire
  const colon = before.match(/(?:^|\s):([a-z][a-z0-9_]{0,24})$/i);
  if (colon && typeof colon.index === 'number') {
    const start = colon.index + (colon[0].startsWith(' ') || colon[0].startsWith('\n') ? 1 : 0);
    return { query: `:${colon[1].toLowerCase()}`, start, end: pos };
  }
  // Word / short phrase (last 1–3 tokens)
  const match = before.match(/(?:^|[\s([{])([\p{L}\p{N}']+(?:[\s-][\p{L}\p{N}']+){0,2})$/u);
  if (!match || typeof match.index !== 'number') return null;
  const leading = match[0].match(/^[\s([{]/)?.[0] || '';
  const start = match.index + leading.length;
  const rawQuery = match[1] || '';
  if (!rawQuery.trim()) return null;
  return { query: rawQuery, start, end: pos };
};

const scorePhraseMatch = (query: string, phrase: string): number => {
  const q = collapseRepeatedLetters(normalizeToken(query));
  const p = normalizeToken(phrase);
  if (!q || !p) return 0;
  if (q === p) return 100;
  if (p.startsWith(q) && q.length >= 2) return 80 + Math.min(15, q.length);
  if (q.startsWith(p) && p.length >= 3) return 70;
  // multi-word: last token
  const qLast = q.split(' ').pop() || q;
  const pLast = p.split(' ').pop() || p;
  if (qLast === pLast) return 90;
  if (pLast.startsWith(qLast) && qLast.length >= 2) return 75;
  return 0;
};

const scoreColonMatch = (query: string, label: string, emoji: string): number => {
  if (!query.startsWith(':')) return 0;
  const key = query.slice(1).toLowerCase();
  if (!key) return 0;
  const labelNorm = normalizeToken(label).replace(/\s+/g, '');
  if (labelNorm === key) return 100;
  if (labelNorm.startsWith(key)) return 85;
  if (emoji === key) return 100;
  return 0;
};

/**
 * Suggest emojis for the current query. Returns at most `limit` unique emojis, sorted by score.
 * Never mutates text; never auto-inserts.
 */
export const suggestEmojisForText = (
  text: string,
  caret: number,
  options?: { limit?: number; minScore?: number }
): { suggestions: EmojiSuggestion[]; range: { start: number; end: number } | null } => {
  const limit = Math.max(1, Math.min(12, options?.limit ?? 6));
  const minScore = options?.minScore ?? 70;
  const range = findEmojiSuggestionQuery(text, caret);
  if (!range || range.query.length < 2) {
    return { suggestions: [], range: null };
  }

  const scored = new Map<string, EmojiSuggestion>();

  for (const group of EMOJI_PHRASE_GROUPS) {
    let bestPhraseScore = 0;
    for (const phrase of group.phrases) {
      bestPhraseScore = Math.max(bestPhraseScore, scorePhraseMatch(range.query, phrase));
    }
    for (const entry of group.emojis) {
      const colonScore = scoreColonMatch(range.query, entry.label, entry.emoji);
      const score = Math.max(bestPhraseScore, colonScore);
      if (score < minScore) continue;
      const existing = scored.get(entry.emoji);
      if (!existing || existing.score < score) {
        scored.set(entry.emoji, { emoji: entry.emoji, label: entry.label, score });
      }
    }
  }

  const suggestions = Array.from(scored.values())
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit);

  return { suggestions, range: suggestions.length ? range : null };
};

/**
 * Insert emoji at caret, preserving surrounding text. Adds spaces when needed.
 * Does not delete the typed phrase unless `replaceRange` is provided (for :colon: style).
 */
export const insertEmojiAtCaret = (
  text: string,
  caret: number,
  emoji: string,
  replaceRange?: { start: number; end: number } | null
): { value: string; caret: number } => {
  const value = String(text || '');
  const pos = Math.max(0, Math.min(typeof caret === 'number' ? caret : value.length, value.length));
  const safeEmoji = String(emoji || '').trim();
  if (!safeEmoji) return { value, caret: pos };

  if (replaceRange && replaceRange.end >= replaceRange.start) {
    const start = Math.max(0, replaceRange.start);
    const end = Math.min(value.length, replaceRange.end);
    const before = value.slice(0, start);
    const after = value.slice(end);
    const needsLead = before.length > 0 && !/\s$/.test(before);
    const needsTrail = after.length > 0 && !/^\s/.test(after);
    const insert = `${needsLead ? ' ' : ''}${safeEmoji}${needsTrail ? ' ' : ''}`;
    const next = `${before}${insert}${after}`;
    return { value: next, caret: before.length + insert.length };
  }

  const before = value.slice(0, pos);
  const after = value.slice(pos);
  const needsLead = before.length > 0 && !/\s$/.test(before);
  const needsTrail = after.length > 0 && !/^\s/.test(after);
  const insert = `${needsLead ? ' ' : ''}${safeEmoji}${needsTrail ? ' ' : ''}`;
  return { value: `${before}${insert}${after}`, caret: before.length + insert.length };
};

const RECENT_KEY = 'scrolith.emoji.recent.v1';
const FREQ_KEY = 'scrolith.emoji.frequent.v1';

export const readRecentEmojis = (limit = 8): string[] => {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.map((x) => String(x || '')).filter(Boolean).slice(0, limit);
  } catch {
    return [];
  }
};

export const rememberEmojiUse = (emoji: string) => {
  const value = String(emoji || '').trim();
  if (!value || typeof localStorage === 'undefined') return;
  try {
    const recent = readRecentEmojis(24).filter((e) => e !== value);
    recent.unshift(value);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 24)));
    const freqRaw = JSON.parse(localStorage.getItem(FREQ_KEY) || '{}') as Record<string, number>;
    freqRaw[value] = (Number(freqRaw[value]) || 0) + 1;
    localStorage.setItem(FREQ_KEY, JSON.stringify(freqRaw));
  } catch {
    /* ignore quota */
  }
};

export const readFrequentEmojis = (limit = 8): string[] => {
  try {
    if (typeof localStorage === 'undefined') return [];
    const freqRaw = JSON.parse(localStorage.getItem(FREQ_KEY) || '{}') as Record<string, number>;
    return Object.entries(freqRaw)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([emoji]) => emoji)
      .slice(0, limit);
  } catch {
    return [];
  }
};
