/**
 * Phase 20.7.3 — Explicit intent routing hierarchy for Scrolitha.
 * Priority: safety → conversation → explicit platform intent → clarification → tools → general.
 * Role/scope/route refine authorized tools; they never override explicit user text.
 */
import type { ScrolithaActor, ScrolithaPlanSuggestion } from './scrolitha.types';

export type ScrolithaIntent =
  | 'CONVERSATION_GREETING'
  | 'CONVERSATION_THANKS'
  | 'CONVERSATION_GOODBYE'
  | 'CONVERSATION_HELP'
  | 'GENERAL_QUESTION'
  | 'PLATFORM_HELP'
  | 'JOB_SEARCH'
  | 'JOB_RECOMMENDATION'
  | 'FREELANCER_SEARCH'
  | 'MARKETPLACE_SEARCH'
  | 'COMMUNITY_SEARCH'
  | 'PROFILE_REVIEW'
  | 'RESUME_REVIEW'
  | 'RESUME_IMPROVEMENT'
  | 'PROPOSAL_DRAFT'
  | 'POST_DRAFT'
  | 'MESSAGE_DRAFT'
  | 'NOTIFICATION_QUERY'
  | 'WALLET_QUERY'
  | 'FILE_UPLOAD_HELP'
  | 'FILE_REVIEW'
  | 'CONTRACT_QUERY'
  | 'GROWTH_PLAN'
  | 'EMPLOYER_GROWTH'
  | 'SUPPORT_TICKET'
  | 'CREATE_GIG'
  | 'CREATE_JOB'
  | 'UNKNOWN';

export type ScrolithaIntentRouteResult = {
  intent: ScrolithaIntent;
  confidence: number;
  /** Whether tool/action plans may be created for this turn */
  allowTools: boolean;
  /** User-visible reply when tools are off or no LLM reply is available */
  userFacingReply: string;
  /** Optional follow-up chips */
  followUpPrompts: string[];
  /** Tool suggestions (only when allowTools and confidence high enough) */
  suggestions: ScrolithaPlanSuggestion[];
  /** Structured router metadata for logs — never put in user-visible body */
  routerMeta: {
    version: 1;
    matchedPatterns: string[];
    roleUsedForRefinementOnly: boolean;
    minConfidence: number;
    skillsMatchUsed: boolean;
  };
};

const MIN_TOOL_CONFIDENCE = 0.72;
const MIN_SKILL_TOKEN_LEN = 4;

const norm = (s: string) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokensOf = (s: string) => norm(s).split(' ').filter(Boolean);

const includesAny = (hay: string, needles: string[]) => needles.some((n) => hay.includes(n));

const wholeWord = (hay: string, word: string) => new RegExp(`(?:^|\\s)${word}(?:$|\\s)`, 'i').test(hay);

const GREETING_RE =
  /^(hi|hello|hey|howdy|hiya|good\s*(morning|afternoon|evening)|yo|sup|what'?s\s*up|hola|greetings)([!?.\s]*)$/i;

const THANKS_RE = /^(thanks|thank\s*you|thx|ty|appreciate\s*it)([!?.\s]*)$/i;

const GOODBYE_RE = /^(bye|goodbye|see\s*you|cya|later|good\s*night)([!?.\s]*)$/i;

const HELP_RE =
  /^(help|what\s+can\s+you\s+do|what\s+do\s+you\s+do|how\s+can\s+you\s+help|capabilities|who\s+are\s+you)([!?.\s]*)$/i;

const JOB_PATTERNS = [
  'find job',
  'find jobs',
  'search job',
  'search jobs',
  'job for me',
  'jobs for me',
  'looking for a job',
  'looking for jobs',
  'job search',
  'jobs near me',
  'recommend job',
  'recommend jobs',
  'match me with job',
  'match me with jobs',
  'open roles',
  'hiring for me',
  'show me jobs',
  'show jobs'
];

const FREELANCER_PATTERNS = [
  'find freelancer',
  'find freelancers',
  'hire freelancer',
  'hire freelancers',
  'search freelancer',
  'who can build',
  'find talent'
];

const RESUME_IMPROVE_PATTERNS = [
  'improve my resume',
  'improve resume',
  'resume improve',
  'cv improve',
  'improve my cv',
  'rewrite my resume',
  'polish my resume'
];

const PROFILE_PATTERNS = ['review my profile', 'improve my profile', 'check my profile', 'profile review'];

const WALLET_PATTERNS = ['my wallet', 'wallet balance', 'show wallet', 'payout', 'withdrawal'];

const FILE_UPLOAD_PATTERNS = [
  'upload a file',
  'upload file',
  'how to upload',
  'attach a file',
  'file library',
  'uploaded files'
];

const GROWTH_PATTERNS = [
  'grow my business',
  'help my business grow',
  'employer growth',
  'growth plan',
  'retention',
  'monetization review',
  'ad performance',
  'referral earnings'
];

const greetingReply = () =>
  "Hi! I'm **Scrolitha**, Scrolith's AI assistant. I can help you find jobs, freelancers, improve your profile or resume, draft proposals and posts, and navigate Scrolith. What would you like to do?";

const thanksReply = () => "You're welcome. If you need anything else on Scrolith — jobs, profile help, drafts, or navigation — just ask.";

const goodbyeReply = () => 'Goodbye for now. Come back anytime when you need help on Scrolith.';

const helpReply = () =>
  "I'm Scrolitha. I can help with job discovery, freelancer search, profile and resume improvement, proposal and post drafts, marketplace and communities, and general Scrolith guidance. What would you like to focus on?";

const jobSearchFallback = (role: string) => {
  const r = role.toLowerCase();
  const roleHint = r.includes('employer') || r.includes('client')
    ? 'If you are hiring instead, say “find freelancers” or “post a job.”'
    : 'I can also help refine your resume or profile for better matches.';
  return (
    'I can help you find jobs.\n\n' +
    'What kind of role are you looking for, and do you prefer **remote**, **hybrid**, or **onsite** work? ' +
    'Live job results may be limited in this chat right now, but I can help you refine your search and prepare your profile.\n\n' +
    roleHint
  );
};

const freelancerSearchFallback = () =>
  'I can help you find freelancers.\n\nWhat skills or role do you need (for example React, design, mobile), and what is your approximate budget or timeline? Live discovery may be limited here, but I can help frame the brief.';

const unknownReply = () =>
  "I can help with jobs, freelancers, profiles, resumes, drafts, and navigating Scrolith. Tell me what you want to do in a short phrase — for example “find jobs” or “improve my resume.”";

/**
 * Pure intent router — deterministic, unit-testable, role-safe.
 */
export const routeScrolithaIntent = (input: {
  message: string;
  actor: ScrolithaActor;
  page?: string | null;
  toolsEnabled?: boolean;
}): ScrolithaIntentRouteResult => {
  const raw = String(input.message || '').trim();
  const hay = norm(raw);
  const matchedPatterns: string[] = [];
  const role = String(input.actor.role || '');
  const toolsEnabled = Boolean(input.toolsEnabled);
  const minConfidence = MIN_TOOL_CONFIDENCE;

  const baseMeta = {
    version: 1 as const,
    matchedPatterns,
    roleUsedForRefinementOnly: true,
    minConfidence,
    skillsMatchUsed: false
  };

  if (!hay) {
    return {
      intent: 'UNKNOWN',
      confidence: 1,
      allowTools: false,
      userFacingReply: unknownReply(),
      followUpPrompts: ['Find jobs for me', 'Improve my resume', 'What can you do?'],
      suggestions: [],
      routerMeta: baseMeta
    };
  }

  // Priority 2 — conversational intents (before any tool selection)
  if (GREETING_RE.test(raw) || GREETING_RE.test(hay)) {
    matchedPatterns.push('greeting');
    return {
      intent: 'CONVERSATION_GREETING',
      confidence: 0.99,
      allowTools: false,
      userFacingReply: greetingReply(),
      followUpPrompts: ['Find jobs for me', 'Improve my resume', 'Find freelancers', 'What can you do?'],
      suggestions: [],
      routerMeta: baseMeta
    };
  }

  if (THANKS_RE.test(raw) || THANKS_RE.test(hay)) {
    matchedPatterns.push('thanks');
    return {
      intent: 'CONVERSATION_THANKS',
      confidence: 0.98,
      allowTools: false,
      userFacingReply: thanksReply(),
      followUpPrompts: [],
      suggestions: [],
      routerMeta: baseMeta
    };
  }

  if (GOODBYE_RE.test(raw) || GOODBYE_RE.test(hay)) {
    matchedPatterns.push('goodbye');
    return {
      intent: 'CONVERSATION_GOODBYE',
      confidence: 0.98,
      allowTools: false,
      userFacingReply: goodbyeReply(),
      followUpPrompts: [],
      suggestions: [],
      routerMeta: baseMeta
    };
  }

  if (HELP_RE.test(raw) || HELP_RE.test(hay) || hay === 'help me' || hay === 'help please') {
    matchedPatterns.push('help');
    return {
      intent: 'CONVERSATION_HELP',
      confidence: 0.95,
      allowTools: false,
      userFacingReply: helpReply(),
      followUpPrompts: ['Find jobs for me', 'Improve my resume', 'Draft a proposal'],
      suggestions: [],
      routerMeta: baseMeta
    };
  }

  // Priority 3 — explicit platform-domain intents
  if (includesAny(hay, JOB_PATTERNS) || (wholeWord(hay, 'jobs') && includesAny(hay, ['find', 'search', 'show', 'need', 'looking']))) {
    matchedPatterns.push('job_search');
    // Never select employer growth tools for job discovery — even for admin/employer roles.
    return {
      intent: 'JOB_SEARCH',
      confidence: 0.95,
      allowTools: false, // job search tool not production-activated without toolExecution + search tool
      userFacingReply: jobSearchFallback(role),
      followUpPrompts: ['Remote React jobs', 'Improve my resume', 'Review my profile'],
      suggestions: [],
      routerMeta: baseMeta
    };
  }

  if (includesAny(hay, FREELANCER_PATTERNS)) {
    matchedPatterns.push('freelancer_search');
    return {
      intent: 'FREELANCER_SEARCH',
      confidence: 0.93,
      allowTools: false,
      userFacingReply: freelancerSearchFallback(),
      followUpPrompts: ['Mobile app freelancers', 'Create a job draft'],
      suggestions: [],
      routerMeta: baseMeta
    };
  }

  if (includesAny(hay, RESUME_IMPROVE_PATTERNS) || (wholeWord(hay, 'resume') && includesAny(hay, ['improve', 'rewrite', 'polish', 'fix']))) {
    matchedPatterns.push('resume_improvement');
    return {
      intent: 'RESUME_IMPROVEMENT',
      confidence: 0.92,
      allowTools: false,
      userFacingReply:
        'I can help improve your resume. Share the role you want, your top skills, and any weak sections (summary, experience, or skills). Paste text or attach a resume when file understanding is available.',
      followUpPrompts: ['Review my profile', 'Find jobs for me'],
      suggestions: [],
      routerMeta: baseMeta
    };
  }

  if (includesAny(hay, PROFILE_PATTERNS) || (wholeWord(hay, 'profile') && includesAny(hay, ['review', 'improve', 'check']))) {
    matchedPatterns.push('profile_review');
    const suggestions: ScrolithaPlanSuggestion[] = toolsEnabled
      ? [
          {
            actionKey: 'get_me_profile',
            toolKey: 'GET_ME_PROFILE',
            summary: 'Load your profile details for a review.',
            paramsPreview: {}
          }
        ]
      : [];
    return {
      intent: 'PROFILE_REVIEW',
      confidence: 0.9,
      allowTools: toolsEnabled && suggestions.length > 0,
      userFacingReply: toolsEnabled
        ? 'I can review your profile. Confirm if you want me to load your profile context and suggest improvements.'
        : 'I can help review your profile. Tell me your target role and what you want to improve (headline, about, skills, or portfolio).',
      followUpPrompts: ['Improve my resume', 'Find jobs for me'],
      suggestions: toolsEnabled ? suggestions : [],
      routerMeta: baseMeta
    };
  }

  if (includesAny(hay, WALLET_PATTERNS) || wholeWord(hay, 'wallet')) {
    matchedPatterns.push('wallet_query');
    const suggestions: ScrolithaPlanSuggestion[] = toolsEnabled
      ? [
          {
            actionKey: 'get_my_wallet_summary',
            toolKey: 'GET_MY_WALLET_SUMMARY',
            summary: 'Load your wallet balance and recent transactions.',
            paramsPreview: {}
          }
        ]
      : [];
    return {
      intent: 'WALLET_QUERY',
      confidence: 0.9,
      allowTools: toolsEnabled && suggestions.length > 0,
      userFacingReply: toolsEnabled
        ? 'I can show a wallet summary when read tools are enabled. Confirm to load your wallet overview.'
        : 'I can help with wallet questions. Open **Wallet** in your dashboard for live balances, or re-enable read tools for in-chat summaries.',
      followUpPrompts: [],
      suggestions: toolsEnabled ? suggestions : [],
      routerMeta: baseMeta
    };
  }

  if (includesAny(hay, FILE_UPLOAD_PATTERNS)) {
    matchedPatterns.push('file_upload_help');
    // Only when user explicitly asked about upload — never for greetings
    return {
      intent: 'FILE_UPLOAD_HELP',
      confidence: 0.88,
      allowTools: false,
      userFacingReply:
        'To upload a file on Scrolith, open **Uploaded Files** in your dashboard (or attach a file in Messages). Supported types depend on the feature (images, PDF, DOCX). Tell me what you want to attach it to (gig, job, proposal, or message).',
      followUpPrompts: [],
      suggestions: [],
      routerMeta: baseMeta
    };
  }

  // Growth only when explicitly requested — not when user said "jobs for me"
  if (includesAny(hay, GROWTH_PATTERNS) && !includesAny(hay, JOB_PATTERNS) && !wholeWord(hay, 'jobs')) {
    matchedPatterns.push('growth');
    const isEmployer = /employer|client/.test(role.toLowerCase());
    return {
      intent: isEmployer ? 'EMPLOYER_GROWTH' : 'GROWTH_PLAN',
      confidence: 0.8,
      allowTools: false,
      userFacingReply: isEmployer
        ? 'I can help with employer growth: hiring pipeline, campaigns, and retention. Which area matters most — hiring, ads, or membership?'
        : 'I can help with a growth plan for freelancers: profile, gigs, proposals, and monetization. Which area should we start with?',
      followUpPrompts: ['Review my profile', 'Find freelancers'],
      suggestions: [],
      routerMeta: baseMeta
    };
  }

  if (includesAny(hay, ['create gig', 'new gig'])) {
    matchedPatterns.push('create_gig');
    return {
      intent: 'CREATE_GIG',
      confidence: 0.85,
      allowTools: false,
      userFacingReply:
        'I can help draft a gig. Share a title, short description, and starting price. Publishing stays confirmation-gated when write tools are enabled.',
      followUpPrompts: [],
      suggestions: [],
      routerMeta: baseMeta
    };
  }

  if (includesAny(hay, ['create job', 'post job', 'new job']) && !includesAny(hay, JOB_PATTERNS.filter((p) => p.includes('find') || p.includes('search')))) {
    // "post job" / "create job" vs "find jobs"
    if (includesAny(hay, ['create job', 'post job', 'new job', 'publish job'])) {
      matchedPatterns.push('create_job');
      return {
        intent: 'CREATE_JOB',
        confidence: 0.85,
        allowTools: false,
        userFacingReply:
          'I can help draft a job posting. Share the role title, must-have skills, budget, and remote/onsite preference. Live posting stays confirmation-gated when write tools are enabled.',
        followUpPrompts: ['Find freelancers'],
        suggestions: [],
        routerMeta: baseMeta
      };
    }
  }

  if (includesAny(hay, ['notification', 'alerts', 'unread'])) {
    matchedPatterns.push('notifications');
    return {
      intent: 'NOTIFICATION_QUERY',
      confidence: 0.8,
      allowTools: false,
      userFacingReply:
        'I can help with notifications. Open the Notifications panel for live unread items, or tell me what kind of alert you are looking for.',
      followUpPrompts: [],
      suggestions: [],
      routerMeta: baseMeta
    };
  }

  // Marketplace / community soft match
  if (includesAny(hay, ['marketplace', 'find service', 'find services', 'gig services'])) {
    matchedPatterns.push('marketplace');
    return {
      intent: 'MARKETPLACE_SEARCH',
      confidence: 0.82,
      allowTools: false,
      userFacingReply:
        'I can help with marketplace discovery. What service do you need, and what is your approximate budget?',
      followUpPrompts: ['Find freelancers'],
      suggestions: [],
      routerMeta: baseMeta
    };
  }

  if (includesAny(hay, ['community', 'communities', 'find group', 'find groups'])) {
    matchedPatterns.push('community');
    return {
      intent: 'COMMUNITY_SEARCH',
      confidence: 0.82,
      allowTools: false,
      userFacingReply: 'I can help you find communities. What topic or professional interest should we look for?',
      followUpPrompts: [],
      suggestions: [],
      routerMeta: baseMeta
    };
  }

  // General question / unknown — never invent a random tool
  matchedPatterns.push('unknown');
  return {
    intent: 'UNKNOWN',
    confidence: 0.4,
    allowTools: false,
    userFacingReply: unknownReply(),
    followUpPrompts: ['Find jobs for me', 'Improve my resume', 'What can you do?'],
    suggestions: [],
    routerMeta: baseMeta
  };
};

/**
 * Safe skill match: only long tokens, word-boundary style, min confidence.
 * Prevents "hi" matching "which/this" and "for/me" matching unrelated skills.
 */
export const matchSkillSuggestionSafe = (
  message: string,
  skills: any[]
): ScrolithaPlanSuggestion | null => {
  if (!Array.isArray(skills) || !skills.length) return null;
  const tokens = tokensOf(message).filter((t) => t.length >= MIN_SKILL_TOKEN_LEN);
  if (!tokens.length) return null;

  let best: { skill: any; score: number } | null = null;
  for (const skill of skills) {
    const hay = `${String(skill?.name || '')} ${String(skill?.description || '')} ${String(skill?.key || '')}`.toLowerCase();
    if (!hay.trim()) continue;
    let hits = 0;
    for (const token of tokens) {
      // Require token as whole-ish word in haystack — not bare substring of short noise
      if (hay.includes(token) && (hay.includes(` ${token} `) || hay.startsWith(`${token} `) || hay.endsWith(` ${token}`) || hay === token || hay.includes(token.replace(/s$/, '')))) {
        // Prefer multi-token / longer matches
        hits += token.length >= 6 ? 2 : 1;
      }
    }
    if (hits >= 2 || (hits === 1 && tokens.some((t) => t.length >= 8 && hay.includes(t)))) {
      if (!best || hits > best.score) best = { skill, score: hits };
    }
  }

  if (!best || best.score < 2) return null;
  const match = best.skill;
  const step = Array.isArray(match.stepsSchema)
    ? match.stepsSchema.find((entry: any) => String(entry?.tool || '').trim())
    : null;
  if (!step?.tool) return null;
  return {
    actionKey: String(match.key || 'skill_task'),
    toolKey: String(step.tool),
    summary: String(match.description || `Run skill ${match.name || match.key}`),
    paramsPreview: {}
  };
};

/**
 * Strip internal orchestration leakage from model or legacy fallback text.
 */
export const sanitizeUserFacingReply = (text: string): string => {
  let out = String(text || '').trim();
  if (!out) return unknownReply();

  // Drop common internal sections if the model echoes them
  const blockPatterns = [
    /^role\s*:\s*.+$/gim,
    /^scope\s*:\s*.+$/gim,
    /^surface\s*:\s*.+$/gim,
    /^route\s*:\s*.+$/gim,
    /^account context\s*:?\s*$/gim,
    /^current context\s*:.*$/gim,
    /^actor (role|scope)\s*:.*$/gim,
    /^planned actions\s*:.*$/gim,
    /^i will keep actions inside approved platform tools.*$/gim,
    /^safe mode is active.*$/gim,
    /^relevant help\s*:.*$/gim,
    /\[INTERNAL_CONTEXT_DO_NOT_ECHO\][\s\S]*?\[\/INTERNAL_CONTEXT_DO_NOT_ECHO\]/gi,
    /actor_scope\s*=\s*\S+/gi,
    /actor_role\s*=\s*\S+/gi,
    /planned_actions\s*:\s*none/gi
  ];
  for (const re of blockPatterns) {
    out = out.replace(re, '');
  }

  // Collapse leftover blank lines
  out = out
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line, idx, arr) => {
      if (line.trim()) return true;
      // keep single blank between paragraphs
      return idx > 0 && Boolean(arr[idx - 1]?.trim());
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Strip leading "I prepared one action/secure next step" when it is the whole style of bad reply
  // but keep if followed by real content that's still useful — prefer clean rewrites for short garbage
  if (/^i prepared (one|a|\d+)/i.test(out) && out.length < 280) {
    // leave to caller if they already have a better intent reply
  }

  return out || unknownReply();
};

export const isConversationalIntent = (intent: ScrolithaIntent) =>
  intent === 'CONVERSATION_GREETING' ||
  intent === 'CONVERSATION_THANKS' ||
  intent === 'CONVERSATION_GOODBYE' ||
  intent === 'CONVERSATION_HELP';

export const INTENT_TOOL_MIN_CONFIDENCE = MIN_TOOL_CONFIDENCE;
