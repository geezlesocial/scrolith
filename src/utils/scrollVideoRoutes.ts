/**
 * Phase 22.1B — Canonical Scroll video destination + recommendation identity.
 *
 * Canonical URL form (single contract, do not invent a second):
 *   /scroll?scroll=<scrollVideoId>
 *
 * Alias accepted when reading (not preferred when building):
 *   /scroll?video=<scrollVideoId>
 */

export const SCROLL_VIDEO_ROUTE_VERSION = '22.1B';
export const SCROLL_PATH = '/scroll';
/** Query param used when building links. */
export const SCROLL_VIDEO_QUERY_KEY = 'scroll';
/** Accepted alias when resolving deep links. */
export const SCROLL_VIDEO_QUERY_ALIAS = 'video';

export type ScrollVideoRecommendationTarget = {
  scrollVideoId: string;
  postId?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  title?: string;
  creatorId?: string;
  creatorUsername?: string;
  creatorName?: string;
  why?: string;
  recommendationId?: string;
};

const clean = (value: unknown, max = 240): string => {
  const s = String(value ?? '').trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
};

/** Prefer media fields that look like playable video URLs or file content paths. */
const pickMediaUrl = (...candidates: unknown[]): string => {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return clean(c, 1200);
    if (c && typeof c === 'object') {
      const o = c as Record<string, unknown>;
      const nested =
        clean(o.url, 1200) ||
        clean(o.src, 1200) ||
        clean(o.mediaUrl, 1200) ||
        clean(o.fallbackUrl, 1200);
      if (nested) return nested;
    }
  }
  return '';
};

const pickThumb = (...candidates: unknown[]): string => {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return clean(c, 1200);
    if (c && typeof c === 'object') {
      const o = c as Record<string, unknown>;
      const nested =
        clean(o.thumbnailUrl, 1200) ||
        clean(o.poster, 1200) ||
        clean(o.thumb, 1200) ||
        clean(o.coverUrl, 1200);
      if (nested) return nested;
    }
  }
  return '';
};

/**
 * Resolve canonical Scroll video id from recommendation / stream payloads.
 * Does NOT treat generic feedKey strings as video ids when a real id is present.
 */
export const resolveScrollVideoId = (source: any): string => {
  if (!source || typeof source !== 'object') {
    const asString = clean(source, 64);
    return asString && !asString.includes(':') ? asString : '';
  }
  const candidates = [
    source.scrollVideoId,
    source.scroll_video_id,
    source.scrollId,
    source.scroll_id,
    source.videoId,
    source.video_id,
    source.targetId,
    source.target_id,
    source.entityId,
    source.entity_id,
    source.contentId,
    source.content_id,
    source.sourceId,
    source.source_id,
    source.id,
    source.payload?.id,
    source.raw?.id,
    source.data?.id,
    source.feedKey,
    source.feed_key,
    source.key
  ];
  for (const c of candidates) {
    const id = clean(c, 64);
    if (!id) continue;
    // feedKey shapes like SCROLL_VIDEO:cuid
    if (/^SCROLL_VIDEO:/i.test(id)) {
      const stripped = id.replace(/^SCROLL_VIDEO:/i, '').trim();
      if (stripped) return stripped;
      continue;
    }
    if (id.includes(':') && !id.startsWith('cm')) continue;
    return id;
  }
  return '';
};

/** Normalize a feed/stream recommendation into a typed Scroll target. */
export const normalizeScrollVideoRecommendation = (
  entryOrData: any
): ScrollVideoRecommendationTarget | null => {
  const raw = entryOrData?.raw || entryOrData;
  const data = entryOrData?.data || entryOrData?.payload || entryOrData || {};
  const media =
    data.media ||
    raw?.media ||
    data.payload?.media ||
    entryOrData?.media ||
    null;

  const scrollVideoId = resolveScrollVideoId({
    ...data,
    id: data.id || raw?.id || entryOrData?.id,
    sourceId: data.sourceId || raw?.sourceId,
    scrollId: data.scrollId || data.scroll_id,
    videoId: data.videoId || data.video_id
  });
  if (!scrollVideoId) return null;

  const author = data.author || raw?.author || data.payload?.author || {};
  const mediaUrl = pickMediaUrl(
    media,
    data.mediaUrl,
    data.url,
    data.videoUrl,
    data.fileUrl,
    media?.url,
    media?.fallbackUrl
  );
  const thumbnailUrl = pickThumb(
    media,
    data.thumbnailUrl,
    data.poster,
    data.coverUrl,
    media?.thumbnailUrl
  );
  const previewUrl =
    pickMediaUrl(data.previewUrl, data.preview, media?.previewUrl, media?.hlsUrl) || mediaUrl;

  return {
    scrollVideoId,
    postId: clean(data.postId || data.post_id || raw?.postId, 64) || undefined,
    mediaUrl: mediaUrl || undefined,
    thumbnailUrl: thumbnailUrl || undefined,
    previewUrl: previewUrl || undefined,
    title:
      clean(data.title || data.name || data.description || raw?.why, 160) || undefined,
    creatorId: clean(author?.id || data.authorId || data.creatorId, 64) || undefined,
    creatorUsername: clean(author?.username || data.username, 80) || undefined,
    creatorName: clean(author?.displayName || author?.name, 120) || undefined,
    why: clean(entryOrData?.raw?.why || data.why || data.whyRecommended, 200) || undefined,
    recommendationId:
      clean(data.feedKey || raw?.feedKey || entryOrData?.key || scrollVideoId, 120) || undefined
  };
};

/** Build canonical Scroll deep link for one exact video. */
export const buildScrollVideoUrl = (videoId: string): string => {
  const id = clean(videoId, 64);
  if (!id) return SCROLL_PATH;
  const params = new URLSearchParams();
  params.set(SCROLL_VIDEO_QUERY_KEY, id);
  return `${SCROLL_PATH}?${params.toString()}`;
};

/** Parse scroll video id from location search (supports scroll|video). */
export const parseScrollVideoIdFromSearch = (
  search: string | URLSearchParams | null | undefined
): string => {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search instanceof URLSearchParams
        ? search
        : null;
  if (!params) return '';
  return (
    clean(params.get(SCROLL_VIDEO_QUERY_KEY), 64) ||
    clean(params.get(SCROLL_VIDEO_QUERY_ALIAS), 64) ||
    ''
  );
};

/** True when the URL asks for one exact native Scroll video. */
export const hasExplicitScrollVideoQuery = (
  search: string | URLSearchParams | null | undefined
): boolean => Boolean(parseScrollVideoIdFromSearch(search));

export const isScrollHomeFallback = (href: string | null | undefined): boolean => {
  const h = String(href || '').trim().toLowerCase();
  return h === '/home' || h === '/m/home' || h.endsWith('/home');
};

/** True when a recommendation kind is a Scroll video. */
export const isScrollRecommendationKind = (kindOrType: unknown): boolean => {
  const t = String(kindOrType || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return t === 'SCROLL' || t === 'SCROLL_VIDEO' || t === 'SCROLLVIDEO';
};
