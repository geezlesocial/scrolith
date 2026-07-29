const STORY_INACTIVE_STATES = new Set([
  'deleted',
  'removed',
  'archived',
  'expired',
  'inactive',
  'disabled'
]);

export const resolveStoryIdentity = (story: any): string => {
  return String(story?.id || story?.storyId || story?.sourceId || story?.source_id || '').trim();
};

const resolveStoryExpiry = (story: any): number | null => {
  const raw =
    story?.expiresAt ||
    story?.expires_at ||
    story?.expirationAt ||
    story?.expiration_at ||
    story?.expires ||
    story?.validUntil ||
    story?.valid_until;
  if (!raw) return null;
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

export const isExistingActiveStory = (story: any, now = Date.now()): boolean => {
  if (!story || typeof story !== 'object') return false;
  if (!resolveStoryIdentity(story)) return false;
  if (story.deletedAt || story.deleted_at || story.removedAt || story.removed_at) return false;
  const status = String(story.status || story.state || story.lifecycle || '').trim().toLowerCase();
  if (status && STORY_INACTIVE_STATES.has(status)) return false;
  const expiresAt = resolveStoryExpiry(story);
  return expiresAt == null || expiresAt > now;
};

export const filterExistingActiveStories = <T = any>(stories: T[], now = Date.now()): T[] => {
  return (Array.isArray(stories) ? stories : []).filter((story) => isExistingActiveStory(story, now));
};

export const findExistingActiveStoryById = <T = any>(
  stories: T[],
  storyId: string | null | undefined,
  now = Date.now()
): T | null => {
  const id = String(storyId || '').trim();
  if (!id) return null;
  return (
    (Array.isArray(stories) ? stories : []).find(
      (story) => isExistingActiveStory(story, now) && resolveStoryIdentity(story) === id
    ) || null
  );
};
