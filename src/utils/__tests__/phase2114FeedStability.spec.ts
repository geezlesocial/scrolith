/**
 * Phase 21.1.4 — append-only session + soft-refresh isolation invariants.
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
