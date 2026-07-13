import { resolveAssetUrl } from './assetUrl';
import { looksLikeFileId, resolveMediaDescriptor, resolvePostAttachmentMediaUrl } from './postAttachmentMedia';

const pickFirstString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
};

/**
 * Resolve user / page avatar or logo URL.
 * Uses dual-path safe precedence (uploads before orphaned fileId content URLs).
 * OAuth external avatars (googleusercontent, etc.) are preserved unchanged.
 */
export const resolveUserAvatarUrl = (userLike: any): string => {
  if (!userLike) return '';

  // Nested media objects first (logo/cover/avatar with url + fileId + storagePath).
  const nestedCandidates = [
    userLike.logo && typeof userLike.logo === 'object' ? userLike.logo : null,
    userLike.avatar && typeof userLike.avatar === 'object' ? userLike.avatar : null,
    userLike.cover && typeof userLike.cover === 'object' ? userLike.cover : null,
    userLike.image && typeof userLike.image === 'object' ? userLike.image : null
  ];
  for (const candidate of nestedCandidates) {
    if (!candidate) continue;
    const resolved = resolvePostAttachmentMediaUrl(candidate);
    if (resolved) return resolved;
  }

  // Composite descriptor from common identity fields.
  const composite = resolveMediaDescriptor({
    url: pickFirstString(
      userLike.avatarUrl,
      userLike.avatar_url,
      typeof userLike.avatar === 'string' ? userLike.avatar : '',
      userLike.logoUrl,
      userLike.logo_url,
      typeof userLike.logo === 'string' ? userLike.logo : '',
      userLike.imageUrl,
      userLike.profileImage,
      userLike.profile_image,
      userLike.photoUrl,
      userLike.photo_url,
      userLike.authorAvatar,
      userLike.userAvatar,
      userLike.user_avatar,
      userLike.coverUrl,
      userLike.cover_url,
      typeof userLike.cover === 'string' ? userLike.cover : ''
    ),
    fileId: pickFirstString(
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
      userLike.logo?.fileId,
      userLike.logo?.file_id,
      userLike.logo?.id,
      userLike.cover?.fileId,
      userLike.cover?.file_id,
      userLike.avatar?.fileId,
      userLike.avatar?.file_id,
      userLike.avatar?.id
    ),
    storagePath: pickFirstString(
      userLike.storagePath,
      userLike.storage_path,
      userLike.storageKey,
      userLike.logo?.storagePath,
      userLike.logo?.storageKey,
      userLike.avatar?.storagePath,
      userLike.avatar?.storageKey
    ),
    fallbackUrl: userLike.fallbackUrl || userLike.fallback_url
  });
  if (composite.url) return composite.url;

  const fileId = String(composite.fileId || '').trim();
  if (fileId && looksLikeFileId(fileId)) {
    const fromFileId = resolvePostAttachmentMediaUrl({ fileId });
    if (fromFileId) return fromFileId;
  }

  return '';
};

/** Avatar pair for OptimizedImage dual-source rendering. */
export const resolveUserAvatarPair = (userLike: any) => {
  if (!userLike) return { url: '', fallbackUrl: '' };
  const descriptor = resolveMediaDescriptor({
    url: pickFirstString(
      userLike.avatarUrl,
      userLike.avatar_url,
      typeof userLike.avatar === 'string' ? userLike.avatar : '',
      userLike.logoUrl,
      userLike.logo_url,
      typeof userLike.logo === 'string' ? userLike.logo : ''
    ),
    fileId: pickFirstString(
      userLike.profilePhotoFileId,
      userLike.avatarFileId,
      userLike.logoFileId,
      userLike.logo?.fileId,
      userLike.avatar?.fileId
    ),
    storagePath: pickFirstString(userLike.storagePath, userLike.storageKey),
    fallbackUrl: userLike.fallbackUrl
  });
  const url = String(descriptor.url || resolveUserAvatarUrl(userLike) || '').trim();
  const fallbackUrl = String(descriptor.fallbackUrl || '').trim();
  return {
    url,
    fallbackUrl: fallbackUrl && fallbackUrl !== url ? fallbackUrl : ''
  };
};

export const resolveAssetUrlSafe = (value?: string | null) => resolveAssetUrl(value);
