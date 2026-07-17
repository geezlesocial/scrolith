/**
 * Phase 10.4 — Notification Priority Engine tests (dark launch).
 */
import {
  DEFAULT_NOTIF_INTEL_FLAGS,
  invalidateNotificationIntelRolloutCache,
  resolveNotificationIntelRolloutFlags,
  notificationPriorityService,
  notificationIntelligenceService,
  computePriorityEvaluation,
  scoreToBand,
  resolvePriorityCategory,
  ALL_PRIORITY_BANDS
} from '../index';
import { applyPriorityOrderingPlaceholder } from '../priority/priority.placeholders';

describe('Priority rollout', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
    invalidateNotificationIntelRolloutCache();
  });

  test('defaults include priority OFF', () => {
    expect(DEFAULT_NOTIF_INTEL_FLAGS.priority).toBe(false);
    delete process.env.NOTIF_INTEL_MASTER;
    delete process.env.NOTIF_INTEL_PRIORITY;
    invalidateNotificationIntelRolloutCache();
    const flags = resolveNotificationIntelRolloutFlags({ ...process.env });
    expect(flags.priority).toBe(false);
    expect(flags.priorityList).toBe(false);
  });

  test('master OFF forces priority OFF even if env sets it', () => {
    const flags = resolveNotificationIntelRolloutFlags({
      NOTIF_INTEL_MASTER: 'false',
      NOTIF_INTEL_PRIORITY: 'true',
      NOTIF_INTEL_PRIORITY_LIST: 'true'
    } as any);
    expect(flags.master).toBe(false);
    expect(flags.priority).toBe(false);
    expect(flags.priorityList).toBe(false);
  });

  test('master ON enables priority when NOTIF_INTEL_PRIORITY set', () => {
    const flags = resolveNotificationIntelRolloutFlags({
      NOTIF_INTEL_MASTER: 'true',
      NOTIF_INTEL_PRIORITY: '1'
    } as any);
    expect(flags.priority).toBe(true);
    // list reordering stays separate
    expect(flags.priorityList).toBe(false);
  });
});

describe('Priority pure evaluation', () => {
  test('scoreToBand thresholds', () => {
    expect(scoreToBand(0.95)).toBe('critical');
    expect(scoreToBand(0.75)).toBe('high');
    expect(scoreToBand(0.5)).toBe('normal');
    expect(scoreToBand(0.25)).toBe('low');
    expect(scoreToBand(0.1)).toBe('background');
  });

  test('resolvePriorityCategory from type and category', () => {
    expect(resolvePriorityCategory('mention_post', null)).toBe('mentions');
    expect(resolvePriorityCategory(null, 'jobs')).toBe('jobs');
    expect(resolvePriorityCategory('security_password_reset', null)).toBe('system');
  });

  test('inactive engine returns normal defaults and no factors', () => {
    const result = computePriorityEvaluation(
      { userId: 'u1', type: 'mention_post' },
      { engineActive: false }
    );
    expect(result.engineActive).toBe(false);
    expect(result.band).toBe('normal');
    expect(result.score).toBe(0.5);
    expect(result.reason).toBe('priority_engine_inactive');
    expect(result.orderingApplied).toBe(false);
    expect(result.factors).toEqual([]);
  });

  test('active engine elevates security and messaging', () => {
    const security = computePriorityEvaluation(
      {
        userId: 'u1',
        type: 'security_login_alert',
        createdAt: new Date().toISOString(),
        relationship: { isClose: true },
        preferences: { globalEnabled: true, categoryEnabled: true }
      },
      { engineActive: true }
    );
    expect(security.engineActive).toBe(true);
    expect(security.reason).toBe('evaluated');
    expect(security.orderingApplied).toBe(false);
    expect(['critical', 'high']).toContain(security.band);
    expect(security.score).toBeGreaterThanOrEqual(0.7);
    expect(security.explanation.topFactors.length).toBeGreaterThan(0);

    const message = computePriorityEvaluation(
      {
        userId: 'u1',
        type: 'message_received',
        category: 'messages',
        createdAt: new Date().toISOString(),
        relationship: { isConnection: true, isFollowing: true, isFollower: true },
        engagement: { recentInteractionCount: 8 },
        preferences: { globalEnabled: true, categoryEnabled: true }
      },
      { engineActive: true }
    );
    expect(message.band === 'high' || message.band === 'critical' || message.band === 'normal').toBe(
      true
    );
    expect(message.score).toBeGreaterThan(0.5);
  });

  test('likes / reactions trend lower than mentions', () => {
    const like = computePriorityEvaluation(
      {
        userId: 'u1',
        type: 'reaction_on_post',
        category: 'likes',
        createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
        relationship: {},
        preferences: { globalEnabled: true, categoryEnabled: true }
      },
      { engineActive: true }
    );
    const mention = computePriorityEvaluation(
      {
        userId: 'u1',
        type: 'mention_post',
        category: 'mentions',
        createdAt: new Date().toISOString(),
        relationship: { isClose: true },
        preferences: { globalEnabled: true, categoryEnabled: true }
      },
      { engineActive: true }
    );
    expect(mention.score).toBeGreaterThan(like.score);
  });

  test('disabled preferences dampen non-security priority', () => {
    const muted = computePriorityEvaluation(
      {
        userId: 'u1',
        type: 'comment_on_post',
        preferences: { globalEnabled: false, categoryEnabled: false }
      },
      { engineActive: true }
    );
    expect(muted.score).toBeLessThanOrEqual(0.25);
    expect(['low', 'background']).toContain(muted.band);
  });

  test('discovery and scrolitha factors are zero-weight placeholders', () => {
    const result = computePriorityEvaluation(
      {
        userId: 'u1',
        type: 'mention_post',
        discoverySignals: { relevanceScore: 1, reserved: true },
        scrolithaSignals: { urgencyHint: 1, reserved: true }
      },
      { engineActive: true }
    );
    const disc = result.factors.find((f) => f.key === 'discovery_signals');
    const scr = result.factors.find((f) => f.key === 'scrolitha_signals');
    expect(disc?.weight).toBe(0);
    expect(disc?.placeholder).toBe(true);
    expect(scr?.weight).toBe(0);
    expect(scr?.placeholder).toBe(true);
  });

  test('ordering placeholder is identity', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    expect(applyPriorityOrderingPlaceholder(items)).toEqual(items);
    expect(applyPriorityOrderingPlaceholder(items)).toBe(items);
  });
});

describe('Priority service + façade', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env = { ...prev };
    invalidateNotificationIntelRolloutCache();
  });

  afterEach(() => {
    process.env = { ...prev };
    invalidateNotificationIntelRolloutCache();
  });

  test('service evaluate inactive when flags OFF', () => {
    delete process.env.NOTIF_INTEL_MASTER;
    delete process.env.NOTIF_INTEL_PRIORITY;
    invalidateNotificationIntelRolloutCache();
    const result = notificationPriorityService.evaluate({
      userId: 'u1',
      type: 'mention_post'
    });
    expect(result.engineActive).toBe(false);
    expect(result.reason).toBe('priority_engine_inactive');
    expect(result.orderingApplied).toBe(false);
    expect(notificationPriorityService.isEngineActive()).toBe(false);
  });

  test('service evaluate active when master+priority ON', () => {
    process.env.NOTIF_INTEL_MASTER = 'true';
    process.env.NOTIF_INTEL_PRIORITY = 'true';
    invalidateNotificationIntelRolloutCache();
    const result = notificationPriorityService.evaluate({
      userId: 'u1',
      type: 'security_suspicious_login',
      createdAt: new Date().toISOString()
    });
    expect(result.engineActive).toBe(true);
    expect(result.reason).toBe('evaluated');
    expect(result.orderingApplied).toBe(false);
    expect(ALL_PRIORITY_BANDS).toContain(result.band);
  });

  test('evaluateMany preserves input length and never reorders claim', () => {
    process.env.NOTIF_INTEL_MASTER = 'true';
    process.env.NOTIF_INTEL_PRIORITY = 'true';
    invalidateNotificationIntelRolloutCache();
    const results = notificationPriorityService.evaluateMany([
      { userId: 'u1', type: 'reaction_on_post' },
      { userId: 'u1', type: 'message_received' }
    ]);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.orderingApplied === false)).toBe(true);
  });

  test('diagnostics expose placeholders and env key', () => {
    const d = notificationPriorityService.getDiagnostics();
    expect(d.service).toBe('notification-priority');
    expect(d.envKey).toBe('NOTIF_INTEL_PRIORITY');
    expect(d.orderingApplied).toBe(false);
    expect(d.placeholders).toContain('list_reordering');
    expect(d.supportedBands).toEqual(ALL_PRIORITY_BANDS);
  });

  test('façade exposes priority service', () => {
    expect(notificationIntelligenceService.priority).toBe(notificationPriorityService);
  });
});
