import { resolveAssetUrl } from './assetUrl';
import { resolvePostAttachmentMediaUrl } from './postAttachmentMedia';

const pickFirstString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
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
    userLike.avatarFileId,
    userLike.avatar_file_id,
    userLike.authorAvatarFileId,
    userLike.userAvatarFileId
  );

  const resolved = resolvePostAttachmentMediaUrl({ url: directUrl, fileId });
  if (resolved) return resolved;
  if (directUrl) return resolveAssetUrl(directUrl);
  if (fileId) return resolvePostAttachmentMediaUrl({ fileId });
  return '';
};
