/**
 * Phase 21.1.4 — Feed Session Integrity Stress Test
 * Continuous session scenarios: scroll, soft refresh, sockets, network, survey, pagination.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createIntegrityProbeController,
  detectIntegrityRegression,
  FEED_SESSION_INTEGRITY_VERSION,
  hashOrderedItemIds,
  runFeedIntegrityStressScenario
} from '../feedSessionIntegrity';
import { isolateSoftRefreshPage, mergeAppendOnly } from '../feedSessionStability';

test('integrity version is 21.1.4-stress', () => {
  assert.equal(FEED_SESSION_INTEGRITY_VERSION, '21.1.4-stress');
});

test('ordered item hash is stable for same order', () => {
  const a = hashOrderedItemIds(['p1', 'p2', 'p3']);
  const b = hashOrderedItemIds(['p1', 'p2', 'p3']);
  const c = hashOrderedItemIds(['p1', 'p3', 'p2']);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('STRESS: continuous session allows background activity without visible ID change', () => {
  const initial = Array.from({ length: 20 }, (_, i) => `post-${i}`);
  const result = runFeedIntegrityStressScenario({
    surface: 'member_home',
    initialIds: initial,
    visibleIndex: 3,
    steps: [
      { event: 'background_fetch', pendingOnly: true },
      { event: 'soft_refresh_pending', pendingOnly: true },
      { event: 'socket_metadata', pendingOnly: true },
      { event: 'network_offline', pendingOnly: true },
      { event: 'network_online', pendingOnly: true },
      { event: 'visibility_hidden', pendingOnly: true },
      { event: 'visibility_visible', pendingOnly: true },
      { event: 'reaction', pendingOnly: true },
      { event: 'follow', pendingOnly: true },
      { event: 'comment', pendingOnly: true },
      { event: 'interest_survey', pendingOnly: true },
      // pagination appends below
      {
        event: 'pagination_append',
        orderedItemIds: [...initial, 'post-20', 'post-21', 'post-22']
      },
      { event: 'probe_tick', pendingOnly: true },
      // soft refresh with re-ranked server page — order must stay (pending only)
      { event: 'soft_refresh_pending', pendingOnly: true },
      { event: 'probe_tick', pendingOnly: true }
    ]
  });
  assert.equal(result.ok, true, JSON.stringify(result.regressions, null, 2));
  assert.equal(result.regressionCount, 0);
});

test('STRESS: illicit reorder during soft path is logged as regression', () => {
  const initial = ['a', 'b', 'c', 'd', 'e'];
  const result = runFeedIntegrityStressScenario({
    surface: 'member_home',
    initialIds: initial,
    visibleIndex: 2,
    steps: [
      // Simulate OLD BUG: replace order without user action
      {
        event: 'soft_refresh_pending',
        orderedItemIds: ['x', 'y', 'z', 'a', 'b']
      }
    ]
  });
  assert.equal(result.ok, false);
  assert.ok(result.regressionCount >= 1);
  assert.ok(
    result.regressions.some(
      (r) =>
        r.reason.includes('visible_post_id') ||
        r.reason.includes('ordered_item_hash') ||
        r.reason.includes('visible_author')
    )
  );
});

test('STRESS: show_new_posts is an allowed identity change', () => {
  const initial = ['a', 'b', 'c'];
  const result = runFeedIntegrityStressScenario({
    surface: 'member_home',
    initialIds: initial,
    visibleIndex: 1,
    steps: [
      {
        event: 'show_new_posts',
        orderedItemIds: ['new1', 'new2', 'a', 'b', 'c']
      },
      { event: 'probe_tick', pendingOnly: true }
    ]
  });
  assert.equal(result.ok, true, JSON.stringify(result.regressions));
});

test('STRESS: hard_refresh starts new session without regression flag', () => {
  const result = runFeedIntegrityStressScenario({
    surface: 'community',
    initialIds: ['a', 'b'],
    steps: [
      { event: 'hard_refresh', orderedItemIds: ['z', 'y', 'x'] },
      { event: 'probe_tick', pendingOnly: true },
      {
        event: 'pagination_append',
        orderedItemIds: ['z', 'y', 'x', 'w']
      }
    ]
  });
  assert.equal(result.ok, true, JSON.stringify(result.regressions));
});

test('STRESS: isolateSoftRefresh + integrity observe stays clean for 50-step session', () => {
  let session = Array.from({ length: 30 }, (_, i) => ({ id: `id-${i}` }));
  const controller = createIntegrityProbeController('member_home');
  const visible = () => session[5];

  const observe = (event: Parameters<typeof controller.observe>[0]) => {
    const v = visible();
    return controller.observe(event, {
      orderedItemIds: session.map((s) => s.id),
      visiblePostId: v.id,
      visibleAuthorId: `author:${v.id}`,
      visibleAnchorId: v.id
    });
  };

  observe('probe_tick');

  for (let step = 0; step < 50; step += 1) {
    // Soft refresh: re-ranked page, isolate only
    const refresh = [
      { id: `fresh-${step}-a` },
      { id: `fresh-${step}-b` },
      ...session.slice(0, 10)
    ];
    const soft = isolateSoftRefreshPage(session, refresh);
    session = soft.sessionItems as typeof session;
    assert.equal(observe('soft_refresh_pending'), null);

    // Pagination append
    const page = [{ id: `page-${step}-0` }, { id: `page-${step}-1` }];
    const { merged } = mergeAppendOnly(session, page);
    session = merged as typeof session;
    assert.equal(observe('pagination_append'), null);

    // User signals — metadata only
    assert.equal(observe('reaction'), null);
    assert.equal(observe('follow'), null);
    assert.equal(observe('interest_survey'), null);
    assert.equal(observe('comment'), null);
    assert.equal(observe('socket_metadata'), null);
    assert.equal(observe('visibility_visible'), null);
    assert.equal(observe('network_online'), null);
    assert.equal(observe('probe_tick'), null);
  }

  const report = controller.getReport();
  assert.equal(report.ok, true, JSON.stringify(report.regressions, null, 2));
  assert.equal(session[5].id, 'id-5');
});

test('detectIntegrityRegression flags visible post swap', () => {
  const before = {
    sessionId: 's1',
    surface: 'member_home',
    orderedItemHash: 'aaa',
    orderedItemCount: 3,
    visiblePostId: 'p1',
    visibleAuthorId: 'a1',
    visibleAnchorId: 'p1',
    capturedAt: 1
  };
  const after = { ...before, visiblePostId: 'p2', visibleAuthorId: 'a2', visibleAnchorId: 'p2', capturedAt: 2 };
  assert.equal(
    detectIntegrityRegression(before, after, { event: 'probe_tick' }),
    'visible_post_id_changed_without_user_action'
  );
  assert.equal(detectIntegrityRegression(before, after, { event: 'scroll_user' }), null);
});
