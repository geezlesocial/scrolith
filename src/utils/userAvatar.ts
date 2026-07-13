import { resolveAssetUrl } from './assetUrl';
import { looksLikeFileId, resolvePostAttachmentMediaUrl } from './postAttachmentMedia';

const pickFirstString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
};

export const resolveUserAvatarUrl = (userLike: any): string => {
  if (!userLike) return '';

  // Prefer durable absolute / content URLs when already present (CDN, API content, signed).
  // Only fall back to fileId reconstruction when URL is missing or a stale /uploads path.
  const attachmentResolved = [
    userLike.avatarUrl,
    userLike.avatar_url,
    userLike.avatar,
    userLike.logo,
    userLike.logoUrl,
    userLike.logo_url,
    userLike.image,
    userLike.imageUrl,
    userLike.profileImage,
    userLike.profile_image,
    userLike.photo,
    userLike.photoUrl,
    userLike.photo_url,
    userLike.authorAvatar,
    userLike.userAvatar,
    userLike.user_avatar,
    userLike.cover,
    userLike.coverUrl,
    userLike.cover_url,
    // Nested objects with url/fileId
    userLike.logo && typeof userLike.logo === 'object' ? userLike.logo : null,
    userLike.cover && typeof userLike.cover === 'object' ? userLike.cover : null,
    userLike.avatar && typeof userLike.avatar === 'object' ? userLike.avatar : null
  ]
    .map((candidate) => resolvePostAttachmentMediaUrl(candidate))
    .find(Boolean);
  if (attachmentResolved) return attachmentResolved;

  // Explicit file IDs — more durable than legacy /uploads paths.
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
    userLike.userAvatarFileId,
    userLike.logoFileId,
    userLike.logo_file_id,
    userLike.coverFileId,
    userLike.cover_file_id,
    userLike.imageFileId,
    userLike.image_file_id,
    userLike.profileImageFileId,
    userLike.profile_image_file_id,
    // Nested logo/cover objects common on business pages
    userLike.logo?.fileId,
    userLike.logo?.file_id,
    userLike.logo?.id,
    userLike.cover?.fileId,
    userLike.cover?.file_id,
    userLike.avatar?.fileId,
    userLike.avatar?.file_id,
    userLike.avatar?.id
  );

  if (fileId && looksLikeFileId(fileId)) {
    const fromFileId = resolvePostAttachmentMediaUrl({ fileId });
    if (fromFileId) return fromFileId;
  }

  const directUrl = pickFirstString(
    userLike.avatarUrl,
    userLike.avatar_url,
    typeof userLike.avatar === 'string' ? userLike.avatar : '',
    userLike.authorAvatar,
    userLike.userAvatar,
    userLike.user_avatar,
    userLike.photoUrl,
    userLike.photo_url,
    userLike.logoUrl,
    userLike.imageUrl,
    userLike.coverUrl,
    userLike.cover_url
  );

  const effectiveFileId = fileId || (looksLikeFileId(directUrl) ? directUrl : '');
  if (effectiveFileId && looksLikeFileId(effectiveFileId)) {
    const resolved = resolvePostAttachmentMediaUrl({ fileId: effectiveFileId });
    if (resolved) return resolved;
  }
  if (directUrl && !looksLikeFileId(directUrl)) {
    return resolveAssetUrl(directUrl);
  }
  return '';
};
