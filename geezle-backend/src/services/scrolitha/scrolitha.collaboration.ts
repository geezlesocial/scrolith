/**
 * AI Collaboration layer — loose coupling to platform modules.
 * Modules publish capability descriptors; Scrolitha invokes safely via intents.
 */
export type ModuleId =
  | 'recruitment'
  | 'freelancing'
  | 'marketplace'
  | 'communities'
  | 'messaging'
  | 'profile'
  | 'analytics'
  | 'moderation'
  | 'search';

export type ModuleCapability = {
  moduleId: ModuleId;
  actions: string[];
  description: string;
  buildHints: (ctx: { question: string; surface?: string; role?: string }) => string[];
};

const registry = new Map<ModuleId, ModuleCapability>();

export const registerModuleCapability = (cap: ModuleCapability) => {
  registry.set(cap.moduleId, cap);
};

export const listModuleCapabilities = () => Array.from(registry.values());

const defaultCaps: ModuleCapability[] = [
  {
    moduleId: 'recruitment',
    actions: ['explain_job', 'match_skills', 'draft_outreach'],
    description: 'Public job and hiring assistance',
    buildHints: ({ question, role }) => {
      const hints: string[] = [];
      if (/\bjob|hiring|candidate|recruit\b/i.test(question) || /employer|recruiter/i.test(role || '')) {
        hints.push('Use public job listings and skill signals only; never expose private applications.');
      }
      return hints;
    }
  },
  {
    moduleId: 'freelancing',
    actions: ['explain_service', 'package_advice'],
    description: 'Public gig/service assistance',
    buildHints: ({ question }) =>
      /\bgig|service|freelance|proposal\b/i.test(question)
        ? ['Recommend public services; do not invent pricing guarantees.']
        : []
  },
  {
    moduleId: 'marketplace',
    actions: ['discover_listings'],
    description: 'Marketplace discovery',
    buildHints: ({ question }) =>
      /\bmarket|buy|sell|listing\b/i.test(question) ? ['Stay within public marketplace visibility.'] : []
  },
  {
    moduleId: 'communities',
    actions: ['explain_rules', 'find_communities'],
    description: 'Community context',
    buildHints: ({ question, surface }) =>
      surface === 'community' || /\bcommunity|group|club\b/i.test(question)
        ? ['Use public community metadata; moderators retain final authority.']
        : []
  },
  {
    moduleId: 'messaging',
    actions: ['draft_message'],
    description: 'Draft help only — no inbox scanning',
    buildHints: ({ surface }) =>
      surface === 'messaging' ? ['Do not read private message bodies unless user pasted them.'] : []
  },
  {
    moduleId: 'profile',
    actions: ['summarize_profile'],
    description: 'Public profile signals',
    buildHints: ({ question }) =>
      /\bprofile|who is|skills\b/i.test(question) ? ['Use public profile fields only.'] : []
  },
  {
    moduleId: 'analytics',
    actions: ['usage_summary'],
    description: 'Non-private AI usage analytics',
    buildHints: ({ role }) =>
      /admin|moderator/i.test(role || '') ? ['Share aggregate counters only, never prompts.'] : []
  },
  {
    moduleId: 'moderation',
    actions: ['assist_review'],
    description: 'Human-in-the-loop moderation assist',
    buildHints: ({ question, role }) =>
      /moderat|spam|misinfo/i.test(question) || /moderator|admin/i.test(role || '')
        ? ['Suggest only; never auto-remove content.']
        : []
  },
  {
    moduleId: 'search',
    actions: ['deep_search'],
    description: 'Permission-aware deep search',
    buildHints: ({ question }) =>
      /\bfind|search|related|similar\b/i.test(question) ? ['Prefer deep platform search over guessing.'] : []
  }
];

for (const cap of defaultCaps) registerModuleCapability(cap);

export const collectCollaborationHints = (input: {
  question: string;
  surface?: string;
  role?: string;
}): { modules: ModuleId[]; hints: string[] } => {
  const modules: ModuleId[] = [];
  const hints: string[] = [];
  for (const cap of listModuleCapabilities()) {
    const h = cap.buildHints(input);
    if (h.length) {
      modules.push(cap.moduleId);
      hints.push(...h);
    }
  }
  return { modules, hints: Array.from(new Set(hints)).slice(0, 8) };
};
