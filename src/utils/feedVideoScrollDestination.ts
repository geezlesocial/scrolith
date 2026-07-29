import { resolvePostAttachmentMediaPair, resolvePostAttachmentPosterUrl } from './postAttachmentMedia';
import type { FeedStreamEntry } from './feedStream';
import type { PendingPostVideoScrollViewerSource } from './postVideoScrollBridge';

const VIDEO_URL_PATTERN = /\.(mp4|webm|mov|m4v|ogv|ogg|m3u8)(?:[?#]|$)/i;

const clean = (value: unknown, max = 280): string => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  return normalized.length > max ? normalized.slice(0, max) : normalized;
};

const firstClean = (...values: unknown[]): string => {
  for (const value of values) {
    const normalized = clean(value, 1200);
    if (normalized) return normalized;
  }
  return '';
};

const flatten = (value: unknown): any[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flatten);
  return [value];
};

const collectMediaCandidates = (entry: FeedStreamEntry | any): any[] => {
  const data = entry?.data || {};
  const raw = entry?.raw || {};
  const payload = data?.payload || raw?.payload || {};
  return [
    ...flatten(data.media),
    ...flatten(raw.media),
    ...flatten(payload.media),
    ...flatten(data.attachments),
    ...flatten(raw.attachments),
    ...flatten(payload.attachments),
    ...flatten(data.mediaAttachments),
    ...flatten(raw.mediaAttachments),
    ...flatten(payload.mediaAttachments),
    ...flatten(data.files),
    ...flatten(raw.files),
    ...flatten(payload.files),
    data.video,
    raw.video,
    payload.video,
    data.mediaUrl,
    raw.mediaUrl,
    payload.mediaUrl,
    data.videoUrl,
    raw.videoUrl,
    payload.videoUrl,
    data.fileUrl,
    raw.fileUrl,
    payload.fileUrl,
    data.url,
    raw.url,
    payload.url
  ].filter(Boolean);
};

const mediaTypeOf = (value: any): string => {
  if (!value || typeof value !== 'object') return '';
  return clean(
    value.mimeType ||
      value.mime_type ||
      value.contentType ||
      value.content_type ||
      value.type ||
      value.mediaType ||
      value.media_type,
    120
  ).toLowerCase();
};

const looksLikeVideo = (value: any, url: string): boolean => {
  const type = mediaTypeOf(value);
  if (type.startsWith('video/')) return true;
  if (type === 'video' || type === 'scroll_video') return true;
  if (VIDEO_URL_PATTERN.test(url)) return true;
  return false;
};

const resolveCandidateUrl = (candidate: any): string => {
  if (typeof candidate === 'string') return clean(candidate, 1200);
  const pair = resolvePostAttachmentMediaPair(candidate);
  return (
    clean(pair.url, 1200) ||
    firstClean(
      candidate?.url,
      candidate?.src,
      candidate?.mediaUrl,
      candidate?.media_url,
      candidate?.videoUrl,
      candidate?.video_url,
      candidate?.fileUrl,
      candidate?.file_url,
      candidate?.fallbackUrl,
      candidate?.fallback_url
    )
  );
};

const resolveCandidateFileId = (candidate: any, data: any, raw: any): string => {
  if (candidate && typeof candidate === 'object') {
    const pair = resolvePostAttachmentMediaPair(candidate);
    const fileId = firstClean(
      pair.fileId,
      candidate.fileId,
      candidate.file_id,
      candidate.id,
      candidate.assetId,
      candidate.asset_id
    );
    if (fileId) return fileId;
  }
  return firstClean(
    data.fileId,
    data.file_id,
    data.videoFileId,
    data.video_file_id,
    raw.fileId,
    raw.file_id,
    raw.videoFileId,
    raw.video_file_id
  );
};

const resolveCandidatePoster = (candidate: any, data: any, raw: any): string => {
  const posterFromCandidate =
    typeof candidate === 'object' ? clean(resolvePostAttachmentPosterUrl(candidate), 1200) : '';
  return (
    posterFromCandidate ||
    firstClean(
      data.thumbnailUrl,
      data.thumbnail_url,
      data.poster,
      data.posterUrl,
      data.poster_url,
      data.coverUrl,
      data.cover_url,
      raw.thumbnailUrl,
      raw.thumbnail_url,
      raw.poster,
      raw.posterUrl,
      raw.poster_url,
      raw.coverUrl,
      raw.cover_url
    )
  );
};

export const resolveVideoRecommendationScrollSource = (
  entry: FeedStreamEntry | any
): PendingPostVideoScrollViewerSource | null => {
  if (!entry || typeof entry !== 'object') return null;
  const data = entry.data || {};
  const raw = entry.raw || {};
  const payload = data.payload || raw.payload || {};
  const candidates = collectMediaCandidates(entry);

  for (const candidate of candidates) {
    const mediaUrl = resolveCandidateUrl(candidate);
    if (!mediaUrl || !looksLikeVideo(candidate, mediaUrl)) continue;

    const sourcePostId = firstClean(
      data.postId,
      data.post_id,
      data.sourcePostId,
      data.source_post_id,
      payload.postId,
      payload.post_id,
      raw.postId,
      raw.post_id,
      raw.sourcePostId,
      raw.source_post_id,
      raw.sourceId,
      raw.source_id,
      data.sourceId,
      data.source_id,
      data.id,
      raw.id,
      entry.key
    );
    if (!sourcePostId) return null;

    const author = data.author || raw.author || payload.author || {};
    return {
      sourcePostId,
      fileId: resolveCandidateFileId(candidate, data, raw) || undefined,
      mediaUrl,
      thumbnailUrl: resolveCandidatePoster(candidate, data, raw) || undefined,
      title: firstClean(data.title, data.name, payload.title, payload.name, raw.title, raw.name, 'Recommended video'),
      description: firstClean(data.description, data.content, payload.description, payload.content, raw.description, raw.content),
      location: firstClean(data.location, payload.location, raw.location),
      authorName: firstClean(author.displayName, author.name, data.authorName, raw.authorName),
      authorAvatar: firstClean(author.avatarUrl, author.avatar, data.authorAvatar, raw.authorAvatar),
      authorUsername: firstClean(author.username, data.username, raw.username),
      isFollowingAuthor: data.isFollowingAuthor ?? raw.isFollowingAuthor ?? author.isFollowing ?? null,
      createdAt: firstClean(data.createdAt, payload.createdAt, raw.createdAt)
    };
  }

  return null;
};
