import type { ScrolithaActor } from './scrolitha.types';

type KnowledgeSection =
  | 'overview'
  | 'coreServices'
  | 'employerCapabilities'
  | 'freelancerCapabilities'
  | 'communicationAndCollaboration'
  | 'trustAndSafety'
  | 'growthAndMonetization'
  | 'platformGuidelines';

export type ScrolithaKnowledgeBundle = {
  overview: string;
  coreServices: string[];
  employerCapabilities: string[];
  freelancerCapabilities: string[];
  communicationAndCollaboration: string[];
  trustAndSafety: string[];
  growthAndMonetization: string[];
  platformGuidelines: string[];
};

const DEFAULT_KNOWLEDGE: ScrolithaKnowledgeBundle = {
  overview:
    'Scrolith is a professional services and talent marketplace where employers/clients, freelancers, and business teams connect to collaborate, hire, deliver projects, and grow in a trusted digital ecosystem.',
  coreServices: [
    'Marketplace for gigs, jobs, proposals, and project briefs.',
    'Community and homepage feeds for content, engagement, recommendations, and professional discovery.',
    'Real-time messaging, notifications, and collaboration with file-sharing support.',
    'Uploaded Files module for centralized asset management and attachment reuse.',
    'Role-aware dashboards for freelancers, clients/employers, moderators, and admins.'
  ],
  employerCapabilities: [
    'Create job posts, publish project briefs, and receive proposals from freelancers.',
    'Review, shortlist, and hire freelancers based on profiles, skills, and performance.',
    'Manage contracts, milestones, communication, and deliverables in one workflow.',
    'Use AI support to draft job descriptions, briefs, and hiring communication.',
    'Track project progress, notifications, and account operations from dashboard tools.'
  ],
  freelancerCapabilities: [
    'Create and optimize gigs/services with pricing, packages, and portfolio content.',
    'Find jobs, submit proposals, and negotiate scope, timelines, and milestones.',
    'Manage deliverables, client communication, and files in real time.',
    'Build reputation through profile quality, content, social proof, and consistent delivery.',
    'Use AI support to improve gig quality, proposal writing, and workflow efficiency.'
  ],
  communicationAndCollaboration: [
    'Real-time inbox messaging with replies, reactions, favorites, and conversation controls.',
    'Post interactions including reactions, comments, repost/share, and visibility options.',
    'Story and media flows with role-safe moderation and policy controls.',
    'Notification routing that directs users to the exact related page/content.'
  ],
  trustAndSafety: [
    'Role and permission controls enforce access boundaries.',
    'Audit-ready records for assistant actions and communications.',
    'Safety checks for prompt injection, policy-violating requests, and risky action guidance.',
    'Admin-managed controls for feature toggles, content policies, and moderation workflows.'
  ],
  growthAndMonetization: [
    'Wallet tools support balances, pending clearance, escrow visibility, and payout or funding workflows.',
    'Membership plans help freelancers and employers unlock retention, reach, and account growth features.',
    'Gcoin rewards and conversions support creator earnings, reward tracking, and monetization follow-through.',
    'Affiliate dashboards track referral links, earnings, withdrawals, and partner application status.',
    'Ads and promotion tools support campaign launch, reactivation, spend review, and marketplace visibility.'
  ],
  platformGuidelines: [
    'Scrolitha should provide guidance, drafts, and recommendations without bypassing platform permissions.',
    'No unauthorized financial, moderation, or destructive actions.',
    'All critical actions should require explicit confirmation when policy requires it.'
  ]
};

const normalizeText = (value: unknown) => String(value || '').trim();

const normalizeList = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => normalizeText(entry)).filter(Boolean);
};

const readKnowledgeFromMetadata = (metadata: unknown): Partial<ScrolithaKnowledgeBundle> => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const src = (metadata as Record<string, any>).knowledge;
  if (!src || typeof src !== 'object' || Array.isArray(src)) return {};

  return {
    overview: normalizeText(src.overview),
    coreServices: normalizeList(src.coreServices),
    employerCapabilities: normalizeList(src.employerCapabilities),
    freelancerCapabilities: normalizeList(src.freelancerCapabilities),
    communicationAndCollaboration: normalizeList(src.communicationAndCollaboration),
    trustAndSafety: normalizeList(src.trustAndSafety),
    growthAndMonetization: normalizeList(src.growthAndMonetization),
    platformGuidelines: normalizeList(src.platformGuidelines)
  };
};

const mergeKnowledge = (
  base: ScrolithaKnowledgeBundle,
  override: Partial<ScrolithaKnowledgeBundle>
): ScrolithaKnowledgeBundle => {
  const merged: ScrolithaKnowledgeBundle = {
    overview: override.overview || base.overview,
    coreServices: override.coreServices && override.coreServices.length ? override.coreServices : base.coreServices,
    employerCapabilities:
      override.employerCapabilities && override.employerCapabilities.length
        ? override.employerCapabilities
        : base.employerCapabilities,
    freelancerCapabilities:
      override.freelancerCapabilities && override.freelancerCapabilities.length
        ? override.freelancerCapabilities
        : base.freelancerCapabilities,
    communicationAndCollaboration:
      override.communicationAndCollaboration && override.communicationAndCollaboration.length
        ? override.communicationAndCollaboration
        : base.communicationAndCollaboration,
    trustAndSafety:
      override.trustAndSafety && override.trustAndSafety.length ? override.trustAndSafety : base.trustAndSafety,
    growthAndMonetization:
      override.growthAndMonetization && override.growthAndMonetization.length
        ? override.growthAndMonetization
        : base.growthAndMonetization,
    platformGuidelines:
      override.platformGuidelines && override.platformGuidelines.length
        ? override.platformGuidelines
        : base.platformGuidelines
  };
  return merged;
};

const rankSectionsByIntent = (message: string, role: string): KnowledgeSection[] => {
  const q = normalizeText(message).toLowerCase();
  const sections: KnowledgeSection[] = ['overview', 'coreServices'];
  const add = (section: KnowledgeSection) => {
    if (!sections.includes(section)) sections.push(section);
  };

  if (role.includes('freelancer')) add('freelancerCapabilities');
  if (role.includes('client') || role.includes('employer')) add('employerCapabilities');

  if (q.includes('job') || q.includes('hire') || q.includes('client') || q.includes('employer')) {
    add('employerCapabilities');
  }
  if (q.includes('gig') || q.includes('proposal') || q.includes('freelancer')) {
    add('freelancerCapabilities');
  }
  if (q.includes('message') || q.includes('chat') || q.includes('notification') || q.includes('story')) {
    add('communicationAndCollaboration');
  }
  if (q.includes('safe') || q.includes('policy') || q.includes('moderation') || q.includes('security')) {
    add('trustAndSafety');
  }
  if (
    q.includes('monetization') ||
    q.includes('growth') ||
    q.includes('promotion') ||
    q.includes('ads') ||
    q.includes('wallet') ||
    q.includes('payout') ||
    q.includes('billing') ||
    q.includes('membership') ||
    q.includes('subscription') ||
    q.includes('affiliate') ||
    q.includes('referral') ||
    q.includes('gcoin') ||
    q.includes('retention')
  ) {
    add('growthAndMonetization');
  }

  add('platformGuidelines');
  return sections;
};

const formatSection = (title: string, lines: string[]) => {
  if (!lines.length) return '';
  return `${title}:\n${lines.map((line) => `- ${line}`).join('\n')}`;
};

export const getScrolithaKnowledgeBundle = (metadata?: unknown): ScrolithaKnowledgeBundle => {
  const override = readKnowledgeFromMetadata(metadata);
  return mergeKnowledge(DEFAULT_KNOWLEDGE, override);
};

export const buildScrolithaKnowledgeContext = (input: {
  actor: ScrolithaActor;
  userMessage: string;
  metadata?: unknown;
}) => {
  const role = normalizeText(input.actor?.role || '').toLowerCase();
  const bundle = getScrolithaKnowledgeBundle(input.metadata);
  const sections = rankSectionsByIntent(input.userMessage, role);
  const parts: string[] = [];

  for (const section of sections) {
    if (section === 'overview') {
      parts.push(`Platform overview:\n- ${bundle.overview}`);
      continue;
    }
    if (section === 'coreServices') {
      parts.push(formatSection('Core services', bundle.coreServices));
      continue;
    }
    if (section === 'employerCapabilities') {
      parts.push(formatSection('What employers/clients can do', bundle.employerCapabilities));
      continue;
    }
    if (section === 'freelancerCapabilities') {
      parts.push(formatSection('What freelancers can do', bundle.freelancerCapabilities));
      continue;
    }
    if (section === 'communicationAndCollaboration') {
      parts.push(formatSection('Communication and collaboration', bundle.communicationAndCollaboration));
      continue;
    }
    if (section === 'trustAndSafety') {
      parts.push(formatSection('Trust and safety', bundle.trustAndSafety));
      continue;
    }
    if (section === 'growthAndMonetization') {
      parts.push(formatSection('Growth and monetization', bundle.growthAndMonetization));
      continue;
    }
    if (section === 'platformGuidelines') {
      parts.push(formatSection('Assistant operating guidelines', bundle.platformGuidelines));
    }
  }

  const merged = parts.join('\n\n').trim();
  if (merged.length <= 6000) return merged;
  return `${merged.slice(0, 6000)}...`;
};
