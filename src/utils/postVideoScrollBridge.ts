export type PendingPostVideoScrollSource = {
  sourcePostId: string;
  fileId: string;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  title?: string | null;
  description?: string | null;
  location?: string | null;
};

export type PendingPostVideoScrollViewerSource = {
  sourcePostId: string;
  fileId?: string | null;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  authorName?: string | null;
  authorAvatar?: string | null;
  authorUsername?: string | null;
  createdAt?: string | null;
};

const STORAGE_KEY = 'scroll:pending-post-video-source';
const VIEWER_STORAGE_KEY = 'scroll:pending-post-video-viewer-source';

const canUseStorage = () => typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';

const normalizeString = (value: unknown, maxLength = 280) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
};

export const stashPendingPostVideoScrollSource = (source: PendingPostVideoScrollSource) => {
  if (!canUseStorage()) return;
  const payload = {
    sourcePostId: normalizeString(source.sourcePostId, 64),
    fileId: normalizeString(source.fileId, 128),
    mediaUrl: normalizeString(source.mediaUrl, 1200),
    thumbnailUrl: normalizeString(source.thumbnailUrl, 1200),
    title: normalizeString(source.title, 160),
    description: normalizeString(source.description, 320),
    location: normalizeString(source.location, 120),
    savedAt: Date.now()
  };
  if (!payload.sourcePostId || !payload.fileId) return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

export const readPendingPostVideoScrollSource = (): PendingPostVideoScrollSource | null => {
  if (!canUseStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const sourcePostId = normalizeString(parsed?.sourcePostId, 64);
    const fileId = normalizeString(parsed?.fileId, 128);
    if (!sourcePostId || !fileId) return null;
    return {
      sourcePostId,
      fileId,
      mediaUrl: normalizeString(parsed?.mediaUrl, 1200),
      thumbnailUrl: normalizeString(parsed?.thumbnailUrl, 1200),
      title: normalizeString(parsed?.title, 160),
      description: normalizeString(parsed?.description, 320),
      location: normalizeString(parsed?.location, 120)
    };
  } catch {
    return null;
  }
};

export const clearPendingPostVideoScrollSource = () => {
  if (!canUseStorage()) return;
  window.sessionStorage.removeItem(STORAGE_KEY);
};

export const stashPendingPostVideoScrollViewerSource = (source: PendingPostVideoScrollViewerSource) => {
  if (!canUseStorage()) return;
  const payload = {
    sourcePostId: normalizeString(source.sourcePostId, 64),
    fileId: normalizeString(source.fileId, 128),
    mediaUrl: normalizeString(source.mediaUrl, 1200),
    thumbnailUrl: normalizeString(source.thumbnailUrl, 1200),
    title: normalizeString(source.title, 160),
    description: normalizeString(source.description, 320),
    location: normalizeString(source.location, 120),
    authorName: normalizeString(source.authorName, 120),
    authorAvatar: normalizeString(source.authorAvatar, 1200),
    authorUsername: normalizeString(source.authorUsername, 80),
    createdAt: normalizeString(source.createdAt, 80),
    savedAt: Date.now()
  };
  if (!payload.sourcePostId || !payload.mediaUrl) return;
  window.sessionStorage.setItem(VIEWER_STORAGE_KEY, JSON.stringify(payload));
};

export const readPendingPostVideoScrollViewerSource = (): PendingPostVideoScrollViewerSource | null => {
  if (!canUseStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(VIEWER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const sourcePostId = normalizeString(parsed?.sourcePostId, 64);
    const mediaUrl = normalizeString(parsed?.mediaUrl, 1200);
    if (!sourcePostId || !mediaUrl) return null;
    return {
      sourcePostId,
      fileId: normalizeString(parsed?.fileId, 128),
      mediaUrl,
      thumbnailUrl: normalizeString(parsed?.thumbnailUrl, 1200),
      title: normalizeString(parsed?.title, 160),
      description: normalizeString(parsed?.description, 320),
      location: normalizeString(parsed?.location, 120),
      authorName: normalizeString(parsed?.authorName, 120),
      authorAvatar: normalizeString(parsed?.authorAvatar, 1200),
      authorUsername: normalizeString(parsed?.authorUsername, 80),
      createdAt: normalizeString(parsed?.createdAt, 80)
    };
  } catch {
    return null;
  }
};

export const clearPendingPostVideoScrollViewerSource = () => {
  if (!canUseStorage()) return;
  window.sessionStorage.removeItem(VIEWER_STORAGE_KEY);
};
