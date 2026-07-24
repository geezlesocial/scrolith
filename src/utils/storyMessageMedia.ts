/**
 * Resolve story-reaction / story-message media previews for messaging.
 * Backend historically stores mediaPreview as a bare mediaFileId (not a URL).
 * Browsers cannot load bare IDs as <img src> — always resolve through content API.
 */

import { resolveAssetUrl } from './assetUrl';
import { looksLikeFileId, resolvePostAttachmentMediaUrl } from './postAttachmentMedia';

const pickString = (...values: unknown[]): string => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

export type StoryMessageReference = {
  storyId: string;
  mediaPreview: string;
  mediaCandidates: string[];
  caption: string;
  reactionType: string;
  category: string;
  actionUrl: string;
  mediaFileId: string;
};

/** Resolve a single candidate (URL, path, or bare file id) to a browser-loadable URL. */
export const resolveStoryMediaPreviewUrl = (raw: unknown): string => {
  const value = String(raw ?? '').trim();
  if (!value) return '';

  // Absolute / relative asset paths
  if (
    /^https?:\/\//i.test(value) ||
    value.startsWith('/') ||
    value.startsWith('uploads/') ||
    value.startsWith('api/files/') ||
    value.startsWith('files/content/') ||
    value.startsWith('blob:') ||
    value.startsWith('data:')
  ) {
    return resolvePostAttachmentMediaUrl(value) || resolveAssetUrl(value) || '';
  }

  // Bare file id (cuid/uuid) — most common historical mediaPreview shape
  if (looksLikeFileId(value)) {
    return (
      resolvePostAttachmentMediaUrl({ fileId: value }) ||
      resolveAssetUrl(value) ||
      ''
    );
  }

  return resolvePostAttachmentMediaUrl(value) || resolveAssetUrl(value) || '';
};

/**
 * Ordered unique loadable preview URLs from storyReference / message metadata.
 * Prefers explicit thumbnails, then mediaPreview, then mediaFileId content URL.
 */
export const resolveStoryMediaPreviewCandidates = (input: {
  storyReference?: any;
  metadata?: any;
}): string[] => {
  const ref =
    input.storyReference && typeof input.storyReference === 'object'
      ? input.storyReference
      : {};
  const meta = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};

  const rawCandidates = [
    ref.thumbnailUrl,
    ref.thumbnail_url,
    ref.posterUrl,
    ref.poster_url,
    ref.mediaPreview,
    ref.media_preview,
    ref.previewUrl,
    ref.preview_url,
    ref.url,
    ref.mediaUrl,
    ref.media_url,
    meta.mediaPreview,
    meta.thumbnailUrl,
    ref.mediaFileId,
    ref.media_file_id,
    meta.mediaFileId,
    meta.media_file_id,
    // Nested media object
    ref.media?.thumbnailUrl,
    ref.media?.posterUrl,
    ref.media?.url,
    ref.media?.fileId,
    ref.media?.id
  ];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawCandidates) {
    const resolved = resolveStoryMediaPreviewUrl(raw);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
};

export const extractStoryMessageReference = (message: any): StoryMessageReference | null => {
  const metadata =
    message?.metadata && typeof message.metadata === 'object' ? message.metadata : null;
  if (!metadata) return null;

  const storyReference =
    metadata.storyReference && typeof metadata.storyReference === 'object'
      ? metadata.storyReference
      : null;

  const storyId = pickString(
    storyReference?.storyId,
    storyReference?.story_id,
    metadata.storyId,
    metadata.story_id
  );
  if (!storyId) return null;

  const mediaFileId = pickString(
    storyReference?.mediaFileId,
    storyReference?.media_file_id,
    metadata.mediaFileId,
    metadata.media_file_id,
    // Historical: mediaPreview was often the bare file id
    looksLikeFileId(storyReference?.mediaPreview)
      ? storyReference?.mediaPreview
      : '',
    looksLikeFileId(metadata.mediaPreview) ? metadata.mediaPreview : ''
  );

  const candidates = resolveStoryMediaPreviewCandidates({
    storyReference: storyReference || {},
    metadata
  });

  return {
    storyId,
    mediaPreview: candidates[0] || '',
    mediaCandidates: candidates,
    caption: pickString(storyReference?.caption, metadata.caption, storyReference?.content),
    reactionType: pickString(
      storyReference?.reactionType,
      storyReference?.reaction_type,
      metadata.reactionType,
      metadata.reaction_type
    ),
    category: pickString(metadata.category, storyReference?.category),
    actionUrl: pickString(
      metadata.actionUrl,
      metadata.action_url,
      storyReference?.actionUrl,
      `/community?story=${encodeURIComponent(storyId)}`
    ),
    mediaFileId
  };
};
