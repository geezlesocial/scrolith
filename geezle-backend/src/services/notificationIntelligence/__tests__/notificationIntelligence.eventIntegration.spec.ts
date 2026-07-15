/**
 * Phase 10.6 — Notification Event Integration tests (dark launch).
 */
import {
  DEFAULT_NOTIF_INTEL_FLAGS,
  invalidateNotificationIntelRolloutCache,
  resolveNotificationIntelRolloutFlags,
  notificationEventIntegrationService,
  notificationIntelligenceService,
  validateEventEnvelope,
  mapEnvelopeToNotificationHints,
  ALL_EVENT_DOMAIN_SOURCES,
  PLACEHOLDER_EVENT_SOURCES,
  resetEventIntegrationIdempotencyForTests,
  EventIntegrationValidationError
} from '../index';
import { listDomainEventAdapters, applyDomainAdapter } from '../eventIntegration/event.adapters';

describe('Event integration rollout', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
    invalidateNotificationIntelRolloutCache();
  });

  test('defaults include eventIntegration OFF', () => {
    expect(DEFAULT_NOTIF_INTEL_FLAGS.eventIntegration).toBe(false);
    delete process.env.NOTIF_INTEL_MASTER;
    delete process.env.NOTIF_INTEL_EVENT_INTEGRATION;
    invalidateNotificationIntelRolloutCache();
    const flags = resolveNotificationIntelRolloutFlags({ ...process.env });
    expect(flags.eventIntegration).toBe(false);
  });

  test('master OFF forces eventIntegration OFF', () => {
    const flags = resolveNotificationIntelRolloutFlags({
      NOTIF_INTEL_MASTER: 'false',
      NOTIF_INTEL_EVENT_INTEGRATION: 'true',
      NOTIF_INTEL_BUS_CONSUMER: 'true'
    } as any);
    expect(flags.eventIntegration).toBe(false);
    expect(flags.busConsumer).toBe(false);
  });

  test('master ON enables eventIntegration when env set', () => {
    const flags = resolveNotificationIntelRolloutFlags({
      NOTIF_INTEL_MASTER: 'true',
      NOTIF_INTEL_EVENT_INTEGRATION: '1'
    } as any);
    expect(flags.eventIntegration).toBe(true);
  });
});

describe('EventEnvelope validation + mapping', () => {
  test('validateEventEnvelope requires eventId and type', () => {
    expect(() => validateEventEnvelope({})).toThrow(EventIntegrationValidationError);
    expect(() => validateEventEnvelope({ eventId: 'e1' })).toThrow(EventIntegrationValidationError);
  });

  test('validateEventEnvelope normalizes recipients and source aliases', () => {
    const env = validateEventEnvelope({
      eventId: 'e1',
      type: 'messaging.message.created',
      source: 'messages',
      actor: { id: 'a1' },
      recipients: ['u1', { userId: 'u2', role: 'cc' }],
      correlationId: 'c1',
      traceId: 't1',
      idempotencyKey: 'idem-1'
    });
    expect(env.source).toBe('messaging');
    expect(env.recipients?.map((r) => r.userId)).toEqual(['u1', 'u2']);
    expect(env.correlationId).toBe('c1');
    expect(env.traceId).toBe('t1');
  });

  test('mapEnvelopeToNotificationHints for messaging and mentions', () => {
    const msg = mapEnvelopeToNotificationHints(
      validateEventEnvelope({
        eventId: 'e1',
        type: 'messaging.message.created',
        source: 'messaging'
      })
    );
    expect(msg.category).toBe('messages');
    expect(msg.confidence).toBe('high');

    const mention = mapEnvelopeToNotificationHints(
      validateEventEnvelope({
        eventId: 'e2',
        type: 'mention_post',
        source: 'posts'
      })
    );
    expect(mention.category).toBe('mentions');
  });

  test('placeholder sources map to future category', () => {
    for (const source of PLACEHOLDER_EVENT_SOURCES) {
      const m = mapEnvelopeToNotificationHints(
        validateEventEnvelope({
          eventId: `e-${source}`,
          type: `${source}.signal`,
          source
        })
      );
      expect(m.isPlaceholderSource).toBe(true);
      expect(m.category).toBe('future');
    }
  });

  test('messaging adapter extracts participant recipients', () => {
    const base = validateEventEnvelope({
      eventId: 'e1',
      type: 'messaging.message.created',
      source: 'messaging',
      actor: { id: 'a1' },
      payload: { toUserId: 'u9', conversationId: 'c1' }
    });
    const { envelope, adapterName } = applyDomainAdapter(base);
    expect(adapterName).toBe('messaging');
    expect(envelope.recipients?.some((r) => r.userId === 'u9')).toBe(true);
    expect(envelope.entity?.id).toBe('c1');
  });

  test('adapters cover all primary domains', () => {
    const names = listDomainEventAdapters().map((a) => a.source);
    expect(names).toEqual(
      expect.arrayContaining([
        'messaging',
        'posts',
        'comments',
        'reactions',
        'follows',
        'jobs',
        'marketplace',
        'communities',
        'companies',
        'system',
        'scrolitha',
        'discovery',
        'search'
      ])
    );
    expect(ALL_EVENT_DOMAIN_SOURCES).toContain('messaging');
  });
});

describe('Event integration service', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env = { ...prev };
    invalidateNotificationIntelRolloutCache();
    resetEventIntegrationIdempotencyForTests();
  });

  afterEach(() => {
    process.env = { ...prev };
    invalidateNotificationIntelRolloutCache();
    resetEventIntegrationIdempotencyForTests();
  });

  test('integrate inactive when flags OFF', () => {
    delete process.env.NOTIF_INTEL_MASTER;
    delete process.env.NOTIF_INTEL_EVENT_INTEGRATION;
    invalidateNotificationIntelRolloutCache();
    const req = notificationEventIntegrationService.integrate({
      eventId: 'e1',
      type: 'messaging.message.created',
      source: 'messaging',
      recipients: [{ userId: 'u1' }],
      actor: { id: 'a1' }
    });
    expect(req.engineActive).toBe(false);
    expect(req.reason).toBe('event_integration_inactive');
    expect(req.published).toBe(false);
    expect(req.executed).toBe(false);
    expect(req.preferenceHandoff.inputs).toEqual([]);
  });

  test('integrate maps envelope to NotificationEvaluationRequest with handoffs', () => {
    process.env.NOTIF_INTEL_MASTER = 'true';
    process.env.NOTIF_INTEL_EVENT_INTEGRATION = 'true';
    invalidateNotificationIntelRolloutCache();

    const req = notificationEventIntegrationService.integrate({
      eventId: 'e-msg-1',
      type: 'messaging.message.created',
      source: 'messaging',
      actor: { id: 'a1', type: 'user' },
      recipients: [{ userId: 'u1' }, { userId: 'a1' }],
      payload: { conversationId: 'conv1' },
      permissions: { required: ['message.read'], audience: 'self' },
      correlationId: 'corr-1',
      traceId: 'trace-1',
      idempotencyKey: 'idem-msg-1'
    });

    expect(req.engineActive).toBe(true);
    expect(req.reason).toBe('mapped');
    expect(req.published).toBe(false);
    expect(req.executed).toBe(false);
    expect(req.category).toBe('messages');
    expect(req.actorId).toBe('a1');
    expect(req.recipientIds).toEqual(['u1']); // actor filtered
    expect(req.correlationId).toBe('corr-1');
    expect(req.traceId).toBe('trace-1');
    expect(req.permissions.propagated).toBe(true);
    expect(req.permissions.required).toContain('message.read');
    expect(req.preferenceHandoff.inputs).toHaveLength(1);
    expect(req.priorityHandoff.inputs[0].userId).toBe('u1');
    expect(req.deliveryHandoff.inputs[0].type).toContain('message');
    expect(req.mapping.adapter).toBe('messaging');
  });

  test('idempotency marks duplicates', () => {
    process.env.NOTIF_INTEL_MASTER = 'true';
    process.env.NOTIF_INTEL_EVENT_INTEGRATION = 'true';
    invalidateNotificationIntelRolloutCache();

    const payload = {
      eventId: 'e-dup',
      type: 'comment.created',
      source: 'comments',
      actor: { id: 'a1' },
      recipients: [{ userId: 'u2' }],
      idempotencyKey: 'same-key'
    };
    const first = notificationEventIntegrationService.integrate(payload);
    expect(first.reason).toBe('mapped');
    expect(first.idempotency.isDuplicate).toBe(false);

    const second = notificationEventIntegrationService.integrate(payload);
    expect(second.reason).toBe('duplicate_idempotency');
    expect(second.idempotency.isDuplicate).toBe(true);
    expect(second.published).toBe(false);
    expect(second.executed).toBe(false);
  });

  test('validation_failed for bad envelope', () => {
    process.env.NOTIF_INTEL_MASTER = 'true';
    process.env.NOTIF_INTEL_EVENT_INTEGRATION = 'true';
    invalidateNotificationIntelRolloutCache();
    const req = notificationEventIntegrationService.integrate({ foo: 1 });
    expect(req.reason).toBe('validation_failed');
    expect(req.published).toBe(false);
    expect(req.executed).toBe(false);
  });

  test('placeholder source reason', () => {
    process.env.NOTIF_INTEL_MASTER = 'true';
    process.env.NOTIF_INTEL_EVENT_INTEGRATION = 'true';
    invalidateNotificationIntelRolloutCache();
    const req = notificationEventIntegrationService.integrate({
      eventId: 'e-disc',
      type: 'discovery.item.scored',
      source: 'discovery',
      recipients: [{ userId: 'u1' }]
    });
    expect(req.reason).toBe('placeholder_source');
    expect(req.category).toBe('future');
    expect(req.published).toBe(false);
  });

  test('system security event maps and keeps handoffs', () => {
    process.env.NOTIF_INTEL_MASTER = 'true';
    process.env.NOTIF_INTEL_EVENT_INTEGRATION = 'true';
    invalidateNotificationIntelRolloutCache();
    const req = notificationEventIntegrationService.integrate({
      eventId: 'e-sec',
      type: 'system.security.login_alert',
      source: 'system',
      payload: { userId: 'u1' },
      permissions: { required: ['security.notify'], audience: 'self' }
    });
    expect(req.category).toBe('system');
    expect(req.recipientIds).toContain('u1');
    expect(req.priorityHandoff.inputs.length).toBeGreaterThan(0);
    expect(req.executed).toBe(false);
  });

  test('integrateMany preserves length and never publishes', () => {
    process.env.NOTIF_INTEL_MASTER = 'true';
    process.env.NOTIF_INTEL_EVENT_INTEGRATION = 'true';
    invalidateNotificationIntelRolloutCache();
    const results = notificationEventIntegrationService.integrateMany([
      {
        eventId: 'e1',
        type: 'reaction.created',
        source: 'reactions',
        actor: { id: 'a1' },
        payload: { postAuthorId: 'u2', postId: 'p1' }
      },
      {
        eventId: 'e2',
        type: 'jobs.application.created',
        source: 'jobs',
        actor: { id: 'cand1' },
        payload: { employerId: 'emp1', jobId: 'j1' }
      }
    ]);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.published === false && r.executed === false)).toBe(true);
    expect(results[0].recipientIds).toContain('u2');
    expect(results[1].recipientIds).toContain('emp1');
  });

  test('diagnostics and façade', () => {
    const d = notificationEventIntegrationService.getDiagnostics();
    expect(d.envKey).toBe('NOTIF_INTEL_EVENT_INTEGRATION');
    expect(d.published).toBe(false);
    expect(d.executed).toBe(false);
    expect(d.placeholderSources).toContain('scrolitha');
    expect(notificationIntelligenceService.events).toBe(notificationEventIntegrationService);
  });
});
