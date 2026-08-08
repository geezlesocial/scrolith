import { FileVisibility } from '@prisma/client';
import prisma from './prismaClient';
import { syncFileUsages } from './fileUsage';

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

const publicizeFile = async (fileId: string, userId?: string | null) => {
  await prisma.file
    .update({
      where: { id: fileId },
      data: { visibility: FileVisibility.PUBLIC }
    })
    .catch(() => undefined);
  const uid = String(userId || '').trim();
  if (uid) {
    await syncFileUsages('profile_photo', uid, [fileId], 'Profile Photo').catch(() => undefined);
    await syncFileUsages('user_avatar', uid, [fileId], 'User Avatar').catch(() => undefined);
  }
};

/**
 * Find a usable image File for this user when profilePhotoFileId is dangling.
 * Prefers files already tagged as profile_photo / user_avatar, then newest image.
 */
export const findAlternateIdentityPhotoFile = async (userId: string) => {
  const uid = String(userId || '').trim();
  if (!uid) return null;

  const usage = await prisma.fileUsage
    .findFirst({
      where: {
        usageId: uid,
        usageType: { in: ['profile_photo', 'user_avatar'] },
        file: { mimeType: { startsWith: 'image/' } }
      },
      orderBy: { createdAt: 'desc' },
      select: { fileId: true, file: { select: { id: true, visibility: true, mimeType: true } } }
    })
    .catch(() => null);
  if (usage?.file?.id) return usage.file;

  return prisma.file
    .findFirst({
      where: {
        ownerId: uid,
        mimeType: { startsWith: 'image/' }
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, visibility: true, mimeType: true }
    })
    .catch(() => null);
};

/**
 * Ensure a profile photo file id is publicly servable for bare <img> tags.
 * If the referenced File row is missing, retarget the user to an alternate
 * owned image (common after storage GC) and publicize it.
 * Best-effort: never throws to callers.
 */
export const ensurePublicIdentityPhoto = async (params: {
  userId?: string | null;
  profilePhotoFileId?: string | null;
  avatar?: string | null;
  /** When true, rewrite user.profilePhotoFileId/avatar if we retarget. */
  retargetUser?: boolean;
}) => {
  try {
    const userId = String(params.userId || '').trim();
    let photoId =
      String(params.profilePhotoFileId || '').trim() ||
      extractFileIdFromAvatarRef(params.avatar);

    if (photoId && photoId.toLowerCase().startsWith('disk:')) {
      photoId = '';
    }

    let file = photoId
      ? await prisma.file
          .findUnique({
            where: { id: photoId },
            select: { id: true, visibility: true, mimeType: true }
          })
          .catch(() => null)
      : null;

    // Dangling profilePhotoFileId (File GC'd) — adopt another image the user still owns.
    if (!file && userId) {
      file = await findAlternateIdentityPhotoFile(userId);
      if (file?.id && params.retargetUser !== false) {
        const contentPath = `/api/files/content/${encodeURIComponent(file.id)}`;
        await prisma.user
          .update({
            where: { id: userId },
            data: {
              profilePhotoFileId: file.id,
              // Keep absolute-or-path content ref so clients resolve consistently.
              avatar: contentPath
            }
          })
          .catch(() => undefined);
        console.warn('ensurePublicIdentityPhoto retargeted dangling profile photo', {
          userId,
          from: photoId || null,
          to: file.id
        });
      }
    }

    if (!file?.id) return null;

    await publicizeFile(file.id, userId || null);
    return file.id;
  } catch {
    return null;
  }
};

/** Build absolute content URL for an identity file id. */
export const buildIdentityContentUrl = (fileId: string, baseUrl?: string) => {
  const id = String(fileId || '').trim();
  if (!id) return '';
  const base = String(baseUrl || '').replace(/\/+$/, '') || 'https://api.scrolith.com';
  return `${base}/api/files/content/${encodeURIComponent(id)}`;
};
