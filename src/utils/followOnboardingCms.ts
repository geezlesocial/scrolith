import type { FollowOnboardingContent } from '../types';

export const DEFAULT_FOLLOW_ONBOARDING_CONTENT: FollowOnboardingContent = {
  hero: {
    eyebrow: 'Set up your feed',
    title: 'Build your first Scrolith feed',
    description: "Choose languages you understand, then follow at least one person or page. We'll personalize your first feed from these choices.",
    imageUrl: ''
  },
  featureCards: [],
  guidance: {
    title: 'Why we ask this',
    language: 'Languages guide translation suggestions — never nationality or location.',
    follows: 'Follows seed your first feed with people and pages you care about.',
    privacy: 'You can change follows and languages anytime after you continue.'
  }
};
