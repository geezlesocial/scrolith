import { z } from 'zod';

const safeImageUrl = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}, 'Image URL must be an HTTPS URL or a same-origin path');

const text = (max: number) => z.string().trim().max(max);

export const followOnboardingContentSchema = z.object({
  hero: z.object({ eyebrow: text(80), title: text(160).min(1), description: text(1000).min(1), imageUrl: safeImageUrl }).strict(),
  featureCards: z.array(z.object({
    id: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
    title: text(100).min(1), description: text(400), imageUrl: safeImageUrl, enabled: z.boolean()
  }).strict()).max(6),
  guidance: z.object({ title: text(100).min(1), language: text(300).min(1), follows: text(300).min(1), privacy: text(300).min(1) }).strict(),
  updatedAt: z.string().datetime().optional()
}).strict().superRefine((content, context) => {
  const ids = content.featureCards.map((card) => card.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['featureCards'], message: 'Feature card IDs must be unique' });
  }
});

export type FollowOnboardingContent = z.infer<typeof followOnboardingContentSchema>;

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

export const normalizeFollowOnboardingContent = (value: unknown): FollowOnboardingContent => {
  const parsed = followOnboardingContentSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_FOLLOW_ONBOARDING_CONTENT;
};
