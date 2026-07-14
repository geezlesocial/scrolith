/**
 * Phase 5.1 — safe local composer draft persistence (sessionStorage).
 * Stores text/settings only — never file bytes, tokens, or private API payloads.
 */

export type ComposerDraftSnapshot = {
  version: 1;
  updatedAt: string;
  title?: string;
  content?: string;
  tags?: string;
  mentions?: string;
  topic?: string;
  region?: string;
  location?: string;
  visibility?: string;
  commentPolicy?: string;
  graphicWarning?: boolean;
  isAIEnhanced?: boolean;
  aiInsightPreference?: string;
  authorScopeId?: string;
};

const DRAFT_VERSION = 1 as const;
const PREFIX = 'scrolith.composer.draft.v1';

export const buildComposerDraftKey = (parts: {
  userId?: string | null;
  surface: string;
  identityId?: string | null;
}) => {
  const user = String(parts.userId || 'anon').trim() || 'anon';
  const surface = String(parts.surface || 'member-home').trim() || 'member-home';
  const identity = String(parts.identityId || 'self').trim() || 'self';
  return `${PREFIX}:${user}:${surface}:${identity}`;
};

const canUseStorage = () => typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';

export const isComposerDraftMeaningful = (draft: Partial<ComposerDraftSnapshot> | null | undefined) => {
  if (!draft) return false;
  const hasText = Boolean(String(draft.title || '').trim() || String(draft.content || '').trim());
  const hasMeta = Boolean(
    String(draft.topic || '').trim() ||
      String(draft.location || '').trim() ||
      String(draft.region || '').trim() ||
      String(draft.tags || '').trim()
  );
  return hasText || hasMeta;
};

export const saveComposerDraft = (key: string, draft: Omit<ComposerDraftSnapshot, 'version' | 'updatedAt'>) => {
  if (!canUseStorage() || !key) return false;
  if (!isComposerDraftMeaningful(draft)) {
    clearComposerDraft(key);
    return false;
  }
  try {
    const payload: ComposerDraftSnapshot = {
      version: DRAFT_VERSION,
      updatedAt: new Date().toISOString(),
      title: String(draft.title || ''),
      content: String(draft.content || ''),
      tags: String(draft.tags || ''),
      mentions: String(draft.mentions || ''),
      topic: String(draft.topic || ''),
      region: String(draft.region || ''),
      location: String(draft.location || ''),
      visibility: draft.visibility,
      commentPolicy: draft.commentPolicy,
      graphicWarning: Boolean(draft.graphicWarning),
      isAIEnhanced: Boolean(draft.isAIEnhanced),
      aiInsightPreference: draft.aiInsightPreference,
      authorScopeId: draft.authorScopeId
    };
    window.sessionStorage.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
};

export const loadComposerDraft = (key: string): ComposerDraftSnapshot | null => {
  if (!canUseStorage() || !key) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ComposerDraftSnapshot;
    if (!parsed || parsed.version !== DRAFT_VERSION) return null;
    if (!isComposerDraftMeaningful(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearComposerDraft = (key: string) => {
  if (!canUseStorage() || !key) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
};
