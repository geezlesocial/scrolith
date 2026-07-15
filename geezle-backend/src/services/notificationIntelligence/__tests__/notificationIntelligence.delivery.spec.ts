/**
 * Phase 10.5 — Notification Delivery Engine tests (dark launch).
 */
import {
  DEFAULT_NOTIF_INTEL_FLAGS,
  invalidateNotificationIntelRolloutCache,
  resolveNotificationIntelRolloutFlags,
  notificationDeliveryService,
  notificationIntelligenceService,
  ALL_DELIVERY_CHANNELS,
  listPlaceholderChannels
} from '../index';
import { evaluateGlobalSuppression, buildRuleContext, evaluateChannelEligibility } from '../delivery/delivery.rules';
import { scheduleChannel, resolveRetryPolicy, aggregatePlanTiming } from '../delivery/delivery.scheduler';
import { getChannelCapability } from '../delivery/delivery.channels';

describe('Delivery rollout', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
    invalidateNotificationIntelRolloutCache();
  });

  test('defaults include delivery OFF', () => {
    expect(DEFAULT_NOTIF_INTEL_FLAGS.delivery).toBe(false);
    delete process.env.NOTIF_INTEL_MASTER;
    delete process.env.NOTIF_INTEL_DELIVERY;
    invalidateNotificationIntelRolloutCache();
    const flags = resolveNotificationIntelRolloutFlags({ ...process.env });
    expect(flags.delivery).toBe(false);
    expect(flags.deliveryUnified).toBe(false);
  });

  test('master OFF forces delivery OFF even if env sets it', () => {
    const flags = resolveNotificationIntelRolloutFlags({
      NOTIF_INTEL_MASTER: 'false',
      NOTIF_INTEL_DELIVERY: 'true',
      NOTIF_INTEL_DELIVERY_UNIFIED: 'true'
    } as any);
    expect(flags.master).toBe(false);
    expect(flags.delivery).toBe(false);
    expect(flags.deliveryUnified).toBe(false);
  });

  test('master ON enables delivery when NOTIF_INTEL_DELIVERY set', () => {
    const flags = resolveNotificationIntelRolloutFlags({
      NOTIF_INTEL_MASTER: 'true',
      NOTIF_INTEL_DELIVERY: '1'
    } as any);
    expect(flags.delivery).toBe(true);
    expect(flags.deliveryUnified).toBe(false);
  });
});

describe('Delivery channels registry', () => {
  test('lists all channels including placeholders', () => {
    expect(ALL_DELIVERY_CHANNELS).toEqual(
      expect.arrayContaining(['in_app', 'push', 'email', 'sms', 'webhook', 'future'])
    );
    const placeholders = listPlaceholderChannels();
    expect(placeholders).toContain('push');
    expect(placeholders).toContain('email');
    expect(placeholders).toContain('sms');
    expect(placeholders).not.toContain('in_app');
    expect(getChannelCapability('in_app').implementationReady).toBe(true);
    expect(getChannelCapability('push').placeholder).toBe(true);
  });
});

describe('Delivery rules + scheduler', () => {
  test('global suppression on forceSuppress', () => {
    const ctx = buildRuleContext({
      userId: 'u1',
      forceSuppress: true,
      forceSuppressReason: 'blocked_actor'
    });
    const g = evaluateGlobalSuppression(ctx);
    expect(g.suppressed).toBe(true);
    expect(g.reasons).toContain('blocked_actor');
  });

  test('preference disabled suppresses non-security', () => {
    const ctx = buildRuleContext({
      userId: 'u1',
      type: 'comment_on_post',
      preferences: { globalEnabled: false }
    });
    expect(evaluateGlobalSuppression(ctx).suppressed).toBe(true);
  });

  test('security type bypasses preference mute', () => {
    const ctx = buildRuleContext({
      userId: 'u1',
      type: 'security_login_alert',
      preferences: { globalEnabled: false }
    });
    expect(evaluateGlobalSuppression(ctx).suppressed).toBe(false);
  });

  test('sms ineligible for low priority', () => {
    const ctx = buildRuleContext({
      userId: 'u1',
      type: 'reaction_on_post',
      priority: { band: 'low', score: 0.2 }
    });
    const decision = evaluateChannelEligibility('sms', ctx, { suppressed: false, reasons: [] });
    expect(decision.eligible).toBe(false);
    expect(decision.status).toBe('ineligible');
  });

  test('quiet hours defers push to scheduled', () => {
    const ctx = buildRuleContext({
      userId: 'u1',
      type: 'mention_post',
      priority: { band: 'normal' },
      quietHours: { active: true, channels: ['ALL'] }
    });
    const base = evaluateChannelEligibility('push', ctx, { suppressed: false, reasons: [] });
    const timed = scheduleChannel('push', ctx, base, new Date('2026-07-15T12:00:00.000Z'));
    expect(timed.timing).toBe('scheduled');
    expect(timed.status).toBe('deferred');
    expect(timed.scheduledFor).toBeTruthy();
  });

  test('in-app not blocked by quiet hours', () => {
    const ctx = buildRuleContext({
      userId: 'u1',
      quietHours: { active: true, channels: ['ALL'] },
      priority: { band: 'normal' }
    });
    const base = evaluateChannelEligibility('in_app', ctx, { suppressed: false, reasons: [] });
    const timed = scheduleChannel('in_app', ctx, base, new Date());
    expect(timed.timing).toBe('immediate');
  });

  test('retry policy scales with band', () => {
    expect(resolveRetryPolicy('critical', true).maxAttempts).toBe(5);
    expect(resolveRetryPolicy('background', true).maxAttempts).toBe(1);
    expect(resolveRetryPolicy('normal', false).eligible).toBe(false);
  });

  test('aggregatePlanTiming prefers immediate when any immediate', () => {
    const agg = aggregatePlanTiming([
      {
        channel: 'in_app',
        eligible: true,
        status: 'planned',
        timing: 'immediate',
        scheduledFor: null,
        retryEligible: true,
        batchEligible: false,
        reasons: []
      },
      {
        channel: 'push',
        eligible: true,
        status: 'deferred',
        timing: 'scheduled',
        scheduledFor: '2026-07-15T13:00:00.000Z',
        retryEligible: true,
        batchEligible: true,
        reasons: []
      }
    ]);
    expect(agg.mode).toBe('immediate');
    expect(agg.scheduledFor).toBeNull();
  });
});

describe('Delivery service', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env = { ...prev };
    invalidateNotificationIntelRolloutCache();
  });

  afterEach(() => {
    process.env = { ...prev };
    invalidateNotificationIntelRolloutCache();
  });

  test('plan is inactive when flags OFF', () => {
    delete process.env.NOTIF_INTEL_MASTER;
    delete process.env.NOTIF_INTEL_DELIVERY;
    invalidateNotificationIntelRolloutCache();
    const plan = notificationDeliveryService.plan({
      userId: 'u1',
      type: 'mention_post'
    });
    expect(plan.engineActive).toBe(false);
    expect(plan.reason).toBe('delivery_engine_inactive');
    expect(plan.executed).toBe(false);
    expect(plan.channels).toEqual([]);
    expect(notificationDeliveryService.isEngineActive()).toBe(false);
  });

  test('plan returns DeliveryPlan when master+delivery ON', () => {
    process.env.NOTIF_INTEL_MASTER = 'true';
    process.env.NOTIF_INTEL_DELIVERY = 'true';
    invalidateNotificationIntelRolloutCache();

    const plan = notificationDeliveryService.plan({
      userId: 'u1',
      notificationId: 'n1',
      type: 'message_received',
      category: 'messages',
      preferences: {
        globalEnabled: true,
        categoryEnabled: true,
        channels: { inApp: true, push: true, email: false }
      },
      priority: { band: 'high', score: 0.8, engineActive: true },
      quietHours: { active: false }
    });

    expect(plan.engineActive).toBe(true);
    expect(plan.executed).toBe(false);
    expect(plan.reason).toBe('planned');
    expect(plan.planId).toMatch(/^dplan_/);
    expect(plan.selectedChannels).toContain('in_app');
    expect(plan.selectedChannels).toContain('push');
    expect(plan.selectedChannels).not.toContain('email');
    expect(plan.preferenceCompatibility.applied).toBe(true);
    expect(plan.priorityCompatibility.band).toBe('high');
    expect(plan.diagnostics.channelCount).toBe(ALL_DELIVERY_CHANNELS.length);
  });

  test('suppressed when preferences disable global', () => {
    process.env.NOTIF_INTEL_MASTER = 'true';
    process.env.NOTIF_INTEL_DELIVERY = 'true';
    invalidateNotificationIntelRolloutCache();

    const plan = notificationDeliveryService.plan({
      userId: 'u1',
      type: 'comment_on_post',
      preferences: { globalEnabled: false }
    });
    expect(plan.reason).toBe('fully_suppressed');
    expect(plan.suppression.suppressed).toBe(true);
    expect(plan.selectedChannels).toHaveLength(0);
    expect(plan.executed).toBe(false);
  });

  test('quiet hours defers push but keeps in_app immediate', () => {
    process.env.NOTIF_INTEL_MASTER = 'true';
    process.env.NOTIF_INTEL_DELIVERY = 'true';
    invalidateNotificationIntelRolloutCache();

    const plan = notificationDeliveryService.plan({
      userId: 'u1',
      type: 'mention_post',
      preferences: { globalEnabled: true, categoryEnabled: true },
      priority: { band: 'normal', score: 0.55 },
      quietHours: { active: true, channels: ['PUSH', 'EMAIL'] },
      now: '2026-07-15T22:00:00.000Z'
    });

    const inApp = plan.channels.find((c) => c.channel === 'in_app');
    const push = plan.channels.find((c) => c.channel === 'push');
    expect(inApp?.timing).toBe('immediate');
    expect(push?.timing).toBe('scheduled');
    expect(push?.status).toBe('deferred');
    expect(plan.executed).toBe(false);
  });

  test('planMany preserves length and never executes', () => {
    process.env.NOTIF_INTEL_MASTER = 'true';
    process.env.NOTIF_INTEL_DELIVERY = 'true';
    invalidateNotificationIntelRolloutCache();
    const plans = notificationDeliveryService.planMany([
      { userId: 'u1', type: 'mention_post' },
      { userId: 'u2', type: 'reaction_on_post' }
    ]);
    expect(plans).toHaveLength(2);
    expect(plans.every((p) => p.executed === false)).toBe(true);
  });

  test('diagnostics expose env key and placeholders', () => {
    const d = notificationDeliveryService.getDiagnostics();
    expect(d.service).toBe('notification-delivery');
    expect(d.envKey).toBe('NOTIF_INTEL_DELIVERY');
    expect(d.executed).toBe(false);
    expect(d.placeholders).toContain('webhook');
  });

  test('façade exposes delivery service', () => {
    expect(notificationIntelligenceService.delivery).toBe(notificationDeliveryService);
  });
});
