/**
 * Phase 23 — Enterprise Scroll player engine (pure helpers).
 * Resume, adaptive preload, virtual window, buffer health.
 */

export type ScrollNetworkClass = 'slow' | 'medium' | 'fast' | 'unknown';

export type ScrollPreloadMode = 'none' | 'metadata' | 'auto';

export type ScrollVirtualWindow = {
  start: number;
  end: number;
  active: number;
  total: number;
};

const RESUME_PREFIX = 'scroll:resume:v1:';
const RESUME_MAX_ENTRIES = 40;

export const detectNetworkClass = (): ScrollNetworkClass => {
  if (typeof navigator === 'undefined') return 'unknown';
  const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (!conn) return 'unknown';
  const effectiveType = String(conn.effectiveType || '').toLowerCase();
  if (effectiveType.includes('2g') || effectiveType === 'slow-2g') return 'slow';
  if (effectiveType.includes('3g')) return 'medium';
  if (effectiveType.includes('4g') || effectiveType.includes('5g')) return 'fast';
  const downlink = Number(conn.downlink || 0);
  if (downlink > 0 && downlink < 1.5) return 'slow';
  if (downlink >= 5) return 'fast';
  if (downlink > 0) return 'medium';
  return 'unknown';
};

/** Adaptive video preload for active / neighbor cards. */
export const resolveScrollPreloadMode = (input: {
  isActive: boolean;
  isNeighbor: boolean;
  autoplayEnabled: boolean;
  dataSaver?: boolean;
  networkClass?: ScrollNetworkClass;
}): ScrollPreloadMode => {
  if (input.dataSaver) {
    return input.isActive ? 'metadata' : 'none';
  }
  const network = input.networkClass || detectNetworkClass();
  if (input.isActive) {
    if (!input.autoplayEnabled) return 'metadata';
    if (network === 'slow') return 'metadata';
    return 'auto';
  }
  if (input.isNeighbor) {
    if (network === 'slow') return 'none';
    if (network === 'medium') return 'metadata';
    return 'metadata';
  }
  return 'none';
};

/** Virtualization window around the active index (inclusive). */
export const computeScrollVirtualWindow = (
  activeIndex: number,
  total: number,
  radius = 2
): ScrollVirtualWindow => {
  const safeTotal = Math.max(0, Math.floor(total));
  if (safeTotal === 0) return { start: 0, end: -1, active: 0, total: 0 };
  const active = Math.max(0, Math.min(safeTotal - 1, Math.floor(activeIndex)));
  const r = Math.max(1, Math.floor(radius));
  return {
    start: Math.max(0, active - r),
    end: Math.min(safeTotal - 1, active + r),
    active,
    total: safeTotal
  };
};

export const isIndexInVirtualWindow = (index: number, window: ScrollVirtualWindow) =>
  index >= window.start && index <= window.end;

export type ScrollResumeState = {
  scrollId: string;
  positionSeconds: number;
  updatedAt: number;
};

const readResumeMap = (): Record<string, ScrollResumeState> => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = JSON.parse(localStorage.getItem(RESUME_PREFIX + 'map') || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
};

const writeResumeMap = (map: Record<string, ScrollResumeState>) => {
  if (typeof localStorage === 'undefined') return;
  try {
    const entries = Object.values(map)
      .filter((entry) => entry && entry.scrollId)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .slice(0, RESUME_MAX_ENTRIES);
    const next: Record<string, ScrollResumeState> = {};
    entries.forEach((entry) => {
      next[entry.scrollId] = entry;
    });
    localStorage.setItem(RESUME_PREFIX + 'map', JSON.stringify(next));
  } catch {
    /* private mode */
  }
};

/** Persist resume position (skip near start / near end). */
export const saveScrollResumePosition = (scrollId: string, positionSeconds: number, durationSeconds?: number) => {
  const id = String(scrollId || '').trim();
  if (!id) return;
  const pos = Number(positionSeconds);
  if (!Number.isFinite(pos) || pos < 1.5) {
    clearScrollResumePosition(id);
    return;
  }
  const duration = Number(durationSeconds || 0);
  if (duration > 0 && pos / duration >= 0.92) {
    clearScrollResumePosition(id);
    return;
  }
  const map = readResumeMap();
  map[id] = { scrollId: id, positionSeconds: pos, updatedAt: Date.now() };
  writeResumeMap(map);
};

export const readScrollResumePosition = (scrollId: string): number | null => {
  const id = String(scrollId || '').trim();
  if (!id) return null;
  const entry = readResumeMap()[id];
  if (!entry) return null;
  const pos = Number(entry.positionSeconds);
  return Number.isFinite(pos) && pos > 0 ? pos : null;
};

export const clearScrollResumePosition = (scrollId: string) => {
  const id = String(scrollId || '').trim();
  if (!id) return;
  const map = readResumeMap();
  if (!map[id]) return;
  delete map[id];
  writeResumeMap(map);
};

/** Buffer health 0–1 from HTMLMediaElement.buffered around currentTime. */
export const estimateBufferHealth = (video: HTMLMediaElement | null | undefined): number => {
  if (!video || !video.buffered || video.buffered.length === 0) return 0;
  try {
    const t = Number(video.currentTime || 0);
    for (let i = 0; i < video.buffered.length; i += 1) {
      const start = video.buffered.start(i);
      const end = video.buffered.end(i);
      if (t >= start - 0.25 && t <= end + 0.25) {
        const ahead = Math.max(0, end - t);
        return Math.max(0, Math.min(1, ahead / 8));
      }
    }
  } catch {
    return 0;
  }
  return 0;
};

/** Prefetch next N media URLs via lightweight link tags / Image warmup for posters. */
export const prefetchScrollMediaUrls = (urls: string[], limit = 2) => {
  if (typeof document === 'undefined') return;
  const list = Array.from(new Set(urls.map((u) => String(u || '').trim()).filter(Boolean))).slice(0, limit);
  list.forEach((url) => {
    const existing = Array.from(document.head.querySelectorAll('link[data-scroll-prefetch]')).some(
      (node) => node.getAttribute('data-scroll-prefetch') === url
    );
    if (existing) return;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'video';
    link.href = url;
    link.setAttribute('data-scroll-prefetch', url);
    document.head.appendChild(link);
  });
};

export const shouldAttemptAutoplay = (input: {
  isActive: boolean;
  autoplayEnabled: boolean;
  playbackBlocked?: boolean;
  documentHidden?: boolean;
}) => {
  if (!input.isActive || !input.autoplayEnabled || input.playbackBlocked) return false;
  if (input.documentHidden) return false;
  return true;
};
