import { FileVisibility } from '@prisma/client';
import prisma from './prismaClient';
import { syncFileUsages } from './fileUsage';

/**
 * Ensure a profile photo file id is publicly servable for bare <img> tags.
 * Best-effort: never throws to callers.
 */
export const ensurePublicIdentityPhoto = async (params: {
  userId?: string | null;
  profilePhotoFileId?: string | null;
  avatar?: string | null;
}) => {
  try {
    const photoId = String(params.profilePhotoFileId || '').trim();
    if (!photoId || photoId.toLowerCase().startsWith('disk:')) return null;

    const file = await prisma.file.findUnique({
      where: { id: photoId },
      select: { id: true, visibility: true, mimeType: true }
    });
    if (!file) return null;

    if (String(file.visibility || '').toUpperCase() !== FileVisibility.PUBLIC) {
      await prisma.file
        .update({
          where: { id: file.id },
          data: { visibility: FileVisibility.PUBLIC }
        })
        .catch(() => undefined);
    }

    const userId = String(params.userId || '').trim();
    if (userId) {
      await syncFileUsages('profile_photo', userId, [file.id], 'Profile Photo').catch(() => undefined);
      await syncFileUsages('user_avatar', userId, [file.id], 'User Avatar').catch(() => undefined);
    }

    return file.id;
  } catch {
    return null;
  }
};

/** Extract a file id from /api/files/content/<id> style avatar strings. */
export const extractFileIdFromAvatarRef = (avatar?: string | null) => {
  const raw = String(avatar || '').trim();
  if (!raw) return '';
  const match = raw.match(/\/api\/files\/content\/([^/?#]+)/i);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]).trim();
    } catch {
      return match[1].trim();
    }
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
    return raw;
  }
  return '';
};
