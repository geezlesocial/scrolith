import { resolveAssetUrl } from './assetUrl';
import { looksLikeFileId, resolveMediaDescriptor, resolvePostAttachmentMediaUrl } from './postAttachmentMedia';
import { resolveScrolithaAvatar } from './scrolithaIdentity';

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

  // Phase 20.10 — accept bare URL / file id strings (callers sometimes pass avatarUrl only).
  if (typeof userLike === 'string') {
    const raw = userLike.trim();
    if (!raw) return '';
    if (looksLikeFileId(raw)) {
      return resolvePostAttachmentMediaUrl({ fileId: raw }) || resolveAssetUrl(raw) || '';
    }
    return resolvePostAttachmentMediaUrl(raw) || resolveAssetUrl(raw) || '';
  }

  // Phase 20.7.9 — official Scrolitha system photo everywhere
  const scrolithaAvatar = resolveScrolithaAvatar(userLike);
  if (scrolithaAvatar) return scrolithaAvatar;

  // Prefer durable platform file ids first — they serve as public identity photos
  // without bearer tokens. Stale OAuth/GCS avatar strings often fail in <img>.
  const identityFileId = pickFirstString(
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
    typeof userLike.avatar === 'object' ? userLike.avatar?.fileId || userLike.avatar?.file_id || userLike.avatar?.id : '',
    typeof userLike.logo === 'object' ? userLike.logo?.fileId || userLike.logo?.file_id || userLike.logo?.id : ''
  );
  if (identityFileId && looksLikeFileId(identityFileId)) {
    const fromFileId = resolvePostAttachmentMediaUrl({ fileId: identityFileId });
    if (fromFileId) return fromFileId;
  }

  // Nested media objects (logo/cover/avatar with url + fileId + storagePath).
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

  // Composite descriptor from string identity fields.
  const composite = resolveMediaDescriptor({
    url: pickFirstString(
      typeof userLike.avatar === 'string' && String(userLike.avatar).includes('/api/files/content/')
        ? userLike.avatar
        : '',
      typeof userLike.avatarUrl === 'string' && String(userLike.avatarUrl).includes('/api/files/content/')
        ? userLike.avatarUrl
        : '',
      userLike.avatarUrl,
      userLike.avatar_url,
      typeof userLike.avatar === 'string' ? userLike.avatar : '',
      userLike.fallbackAvatar,
      userLike.fallback_avatar,
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
    fileId: identityFileId,
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
