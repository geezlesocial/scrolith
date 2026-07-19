/**
 * Phase 21.1.4 — append-only session + soft-refresh isolation invariants.
 * Includes video-reproduction simulation of visible-index identity swap.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyPendingNewItems,
  assertStableRelativeOrder,
  detectDestructiveReplacement,
  FEED_SESSION_STABILITY_VERSION,
  isolateSoftRefreshPage,
  mergeAppendOnly,
  updateItemInPlace
} from '../feedSessionStability';
import { mergeUniqueFeedItems } from '../feedPagination';
import { mergeStreamEntries, type FeedStreamEntry } from '../feedStream';

test('FEED_SESSION_STABILITY_VERSION is 21.1.4', () => {
  assert.equal(FEED_SESSION_STABILITY_VERSION, '21.1.4');
});

test('mergeAppendOnly preserves existing order and appends only new ids', () => {
  const existing = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const incoming = [{ id: 'b' }, { id: 'd' }, { id: 'e' }];
  const { merged, addedCount } = mergeAppendOnly(existing, incoming);
  assert.deepEqual(
    merged.map((i) => i.id),
    ['a', 'b', 'c', 'd', 'e']
  );
  assert.equal(addedCount, 2);
  assert.equal(assertStableRelativeOrder(existing, merged), true);
});

test('soft refresh isolation does not reorder session', () => {
  const session = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  // Server re-ranked first page: x, y, a, b
  const refreshPage = [{ id: 'x' }, { id: 'y' }, { id: 'a' }, { id: 'b' }];
  const result = isolateSoftRefreshPage(session, refreshPage);
  assert.deepEqual(
    result.sessionItems.map((i) => i.id),
    ['a', 'b', 'c']
  );
  assert.deepEqual(
    result.pendingNewItems.map((i) => i.id),
    ['x', 'y']
  );
  assert.equal(detectDestructiveReplacement(session, result.sessionItems), false);
});

test('destructive replacement detector catches old soft-merge bug pattern', () => {
  const before = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];
  // Old bug: mergeUniqueFeedItems(newFirstPage, existing) puts re-ranked page first
  const after = [{ id: 'x' }, { id: 'y' }, { id: 'z' }, { id: 'a' }, { id: 'b' }];
  assert.equal(detectDestructiveReplacement(before, after), true);
});

test('applyPendingNewItems prepends without losing relative session order', () => {
  const session = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const pending = [{ id: 'x' }, { id: 'y' }];
  const { merged, addedCount } = applyPendingNewItems(session, pending);
  assert.equal(addedCount, 2);
  assert.deepEqual(
    merged.map((i) => i.id),
    ['x', 'y', 'a', 'b', 'c']
  );
  assert.equal(assertStableRelativeOrder(session, merged), true);
});

test('updateItemInPlace does not move card index', () => {
  const items = [
    { id: 'a', likes: 1 },
    { id: 'b', likes: 2 },
    { id: 'c', likes: 3 }
  ];
  const next = updateItemInPlace(items, 'b', { likes: 99 });
  assert.equal(next[1].id, 'b');
  assert.equal((next[1] as any).likes, 99);
  assert.equal(next[0].id, 'a');
  assert.equal(next[2].id, 'c');
});

test('stream merge append-only preserves keys subsequence', () => {
  const existing: FeedStreamEntry[] = [
    { key: 'post:a', kind: 'post', type: 'POST', post: { id: 'a' }, raw: {}, data: {} },
    { key: 'post:b', kind: 'post', type: 'POST', post: { id: 'b' }, raw: {}, data: {} }
  ];
  const incoming: FeedStreamEntry[] = [
    { key: 'post:c', kind: 'post', type: 'POST', post: { id: 'c' }, raw: {}, data: {} },
    { key: 'person:p1', kind: 'person', type: 'PERSON', post: null, raw: {}, data: { id: 'p1' } }
  ];
  const { merged, addedCount } = mergeStreamEntries(existing, incoming);
  assert.equal(addedCount, 2);
  assert.deepEqual(
    merged.map((e) => e.key),
    ['post:a', 'post:b', 'post:c', 'person:p1']
  );
});

/**
 * Video reproduction artifact simulation (Member Home soft-refresh morph):
 * User is reading progressive window index 2 (id=c). Scroll position fixed.
 * Soft refresh returns re-ranked first page. Old bug swapped identity at index 2.
 *
 * Source (pre-fix): MemberHomeSection.loadFeed orchestrated soft path used
 * mergeUniqueFeedItems(normalizedFirstPage, existingSession).
 */
test('VIDEO REPRO: old soft-merge swaps identity at fixed progressive index', () => {
  const session = [
    { id: 'post-author-A', key: 'post:post-author-A' },
    { id: 'post-author-B', key: 'post:post-author-B' },
    { id: 'post-author-C', key: 'post:post-author-C' },
    { id: 'post-author-D', key: 'post:post-author-D' },
    { id: 'post-author-E', key: 'post:post-author-E' }
  ];
  const readingIndex = 2;
  const beforeId = session[readingIndex].id;
  const beforeKey = session[readingIndex].key;

  // Server soft-refresh first page (re-ranked personalization)
  const refreshPage = [
    { id: 'reco-person-X', key: 'person:reco-person-X' },
    { id: 'post-author-Z', key: 'post:post-author-Z' },
    { id: 'post-author-Y', key: 'post:post-author-Y' },
    { id: 'post-author-A', key: 'post:post-author-A' },
    { id: 'post-author-B', key: 'post:post-author-B' }
  ];

  // OLD BUG PATH (arguments inverted relative to session-first semantics)
  const buggy = mergeUniqueFeedItems(refreshPage, session).merged;
  assert.notEqual(buggy[readingIndex].id, beforeId);
  assert.equal(detectDestructiveReplacement(session, buggy), true);

  // FIXED PATH — isolate soft refresh
  const fixed = isolateSoftRefreshPage(session, refreshPage);
  assert.equal(fixed.sessionItems[readingIndex].id, beforeId);
  assert.equal(fixed.sessionItems[readingIndex].key, beforeKey);
  assert.deepEqual(
    fixed.sessionItems.map((i) => i.id),
    session.map((i) => i.id)
  );
  // New recommendations are pending, not injected into the reading window
  assert.ok(fixed.pendingNewItems.some((i) => i.id === 'reco-person-X'));
  assert.ok(fixed.pendingNewItems.some((i) => i.id === 'post-author-Z'));
  assert.equal(assertStableRelativeOrder(session, fixed.sessionItems), true);
});

test('VIDEO REPRO: progressive window slice identity stable after soft isolation', () => {
  const session = Array.from({ length: 12 }, (_, i) => ({
    id: `id-${i}`,
    key: `post:id-${i}`
  }));
  const renderedCount = 8;
  const beforeWindow = session.slice(0, renderedCount).map((i) => i.id);

  const refresh = [
    { id: 'new-0', key: 'post:new-0' },
    { id: 'new-1', key: 'post:new-1' },
    ...session.slice(0, 6)
  ];
  const soft = isolateSoftRefreshPage(session, refresh);
  const afterWindow = soft.sessionItems.slice(0, renderedCount).map((i) => i.id);
  assert.deepEqual(afterWindow, beforeWindow);
});
