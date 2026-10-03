import { DEFAULT_FOLLOW_ONBOARDING_CONTENT, followOnboardingContentSchema, normalizeFollowOnboardingContent } from '../followOnboardingContent';

describe('follow onboarding CMS content', () => {
  it('returns conservative defaults for missing/invalid content without changing policy fields', () => {
    expect(DEFAULT_FOLLOW_ONBOARDING_CONTENT.featureCards).toEqual([]);
    expect(normalizeFollowOnboardingContent({})).toEqual(DEFAULT_FOLLOW_ONBOARDING_CONTENT);
  });

  it('accepts HTTPS and same-origin image references only', () => {
    const base = structuredClone(DEFAULT_FOLLOW_ONBOARDING_CONTENT);
    for (const imageUrl of ['https://cdn.example.test/onboarding.webp', '/uploads/onboarding.webp']) {
      expect(followOnboardingContentSchema.safeParse({ ...base, hero: { ...base.hero, imageUrl } }).success).toBe(true);
    }
    for (const imageUrl of ['javascript:alert(1)', '//untrusted.test/image.png', 'data:image/png;base64,abc']) {
      expect(followOnboardingContentSchema.safeParse({ ...base, hero: { ...base.hero, imageUrl } }).success).toBe(false);
    }
  });

  it('bounds card count and rejects unknown configuration fields', () => {
    const base = structuredClone(DEFAULT_FOLLOW_ONBOARDING_CONTENT);
    const cards = Array.from({ length: 7 }, (_, index) => ({ id: `card-${index}`, title: 'Title', description: '', imageUrl: '', enabled: true }));
    expect(followOnboardingContentSchema.safeParse({ ...base, featureCards: cards }).success).toBe(false);
    expect(followOnboardingContentSchema.safeParse({ ...base, unexpected: true }).success).toBe(false);
    expect(followOnboardingContentSchema.safeParse({ ...base, featureCards: [
      { id: 'duplicate', title: 'One', description: '', imageUrl: '', enabled: true },
      { id: 'duplicate', title: 'Two', description: '', imageUrl: '', enabled: true }
    ] }).success).toBe(false);
  });
});
