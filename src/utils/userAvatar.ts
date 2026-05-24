import { resolveAssetUrl } from './assetUrl';
import { resolvePostAttachmentMediaUrl } from './postAttachmentMedia';

const pickFirstString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
};

const looksLikeDirectAvatarUrl = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('/') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:') ||
    normalized.includes('/uploads/') ||
    normalized.includes('/api/files/content/') ||
    normalized.includes('?') ||
    normalized.includes('.png') ||
    normalized.includes('.jpg') ||
    normalized.includes('.jpeg') ||
    normalized.includes('.webp') ||
    normalized.includes('.gif')
  );
};

const looksLikeFileId = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized || looksLikeDirectAvatarUrl(normalized)) return false;
  return /^[a-z0-9_-]{12,}$/i.test(normalized);
};

export const resolveUserAvatarUrl = (userLike: any): string => {
  if (!userLike) return '';

  const directUrl = pickFirstString(
    userLike.avatarUrl,
    userLike.avatar_url,
    userLike.avatar,
    userLike.authorAvatar,
    userLike.userAvatar,
    userLike.user_avatar,
    userLike.photoUrl,
    userLike.photo_url
  );

  const fileId = pickFirstString(
    userLike.profilePhotoFileId,
    userLike.profile_photo_file_id,
    userLike.clientProfilePhotoFileId,
    userLike.client_profile_photo_file_id,
    userLike.freelancerProfilePhotoFileId,
    userLike.freelancer_profile_photo_file_id,
    userLike.avatarFileId,
    userLike.avatar_file_id,
    userLike.authorAvatarFileId,
    userLike.userAvatarFileId
  );

  const effectiveFileId = fileId || (looksLikeFileId(directUrl) ? directUrl : '');
  const resolved = resolvePostAttachmentMediaUrl({ fileId: effectiveFileId });
  if (resolved) return resolved;
  if (effectiveFileId) return resolvePostAttachmentMediaUrl({ fileId: effectiveFileId });
  if (directUrl && !looksLikeFileId(directUrl)) {
    return resolveAssetUrl(directUrl);
  }
  return '';
};
