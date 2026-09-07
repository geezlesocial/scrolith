import { DEFAULT_ENGAGEMENT_TEMPLATES, ENGAGEMENT_EVENT_TYPES } from '../contracts';
import { EngagementMilestoneAdminService } from '../admin.service';

describe('engagement milestone contracts', () => {
  it('defines the approved extensible event set and deterministic fallbacks', () => {
    expect(Object.keys(ENGAGEMENT_EVENT_TYPES)).toHaveLength(9);
    for (const eventType of Object.values(ENGAGEMENT_EVENT_TYPES)) {
      expect(DEFAULT_ENGAGEMENT_TEMPLATES[eventType]).toEqual(expect.objectContaining({
        title: expect.any(String),
        body: expect.any(String),
        deepLink: expect.any(String)
      }));
    }
  });

  it('previews a rule without invoking AI or delivery', () => {
    const preview = EngagementMilestoneAdminService.preview({
      eventType: ENGAGEMENT_EVENT_TYPES.POST_IMPRESSION,
      thresholds: [50],
      aiAssistanceEnabled: true
    });
    expect(preview.deterministicFallback).toBe(true);
    expect(preview.aiAssistanceEnabled).toBe(true);
    expect(preview.body).toContain('{{count}}');
  });
});
