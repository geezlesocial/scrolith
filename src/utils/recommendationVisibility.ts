type RecommendationRecord = Record<string, any>;

const asRecord = (value: unknown): RecommendationRecord =>
  value && typeof value === 'object' ? (value as RecommendationRecord) : {};

export const recommendationEntity = (value: unknown): RecommendationRecord => {
  const source = asRecord(value);
  return asRecord(source.account || source.user || source.page || source);
};

export const recommendationId = (value: unknown): string => {
  const source = asRecord(value);
  const entity = recommendationEntity(value);
  return String(
    entity.id ||
      source.entityId ||
      source.entity_id ||
      source.userId ||
      source.user_id ||
      source.pageId ||
      source.page_id ||
      ''
  ).trim();
};

const booleanValue = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return undefined;
};

export const recommendationIsFollowing = (value: unknown): boolean => {
  const source = asRecord(value);
  const entity = recommendationEntity(value);
  return Boolean(
    [
      source.isFollowing,
      source.is_following,
      entity.isFollowing,
      entity.is_following,
      source.viewer?.isFollowing,
      source.viewer?.is_following
    ]
      .map(booleanValue)
      .find((entry) => entry !== undefined)
  );
};

export const filterUnfollowedRecommendations = <T>(
  values: T[],
  isFollowing: (value: T) => boolean = recommendationIsFollowing
): T[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = recommendationId(value);
    if (!id || seen.has(id) || isFollowing(value)) return false;
    seen.add(id);
    return true;
  });
};
