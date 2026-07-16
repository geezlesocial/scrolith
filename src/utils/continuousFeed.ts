/**
 * Continuous mixed-feed orchestration helpers for member-home and /community.
 * Pure utilities — no React, network, or media URL rewriting.
 * Media URLs must still go through resolvePostAttachmentMediaUrl / resolveAssetUrl.
 */

export type FeedSourceType =
  | 'post'
  | 'page_post'
  | 'job'
  | 'gig'
  | 'listing'
  | 'ad'
  | 'recommendation'
  | 'person'
  | 'page'
  | 'story'
  | 'scroll'
  | 'event'
  | 'discussion'
  | 'featured'
  | string;

export type ContinuousFeedKey = string;

export const buildFeedEntityKey = (sourceType: FeedSourceType, sourceId: string | null | undefined): ContinuousFeedKey => {
  const type = String(sourceType || 'item').trim().toLowerCase() || 'item';
  const id = String(sourceId || '').trim();
  if (!id) return '';
  return `${type}:${id}`;
};

export const extractEntityKeyFromItem = (item: any): ContinuousFeedKey => {
  if (!item || typeof item !== 'object') return '';
  const explicit = String(item.feedKey || item.entityKey || '').trim();
  if (explicit) return explicit;
  const sourceType =
    item.sourceType ||
    item.itemType ||
    item.type ||
    item.kind ||
    (item.postId || item.post_id ? 'post' : '') ||
    'item';
  const sourceId =
    item.sourceId ||
    item.entityId ||
    item.entity_id ||
    item.id ||
    item.postId ||
    item.post_id ||
    item.jobId ||
    item.gigId ||
    item.listingId ||
    '';
  return buildFeedEntityKey(String(sourceType), String(sourceId));
};

/**
 * Merge stream pages with stable sourceType+sourceId keys.
 * Returns how many unique rows were newly added.
 */
export const mergeContinuousFeedItems = <T>(
  existing: T[],
  incoming: T[],
  options?: { getKey?: (item: T) => string }
): { merged: T[]; addedCount: number; keys: Set<string> } => {
  const getKey = options?.getKey || ((item: T) => extractEntityKeyFromItem(item));
  const keys = new Set<string>();
  const merged: T[] = [];

  const pushUnique = (item: T) => {
    const key = getKey(item);
    const plainId = String((item as any)?.id || '').trim();
    if (key && keys.has(key)) return false;
    if (plainId && keys.has(`id:${plainId}`)) return false;
    if (key) keys.add(key);
    if (plainId) keys.add(`id:${plainId}`);
    merged.push(item);
    return true;
  };

  (Array.isArray(existing) ? existing : []).forEach((item) => {
    pushUnique(item);
  });

  let addedCount = 0;
  (Array.isArray(incoming) ? incoming : []).forEach((item) => {
    if (pushUnique(item)) addedCount += 1;
  });

  return { merged, addedCount, keys };
};

/**
 * Diversity-aware interleave: avoid long runs of the same source type / author.
 * Does not invent items — only reorders a finite batch.
 */
export const interleaveForDiversity = <T>(
  items: T[],
  options?: {
    getType?: (item: T) => string;
    getAuthor?: (item: T) => string;
    maxConsecutiveSameType?: number;
    maxConsecutiveSameAuthor?: number;
  }
): T[] => {
  const list = Array.isArray(items) ? [...items] : [];
  if (list.length <= 2) return list;

  const getType = options?.getType || ((item: T) => String((item as any)?.type || (item as any)?.sourceType || 'item'));
  const getAuthor =
    options?.getAuthor ||
    ((item: T) =>
      String(
        (item as any)?.authorId ||
          (item as any)?.authorUserId ||
          (item as any)?.author?.id ||
          (item as any)?.userId ||
          ''
      ));
  const maxType = Math.max(1, Number(options?.maxConsecutiveSameType || 2));
  const maxAuthor = Math.max(1, Number(options?.maxConsecutiveSameAuthor || 2));

  const result: T[] = [];
  const remaining = [...list];

  while (remaining.length) {
    let pickedIndex = 0;
    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i];
      const type = getType(candidate);
      const author = getAuthor(candidate);
      let sameTypeRun = 0;
      let sameAuthorRun = 0;
      for (let j = result.length - 1; j >= 0; j -= 1) {
        if (getType(result[j]) === type) sameTypeRun += 1;
        else break;
      }
      for (let j = result.length - 1; j >= 0; j -= 1) {
        const prevAuthor = getAuthor(result[j]);
        if (author && prevAuthor && prevAuthor === author) sameAuthorRun += 1;
        else break;
      }
      if (sameTypeRun < maxType && sameAuthorRun < maxAuthor) {
        pickedIndex = i;
        break;
      }
      // Prefer any candidate that breaks the run; keep scanning.
      if (i === remaining.length - 1) pickedIndex = 0;
    }
    result.push(remaining.splice(pickedIndex, 1)[0]);
  }

  return result;
};

export const extractHasMore = (payload: any): boolean | null => {
  const candidates = [
    payload?.data?.data?.hasMore,
    payload?.data?.data?.has_more,
    payload?.data?.hasMore,
    payload?.data?.has_more,
    payload?.hasMore,
    payload?.has_more,
    payload?.pagination?.hasMore,
    payload?.pagination?.has_more
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'boolean') return candidate;
    if (candidate === 'true') return true;
    if (candidate === 'false') return false;
  }
  return null;
};

/**
 * Terminal only when every active source is exhausted and the last page
 * produced no unique progress (and has no forward cursor).
 */
export const resolveFeedTerminalState = (params: {
  nextCursor: string | null | undefined;
  hasMoreFlag?: boolean | null;
  uniqueAddedCount: number;
  offsetFallbackEnabled?: boolean;
  secondarySourcesRemaining?: boolean;
}): { canContinue: boolean; isTerminal: boolean } => {
  const cursor = String(params.nextCursor || '').trim();
  const hasMoreFlag = params.hasMoreFlag;
  const offsetOn = Boolean(params.offsetFallbackEnabled);
  const secondary = Boolean(params.secondarySourcesRemaining);

  if (cursor) return { canContinue: true, isTerminal: false };
  if (hasMoreFlag === true) return { canContinue: true, isTerminal: false };
  if (offsetOn && params.uniqueAddedCount > 0) return { canContinue: true, isTerminal: false };
  if (secondary) return { canContinue: true, isTerminal: false };
  if (params.uniqueAddedCount > 0 && hasMoreFlag !== false) {
    // Soft progress without explicit cursor — allow one more attempt only if hasMore unknown
    return { canContinue: hasMoreFlag == null, isTerminal: hasMoreFlag === false };
  }
  return { canContinue: false, isTerminal: true };
};

/**
 * Guard against empty-page request storms: after N consecutive zero-add pages, stop.
 */
export const shouldHaltEmptyPageLoop = (consecutiveEmptyPages: number, maxEmpty = 2): boolean =>
  Number(consecutiveEmptyPages || 0) >= Math.max(1, maxEmpty);
