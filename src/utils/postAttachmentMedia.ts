import { resolveAssetUrl } from './assetUrl';

const looksLikeDirectUrl = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('/') ||
    normalized.includes('/') ||
    normalized.includes('.') ||
    normalized.includes('?')
  );
};

const buildFileContentUrl = (value: string) => {
  const contentId = String(value || '').trim();
  if (!contentId) return '';
  return `/api/files/content/${encodeURIComponent(contentId)}`;
};

export const resolvePostAttachmentMediaUrl = (attachment: any) => {
  if (!attachment) return '';
  const directValue =
    typeof attachment === 'string'
      ? attachment
      : attachment?.url ||
        attachment?.path ||
        attachment?.downloadUrl ||
        attachment?.download_url ||
        attachment?.fileUrl ||
        attachment?.file_url ||
        attachment?.mediaUrl ||
        attachment?.media_url ||
        attachment?.videoUrl ||
        attachment?.video_url ||
        '';
  const normalizedDirect = String(directValue || '').trim();
  if (normalizedDirect && looksLikeDirectUrl(normalizedDirect)) {
    return resolveAssetUrl(normalizedDirect);
  }

  const contentId =
    typeof attachment === 'string'
      ? normalizedDirect
      : String(attachment?.fileId || attachment?.file_id || attachment?.id || '').trim();

  if (!contentId) return normalizedDirect;
  return resolveAssetUrl(buildFileContentUrl(contentId));
};

export const resolvePostAttachmentPosterUrl = (attachment: any) => {
  if (!attachment || typeof attachment === 'string') return undefined;
  const posterValue =
    attachment?.thumbnailUrl ||
    attachment?.thumbnail_url ||
    attachment?.poster ||
    attachment?.posterUrl ||
    attachment?.poster_url ||
    attachment?.previewUrl ||
    attachment?.preview_url ||
    attachment?.thumbnailFileUrl ||
    attachment?.thumbnail_file_url ||
    '';
  const normalizedPoster = String(posterValue || '').trim();
  if (normalizedPoster) {
    return resolveAssetUrl(normalizedPoster);
  }

  const posterId = String(attachment?.thumbnailFileId || attachment?.thumbnail_file_id || '').trim();
  if (!posterId) return undefined;
  return resolveAssetUrl(buildFileContentUrl(posterId));
};
