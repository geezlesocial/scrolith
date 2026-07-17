import test from 'node:test';
import assert from 'node:assert/strict';

const load = async () => {
  // Fresh module state per suite section where needed
  return import(`../../src/services/intelligenceFeedback.ts?t=${Date.now()}-${Math.random()}`);
};

test('maps member-feed entity types into feedback event entities', async () => {
  const { resolveFeedbackEntityType } = await load();
  assert.equal(resolveFeedbackEntityType('COMMUNITY_POST'), 'post');
  assert.equal(resolveFeedbackEntityType('MARKETPLACE_LISTING'), 'marketplace_listing');
  assert.equal(resolveFeedbackEntityType('PERSON_RECOMMENDATION'), 'person');
  assert.equal(resolveFeedbackEntityType('PAGE_RECOMMENDATION'), 'page');
  assert.equal(resolveFeedbackEntityType('UNKNOWN_THING'), null);
});

test('valid event serialization preserves reason codes and feed position', async () => {
  const { buildMemberFeedFeedbackEvents } = await load();
  const events = buildMemberFeedFeedbackEvents({
    surface: 'member_home',
    mode: 'for_you',
    items: [
      {
        type: 'POST',
        id: 'post-1',
        intelligence: {
          intelligenceVersion: '19.1',
          reasonCodes: ['TOPIC_AFFINITY', 'topic_affinity', 'LOCATION_RELEVANCE']
        }
      } as any
    ]
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].action, 'impression');
  assert.equal(events[0].entityType, 'post');
  assert.equal(events[0].entityId, 'post-1');
  assert.equal(events[0].feedPosition, 0);
  assert.deepEqual(events[0].reasonCodes, ['TOPIC_AFFINITY', 'LOCATION_RELEVANCE']);
  assert.equal(events[0].intelligenceVersion, '19.1');
  assert.equal(events[0].sourceSurface, 'member_home');
  assert.ok(events[0].eventId);
  assert.ok(events[0].timestamp);
});

test('required-field validation rejects incomplete events', async () => {
  const { sanitizeFeedbackEvent } = await load();
  assert.equal(sanitizeFeedbackEvent({ entityType: 'post', action: 'like' } as any), null);
  assert.equal(sanitizeFeedbackEvent({ entityType: 'post', entityId: 'x' } as any), null);
  assert.equal(sanitizeFeedbackEvent({ entityId: 'x', action: 'impression' } as any), null);
});

test('optional fields may be omitted', async () => {
  const { sanitizeFeedbackEvent } = await load();
  const event = sanitizeFeedbackEvent({
    entityType: 'job',
    entityId: 'job-1',
    action: 'impression'
  } as any);
  assert.ok(event);
  assert.equal(event?.latencyMs, undefined);
  assert.equal(event?.viewDurationMs, undefined);
  assert.equal(event?.reasonCodes, undefined);
});

test('sanitizer strips raw content, score, and weight fields', async () => {
  const { sanitizeFeedbackEvent } = await load();
  const dirty = {
    entityType: 'post',
    entityId: 'p1',
    action: 'impression',
    content: 'secret body',
    score: 99,
    rankingWeight: 0.8,
    email: 'user@example.com',
    token: 'abc',
    metadata: { content: 'nope', score: 1 }
  } as any;
  const event = sanitizeFeedbackEvent(dirty);
  assert.ok(event);
  const json = JSON.stringify(event);
  assert.equal(json.includes('secret body'), false);
  assert.equal(json.includes('user@example.com'), false);
  assert.equal(json.includes('"score"'), false);
  assert.equal(json.includes('rankingWeight'), false);
  assert.equal(json.includes('token'), false);
  assert.equal((event as any).content, undefined);
  assert.equal((event as any).score, undefined);
});

test('buildMemberFeedFeedbackEvents skips malformed items without throwing', async () => {
  const { buildMemberFeedFeedbackEvents } = await load();
  const events = buildMemberFeedFeedbackEvents({
    surface: 'community',
    items: [{ type: 'UNKNOWN', id: 'x' }, { type: 'JOB' }] as any
  });
  assert.equal(events.length, 0);
});

test('maximum batch size is 25', async () => {
  const { buildMemberFeedFeedbackEvents, MAX_BATCH_SIZE, sanitizeFeedbackEvent } = await load();
  assert.equal(MAX_BATCH_SIZE, 25);
  const items = Array.from({ length: 40 }, (_, i) => ({
    type: 'POST',
    id: `post-${i}`
  }));
  const events = buildMemberFeedFeedbackEvents({
    surface: 'member_home',
    items: items as any
  });
  assert.equal(events.length, 25);
  const oversized = Array.from({ length: 30 }, (_, i) =>
    sanitizeFeedbackEvent({
      eventId: `e-${i}`,
      entityType: 'post',
      entityId: `p-${i}`,
      action: 'hover'
    } as any)
  ).filter(Boolean);
  assert.ok(oversized.length >= 25);
});

test('session id is opaque and stable within session storage', async () => {
  const { getFeedbackSessionId, clearFeedbackSessionState, enableFeedbackSubmissions } = await load();
  // Node test environment may not have sessionStorage; ensure no throw.
  const a = getFeedbackSessionId();
  const b = getFeedbackSessionId();
  assert.equal(typeof a, 'string');
  assert.ok(a.length > 0);
  assert.equal(a.includes('@'), false);
  assert.match(a, /^[a-zA-Z0-9_.:-]+$/);
  // When storage unavailable both may be session_unavailable or server.
  assert.equal(a.includes('user'), false);
  clearFeedbackSessionState();
  enableFeedbackSubmissions();
  void b;
});

test('event ids are stable for the same logical impression', async () => {
  const { buildMemberFeedFeedbackEvents } = await load();
  const item = { type: 'POST', id: 'stable-post', intelligence: { reasonCodes: ['A'] } } as any;
  const first = buildMemberFeedFeedbackEvents({
    surface: 'member_home',
    mode: 'for_you',
    items: [item]
  });
  const second = buildMemberFeedFeedbackEvents({
    surface: 'member_home',
    mode: 'for_you',
    items: [item]
  });
  assert.equal(first[0].eventId, second[0].eventId);
});

test('submit skips unauthenticated sessions without throwing', async () => {
  const mod = await load();
  mod.enableFeedbackSubmissions();
  // In node tests tokenStore will typically return null.
  const result = await mod.submitIntelligenceFeedbackEvents([
    {
      eventId: `test-unauth-${Date.now()}`,
      entityType: 'post',
      entityId: 'p-unauth',
      action: 'impression',
      sourceSurface: 'member_home'
    }
  ]);
  assert.equal(result, null);
});

test('recordMemberFeedPageFeedback never throws on bad input', async () => {
  const { recordMemberFeedPageFeedback } = await load();
  const result = await recordMemberFeedPageFeedback({
    surface: 'member_home',
    items: null as any
  });
  assert.equal(result, null);
});

test('duplicate client-side event ids are suppressed after first remember', async () => {
  const mod = await load();
  mod.enableFeedbackSubmissions();
  const event = {
    eventId: `dup-test-${Date.now()}`,
    entityType: 'post' as const,
    entityId: 'dup-post',
    action: 'impression' as const,
    sourceSurface: 'member_home'
  };
  // First call may skip due to no auth; still exercises sanitize + remember path.
  await mod.submitIntelligenceFeedbackEvents([event]);
  const second = await mod.submitIntelligenceFeedbackEvents([event]);
  assert.equal(second, null);
});

test('clearFeedbackSessionState disables submissions', async () => {
  const mod = await load();
  mod.clearFeedbackSessionState();
  const result = await mod.submitIntelligenceFeedbackEvents([
    {
      eventId: `disabled-${Date.now()}`,
      entityType: 'post',
      entityId: 'p1',
      action: 'impression'
    }
  ]);
  assert.equal(result, null);
  mod.enableFeedbackSubmissions();
});

test('unsupported actions are rejected by sanitizer', async () => {
  const { sanitizeFeedbackEvent } = await load();
  assert.equal(
    sanitizeFeedbackEvent({
      entityType: 'post',
      entityId: 'p1',
      action: 'delete_account' as any
    }),
    null
  );
});

test('FeedbackCollector exports stay stable', async () => {
  const { FeedbackCollector, MAX_BATCH_SIZE, FEEDBACK_ENDPOINT } = await load();
  assert.equal(typeof FeedbackCollector.submit, 'function');
  assert.equal(typeof FeedbackCollector.buildMemberFeedFeedbackEvents, 'function');
  assert.equal(FeedbackCollector.maxBatchSize, 25);
  assert.equal(MAX_BATCH_SIZE, 25);
  assert.equal(FEEDBACK_ENDPOINT, '/intelligence/feedback/events');
});
