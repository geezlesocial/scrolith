import { UserService } from '../services/user';
import { resolvePostAttachmentMediaUrl } from './postAttachmentMedia';
import { resolveUserAvatarUrl } from './userAvatar';

type HydratedStoryAuthor = {
  id?: string;
  name?: string;
  username?: string;
  avatarUrl?: string;
  profilePhotoFileId?: string;
};

const authorCache = new Map<string, Promise<HydratedStoryAuthor | null>>();

const pickFirstString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
};

const normalizeLookupToken = (value: unknown) => String(value || '').trim().replace(/^@+/, '').toLowerCase();

const safeUsernameCandidate = (value: unknown) => {
  const normalized = String(value || '').trim().replace(/^@+/, '');
  if (!normalized || normalized.includes(' ')) return '';
  return /^[a-z0-9_.-]{3,40}$/i.test(normalized) ? normalized : '';
};

const resolveProfilePhotoFileId = (value: any) =>
  pickFirstString(
    value?.profilePhotoFileId,
    value?.profile_photo_file_id,
    value?.avatarFileId,
    value?.avatar_file_id,
    value?.authorAvatarFileId,
    value?.author_avatar_file_id
  );

const resolveHydratedAuthor = (profile: any): HydratedStoryAuthor | null => {
  if (!profile || typeof profile !== 'object') return null;
  const profilePhotoFileId = resolveProfilePhotoFileId(profile);
  const avatarUrl =
    resolveUserAvatarUrl({
      ...profile,
      profilePhotoFileId,
      profile_photo_file_id: profilePhotoFileId
    }) || (profilePhotoFileId ? resolvePostAttachmentMediaUrl({ fileId: profilePhotoFileId }) : '');

  return {
    id: pickFirstString(profile.id, profile.userId, profile.user_id),
    name: pickFirstString(profile.name, profile.displayName, profile.display_name, profile.username),
    username: pickFirstString(profile.username, profile.userName, profile.user_name),
    avatarUrl,
    profilePhotoFileId
  };
};

const resolveViewerAuthor = (story: any, viewer?: any): HydratedStoryAuthor | null => {
  if (!story || !viewer) return null;
  const storyTokens = [
    story?.authorId,
    story?.userId,
    story?.user_id,
    story?.author?.id,
    story?.authorUsername,
    story?.author?.username,
    story?.userName,
    story?.user_name,
    story?.authorName,
    story?.author?.name,
    story?.author?.displayName
  ].map(normalizeLookupToken).filter(Boolean);
  const viewerTokens = [
    viewer?.id,
    viewer?.user_id,
    viewer?.username,
    viewer?.user_name,
    viewer?.name,
    viewer?.email
  ].map(normalizeLookupToken).filter(Boolean);
  if (!storyTokens.length || !storyTokens.some((token) => viewerTokens.includes(token))) return null;
  return resolveHydratedAuthor(viewer);
};

const fetchAuthorByStory = (story: any): Promise<HydratedStoryAuthor | null> => {
  const authorId = pickFirstString(story?.authorId, story?.userId, story?.user_id, story?.author?.id);
  const explicitUsername = pickFirstString(
    story?.authorUsername,
    story?.author?.username,
    story?.user?.username,
    story?.owner?.username,
    story?.creator?.username,
    story?.createdBy?.username,
    story?.account?.username,
    story?.userName,
    story?.user_name
  ).replace(/^@+/, '');
  const username =
    explicitUsername ||
    safeUsernameCandidate(story?.authorName) ||
    safeUsernameCandidate(story?.author?.name) ||
    safeUsernameCandidate(story?.user?.name);
  const cacheKey = authorId ? `id:${authorId}` : username ? `username:${username.toLowerCase()}` : '';
  if (!cacheKey) return Promise.resolve(null);
  const cached = authorCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    try {
      if (authorId) {
        const profile = await UserService.getUserBasic(authorId);
        const hydrated = resolveHydratedAuthor(profile);
        if (hydrated?.avatarUrl || hydrated?.profilePhotoFileId) return hydrated;
      }
    } catch {
      // Fall back to username lookup below when available.
    }
    if (username) {
      try {
        return resolveHydratedAuthor(await UserService.getUserByUsername(username));
      } catch {
        return null;
      }
    }
    return null;
  })();

  authorCache.set(cacheKey, promise);
  return promise;
};

export const mergeStoryAuthorAvatar = (story: any, author: HydratedStoryAuthor | null) => {
  if (!story || !author) return story;
  const avatarUrl = pickFirstString(author.avatarUrl);
  const profilePhotoFileId = pickFirstString(author.profilePhotoFileId);
  if (!avatarUrl && !profilePhotoFileId) return story;

  return {
    ...story,
    authorId: pickFirstString(story.authorId, story.userId, story.user_id, story.author?.id, author.id),
    authorName: pickFirstString(story.authorName, story.author?.name, author.name, author.username),
    authorUsername: pickFirstString(story.authorUsername, story.author?.username, author.username),
    authorAvatar: avatarUrl || story.authorAvatar,
    authorAvatarFileId: profilePhotoFileId || story.authorAvatarFileId,
    author: {
      ...(story.author || {}),
      id: pickFirstString(story.author?.id, story.authorId, author.id),
      name: pickFirstString(story.author?.name, story.authorName, author.name, author.username),
      username: pickFirstString(story.author?.username, story.authorUsername, author.username),
      avatarUrl: avatarUrl || story.author?.avatarUrl || story.authorAvatar,
      avatar: avatarUrl || story.author?.avatar || story.authorAvatar,
      profilePhotoFileId: profilePhotoFileId || story.author?.profilePhotoFileId || story.authorAvatarFileId,
      profile_photo_file_id: profilePhotoFileId || story.author?.profile_photo_file_id,
      avatarFileId: profilePhotoFileId || story.author?.avatarFileId,
      avatar_file_id: profilePhotoFileId || story.author?.avatar_file_id
    }
  };
};

export const hydrateStoryAuthorAvatar = async (story: any, viewer?: any) => {
  const viewerAuthor = resolveViewerAuthor(story, viewer);
  const fetchedAuthor = await fetchAuthorByStory(story);
  return mergeStoryAuthorAvatar(story, fetchedAuthor || viewerAuthor);
};

export const hydrateStoryAuthorAvatars = async (stories: any[], viewer?: any) => {
  if (!Array.isArray(stories) || !stories.length) return [];
  return Promise.all(stories.map((story) => hydrateStoryAuthorAvatar(story, viewer)));
};
