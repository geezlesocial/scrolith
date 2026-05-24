import { resolveAssetUrl } from './assetUrl';

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(String(value || '').trim());

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

const isLegacyUploadPath = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.startsWith('/uploads/') ||
    normalized.startsWith('uploads/') ||
    normalized.includes('/uploads/')
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
  const contentId =
    typeof attachment === 'string'
      ? normalizedDirect
      : String(attachment?.fileId || attachment?.file_id || attachment?.id || '').trim();

  if (contentId && isLegacyUploadPath(normalizedDirect)) {
    return resolveAssetUrl(buildFileContentUrl(contentId));
  }

  if (normalizedDirect && looksLikeDirectUrl(normalizedDirect)) {
    return resolveAssetUrl(normalizedDirect);
  }

  if (!contentId) return normalizedDirect;
  if (isAbsoluteUrl(contentId)) return resolveAssetUrl(contentId);
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
  const posterId = String(attachment?.thumbnailFileId || attachment?.thumbnail_file_id || '').trim();
  if (posterId && isLegacyUploadPath(normalizedPoster)) {
    return resolveAssetUrl(buildFileContentUrl(posterId));
  }
  if (normalizedPoster) {
    return resolveAssetUrl(normalizedPoster);
  }
  if (!posterId) return undefined;
  if (isAbsoluteUrl(posterId)) return resolveAssetUrl(posterId);
  return resolveAssetUrl(buildFileContentUrl(posterId));
};
