/**
 * Phase 33.1 — Curated, versioned prompt library (not user system prompts).
 */
export type PromptLibraryCategory =
  | 'professional'
  | 'business'
  | 'education'
  | 'marketing'
  | 'community'
  | 'freelancing'
  | 'recruitment'
  | 'productivity';

export type PromptLibraryItem = {
  id: string;
  key: string;
  title: string;
  description: string;
  category: PromptLibraryCategory;
  version: number;
  status: 'published' | 'deprecated';
  /** User-facing starter text inserted into assistant — not a system prompt override */
  userTemplate: string;
  draftKind?: string;
  locale: string;
  tags: string[];
};

const LIBRARY: PromptLibraryItem[] = [
  {
    id: 'pl-prof-1',
    key: 'professional.linkedin_style_post',
    title: 'Professional post draft',
    description: 'Draft a professional networking post from a short idea.',
    category: 'professional',
    version: 1,
    status: 'published',
    userTemplate: 'Draft a professional post about: {{topic}}. Keep it concise and authentic.',
    draftKind: 'post',
    locale: 'en',
    tags: ['post', 'professional']
  },
  {
    id: 'pl-biz-1',
    key: 'business.page_announcement',
    title: 'Business page announcement',
    description: 'Draft an announcement for a business page (draft only).',
    category: 'business',
    version: 1,
    status: 'published',
    userTemplate: 'Draft a business page announcement about: {{topic}}. Do not publish.',
    draftKind: 'business_announcement',
    locale: 'en',
    tags: ['business', 'announcement']
  },
  {
    id: 'pl-edu-1',
    key: 'education.explain_simply',
    title: 'Explain simply',
    description: 'Explain a topic in plain language.',
    category: 'education',
    version: 1,
    status: 'published',
    userTemplate: 'Explain this simply for a general audience: {{topic}}',
    locale: 'en',
    tags: ['education', 'simplify']
  },
  {
    id: 'pl-mkt-1',
    key: 'marketing.promo_post',
    title: 'Marketing promotion draft',
    description: 'Draft a promotional post with clear CTA (draft only).',
    category: 'marketing',
    version: 1,
    status: 'published',
    userTemplate: 'Draft a marketing promotion for: {{topic}}. Include a soft call to action.',
    draftKind: 'promotion',
    locale: 'en',
    tags: ['marketing', 'promo']
  },
  {
    id: 'pl-com-1',
    key: 'community.announcement',
    title: 'Community announcement',
    description: 'Draft a community announcement.',
    category: 'community',
    version: 1,
    status: 'published',
    userTemplate: 'Draft a friendly community announcement about: {{topic}}',
    draftKind: 'community_announcement',
    locale: 'en',
    tags: ['community']
  },
  {
    id: 'pl-free-1',
    key: 'freelancing.proposal_outline',
    title: 'Freelance proposal outline',
    description: 'Outline a proposal response (draft only).',
    category: 'freelancing',
    version: 1,
    status: 'published',
    userTemplate: 'Draft an outline for a freelance proposal about: {{topic}}. Do not submit.',
    draftKind: 'message',
    locale: 'en',
    tags: ['freelance', 'proposal']
  },
  {
    id: 'pl-rec-1',
    key: 'recruitment.job_description',
    title: 'Job description draft',
    description: 'Draft a job description (never posts the job).',
    category: 'recruitment',
    version: 1,
    status: 'published',
    userTemplate: 'Draft a job description for: {{topic}}. Include responsibilities and requirements.',
    draftKind: 'job_description',
    locale: 'en',
    tags: ['jobs', 'recruitment']
  },
  {
    id: 'pl-rec-2',
    key: 'recruitment.cover_letter',
    title: 'Cover letter draft',
    description: 'Draft a cover letter (never applies).',
    category: 'recruitment',
    version: 1,
    status: 'published',
    userTemplate: 'Draft a cover letter for role: {{topic}}. Do not submit an application.',
    draftKind: 'cover_letter',
    locale: 'en',
    tags: ['jobs', 'cover-letter']
  },
  {
    id: 'pl-prod-1',
    key: 'productivity.summarize_notes',
    title: 'Summarize notes',
    description: 'Turn notes into a short summary.',
    category: 'productivity',
    version: 1,
    status: 'published',
    userTemplate: 'Summarize these notes into key points:\n{{topic}}',
    locale: 'en',
    tags: ['summary', 'productivity']
  },
  {
    id: 'pl-mkt-2',
    key: 'marketing.marketplace_listing',
    title: 'Marketplace listing draft',
    description: 'Draft title and description for a listing (never publishes).',
    category: 'marketing',
    version: 1,
    status: 'published',
    userTemplate: 'Draft a marketplace listing (title + description + SEO keywords) for: {{topic}}. Do not publish.',
    draftKind: 'marketplace_listing',
    locale: 'en',
    tags: ['marketplace', 'seo']
  },
  {
    id: 'pl-prod-2',
    key: 'productivity.comment_reply',
    title: 'Comment reply draft',
    description: 'Draft a thoughtful comment reply.',
    category: 'productivity',
    version: 1,
    status: 'published',
    userTemplate: 'Draft a polite comment reply about: {{topic}}',
    draftKind: 'comment',
    locale: 'en',
    tags: ['comment']
  },
  {
    id: 'pl-prof-2',
    key: 'professional.bio',
    title: 'Profile bio draft',
    description: 'Draft a short professional bio.',
    category: 'professional',
    version: 1,
    status: 'published',
    userTemplate: 'Draft a professional bio based on: {{topic}}',
    draftKind: 'bio',
    locale: 'en',
    tags: ['bio', 'profile']
  }
];

export function listPromptLibrary(opts: {
  category?: PromptLibraryCategory | string;
  q?: string;
  locale?: string;
} = {}): PromptLibraryItem[] {
  const q = String(opts.q || '').toLowerCase().trim();
  const cat = String(opts.category || '').toLowerCase().trim();
  return LIBRARY.filter((p) => p.status === 'published')
    .filter((p) => (cat ? p.category === cat : true))
    .filter((p) =>
      q
        ? p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.includes(q))
        : true
    )
    .filter((p) => !opts.locale || p.locale === opts.locale || p.locale === 'en');
}

export function getPromptLibraryItem(idOrKey: string): PromptLibraryItem | null {
  return LIBRARY.find((p) => p.id === idOrKey || p.key === idOrKey) || null;
}

export function renderPromptTemplate(item: PromptLibraryItem, vars: Record<string, string>): string {
  let out = item.userTemplate;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), v);
  }
  // leftover topic empty
  out = out.replace(/\{\{\s*topic\s*\}\}/g, vars.topic || '');
  return out;
}

export function promptLibraryCategories(): PromptLibraryCategory[] {
  return [
    'professional',
    'business',
    'education',
    'marketing',
    'community',
    'freelancing',
    'recruitment',
    'productivity'
  ];
}

export default {
  listPromptLibrary,
  getPromptLibraryItem,
  renderPromptTemplate,
  promptLibraryCategories
};
