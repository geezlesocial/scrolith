/**
 * Phase 22.1 — messaging session stability (Phase 21 feed principles applied to inbox/thread).
 * Pure helpers — no network / React.
 */

export const MESSAGING_SESSION_STABILITY_VERSION = '22.1';

const idOf = <T extends { id?: string | null }>(item: T): string =>
  String((item as any)?.id || '').trim();

/**
 * Append-only thread merge: keep existing order; append only unseen ids.
 * Never reorders confirmed history.
 */
export const mergeThreadAppendOnly = <T extends { id?: string | null }>(
  existing: T[],
  incoming: T[]
): { merged: T[]; addedCount: number } => {
  const session = Array.isArray(existing) ? existing : [];
  const page = Array.isArray(incoming) ? incoming : [];
  const seen = new Set(session.map(idOf).filter(Boolean));
  const merged = [...session];
  let addedCount = 0;
  page.forEach((item) => {
    const id = idOf(item);
    if (!id || seen.has(id)) return;
    seen.add(id);
    merged.push(item);
    addedCount += 1;
  });
  return { merged, addedCount };
};

/**
 * Soft-refresh isolation for inbox: keep session order; collect genuinely new conversation ids.
 */
export const isolateInboxSoftRefresh = <T extends { id?: string | null }>(
  sessionItems: T[],
  refreshPage: T[]
): { sessionItems: T[]; pendingNewItems: T[]; pendingCount: number } => {
  const session = Array.isArray(sessionItems) ? sessionItems : [];
  const page = Array.isArray(refreshPage) ? refreshPage : [];
  const seen = new Set(session.map(idOf).filter(Boolean));
  const pendingNewItems: T[] = [];
  page.forEach((item) => {
    const id = idOf(item);
    if (!id || seen.has(id)) return;
    seen.add(id);
    pendingNewItems.push(item);
  });
  // In-place metadata refresh for overlapping ids without reordering.
  const byId = new Map(page.map((item) => [idOf(item), item] as const));
  const sessionItemsNext = session.map((item) => {
    const id = idOf(item);
    const next = id ? byId.get(id) : null;
    return next ? { ...item, ...next } : item;
  });
  return {
    sessionItems: sessionItemsNext,
    pendingNewItems,
    pendingCount: pendingNewItems.length
  };
};

/**
 * Merge inbox with optional controlled prepend of pending (user action).
 * Default apply=false keeps session head stable.
 */
export const applyPendingInboxItems = <T extends { id?: string | null }>(
  sessionItems: T[],
  pendingNewItems: T[]
): T[] => {
  const session = Array.isArray(sessionItems) ? sessionItems : [];
  const pending = Array.isArray(pendingNewItems) ? pendingNewItems : [];
  if (!pending.length) return session;
  const seen = new Set<string>();
  const merged: T[] = [];
  pending.forEach((item) => {
    const id = idOf(item);
    if (!id || seen.has(id)) return;
    seen.add(id);
    merged.push(item);
  });
  session.forEach((item) => {
    const id = idOf(item);
    if (!id || seen.has(id)) return;
    seen.add(id);
    merged.push(item);
  });
  return merged;
};

/** Fair round-robin drain order across conversation queues (FIFO within each). */
export const fairScheduleConversationQueues = <T extends { conversationId: string }>(
  items: T[]
): T[] => {
  const list = Array.isArray(items) ? items : [];
  const byConv = new Map<string, T[]>();
  list.forEach((item) => {
    const cid = String(item.conversationId || '').trim() || '_';
    const bucket = byConv.get(cid) || [];
    bucket.push(item);
    byConv.set(cid, bucket);
  });
  const queues = Array.from(byConv.values());
  const result: T[] = [];
  let progress = true;
  while (progress) {
    progress = false;
    for (const q of queues) {
      if (!q.length) continue;
      result.push(q.shift() as T);
      progress = true;
    }
  }
  return result;
};
