/**
 * Phase 33.3 — Modular Scrolitha skills registry.
 */
import type { CopilotSurface, ScrolithaSkillId } from '../types';
import type { ScrolithaSkill, SkillContext, SkillResult, SkillSuggestion } from './types';
import { detectIntentLocal } from '../providers/nativeProvider';

function baseSuggestion(
  skillId: ScrolithaSkillId,
  title: string,
  body: string,
  kind: SkillSuggestion['kind'] = 'tip',
  hrefHint?: string
): SkillSuggestion {
  return {
    id: `${skillId}-${kind}-${title.slice(0, 12)}`,
    title,
    body,
    kind,
    requiresUserAction: true,
    hrefHint,
    skillId
  };
}

function makeSkill(
  id: ScrolithaSkillId,
  surfaces: CopilotSurface[],
  keywords: RegExp,
  handler: (message: string, ctx: SkillContext) => SkillSuggestion[]
): ScrolithaSkill {
  return {
    id,
    surfaces,
    canHandle({ message, context }) {
      if (surfaces.includes(context.surface) || context.surface === 'generic') {
        return keywords.test(message) || surfaces.includes(context.surface);
      }
      return keywords.test(message);
    },
    async run({ message, context }) {
      const suggestions = handler(message, context).slice(0, 5);
      return {
        skillId: id,
        ok: true,
        suggestions,
        plan: suggestions.map((s) => s.title),
        usedNative: true
      };
    }
  };
}

const FeedSkill = makeSkill(
  'FeedSkill',
  ['feed'],
  /\b(feed|post|timeline|rank|for you)\b/i,
  (msg, ctx) => [
    baseSuggestion(
      'FeedSkill',
      'Feed ranking is deterministic',
      'Scrolitha can suggest relevance signals, but the existing feed algorithm stays authoritative. AI will not reorder posts for you automatically.',
      'explanation'
    ),
    baseSuggestion(
      'FeedSkill',
      'Draft a comment',
      `Draft a short, constructive comment related to: ${msg.slice(0, 120)}. You paste and post it yourself.`,
      'draft'
    ),
    ...(ctx.memoryTopics?.length
      ? [
          baseSuggestion(
            'FeedSkill',
            'Why this feed feels relevant',
            `Based on disclosed interests (${ctx.memoryTopics.slice(0, 3).join(', ')}), posts matching those topics may rank higher — as suggestions only.`,
            'explanation'
          )
        ]
      : [])
  ]
);

const JobSkill = makeSkill(
  'JobSkill',
  ['jobs', 'recruiting', 'freelancing'],
  /\b(job|career|hiring|apply|resume|cover)\b/i,
  (msg) => [
    baseSuggestion(
      'JobSkill',
      'Draft cover letter (not submitted)',
      `Outline a cover letter for: ${msg.slice(0, 160)}. Scrolitha never submits applications.`,
      'draft',
      '/jobs'
    ),
    baseSuggestion(
      'JobSkill',
      'Improve job search queries',
      'Ask SearchSkill for expanded queries, then run search yourself in Jobs.',
      'search',
      '/jobs'
    )
  ]
);

const MarketplaceSkill = makeSkill(
  'MarketplaceSkill',
  ['marketplace'],
  /\b(marketplace|gig|listing|product|sell|buy)\b/i,
  (msg) => [
    baseSuggestion(
      'MarketplaceSkill',
      'Draft listing copy',
      `Title + description draft for: ${msg.slice(0, 140)}. You publish only after review.`,
      'draft',
      '/marketplace'
    ),
    baseSuggestion(
      'MarketplaceSkill',
      'SEO keyword ideas',
      'Suggest 5 keywords for your listing (suggestion only).',
      'tip'
    )
  ]
);

const CommunitySkill = makeSkill(
  'CommunitySkill',
  ['communities'],
  /\b(community|group|forum|club)\b/i,
  (msg) => [
    baseSuggestion(
      'CommunitySkill',
      'Draft community announcement',
      `Announcement draft: ${msg.slice(0, 140)}. Not posted automatically.`,
      'draft'
    ),
    baseSuggestion(
      'CommunitySkill',
      'Community recommendations',
      'Open Discovery for explainable community suggestions.',
      'recommend',
      '/discovery'
    )
  ]
);

const MessagingSkill = makeSkill(
  'MessagingSkill',
  ['messaging'],
  /\b(message|dm|reply|chat)\b/i,
  (msg) => [
    baseSuggestion(
      'MessagingSkill',
      'Draft reply',
      `Polite reply draft for: ${msg.slice(0, 140)}. Scrolitha never sends messages.`,
      'draft'
    )
  ]
);

const NotificationSkill = makeSkill(
  'NotificationSkill',
  ['notifications'],
  /\b(notif|inbox|alert|priority)\b/i,
  () => [
    baseSuggestion(
      'NotificationSkill',
      'Priority suggestions only',
      'Scrolitha may suggest priority/grouping. Security, payment, and verification alerts stay highest priority.',
      'explanation',
      '/notifications'
    ),
    baseSuggestion(
      'NotificationSkill',
      'Summarize inbox',
      'Request a digest-style summary of non-critical items (suggestion only).',
      'tip'
    )
  ]
);

const SearchSkill = makeSkill(
  'SearchSkill',
  ['search', 'generic'],
  /\b(search|find|look for|query)\b/i,
  (msg) => {
    const q = msg.replace(/.*search( for)?/i, '').trim() || msg;
    return [
      baseSuggestion('SearchSkill', 'Expanded query A', q.slice(0, 80), 'search'),
      baseSuggestion('SearchSkill', 'Expanded query B', `${q.slice(0, 60)} remote`, 'search'),
      baseSuggestion(
        'SearchSkill',
        'Run search yourself',
        'Scrolitha only suggests queries; deterministic search executes.',
        'action_hint'
      )
    ];
  }
);

const ResumeSkill = makeSkill(
  'ResumeSkill',
  ['profiles', 'jobs', 'freelancing'],
  /\b(resume|cv|bio|profile summary)\b/i,
  (msg) => [
    baseSuggestion(
      'ResumeSkill',
      'Resume summary draft',
      `Professional summary draft based on: ${msg.slice(0, 160)}`,
      'draft'
    )
  ]
);

const RecruiterSkill = makeSkill(
  'RecruiterSkill',
  ['recruiting', 'jobs', 'administration'],
  /\b(recruit|candidate|shortlist|hire)\b/i,
  () => [
    baseSuggestion(
      'RecruiterSkill',
      'Screening checklist',
      'Draft a neutral screening checklist. No automated hiring decisions.',
      'tip'
    ),
    baseSuggestion(
      'RecruiterSkill',
      'Job description draft',
      'Draft JD text only — you publish the job.',
      'draft'
    )
  ]
);

const BusinessSkill = makeSkill(
  'BusinessSkill',
  ['business_pages'],
  /\b(business|company page|promo|announcement)\b/i,
  (msg) => [
    baseSuggestion(
      'BusinessSkill',
      'Business announcement draft',
      `Draft: ${msg.slice(0, 140)}. Not published automatically.`,
      'draft'
    )
  ]
);

const AnalyticsSkill = makeSkill(
  'AnalyticsSkill',
  ['administration', 'generic'],
  /\b(analytics|metrics|ctr|dashboard|performance)\b/i,
  () => [
    baseSuggestion(
      'AnalyticsSkill',
      'Where to look',
      'Admin → Scrolitha AI → Discovery Analytics for recommendation CTR/dismissal proxies. Core product analytics remain in their modules.',
      'explanation',
      '/admin/dashboard?tab=scrolitha-ai'
    )
  ]
);

export const ALL_SKILLS: ScrolithaSkill[] = [
  FeedSkill,
  JobSkill,
  MarketplaceSkill,
  CommunitySkill,
  MessagingSkill,
  NotificationSkill,
  SearchSkill,
  ResumeSkill,
  RecruiterSkill,
  BusinessSkill,
  AnalyticsSkill
];

export function listSkills() {
  return ALL_SKILLS.map((s) => ({ id: s.id, surfaces: s.surfaces }));
}

export function resolveSkills(message: string, context: SkillContext): ScrolithaSkill[] {
  const matched = ALL_SKILLS.filter((s) => s.canHandle({ message, context }));
  if (matched.length) return matched.slice(0, 3);
  // fallback by surface
  const bySurface = ALL_SKILLS.filter((s) => s.surfaces.includes(context.surface));
  return (bySurface.length ? bySurface : [SearchSkill]).slice(0, 2);
}

export async function runSkills(message: string, context: SkillContext): Promise<SkillResult[]> {
  const skills = resolveSkills(message, context);
  const results: SkillResult[] = [];
  for (const skill of skills) {
    results.push(await skill.run({ message, context }));
  }
  return results;
}

export function pickPrimarySkill(message: string, surface: CopilotSurface): ScrolithaSkillId {
  const intent = detectIntentLocal(message);
  const map: Record<string, ScrolithaSkillId> = {
    jobs: 'JobSkill',
    marketplace: 'MarketplaceSkill',
    community: 'CommunitySkill',
    notifications: 'NotificationSkill',
    search: 'SearchSkill',
    feed: 'FeedSkill',
    messaging: 'MessagingSkill',
    profile: 'ResumeSkill',
    business: 'BusinessSkill',
    recruiting: 'RecruiterSkill',
    analytics: 'AnalyticsSkill'
  };
  if (map[intent.intent]) return map[intent.intent];
  const bySurface: Partial<Record<CopilotSurface, ScrolithaSkillId>> = {
    feed: 'FeedSkill',
    jobs: 'JobSkill',
    marketplace: 'MarketplaceSkill',
    communities: 'CommunitySkill',
    messaging: 'MessagingSkill',
    notifications: 'NotificationSkill',
    search: 'SearchSkill',
    profiles: 'ResumeSkill',
    business_pages: 'BusinessSkill',
    recruiting: 'RecruiterSkill',
    freelancing: 'JobSkill',
    administration: 'AnalyticsSkill'
  };
  return bySurface[surface] || 'SearchSkill';
}

export type { SkillContext, SkillResult, SkillSuggestion, ScrolithaSkill };
