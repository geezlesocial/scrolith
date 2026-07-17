import express from 'express';
import request from 'supertest';
import {
  FeedbackFabricService,
  FeedbackRateLimiter,
  feedbackMetrics,
  normalizeFeedbackAction,
  normalizeFeedbackEntityType,
  normalizeFeedbackEvent,
  validateFeedbackEvent
} from '../services/intelligenceFeedback';
import intelligenceFeedbackRoutes from '../routes/intelligenceFeedback.routes';

describe('Phase 19.2 intelligence feedback fabric', () => {
  beforeEach(() => {
    feedbackMetrics.resetForTests();
  });

  test('normalizes supported entities, actions, and reason codes without ranking fields', () => {
    expect(normalizeFeedbackEntityType('MARKETPLACE')).toBe('marketplace_listing');
    expect(normalizeFeedbackAction('notInterested')).toBe('not_interested');
    const event = normalizeFeedbackEvent(
      {
        eventId: 'evt-1',
        entityType: 'POST',
        entityId: 'post-1',
        action: 'Read More',
        sourceSurface: 'member home',
        reasonCodes: ['TOPIC_AFFINITY', 'topic_affinity', 'LOCATION_RELEVANCE'],
        feedPosition: 4,
        metadata: {
          content: 'must not be persisted',
          score: 999
        }
      },
      'user-1'
    );
    expect(event).toBeTruthy();
    expect(event?.storageAction).toBe('iff_read_more');
    expect(event?.metadata.reasonCodes).toEqual(['TOPIC_AFFINITY', 'LOCATION_RELEVANCE']);
    expect((event?.metadata as any).content).toBeUndefined();
    expect((event?.metadata as any).score).toBeUndefined();
  });

  test('rejects invalid payloads', () => {
    const result = validateFeedbackEvent({ entityType: 'post', action: 'like' }, 'user-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result as any).issues.some((entry: any) => entry.field === 'entityId')).toBe(true);
    }
  });

  test('stores accepted events and preserves namespaced actions', async () => {
    const storedActions: string[] = [];
    const service = new FeedbackFabricService({
      rateLimiter: new FeedbackRateLimiter({ maxEvents: 10 }),
      store: async (event) => {
        storedActions.push(event.storageAction);
        return { stored: true, duplicate: false, id: event.idempotencyKey || 'row-1' };
      }
    });

    const result = await service.submit({
      viewerId: 'user-1',
      events: [
        {
          eventId: 'evt-1',
          entityType: 'job',
          entityId: 'job-1',
          action: 'apply',
          reasonCodes: ['HIRING_INTENT']
        }
      ]
    });

    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(0);
    expect(storedActions).toEqual(['iff_apply']);
  });

  test('counts duplicate idempotent events separately from new accepts', async () => {
    const service = new FeedbackFabricService({
      rateLimiter: new FeedbackRateLimiter({ maxEvents: 10 }),
      store: async () => ({ stored: false, duplicate: true, id: 'iff_duplicate' })
    });

    const result = await service.submit({
      viewerId: 'user-1',
      events: [
        {
          eventId: 'evt-dup',
          entityType: 'page',
          entityId: 'page-1',
          action: 'follow'
        }
      ]
    });

    expect(result.accepted).toBe(0);
    expect(result.deduped).toBe(1);
    expect(result.success).toBe(true);
  });

  test('rate limits per authenticated viewer', async () => {
    const service = new FeedbackFabricService({
      rateLimiter: new FeedbackRateLimiter({ maxEvents: 1 }),
      store: async () => ({ stored: true, duplicate: false, id: 'row-1' })
    });
    await service.submit({
      viewerId: 'user-1',
      events: [{ entityType: 'post', entityId: 'post-1', action: 'impression' }]
    });
    await expect(
      service.submit({
        viewerId: 'user-1',
        events: [{ entityType: 'post', entityId: 'post-2', action: 'impression' }]
      })
    ).rejects.toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
  });

  test('requires authentication on the additive route', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/intelligence/feedback', intelligenceFeedbackRoutes);

    const res = await request(app)
      .post('/api/intelligence/feedback/events')
      .send({ entityType: 'post', entityId: 'post-1', action: 'impression' });

    expect(res.status).toBe(401);
  });

  test('metrics expose aggregate counters only', async () => {
    const service = new FeedbackFabricService({
      rateLimiter: new FeedbackRateLimiter({ maxEvents: 10 }),
      store: async () => ({ stored: true, duplicate: false, id: 'row-1' })
    });
    await service.submit({
      viewerId: 'user-1',
      events: [{ entityType: 'person', entityId: 'person-1', action: 'profile_visit', sourceSurface: 'member_home' }]
    });
    const snap = service.metrics();
    expect(snap.counters['feedback.accepted']).toBe(1);
    expect(snap.counters['feedback.type.profile_visit']).toBe(1);
    expect(Object.keys(snap.counters).some((key) => key.includes('user-1'))).toBe(false);
  });
});
