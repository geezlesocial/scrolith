/**
 * Session-scoped Scrolitha draft helpers (frontend only).
 * Uses sessionStorage so drafts survive refresh/tab switches within the session
 * without writing sensitive content to long-lived localStorage.
 */

const isBrowser = () => typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';

const safeParse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const SCROLITHA_SUPPORT_DRAFT_KEY = 'scrolitha:support:draft:v1';
export const SCROLITHA_COACH_DRAFT_KEY = 'scrolitha:coach:draft:v1';
/** Shared handoff key for project-brief → SupportWidget / auth redirect flows. */
export const SCROLITHA_PENDING_PROJECT_PROMPT_KEY = 'scrolitha_pending_project_prompt';

export type SupportDraftSnapshot = {
  message?: string;
  conversationId?: string | null;
  updatedAt?: number;
};

export type CoachSurfaceDraft = {
  input?: string;
  output?: string;
  updatedAt?: number;
};

export type CoachDraftSnapshot = {
  surface?: 'post' | 'gig' | 'brief';
  bySurface?: Partial<Record<'post' | 'gig' | 'brief', CoachSurfaceDraft>>;
  updatedAt?: number;
};

export const readSupportDraft = (): SupportDraftSnapshot | null => {
  if (!isBrowser()) return null;
  return safeParse<SupportDraftSnapshot>(window.sessionStorage.getItem(SCROLITHA_SUPPORT_DRAFT_KEY));
};

export const writeSupportDraft = (snapshot: SupportDraftSnapshot) => {
  if (!isBrowser()) return;
  try {
    const next: SupportDraftSnapshot = {
      message: String(snapshot.message || ''),
      conversationId: snapshot.conversationId ?? null,
      updatedAt: Date.now()
    };
    if (!next.message && !next.conversationId) {
      window.sessionStorage.removeItem(SCROLITHA_SUPPORT_DRAFT_KEY);
      return;
    }
    window.sessionStorage.setItem(SCROLITHA_SUPPORT_DRAFT_KEY, JSON.stringify(next));
  } catch {
    // storage full / private mode — non-fatal
  }
};

export const clearSupportDraft = () => {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(SCROLITHA_SUPPORT_DRAFT_KEY);
  } catch {
    // ignore
  }
};

export const readCoachDraft = (): CoachDraftSnapshot | null => {
  if (!isBrowser()) return null;
  return safeParse<CoachDraftSnapshot>(window.sessionStorage.getItem(SCROLITHA_COACH_DRAFT_KEY));
};

export const writeCoachDraft = (snapshot: CoachDraftSnapshot) => {
  if (!isBrowser()) return;
  try {
    const next: CoachDraftSnapshot = {
      surface: snapshot.surface,
      bySurface: snapshot.bySurface || {},
      updatedAt: Date.now()
    };
    window.sessionStorage.setItem(SCROLITHA_COACH_DRAFT_KEY, JSON.stringify(next));
  } catch {
    // non-fatal
  }
};

export const clearCoachDraft = () => {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(SCROLITHA_COACH_DRAFT_KEY);
  } catch {
    // ignore
  }
};

export const writePendingProjectPrompt = (prompt: string) => {
  if (!isBrowser()) return;
  const value = String(prompt || '').trim();
  if (!value) return;
  try {
    window.sessionStorage.setItem(SCROLITHA_PENDING_PROJECT_PROMPT_KEY, value);
  } catch {
    // non-fatal
  }
};

export const readPendingProjectPrompt = (): string => {
  if (!isBrowser()) return '';
  try {
    return String(window.sessionStorage.getItem(SCROLITHA_PENDING_PROJECT_PROMPT_KEY) || '').trim();
  } catch {
    return '';
  }
};

export const clearPendingProjectPrompt = () => {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(SCROLITHA_PENDING_PROJECT_PROMPT_KEY);
  } catch {
    // ignore
  }
};
