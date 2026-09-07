export type MobilePostDraft = {
  userId: string;
  content: string;
  mediaCaption: string;
  visibility: string;
  graphicWarning: boolean;
  isAIEnhanced: boolean;
  aiInsightPreference: string;
  topic: string;
  place: string;
  textBackgroundId: string;
  updatedAt: string;
};

const STORAGE_PREFIX = 'scrolith:mobile-post-draft:v1:';
const MAX_TEXT_LENGTH = 12_000;

const storage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const keyFor = (userId: unknown) => {
  const normalized = String(userId || '').trim();
  return normalized ? `${STORAGE_PREFIX}${normalized.slice(0, 128)}` : '';
};

const boundedText = (value: unknown) => String(value ?? '').slice(0, MAX_TEXT_LENGTH);

export const loadMobilePostDraft = (userId: unknown): MobilePostDraft | null => {
  const key = keyFor(userId);
  const target = storage();
  if (!key || !target) return null;
  try {
    const raw = target.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      userId: String(parsed.userId || userId).slice(0, 128),
      content: boundedText(parsed.content),
      mediaCaption: boundedText(parsed.mediaCaption),
      visibility: String(parsed.visibility || 'public').slice(0, 32),
      graphicWarning: Boolean(parsed.graphicWarning),
      isAIEnhanced: Boolean(parsed.isAIEnhanced),
      aiInsightPreference: String(parsed.aiInsightPreference || 'auto').slice(0, 16),
      topic: boundedText(parsed.topic).slice(0, 240),
      place: boundedText(parsed.place).slice(0, 240),
      textBackgroundId: String(parsed.textBackgroundId || 'none').slice(0, 80),
      updatedAt: String(parsed.updatedAt || '').slice(0, 80)
    };
  } catch {
    return null;
  }
};

export const saveMobilePostDraft = (draft: Omit<MobilePostDraft, 'updatedAt'>) => {
  const key = keyFor(draft.userId);
  const target = storage();
  if (!key || !target) return false;
  try {
    target.setItem(
      key,
      JSON.stringify({
        ...draft,
        content: boundedText(draft.content),
        mediaCaption: boundedText(draft.mediaCaption),
        topic: boundedText(draft.topic).slice(0, 240),
        place: boundedText(draft.place).slice(0, 240),
        updatedAt: new Date().toISOString()
      })
    );
    return true;
  } catch {
    return false;
  }
};

export const clearMobilePostDraft = (userId: unknown) => {
  const key = keyFor(userId);
  const target = storage();
  if (!key || !target) return;
  try {
    target.removeItem(key);
  } catch {
    // Draft cleanup is best effort.
  }
};

export const hasMobilePostDraftContent = (draft: Pick<MobilePostDraft, 'content' | 'mediaCaption' | 'topic' | 'place'>) =>
  Boolean(draft.content.trim() || draft.mediaCaption.trim() || draft.topic.trim() || draft.place.trim());
