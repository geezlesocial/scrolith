/**
 * Shared feed pagination helpers for member-home and community continuous scroll.
 * Pure utilities only — no network or React state.
 */

export const extractNextCursor = (payload: any): string | null => {
  const candidates = [
    payload?.data?.data?.nextCursor,
    payload?.data?.data?.next_cursor,
    payload?.data?.nextCursor,
    payload?.data?.next_cursor,
    payload?.nextCursor,
    payload?.next_cursor,
    payload?.cursor?.next,
    payload?.pagination?.nextCursor,
    payload?.pagination?.next_cursor
  ];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }
  return null;
};

export const extractFeedItemList = (value: any): any[] => {
  if (Array.isArray(value?.data?.data?.items)) return value.data.data.items;
  if (Array.isArray(value?.data?.data?.posts)) return value.data.data.posts;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.posts)) return value.posts;
  if (Array.isArray(value?.data?.items)) return value.data.items;
  if (Array.isArray(value?.data?.posts)) return value.data.posts;
  if (Array.isArray(value?.data?.data)) return value.data.data;
  if (Array.isArray(value?.data)) return value.data;
  return Array.isArray(value) ? value : [];
};

export const getStableFeedItemId = (item: any): string => {
  if (!item || typeof item !== 'object') return '';
  const typeHint = String(item?.type || item?.itemType || item?.kind || 'item').trim().toLowerCase() || 'item';
  const id = String(
    item?.id ||
      item?.postId ||
      item?.post_id ||
      item?.entityId ||
      item?.entity_id ||
      item?.jobId ||
      item?.gigId ||
      ''
  ).trim();
  if (!id) return '';
  return `${typeHint}:${id}`;
};

/**
 * Append incoming rows, dropping duplicates by stable type+id (or plain id).
 * Returns the merged list and how many new unique rows were added.
 */
export const mergeUniqueFeedItems = <T extends { id?: string | null }>(
  existing: T[],
  incoming: T[],
  options?: { useTypedKeys?: boolean }
): { merged: T[]; addedCount: number } => {
  const useTypedKeys = Boolean(options?.useTypedKeys);
  const seen = new Set<string>();
  const merged: T[] = [];

  const remember = (item: T) => {
    const typed = useTypedKeys ? getStableFeedItemId(item) : '';
    const plain = String(item?.id || '').trim();
    const key = typed || plain;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    if (plain) seen.add(plain);
    merged.push(item);
    return true;
  };

  (Array.isArray(existing) ? existing : []).forEach((item) => {
    remember(item);
  });

  let addedCount = 0;
  (Array.isArray(incoming) ? incoming : []).forEach((item) => {
    if (remember(item)) addedCount += 1;
  });

  return { merged, addedCount };
};

/**
 * Offset fallback continues only when the last page returned a full batch of items
 * (before or after normalize) and the API did not provide a cursor.
 */
export const shouldContinueOffsetFallback = (params: {
  usedOffsetFallback: boolean;
  nextCursor: string | null;
  pageItemCount: number;
  pageSize: number;
  uniqueAddedCount: number;
}): boolean => {
  if (!params.usedOffsetFallback) return false;
  if (params.nextCursor) return false;
  if (params.uniqueAddedCount <= 0) return false;
  return params.pageItemCount >= params.pageSize;
};
