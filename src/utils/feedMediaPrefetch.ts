/**
 * Phase 21.0.2 — intelligent media pipeline for feed cards.
 * Privacy-safe: URLs only, no content bodies.
 */
import { resolveAssetUrl } from './assetUrl';
import type { FeedStreamEntry } from './feedStream';

const prefetched = new Set<string>();
const failed = new Set<string>();
const MAX = 64;
const MAX_FAILED = 32;

const remember = (url: string) => {
  if (!url || prefetched.has(url) || failed.has(url)) return false;
  if (prefetched.size >= MAX) {
    const first = prefetched.values().next().value;
    if (first) prefetched.delete(first);
  }
  prefetched.add(url);
  return true;
};

const rememberFailed = (url: string) => {
  if (!url) return;
  failed.add(url);
  if (failed.size > MAX_FAILED) {
    const first = failed.values().next().value;
    if (first) failed.delete(first);
  }
};

/** Prefetch a single image URL via browser Image (async decode). */
export const prefetchImageUrl = (
  raw: string | null | undefined,
  options?: { priority?: 'high' | 'low'; retry?: boolean }
): void => {
  const url = resolveAssetUrl(String(raw || '').trim());
  if (!url || url.startsWith('data:')) return;
  if (failed.has(url) && !options?.retry) return;
  if (!remember(url) && !options?.retry) return;
  try {
    if (typeof window === 'undefined') return;
    const img = new Image();
    img.decoding = 'async';
    // Prefer visible-priority loads without blocking the main thread.
    try {
      (img as any).fetchPriority = options?.priority === 'high' ? 'high' : 'low';
    } catch {
      // ignore
    }
    img.loading = options?.priority === 'high' ? 'eager' : 'lazy';
    img.onerror = () => {
      rememberFailed(url);
      prefetched.delete(url);
    };
    img.src = url;
  } catch {
    // ignore
  }
};

/** Broken-image safe placeholder (inline SVG data URI — no network). */
export const FEED_MEDIA_FALLBACK_DATA_URI =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
      <rect width="80" height="80" fill="#e2e8f0"/>
      <circle cx="40" cy="32" r="12" fill="#94a3b8"/>
      <rect x="16" y="50" width="48" height="14" rx="7" fill="#94a3b8"/>
    </svg>`
  );

export const resolveFeedMediaUrlOrFallback = (raw: string | null | undefined): string => {
  const url = resolveAssetUrl(String(raw || '').trim());
  if (!url || failed.has(url)) return FEED_MEDIA_FALLBACK_DATA_URI;
  return url;
};

/** Collect likely media URLs from a stream entry. */
export const collectEntryMediaUrls = (entry: FeedStreamEntry): string[] => {
  const data = entry?.data || entry?.post || {};
  const urls: string[] = [];
  const push = (v: unknown) => {
    const s = String(v || '').trim();
    if (s) urls.push(s);
  };
  push(data.avatarUrl || data.avatar || data.clientAvatar || data.freelancerAvatar || data.logoUrl || data.logo);
  push(data.image || data.thumbnail || data.coverUrl || data.mediaUrl);
  if (Array.isArray(data.images)) data.images.slice(0, 2).forEach(push);
  if (Array.isArray(data.attachments)) {
    data.attachments.slice(0, 2).forEach((a: any) => push(a?.url || a?.thumbnailUrl || a?.posterUrl));
  }
  if (entry.post?.author) {
    push(entry.post.author.avatarUrl || entry.post.author.avatar);
  }
  return urls;
};

/**
 * Prefetch media for the next N visible-adjacent entries (idle-friendly).
 * First entry in the window is high priority (likely visible).
 */
export const prefetchStreamMedia = (
  entries: FeedStreamEntry[],
  startIndex: number,
  count = 4
): void => {
  const slice = (entries || []).slice(Math.max(0, startIndex), Math.max(0, startIndex) + Math.max(1, count));
  const run = () => {
    slice.forEach((entry, index) => {
      collectEntryMediaUrls(entry)
        .slice(0, index === 0 ? 4 : 2)
        .forEach((url) => prefetchImageUrl(url, { priority: index === 0 ? 'high' : 'low' }));
    });
  };
  if (typeof window !== 'undefined' && typeof (window as any).requestIdleCallback === 'function') {
    (window as any).requestIdleCallback(run, { timeout: 1200 });
  } else if (typeof window !== 'undefined') {
    window.setTimeout(run, 120);
  } else {
    run();
  }
};

/** Prioritize currently visible entries (avatars + first attachment). */
export const prefetchVisibleStreamMedia = (entries: FeedStreamEntry[]): void => {
  (entries || []).slice(0, 6).forEach((entry, index) => {
    collectEntryMediaUrls(entry)
      .slice(0, 2)
      .forEach((url) => prefetchImageUrl(url, { priority: index < 2 ? 'high' : 'low' }));
  });
};
