import {
  detectScrolithaDomain,
  getDomainPromptPack,
  routeScrolithaModel,
  selectModelTier
} from '../scrolitha.phase3';

const runtime = {
  model: 'qwen3:14b',
  maxTokens: 900,
  temperature: 0.7,
  topP: 0.9
} as any;

describe('Scrolitha Phase 3 model routing', () => {
  test('detects domain without exposing user content', () => {
    expect(detectScrolithaDomain({ message: 'Improve my portfolio bio', page: '/profile' })).toBe('profile');
    expect(detectScrolithaDomain({ message: 'Find a service listing for logo design' })).toBe('marketplace');
    expect(detectScrolithaDomain({ message: 'How do I report harassment?' })).toBe('moderation');
  });

  test('selects bounded tiers by risk and complexity', () => {
    expect(selectModelTier({ message: 'Hi', domain: 'general' })).toBe('fast');
    expect(selectModelTier({ message: 'Review my profile and suggest improvements', domain: 'profile' })).toBe('standard');
    expect(selectModelTier({ message: 'Is this safe?', domain: 'moderation' })).toBe('advanced');
  });

  test('keeps the configured model as fallback and applies domain pack', () => {
    const decision = routeScrolithaModel({
      runtime,
      message: 'Create a hiring strategy',
      intent: 'RECRUITER',
      page: '/create-job',
      hasActions: true
    });
    expect(decision.model).toBe('qwen3:14b');
    expect(decision.domain).toBe('career');
    expect(decision.tier).toBe('standard');
    expect(getDomainPromptPack(decision.domain)).toMatch(/skills-based/i);
  });
});
