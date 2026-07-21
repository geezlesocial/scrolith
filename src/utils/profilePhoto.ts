/**
 * Phase 21.1.2R — canonical profile photo candidate resolution.
 * Initials are a fallback only; never treat invalid values as photos.
 */

import { resolveUserAvatarUrl } from './userAvatar';
import { SafeText } from './safeRender';

const INVALID_LITERALS = new Set(['', 'null', 'undefined', '[object object]', 'none', 'n/a', 'na', '-']);

export const isUsablePhotoCandidate = (value: unknown): value is string => {
  if (value == null) return false;
  if (typeof value === 'number' || typeof value === 'boolean') return false;
  if (typeof value === 'object') return false;
  const text = String(value).trim();
  if (!text) return false;
  if (INVALID_LITERALS.has(text.toLowerCase())) return false;
  if (text === '{}' || text === '[]') return false;
  // Reject pure whitespace / obvious non-URLs that are only punctuation
  if (/^[{}[\](),.;:]+$/.test(text)) return false;
  return true;
};

const pushCandidate = (out: string[], seen: Set<string>, raw: unknown) => {
  if (!isUsablePhotoCandidate(raw)) return;
  const text = String(raw).trim();
  if (seen.has(text)) return;
  // Prefer resolved absolute/content URLs when possible
  let resolved = '';
  try {
    resolved = resolveUserAvatarUrl(text) || text;
  } catch {
    resolved = text;
  }
  if (!isUsablePhotoCandidate(resolved)) return;
  if (seen.has(resolved)) return;
  seen.add(text);
  seen.add(resolved);
  out.push(resolved);
};

/**
 * Ordered photo candidates for a user-like entity or explicit src.
 * Does not invent ui-avatars or placeholders — empty list means use initials.
 */
export const resolveProfilePhotoCandidates = (input?: {
  user?: any;
  src?: string | null;
  name?: string | null;
}): string[] => {
  const user = input?.user;
  const src = input?.src;
  const out: string[] = [];
  const seen = new Set<string>();

  pushCandidate(out, seen, src);

  if (user && typeof user === 'object') {
    // Prefer file-id based content URLs first (most reliable for uploaded photos).
    const fileIds = [
      user.profilePhotoFileId,
      user.profile_photo_file_id,
      user.avatarFileId,
      user.avatar_file_id,
      user.clientProfilePhotoFileId,
      user.freelancerProfilePhotoFileId
    ];
    for (const fileId of fileIds) {
      if (!fileId) continue;
      try {
        pushCandidate(out, seen, resolveUserAvatarUrl({ profilePhotoFileId: fileId }));
        pushCandidate(out, seen, resolveUserAvatarUrl(String(fileId)));
      } catch {
        // ignore
      }
    }

    const directKeys = [
      user.avatarUrl,
      user.avatar_url,
      typeof user.avatar === 'string' ? user.avatar : null,
      user.profilePhotoUrl,
      user.profile_photo_url,
      user.profilePhoto,
      user.profile_photo,
      user.profileImage,
      user.profile_image,
      user.photoURL,
      user.photoUrl,
      user.photo_url,
      user.imageUrl,
      user.image_url,
      typeof user.image === 'string' ? user.image : null,
      user.logoUrl,
      user.logo_url,
      typeof user.logo === 'string' ? user.logo : null,
      user.userAvatar,
      user.user_avatar,
      user.authorAvatar
    ];
    for (const key of directKeys) pushCandidate(out, seen, key);

    // Nested media objects via resolveUserAvatarUrl (fileId + url)
    try {
      const resolved = resolveUserAvatarUrl(user);
      pushCandidate(out, seen, resolved);
    } catch {
      // ignore
    }

    // Nested objects with url/fileId
    for (const nest of [user.avatar, user.logo, user.image, user.profilePhoto, user.cover]) {
      if (nest && typeof nest === 'object') {
        pushCandidate(out, seen, (nest as any).url);
        pushCandidate(out, seen, (nest as any).src);
        pushCandidate(out, seen, (nest as any).href);
        try {
          pushCandidate(out, seen, resolveUserAvatarUrl(nest));
        } catch {
          // ignore
        }
      }
    }
  } else if (typeof user === 'string') {
    pushCandidate(out, seen, user);
  }

  // Bare src as userLike string resolution
  if (src && !out.length) {
    try {
      pushCandidate(out, seen, resolveUserAvatarUrl(src));
    } catch {
      // ignore
    }
  }

  return out;
};

/** First usable candidate, or empty string. */
export const resolveProfilePhotoCandidate = (input?: {
  user?: any;
  src?: string | null;
}): string => resolveProfilePhotoCandidates(input)[0] || '';

export const profilePhotoDebugLabel = (candidates: string[], loaded: boolean, failedAll: boolean) => {
  if (loaded) return 'photo';
  if (failedAll || !candidates.length) return 'initials';
  return 'loading';
};

export const hasMeaningfulAvatarName = (name: unknown): boolean => {
  const text = SafeText(name, '').trim();
  return Boolean(text) && text.toLowerCase() !== 'member' && text.toLowerCase() !== 'user';
};
