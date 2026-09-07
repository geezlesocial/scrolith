jest.mock('../../scrolithaAi', () => ({
  ScrolithaAI: { execute: jest.fn() }
}));

jest.mock('../../scrolithaAi/observability', () => ({
  logAIEvent: jest.fn()
}));

jest.mock('../../notificationCenter/analytics', () => ({
  bumpNotificationMetric: jest.fn().mockResolvedValue(undefined),
  writeNotificationAudit: jest.fn().mockResolvedValue(undefined)
}));

import { ScrolithaAI } from '../../scrolithaAi';
import {
  getCachedEngagementNotificationCopy,
  warmEngagementNotificationCopy
} from '../aiCopy.service';

const execute = ScrolithaAI.execute as jest.Mock;

describe('engagement notification AI copy', () => {
  beforeEach(() => {
    execute.mockReset();
  });

  it('warms and serves bounded copy without sending entity identifiers', async () => {
    execute.mockResolvedValue({
      ok: true,
      data: {
        title: 'Your reach is growing',
        body: 'Your post reached {{count}} impressions at the {{threshold}} milestone.'
      },
      disclosure: { provider: 'OLLAMA', model: 'qwen3:14b', promptVersion: 'engagement.notification_copy@1' }
    });

    const input = {
      ruleId: 'rule-copy-1',
      eventType: 'engagement.post.impression',
      entityType: 'post',
      threshold: 50,
      locale: 'en'
    };
    const result = await warmEngagementNotificationCopy(input);
    expect(result).toEqual({ usedAI: true, cacheHit: false });
    expect(getCachedEngagementNotificationCopy(input)).toEqual({
      title: 'Your reach is growing',
      body: 'Your post reached {{count}} impressions at the {{threshold}} milestone.'
    });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      userId: null,
      capability: 'ENGAGEMENT_NOTIFICATION_COPY',
      policy: expect.objectContaining({ requireOllama: true, timeoutMs: 3500 }),
      input: expect.objectContaining({ entityType: 'post', threshold: 50 })
    }));
    expect(execute.mock.calls[0][0].input).not.toHaveProperty('entityId');
  });

  it('rejects invalid AI output so the caller keeps deterministic fallback', async () => {
    execute.mockResolvedValue({
      ok: true,
      data: { title: 'Unsafe https://example.test', body: 'No count here.' },
      disclosure: { provider: 'OLLAMA', model: 'qwen3:14b', promptVersion: 'engagement.notification_copy@1' }
    });

    const input = {
      ruleId: 'rule-copy-invalid',
      eventType: 'engagement.profile.direct_view',
      entityType: 'profile',
      threshold: 40,
      locale: 'en'
    };
    await expect(warmEngagementNotificationCopy(input)).resolves.toEqual({ usedAI: false, cacheHit: false });
    expect(getCachedEngagementNotificationCopy(input)).toBeNull();
  });
});
