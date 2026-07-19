/**
 * Phase 21.1.7 — WebKit feed identity invariants (pure helpers).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trimFeedForMemory } from '../enterpriseFeedEngine';
import { mergeStreamEntries, type FeedStreamEntry } from '../feedStream';
import { isolateStreamSoftRefresh } from '../feedSessionStability';
import { firstPostIdFromStream, firstPostKeyFromStream } from '../feedIdentityDebug';

const post = (id: string): FeedStreamEntry => ({
  key: `POST:${id}`,
  kind: 'post',
  type: 'POST',
  post: { id },
  raw: { id },
  data: { id }
});

test('trim preserves session head (reading window)', () => {
  const items = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}` }));
  const trimmed = trimFeedForMemory(items, 25);
  assert.equal(trimmed.length, 25);
  assert.equal(trimmed[0].id, 'p0');
  assert.equal(trimmed[24].id, 'p24');
});

test('mergeStreamEntries over maxRetained keeps head', () => {
  const existing = Array.from({ length: 18 }, (_, i) => post(`e${i}`));
  const incoming = Array.from({ length: 10 }, (_, i) => post(`n${i}`));
  const { merged } = mergeStreamEntries(existing, incoming, { maxRetained: 22 });
  assert.equal(merged.length, 22);
  assert.equal(merged[0].key, 'POST:e0');
  assert.equal(firstPostIdFromStream(merged), 'e0');
});

test('soft-refresh isolation keeps head when server re-ranks first page', () => {
  const session = [post('head'), post('b'), post('c')];
  const refresh = [post('x'), post('y'), post('head'), post('b')];
  const { session: kept, pending } = isolateStreamSoftRefresh(session, refresh);
  assert.equal(firstPostIdFromStream(kept), 'head');
  assert.equal(firstPostKeyFromStream(kept), 'POST:head');
  assert.ok(pending.some((e) => e.key === 'POST:x'));
});

test('re-initial protection pattern: isolate instead of replace live session', () => {
  const live = [post('session-head'), post('two'), post('three')];
  const incoming = [post('ranked-1'), post('ranked-2'), post('session-head')];
  // Same helper used by useContinuousFeed for soft_refresh AND re-initial.
  const { session, pending } = isolateStreamSoftRefresh(live, incoming);
  assert.deepEqual(
    session.map((e) => e.post?.id),
    ['session-head', 'two', 'three']
  );
  assert.deepEqual(
    pending.map((e) => e.post?.id),
    ['ranked-1', 'ranked-2']
  );
});
