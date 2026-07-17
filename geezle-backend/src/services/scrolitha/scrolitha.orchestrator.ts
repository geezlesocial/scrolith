import prisma from '../../utils/prismaClient';
import { listScrolithaAuditLogs, writeScrolithaAuditLog } from './scrolitha.audit';
import { buildScrolithaKnowledgeContext, getScrolithaKnowledgeBundle } from './scrolitha.knowledge';
import {
  buildScrolithaLearningContext,
  getScrolithaLearningInsightsForAdmin,
  persistScrolithaLearningSignal
} from './scrolitha.learning';
import { ollamaChat, resolveScrolithaLlmRuntime } from './scrolitha.ollama';
import {
  canUseTool,
  detectPromptInjectionAttempt,
  enforceActionRateLimits,
  ensureScrolithaConfig,
  redactPayload,
  shouldRequireConfirmation,
  updateScrolithaConfig
} from './scrolitha.policy';
import {
  appendConversationMessage,
  listConversationHistory,
  listSkillsForScope,
  resolveConversation,
  saveConversationFeedback
} from './scrolitha.memory';
import { getScrolithaToolDefinition, listScrolithaTools } from './scrolitha.tools';
import type {
  ScrolithaActor,
  ScrolithaAgentPlanPreview,
  ScrolithaChatInput,
  ScrolithaExecuteInput,
  ScrolithaFeedbackInput,
  ScrolithaPlanSuggestion
} from './scrolitha.types';

const text = (v: unknown) => String(v || '').trim();
const truncate = (value: string, max = 1800) => {
  const s = String(value || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
};

const uniqueStrings = (items: Array<unknown>, max = 8) => {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const entry of items) {
    const value = String(entry || '').trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
    if (output.length >= max) break;
  }
  return output;
};

const INTERNAL_AGENT_KEY = '__scrolithaAgent';

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const cloneJson = <T>(value: T): T => {
  if (value === undefined) return value;
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
};

const prettifyToken = (value: unknown) =>
  String(value || '')
    .trim()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (entry) => entry.toUpperCase());

const stripInternalScrolithaParams = (value: unknown) => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !String(key || '').startsWith('__scrolitha'))
  );
};

const normalizeAgentStepMode = (value: unknown): 'fetch' | 'preview' | 'execute' | 'confirm' | 'other' => {
  const stepType = text(value).toLowerCase();
  if (stepType === 'fetch') return 'fetch';
  if (stepType === 'execute') return 'execute';
  if (stepType === 'action_preview') return 'preview';
  if (stepType === 'confirm_required') return 'confirm';
  return 'other';
};

const buildAgentStepSummary = (step: Record<string, any>, index: number) => {
  const explicit = text(step.summary || step.label || step.description);
  if (explicit) return explicit;
  const mode = normalizeAgentStepMode(step.type);
  const toolKey = text(step.tool).toUpperCase();
  if (mode === 'confirm') return 'Wait for user confirmation before making changes.';
  if (!toolKey) return `Run step ${index}.`;
  if (mode === 'fetch') return `Load ${prettifyToken(toolKey)} context.`;
  if (mode === 'preview') return `Prepare ${prettifyToken(toolKey)} for review.`;
  if (mode === 'execute') return `Run ${prettifyToken(toolKey)}.`;
  return prettifyToken(toolKey) || `Run step ${index}.`;
};

const findSkillForSuggestion = (suggestion: ScrolithaPlanSuggestion, skills: any[]) => {
  const actionKey = text(suggestion.actionKey).toLowerCase();
  const toolKey = text(suggestion.toolKey).toUpperCase();
  if (!Array.isArray(skills) || !skills.length) return null;

  const exact = skills.find((skill) => text(skill?.key).toLowerCase() === actionKey);
  if (exact) return exact;

  const matchingToolSkills = skills.filter((skill) => {
    if (!Array.isArray(skill?.stepsSchema)) return false;
    return skill.stepsSchema.some((step: any) => text(step?.tool).toUpperCase() === toolKey);
  });

  return matchingToolSkills.length === 1 ? matchingToolSkills[0] : null;
};

const buildSkillAgentPlan = (skill: any, suggestion: ScrolithaPlanSuggestion, config: any): {
  primaryToolKey: string;
  requiresConfirmation: boolean;
  runtimeToolKeys: string[];
  preview: ScrolithaAgentPlanPreview;
  storedMeta: Record<string, any>;
} | null => {
  const rawSteps = Array.isArray(skill?.stepsSchema) ? skill.stepsSchema.filter(isRecord) : [];
  if (!rawSteps.length) return null;

  const previewSteps = rawSteps.map((entry, idx) => {
    const toolKey = text(entry.tool).toUpperCase() || null;
    const tool = toolKey ? getScrolithaToolDefinition(toolKey) : null;
    const mode = normalizeAgentStepMode(entry.type);
    return {
      index: idx + 1,
      type: text(entry.type) || 'step',
      mode,
      toolKey,
      summary: buildAgentStepSummary(entry, idx + 1),
      requiresConfirmation:
        mode === 'confirm' ||
        Boolean(tool && mode === 'execute' && shouldRequireConfirmation(tool, config)),
      params: isRecord(entry.params) ? cloneJson(entry.params) : null
    };
  });

  const runtimeSteps = previewSteps.filter(
    (step) => Boolean(step.toolKey) && (step.mode === 'fetch' || step.mode === 'execute')
  );
  if (!runtimeSteps.length) return null;

  const primaryToolKey =
    runtimeSteps.find((step) => step.mode === 'execute')?.toolKey ||
    runtimeSteps[0]?.toolKey ||
    text(suggestion.toolKey).toUpperCase();

  return {
    primaryToolKey,
    requiresConfirmation: previewSteps.some((step) => step.requiresConfirmation),
    runtimeToolKeys: Array.from(
      new Set(runtimeSteps.map((step) => String(step.toolKey || '').trim()).filter(Boolean))
    ),
    preview: {
      mode: 'skill',
      skillId: text(skill?.id) || null,
      skillKey: text(skill?.key) || text(suggestion.actionKey),
      skillName: text(skill?.name) || null,
      stepCount: previewSteps.length,
      executableStepCount: runtimeSteps.length,
      steps: previewSteps.map(({ params, ...rest }) => rest)
    },
    storedMeta: {
      version: 1,
      mode: 'skill',
      skillId: text(skill?.id) || null,
      skillKey: text(skill?.key) || text(suggestion.actionKey),
      skillName: text(skill?.name) || null,
      steps: previewSteps.map((step) => ({
        index: step.index,
        type: step.type,
        mode: step.mode,
        toolKey: step.toolKey,
        summary: step.summary,
        requiresConfirmation: step.requiresConfirmation,
        params: step.params
      }))
    }
  };
};

const extractStoredAgentMeta = (value: unknown) => {
  if (!isRecord(value)) return null;
  const meta = value[INTERNAL_AGENT_KEY];
  return isRecord(meta) ? meta : null;
};

const getPathValue = (source: unknown, path: string) => {
  const segments = String(path || '')
    .split('.')
    .map((entry) => entry.trim())
    .filter(Boolean);
  let cursor: any = source;
  for (const segment of segments) {
    if (!isRecord(cursor) && !Array.isArray(cursor)) return undefined;
    cursor = cursor?.[segment];
    if (cursor === undefined) return undefined;
  }
  return cursor;
};

const resolveAgentTemplates = (value: unknown, context: Record<string, any>): any => {
  if (Array.isArray(value)) {
    return value.map((entry) => resolveAgentTemplates(entry, context));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveAgentTemplates(entry, context)])
    );
  }
  if (typeof value !== 'string') return value;

  const exactMatch = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
  if (exactMatch) {
    const resolved = getPathValue(context, exactMatch[1]);
    return resolved === undefined ? null : resolved;
  }

  return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_full, token) => {
    const resolved = getPathValue(context, token);
    return resolved === undefined || resolved === null ? '' : String(resolved);
  });
};

const extractCarryForwardParams = (value: unknown) => {
  if (!isRecord(value)) return {};
  const output: Record<string, any> = {};
  for (const [key, entry] of Object.entries(value)) {
    const lower = key.toLowerCase();
    const primitive =
      entry === null ||
      ['string', 'number', 'boolean'].includes(typeof entry) ||
      (Array.isArray(entry) &&
        entry.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item)));
    if (!primitive) continue;
    if (
      lower === 'id' ||
      lower === 'status' ||
      lower === 'trackingcode' ||
      lower.endsWith('id') ||
      lower.endsWith('ids')
    ) {
      output[key] = cloneJson(entry);
    }
  }
  return output;
};

const formatPageContext = (value: unknown) => {
  const page = text(value).toLowerCase();
  if (!page) return '';
  if (page.includes('tab=wallet')) return 'Wallet dashboard';
  if (page.includes('tab=membership')) return 'Membership dashboard';
  if (page.includes('tab=affiliate-program') || page.includes('/affiliate-program')) return 'Affiliate dashboard';
  if (page.includes('tab=gcoin')) return 'Gcoin dashboard';
  if (page.includes('tab=my-ads')) return 'Ads dashboard';
  if (page.includes('/freelancer/dashboard')) return 'Freelancer dashboard';
  if (page.includes('/client/dashboard')) return 'Client dashboard';
  if (page.includes('/admin')) return 'Admin dashboard';
  if (page.includes('/support')) return 'Support center';
  if (page.includes('/messages')) return 'Messages';
  if (page.includes('/profile')) return 'Profile';
  if (page.includes('/create-gig')) return 'Gig creation';
  if (page.includes('/create-job')) return 'Job creation';
  if (page.includes('/company')) return 'Company page';
  if (page.includes('/scroll')) return 'Scroll feed';
  if (page.includes('/post')) return 'Post view';
  return page.replace(/^\//, '').replace(/[/?#].*$/, '').replace(/-/g, ' ') || 'current page';
};

const buildAccountContextSummary = (actor: ScrolithaActor, context?: ScrolithaChatInput['context']) => {
  const lines: string[] = [];
  const userName = text(context?.userName);
  const userRole = text(context?.userRole || actor.role);
  const accountType = text(context?.accountType);
  const surface = text(context?.surface);
  const route = text(context?.route || context?.page);
  const locale = text(context?.locale);

  if (userName) lines.push(`User: ${userName}`);
  if (userRole) lines.push(`Role: ${userRole}`);
  lines.push(`Scope: ${actor.scope}`);
  if (accountType && accountType.toLowerCase() !== userRole.toLowerCase()) {
    lines.push(`Account type: ${accountType}`);
  }
  if (surface) lines.push(`Surface: ${surface}`);
  if (route) lines.push(`Route: ${formatPageContext(route)}`);
  if (locale) lines.push(`Locale: ${locale}`);

  return lines.join('\n');
};

const summarizeKnowledgeHighlights = (knowledgeContext?: string | null, max = 3) => {
  if (!knowledgeContext) return [];
  const lines = String(knowledgeContext || '')
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter((line) => line && !line.endsWith(':') && !/^scrolith platform knowledge$/i.test(line));
  return uniqueStrings(lines, max);
};

const buildFollowUpPrompts = (input: {
  actor: ScrolithaActor;
  page?: string | null;
  actionPlans: Array<{ toolKey?: string }>;
  knowledgeHighlights?: string[];
}) => {
  const role = String(input.actor.role || '').toLowerCase();
  const page = String(input.page || '').toLowerCase();
  const prompts: string[] = [];

  for (const action of input.actionPlans) {
    const toolKey = String(action.toolKey || '').toUpperCase();
    if (toolKey === 'GET_MY_ORDERS') prompts.push('Show my latest orders');
    if (toolKey === 'GET_UPLOADED_FILES') prompts.push('Show my uploaded files');
    if (toolKey === 'FETCH_NOTIFICATIONS') prompts.push('Show my latest notifications');
    if (toolKey === 'GET_ME_PROFILE') prompts.push('Review my profile and settings');
    if (toolKey === 'CREATE_TICKET') prompts.push('Create a support ticket');
    if (toolKey === 'GENERATE_PROJECT_BRIEF') prompts.push('Generate a structured project brief');
    if (toolKey === 'CREATE_GIG') prompts.push('Create a gig draft');
    if (toolKey === 'CREATE_JOB') prompts.push('Create a job draft');
    if (toolKey === 'GET_MY_WALLET_SUMMARY') prompts.push('Show my wallet summary');
    if (toolKey === 'GET_MY_MEMBERSHIP_STATUS') prompts.push('Review my membership plan');
    if (toolKey === 'GET_MY_GCOIN_SUMMARY') prompts.push('Show my Gcoin balance');
    if (toolKey === 'GET_MY_AFFILIATE_OVERVIEW') prompts.push('Show my affiliate earnings');
    if (toolKey === 'GET_MY_ADS_OVERVIEW') prompts.push('Check my ad performance');
    if (toolKey === 'GET_MY_MONETIZATION_STATUS') prompts.push('Review my monetization and retention status');
  }

  if (role.includes('freelancer')) {
    prompts.push(
      'Create a gig draft',
      'Show my latest orders',
      'Review my profile and settings',
      'Review my monetization and retention status',
      'Show my wallet summary'
    );
  } else if (role.includes('client') || role.includes('employer')) {
    prompts.push(
      'Create a job draft',
      'Generate a structured project brief',
      'Show my latest notifications',
      'Review my retention and growth setup',
      'Check my ad performance'
    );
  } else if (input.actor.scope === 'admin') {
    prompts.push('Search users', 'Review ads', 'Read Scrolitha audit logs');
  }

  if (page.includes('/support')) prompts.push('Create a support ticket');
  if (page.includes('/messages')) prompts.push('Show my latest notifications');
  if (page.includes('/profile')) prompts.push('Review my profile and settings');
  if (page.includes('/create-gig')) prompts.push('Create a gig draft', 'Show my uploaded files');
  if (page.includes('/create-job')) prompts.push('Create a job draft', 'Generate a structured project brief');
  if (page.includes('tab=wallet')) prompts.push('Show my wallet summary');
  if (page.includes('tab=membership')) prompts.push('Review my membership plan');
  if (page.includes('tab=affiliate-program') || page.includes('/affiliate-program')) {
    prompts.push('Show my affiliate earnings');
  }
  if (page.includes('tab=gcoin')) prompts.push('Show my Gcoin balance');
  if (page.includes('tab=my-ads')) prompts.push('Check my ad performance');

  for (const highlight of input.knowledgeHighlights || []) {
    if (/brief/i.test(highlight)) prompts.push('Generate a structured project brief');
    if (/gig/i.test(highlight)) prompts.push('Create a gig draft');
    if (/job/i.test(highlight)) prompts.push('Create a job draft');
    if (/support/i.test(highlight)) prompts.push('Create a support ticket');
    if (/wallet|payout|billing/i.test(highlight)) prompts.push('Show my wallet summary');
    if (/membership|subscription/i.test(highlight)) prompts.push('Review my membership plan');
    if (/affiliate|referral/i.test(highlight)) prompts.push('Show my affiliate earnings');
    if (/gcoin|reward/i.test(highlight)) prompts.push('Show my Gcoin balance');
    if (/ads|promotion|campaign/i.test(highlight)) prompts.push('Check my ad performance');
    if (/monetization|retention|growth/i.test(highlight)) {
      prompts.push('Review my monetization and retention status');
    }
  }

  return uniqueStrings(prompts, 5);
};

const buildFallbackReply = (input: {
  page?: string | null;
  accountContext?: string | null;
  safeMode: boolean;
  actionPlans: Array<{ summary?: string; requiresConfirmation?: boolean }>;
  knowledgeHighlights: string[];
  classifiedReply: string;
}) => {
  const sections: string[] = [];
  const pageContext = formatPageContext(input.page);

  if (input.actionPlans.length === 1) {
    const action = input.actionPlans[0];
    sections.push(
      `I prepared one secure next step: ${String(action.summary || 'action ready')}${action.requiresConfirmation ? ' It will wait for confirmation before any change is made.' : '.'}`
    );
  } else if (input.actionPlans.length > 1) {
    sections.push(`I prepared ${input.actionPlans.length} secure next steps. Review the prepared actions and run the one that matches your goal.`);
  } else {
    sections.push(input.classifiedReply);
  }

  if (pageContext) {
    sections.push(`Current context: ${pageContext}. I can tailor guidance and safe actions for this surface.`);
  }

  if (input.accountContext) {
    sections.push(`Account context:\n${input.accountContext}`);
  }

  if (input.knowledgeHighlights.length) {
    sections.push(`Relevant help:\n- ${input.knowledgeHighlights.join('\n- ')}`);
  }

  sections.push(
    input.safeMode
      ? 'Safe mode is active, so I will avoid risky actions and keep changes confirmation-based.'
      : 'I will keep actions inside approved platform tools and only execute confirmed changes.'
  );

  return sections.join('\n\n');
};

const buildScrolithaSystemPrompt = (params: {
  actor: ScrolithaActor;
  safeMode: boolean;
  pageContext?: string | null;
  accountContext?: string | null;
  plannedActions: Array<{ summary: string; toolKey: string; requiresConfirmation: boolean }>;
  knowledgeContext?: string | null;
  learningContext?: string | null;
}) => {
  const role = String(params.actor.role || 'user');
  const scope = String(params.actor.scope || 'user');
  const actions = params.plannedActions
    .slice(0, 12)
    .map((a, idx) => `${idx + 1}. ${a.summary} (tool=${a.toolKey}${a.requiresConfirmation ? ', needs_confirmation' : ''})`)
    .join('\n');

  return [
    `You are Scrolitha, the embedded assistant for the Scrolith platform.`,
    `Rules:`,
    `- Do NOT ask for secrets, API keys, passwords, or private tokens.`,
    `- Do NOT claim to have executed an action unless a tool result explicitly confirms it.`,
    `- Keep replies concise, professional, and actionable.`,
    `- If user intent is unclear, ask a single clarifying question.`,
    `- If there are planned actions, summarize them and ask the user which one to execute (or confirm).`,
    `- Safety mode: ${params.safeMode ? 'ON (avoid risky guidance and do not suggest destructive actions).' : 'OFF'}`,
    ``,
    `Actor scope: ${scope}`,
    `Actor role: ${role}`,
    params.pageContext ? `Current page: ${params.pageContext}` : '',
    params.accountContext ? `Account context:\n${params.accountContext}` : '',
    actions ? `Planned actions:\n${actions}` : `Planned actions: (none)`,
    ``,
    params.knowledgeContext ? `Scrolith platform knowledge:\n${params.knowledgeContext}` : '',
    params.learningContext ? `Adaptive user learning context:\n${params.learningContext}` : ''
  ].join('\n');
};

const loadRecentConversationMessages = async (conversationId: string, take = 12) => {
  const rows = await prisma.scrolithaMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: Math.max(2, Math.min(40, Math.floor(take)))
  });
  return rows.reverse();
};

const buildLlmReply = async (input: {
  actor: ScrolithaActor;
  conversationId: string;
  userMessage: string;
  pageContext?: string | null;
  accountContext?: string | null;
  config: Awaited<ReturnType<typeof ensureScrolithaConfig>>;
  actionPlans: Array<{ summary: string; toolKey: string; requiresConfirmation: boolean }>;
}) => {
  const runtime = await resolveScrolithaLlmRuntime(input.actor.scope);
  if (!runtime.enabled || runtime.provider === 'disabled' || !runtime.runtimeConfigured) return null;

  const knowledgeContext = buildScrolithaKnowledgeContext({
    actor: input.actor,
    userMessage: input.userMessage,
    metadata: input.config.metadata
  });
  const learningContext = await buildScrolithaLearningContext({
    actor: input.actor,
    conversationId: input.conversationId
  });

  const history = await loadRecentConversationMessages(input.conversationId, 14);
  const messages = [
    {
      role: 'system' as const,
      content: buildScrolithaSystemPrompt({
        actor: input.actor,
        safeMode: Boolean(input.config.safeMode),
        pageContext: input.pageContext,
        accountContext: input.accountContext,
        plannedActions: input.actionPlans,
        knowledgeContext,
        learningContext
      })
    },
    ...history.map((msg) => ({
      role: msg.sender === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: truncate(String(msg.content || ''))
    }))
  ];

  try {
    const result = await ollamaChat({
      host: runtime.host,
      model: runtime.model,
      messages,
      maxTokens: runtime.maxTokens,
      temperature: runtime.temperature,
      topP: runtime.topP,
      timeoutMs: runtime.timeoutMs
    });
    const out = String(result.text || '').trim();
    return out || null;
  } catch (error) {
    console.warn('[scrolitha] ollama chat failed, falling back to heuristic reply:', error);
    return null;
  }
};

const classifyMessage = (message: string, actor: ScrolithaActor, skills: any[], page?: string | null) => {
  const m = message.toLowerCase();
  const currentPage = String(page || '').toLowerCase();
  const has = (...terms: string[]) => terms.some((term) => m.includes(term));
  const actorRole = String(actor.role || '').toLowerCase();
  const isEmployer = actorRole.includes('client') || actorRole.includes('employer');
  const isFreelancer = actorRole.includes('freelancer') || actorRole.includes('seller');
  const growthReviewKey = isFreelancer
    ? 'freelancer_growth_review'
    : isEmployer
      ? 'employer_growth_review'
      : '';

  const suggestions: ScrolithaPlanSuggestion[] = [];
  const add = (actionKey: string, toolKey: string, summary: string) => {
    suggestions.push({ actionKey, toolKey, summary, paramsPreview: {} });
  };

  if (actor.scope === 'admin') {
    if (has('search user', 'find user', 'lookup user')) add('search_users', 'SEARCH_USERS', 'Search users by query.');
    if (has('approve monetization', 'review monetization', 'application')) {
      add('review_monetization_application', 'REVIEW_MONETIZATION_APPLICATION', 'Review a monetization application.');
    }
    if (has('create role', 'new role')) add('create_role', 'CREATE_ROLE', 'Create a new staff role.');
    if (has('update role', 'permission')) add('update_role_permissions', 'UPDATE_ROLE_PERMISSIONS', 'Update role permissions.');
    if (has('moderate post', 'remove post', 'restore post')) add('moderate_post', 'MODERATE_POST', 'Moderate a community post.');
    if (has('review ad', 'approve ad', 'reject ad', 'pause ad')) add('review_ads', 'REVIEW_ADS', 'Review ad status.');
    if (has('audit log', 'scrolitha logs')) add('view_audit_logs', 'VIEW_SCROLITHA_AUDIT_LOGS', 'View Scrolitha audit logs.');
  } else {
    if (has('create gig', 'new gig')) add('create_gig', 'CREATE_GIG', 'Create a gig draft.');
    if (has('submit gig', 'gig for review')) add('submit_gig_for_review', 'SUBMIT_GIG_FOR_REVIEW', 'Submit a gig draft for review.');
    if (has('post job', 'create job', 'new job')) add('create_job', 'CREATE_JOB', 'Create a job draft.');
    if (
      growthReviewKey &&
      (has(
        'monetization',
        'retention',
        'growth review',
        'growth setup',
        'earnings setup',
        'creator earnings',
        'reactivate revenue'
      ) ||
        currentPage.includes('tab=membership') ||
        currentPage.includes('tab=gcoin') ||
        currentPage.includes('tab=my-ads') ||
        currentPage.includes('/affiliate-program') ||
        currentPage.includes('tab=affiliate-program'))
    ) {
      add(
        growthReviewKey,
        'GET_MY_MEMBERSHIP_STATUS',
        isFreelancer
          ? 'Review your monetization, retention, and earnings setup.'
          : 'Review your retention, budget, and campaign growth setup.'
      );
    }
    if (has('support', 'help', 'issue', 'problem', 'ticket') || currentPage.includes('/support')) {
      add('create_ticket', 'CREATE_TICKET', 'Create a support ticket with your issue summary.');
    }
    if (has('uploaded files', 'my files', 'file library') || currentPage.includes('uploaded-files')) {
      add('get_uploaded_files', 'GET_UPLOADED_FILES', 'Load your latest uploaded files.');
    }
    if (has('upload file', 'attach file', 'file library')) add('upload_file_to_library', 'UPLOAD_FILE_TO_LIBRARY', 'Bind a file from Uploaded Files.');
    if (has('find orders', 'my orders', 'orders')) add('get_my_orders', 'GET_MY_ORDERS', 'Load your latest orders.');
    if (has('notification', 'alerts')) add('fetch_notifications', 'FETCH_NOTIFICATIONS', 'Fetch recent notifications.');
    if (has('mark read', 'read notification')) add('mark_notification_read', 'MARK_NOTIFICATION_READ', 'Mark notifications as read.');
    if (has('block user', 'report user', 'restrict follower')) add('block_user', 'BLOCK_USER', 'Block a user account.');
    if (has('follow user', 'follow account')) add('follow_user', 'FOLLOW_USER', 'Follow an account.');
    if (has('project brief', 'generate brief')) add('generate_project_brief', 'GENERATE_PROJECT_BRIEF', 'Generate a project brief draft.');
    if (has('profile', 'settings')) add('get_me_profile', 'GET_ME_PROFILE', 'Load your profile and settings context.');
    if (
      has('wallet', 'billing', 'payout', 'withdrawal', 'withdraw money', 'fund wallet', 'wallet balance') ||
      currentPage.includes('tab=wallet')
    ) {
      add('get_my_wallet_summary', 'GET_MY_WALLET_SUMMARY', 'Load your wallet balance, payouts, and recent transactions.');
    }
    if (
      has('membership', 'subscription', 'upgrade plan', 'renew plan', 'pro plan', 'pricing plan') ||
      currentPage.includes('tab=membership')
    ) {
      add('get_my_membership_status', 'GET_MY_MEMBERSHIP_STATUS', 'Review your membership plan and renewal status.');
    }
    if (has('gcoin', 'creator reward', 'coin balance', 'rewards wallet') || currentPage.includes('tab=gcoin')) {
      add('get_my_gcoin_summary', 'GET_MY_GCOIN_SUMMARY', 'Load your Gcoin balance and reward activity.');
    }
    if (
      has('affiliate', 'referral', 'refer friend', 'invite earnings', 'partner earnings') ||
      currentPage.includes('/affiliate-program') ||
      currentPage.includes('tab=affiliate-program')
    ) {
      add('get_my_affiliate_overview', 'GET_MY_AFFILIATE_OVERVIEW', 'Review your affiliate referrals and earnings.');
    }
    if (
      has('ads', 'campaign', 'promotion', 'boost post', 'ad performance', 'reactivate ad', 'campaign spend') ||
      currentPage.includes('tab=my-ads')
    ) {
      add('get_my_ads_overview', 'GET_MY_ADS_OVERVIEW', 'Review your ad campaigns and recent performance.');
    }
    if (has('monetize', 'monetization status', 'creator program', 'eligibility', 'earnings approval')) {
      add('get_my_monetization_status', 'GET_MY_MONETIZATION_STATUS', 'Review your monetization profile and application status.');
    }
  }

  if (!suggestions.length && Array.isArray(skills) && skills.length) {
    const match = skills.find((skill: any) => {
      const hay = `${String(skill?.name || '')} ${String(skill?.description || '')}`.toLowerCase();
      return message
        .toLowerCase()
        .split(/\s+/)
        .some((token) => token && hay.includes(token));
    });

    if (match) {
      const step = Array.isArray(match.stepsSchema)
        ? match.stepsSchema.find((entry: any) => String(entry?.tool || '').trim())
        : null;
      if (step?.tool) {
        suggestions.push({
          actionKey: String(match.key || 'skill_task'),
          toolKey: String(step.tool),
          summary: String(match.description || `Run skill ${match.name || match.key}`),
          paramsPreview: {}
        });
      }
    }
  }

  let reply = 'I can help with secure platform tasks, guided support, and approved actions. Tell me the goal, and I will prepare the next safe step.';
  if (suggestions.length === 1) {
    reply = `I prepared one action: ${suggestions[0].summary}`;
  } else if (suggestions.length > 1) {
    reply = `I prepared ${suggestions.length} actions. Confirm the one you want to execute.`;
  }

  return { reply, suggestions };
};

const emitScrolithaEvents = (app: any, eventName: string, payload: any) => {
  try {
    const io = app?.get?.('io');
    const communityNs = app?.get?.('communityNs');
    io?.emit?.(eventName, payload);
    communityNs?.emit?.(eventName, payload);
    if (payload?.actorId) {
      io?.to?.(payload.actorId)?.emit?.(eventName, payload);
      communityNs?.to?.(`community:user:${payload.actorId}`)?.emit?.(eventName, payload);
    }
  } catch (error) {
    console.warn('[scrolitha] socket emit failed', eventName, error);
  }
};

const createActionPlans = async (input: {
  actor: ScrolithaActor;
  conversationId: string;
  suggestions: ScrolithaPlanSuggestion[];
  skills: any[];
  config: any;
}) => {
  const plans: any[] = [];

  for (const suggestion of input.suggestions) {
    const skill = findSkillForSuggestion(suggestion, input.skills);
    const agentPlan = skill ? buildSkillAgentPlan(skill, suggestion, input.config) : null;
    const tool = getScrolithaToolDefinition(agentPlan?.primaryToolKey || suggestion.toolKey);
    if (!tool) continue;
    const planToolKeys = agentPlan?.runtimeToolKeys || [tool.key];
    if (planToolKeys.some((toolKey) => !getScrolithaToolDefinition(toolKey))) continue;
    const blockedReason = planToolKeys
      .map((toolKey) => getScrolithaToolDefinition(toolKey))
      .filter(Boolean)
      .map((entry) => canUseTool(input.actor, entry as any, input.config))
      .find((result) => !result.allowed);
    if (blockedReason && !blockedReason.allowed) continue;

    const publicParamsPreview = stripInternalScrolithaParams(suggestion.paramsPreview || {});
    const storedParamsPreview = agentPlan
      ? { ...publicParamsPreview, [INTERNAL_AGENT_KEY]: agentPlan.storedMeta }
      : publicParamsPreview;
    const requiresConfirmation = agentPlan?.requiresConfirmation || shouldRequireConfirmation(tool, input.config);
    const redacted = redactPayload(publicParamsPreview, tool.redactedFields);

    const row = await prisma.scrolithaActionPlan.create({
      data: {
        conversationId: input.conversationId,
        userId: input.actor.id,
        userRole: input.actor.role,
        scope: input.actor.scope,
        actionKey: suggestion.actionKey,
        toolKey: tool.key,
        summary: suggestion.summary,
        requiresConfirmation,
        confirmationStatus: requiresConfirmation ? 'pending' : 'not_required',
        status: 'planned',
        paramsPreview: storedParamsPreview,
        paramsRedacted: redacted
      }
    });

    plans.push({
      actionId: row.id,
      actionKey: row.actionKey,
      toolKey: row.toolKey,
      summary: row.summary,
      requiresConfirmation,
      paramsPreview: publicParamsPreview,
      agent: agentPlan?.preview || null,
      tool: {
        endpoint: tool.endpoint,
        method: tool.method
      }
    });
  }

  return plans;
};

const executeSkillAgentPlan = async (input: {
  actionPlan: any;
  actor: ScrolithaActor;
  app?: any;
  config: any;
  agentMeta: Record<string, any>;
  params: Record<string, any>;
}) => {
  const steps = Array.isArray(input.agentMeta?.steps) ? input.agentMeta.steps.filter(isRecord) : [];
  if (!steps.length) throw new Error('Agent plan has no steps.');

  const trace: Array<Record<string, any>> = [];
  const emittedEvents = new Set<string>();
  const carryForward: Record<string, any> = { ...stripInternalScrolithaParams(input.params) };
  const outputs: Record<string, any> = {};
  const stepResults: Record<string, any> = {};
  let lastResult: any = null;
  let lastSummary = '';
  let deepLink: string | null = null;

  for (const rawStep of steps) {
    const stepIndex = Number(rawStep.index || trace.length + 1);
    const stepMode = String(rawStep.mode || normalizeAgentStepMode(rawStep.type));
    const stepToolKey = text(rawStep.toolKey).toUpperCase();
    const traceEntry: Record<string, any> = {
      index: stepIndex,
      type: text(rawStep.type) || 'step',
      mode: stepMode,
      toolKey: stepToolKey || null,
      summary: text(rawStep.summary) || `Step ${stepIndex}`,
      status: 'skipped'
    };

    if (!stepToolKey || !['fetch', 'execute'].includes(stepMode)) {
      trace.push(traceEntry);
      continue;
    }

    const stepTool = getScrolithaToolDefinition(stepToolKey);
    if (!stepTool) {
      const missingError: any = new Error(`Agent step tool missing: ${stepToolKey}`);
      missingError.scrolithaAgentTrace = [...trace, { ...traceEntry, status: 'failed' }];
      throw missingError;
    }

    const allowed = canUseTool(input.actor, stepTool, input.config);
    if (!allowed.allowed) {
      const blockedError: any = new Error(allowed.reason || `Tool ${stepTool.key} is blocked by policy.`);
      blockedError.scrolithaAgentTrace = [...trace, { ...traceEntry, status: 'failed' }];
      throw blockedError;
    }

    const resolvedStepParams = isRecord(rawStep.params)
      ? resolveAgentTemplates(rawStep.params, {
          params: input.params,
          carry: carryForward,
          last: lastResult,
          steps: stepResults
        })
      : {};

    const stepParams = {
      ...carryForward,
      ...(isRecord(resolvedStepParams) ? resolvedStepParams : {})
    };
    const redactedStepParams = redactPayload(stepParams, stepTool.redactedFields);

    try {
      await writeScrolithaAuditLog({
        actor: input.actor,
        conversationId: input.actionPlan.conversationId,
        actionPlanId: input.actionPlan.id,
        eventType: 'action_step_execute_requested',
        intent: input.actionPlan.actionKey,
        toolKey: stepTool.key,
        requestPayload: stepParams,
        redactedPayload: redactedStepParams,
        resultStatus: 'pending',
        resultSummary: traceEntry.summary,
        confirmationStatus: input.actionPlan.requiresConfirmation ? 'confirmed' : 'not_required'
      });

      const executed = await stepTool.execute(stepParams, {
        actor: input.actor,
        app: input.app,
        conversationId: input.actionPlan.conversationId,
        actionPlanId: input.actionPlan.id
      });

      traceEntry.status = 'executed';
      traceEntry.resultSummary = executed?.resultSummary || `${stepTool.key} completed.`;
      trace.push(traceEntry);

      const carry = extractCarryForwardParams(executed?.result);
      Object.assign(carryForward, carry);
      Object.assign(outputs, carry);
      stepResults[stepTool.key] = {
        result: cloneJson(executed?.result || null),
        summary: executed?.resultSummary || null,
        deepLink: executed?.deepLink || null
      };
      lastResult = cloneJson(executed?.result || null);
      lastSummary = executed?.resultSummary || lastSummary || `${stepTool.key} completed.`;
      deepLink = executed?.deepLink || deepLink;

      for (const eventName of executed?.emittedEvents || []) {
        emittedEvents.add(String(eventName || '').trim());
      }

      await writeScrolithaAuditLog({
        actor: input.actor,
        conversationId: input.actionPlan.conversationId,
        actionPlanId: input.actionPlan.id,
        eventType: 'action_step_executed',
        intent: input.actionPlan.actionKey,
        toolKey: stepTool.key,
        requestPayload: stepParams,
        redactedPayload: redactedStepParams,
        resultStatus: 'ok',
        resultSummary: traceEntry.resultSummary,
        confirmationStatus: input.actionPlan.requiresConfirmation ? 'confirmed' : 'not_required'
      });
    } catch (error: any) {
      traceEntry.status = 'failed';
      traceEntry.resultSummary = String(error?.message || `${stepTool.key} failed.`);
      trace.push(traceEntry);

      await writeScrolithaAuditLog({
        actor: input.actor,
        conversationId: input.actionPlan.conversationId,
        actionPlanId: input.actionPlan.id,
        eventType: 'action_step_failed',
        intent: input.actionPlan.actionKey,
        toolKey: stepTool.key,
        requestPayload: stepParams,
        redactedPayload: redactedStepParams,
        resultStatus: 'error',
        resultSummary: traceEntry.resultSummary,
        confirmationStatus: input.actionPlan.requiresConfirmation ? 'confirmed' : 'not_required'
      });

      const wrappedError: any = new Error(traceEntry.resultSummary);
      wrappedError.scrolithaAgentTrace = trace;
      throw wrappedError;
    }
  }

  const executedStepCount = trace.filter((entry) => entry.status === 'executed').length;
  const summary =
    lastSummary ||
    `${prettifyToken(input.agentMeta.skillName || input.agentMeta.skillKey || input.actionPlan.actionKey)} completed.`;

  return {
    success: true,
    result: {
      mode: 'skill',
      skillKey: text(input.agentMeta.skillKey) || null,
      skillName: text(input.agentMeta.skillName) || null,
      executedStepCount,
      steps: trace,
      outputs,
      lastResult
    },
    emittedEvents: Array.from(emittedEvents),
    resultSummary: summary,
    deepLink
  };
};

export const scrolithaChat = async (input: ScrolithaChatInput, actor: ScrolithaActor, app?: any) => {
  const message = text(input.message);
  const pageContext = text(input.context?.page);
  const accountContext = buildAccountContextSummary(actor, input.context);
  if (!message) throw new Error('message is required.');

  const { assertScrolithaAccess } = await import('./scrolitha.rollout');
  await assertScrolithaAccess(actor, 'Scrolitha chat');

  const config = await ensureScrolithaConfig(actor.scope);
  const limitCheck = enforceActionRateLimits({ actor, config, channel: 'chat' });
  if (!limitCheck.allowed) throw new Error(limitCheck.reason || 'Rate limit exceeded.');

  const blocked = detectPromptInjectionAttempt(message, config.promptBlocklist || []);
  if (blocked.blocked) {
    await writeScrolithaAuditLog({
      actor,
      eventType: 'chat_blocked',
      intent: 'blocked_prompt',
      requestPayload: { message },
      redactedPayload: { message: '[REDACTED]' },
      resultStatus: 'blocked',
      resultSummary: `Prompt blocked by pattern: ${blocked.pattern || 'unknown'}`
    });
    return {
      reply: 'Request blocked by security policy. Rephrase without hidden/system-instruction directives.',
      suggestedActions: [],
      needsConfirmation: false,
      responseMode: 'blocked',
      followUpPrompts: [],
      knowledgeHighlights: [],
      draftChanges: null,
      conversationId: null
    };
  }

  const conversation = await resolveConversation({
    actor,
    conversationId: input.conversationId,
    context: input.context
  });

  await appendConversationMessage({
    conversationId: conversation.id,
    sender: 'user',
    content: message,
    metadata: { page: input.context?.page || null, entityId: input.context?.entityId || null }
  });

  const skills = await listSkillsForScope(actor.scope, actor.role, false);
  const classified = classifyMessage(message, actor, skills, pageContext);
  const actionPlans = await createActionPlans({
    actor,
    conversationId: conversation.id,
    suggestions: classified.suggestions,
    skills,
    config
  });
  const knowledgeContext = buildScrolithaKnowledgeContext({
    actor,
    userMessage: message,
    metadata: config.metadata
  });
  const knowledgeHighlights = summarizeKnowledgeHighlights(knowledgeContext);
  const followUpPrompts = buildFollowUpPrompts({
    actor,
    page: pageContext,
    actionPlans,
    knowledgeHighlights
  });

  const plannedForPrompt = actionPlans.map((plan) => ({
    summary: String(plan.summary || ''),
    toolKey: String(plan.toolKey || ''),
    requiresConfirmation: Boolean(plan.requiresConfirmation)
  }));
  const llmReply = await buildLlmReply({
    actor,
    conversationId: conversation.id,
    userMessage: message,
    pageContext,
    accountContext,
    config,
    actionPlans: plannedForPrompt
  });
  const reply =
    llmReply ||
    buildFallbackReply({
      page: pageContext,
      accountContext,
      safeMode: Boolean(config.safeMode),
      actionPlans,
      knowledgeHighlights,
      classifiedReply: classified.reply
    });

  await appendConversationMessage({
    conversationId: conversation.id,
    sender: 'assistant',
    content: reply,
    metadata: {
      suggestedActionIds: actionPlans.map((entry) => entry.actionId),
      suggestedToolKeys: actionPlans.map((entry) => entry.toolKey)
    }
  });

  await writeScrolithaAuditLog({
    actor,
    conversationId: conversation.id,
    eventType: 'chat_planned',
    intent: actionPlans[0]?.actionKey || 'chat',
    requestPayload: { message },
    redactedPayload: { message: '[REDACTED]' },
    resultStatus: 'ok',
    resultSummary: `Planned ${actionPlans.length} action(s).`
  });

  let learningSnapshot: Awaited<ReturnType<typeof persistScrolithaLearningSignal>> = null;
  try {
    learningSnapshot = await persistScrolithaLearningSignal({
      actor,
      conversationId: conversation.id,
      userMessage: message,
      assistantReply: reply,
      pageContext: input.context?.page || null,
      scopeMetadata: config.metadata
    });
  } catch (error) {
    console.warn('[scrolitha] adaptive learning persistence failed (continuing chat response):', error);
  }
  if (learningSnapshot) {
    try {
      await writeScrolithaAuditLog({
        actor,
        conversationId: conversation.id,
        eventType: 'learning_profile_updated',
        intent: 'adaptive_learning',
        requestPayload: {
          messageLength: message.length,
          hasActions: actionPlans.length > 0
        },
        redactedPayload: {
          messageLength: message.length,
          hasActions: actionPlans.length > 0
        },
        resultStatus: 'ok',
        resultSummary: `Learning profile updated with ${learningSnapshot.topTopics.length} topic hints.`
      });
    } catch (error) {
      console.warn('[scrolitha] learning audit write failed:', error);
    }
    emitScrolithaEvents(app, 'scrolitha:learning_updated', {
      actorId: actor.id,
      conversationId: conversation.id,
      updatedAt: learningSnapshot.updatedAt,
      topTopics: learningSnapshot.topTopics
    });
  }

  return {
    conversationId: conversation.id,
    reply,
    suggestedActions: actionPlans,
    needsConfirmation: actionPlans.some((entry) => entry.requiresConfirmation),
    responseMode: llmReply ? 'llm' : 'fallback',
    followUpPrompts,
    knowledgeHighlights,
    draftChanges: actionPlans[0]?.paramsPreview || null,
    learning: learningSnapshot || null
  };
};

export const scrolithaExecute = async (input: ScrolithaExecuteInput, actor: ScrolithaActor, app?: any) => {
  const actionId = text(input.actionId);
  if (!actionId) throw new Error('actionId is required.');

  const { assertScrolithaAccess } = await import('./scrolitha.rollout');
  await assertScrolithaAccess(actor, 'Scrolitha execute');

  const actionPlan = await prisma.scrolithaActionPlan.findUnique({ where: { id: actionId } });
  if (!actionPlan) throw new Error('Action plan not found.');
  if (actionPlan.userId !== actor.id || actionPlan.scope !== actor.scope) {
    throw new Error('Not allowed to execute this action.');
  }

  const tool = getScrolithaToolDefinition(actionPlan.toolKey);
  if (!tool) throw new Error('Tool no longer exists.');
  const agentMeta = extractStoredAgentMeta(actionPlan.paramsPreview);

  const config = await ensureScrolithaConfig(actor.scope);
  const allowed = canUseTool(actor, tool, config);
  if (!allowed.allowed) throw new Error(allowed.reason || 'Tool is blocked by policy.');
  const agentToolKeys = Array.isArray(agentMeta?.steps)
    ? agentMeta.steps
        .map((step: any) => text(step?.toolKey).toUpperCase())
        .filter(Boolean)
    : [];
  const agentDestructive = agentToolKeys.some((toolKey) => Boolean(getScrolithaToolDefinition(toolKey)?.destructive));

  const limitCheck = enforceActionRateLimits({
    actor,
    config,
    channel: 'execute',
    destructive: Boolean(tool.destructive) || agentDestructive
  });
  if (!limitCheck.allowed) throw new Error(limitCheck.reason || 'Rate limit exceeded.');

  const requiresConfirmation = Boolean(actionPlan.requiresConfirmation);
  const confirmed = Boolean(input.confirmed);
  if (requiresConfirmation && !confirmed) {
    await prisma.scrolithaActionPlan.update({
      where: { id: actionPlan.id },
      data: {
        status: 'awaiting_confirmation',
        confirmationStatus: 'pending'
      }
    });

    await writeScrolithaAuditLog({
      actor,
      conversationId: actionPlan.conversationId,
      actionPlanId: actionPlan.id,
      eventType: 'action_confirmation_required',
      intent: actionPlan.actionKey,
      toolKey: actionPlan.toolKey,
      requestPayload: input.params || {},
      redactedPayload: redactPayload(input.params || {}, tool.redactedFields),
      resultStatus: 'blocked',
      resultSummary: 'Confirmation required.',
      confirmationStatus: 'pending'
    });

    return {
      success: false,
      needsConfirmation: true,
      message: 'Confirmation is required for this action.'
    };
  }

  const mergedParams = {
    ...stripInternalScrolithaParams((actionPlan.paramsPreview as any) || {}),
    ...stripInternalScrolithaParams((input.params as any) || {})
  };
  const redactedParams = redactPayload(mergedParams, tool.redactedFields);

  try {
    await prisma.scrolithaActionPlan.update({
      where: { id: actionPlan.id },
      data: {
        status: 'executing',
        confirmationStatus: requiresConfirmation ? 'confirmed' : 'not_required',
        confirmedAt: requiresConfirmation ? new Date() : null,
        paramsRedacted: redactedParams
      }
    });

    await writeScrolithaAuditLog({
      actor,
      conversationId: actionPlan.conversationId,
      actionPlanId: actionPlan.id,
      eventType: 'action_execute_requested',
      intent: actionPlan.actionKey,
      toolKey: actionPlan.toolKey,
      requestPayload: mergedParams,
      redactedPayload: redactedParams,
      resultStatus: 'pending',
      resultSummary: 'Execution started.',
      confirmationStatus: requiresConfirmation ? 'confirmed' : 'not_required'
    });

    const executed = agentMeta
      ? await executeSkillAgentPlan({
          actionPlan,
          actor,
          app,
          config,
          agentMeta,
          params: mergedParams
        })
      : await tool.execute(mergedParams, {
          actor,
          app,
          conversationId: actionPlan.conversationId,
          actionPlanId: actionPlan.id
        });

    await prisma.scrolithaActionPlan.update({
      where: { id: actionPlan.id },
      data: {
        status: 'executed',
        confirmationStatus: requiresConfirmation ? 'confirmed' : 'not_required',
        executedAt: new Date(),
        resultPayload: executed?.result || null,
        errorCode: null,
        errorMessage: null
      }
    });

    await appendConversationMessage({
      conversationId: actionPlan.conversationId,
      sender: 'assistant',
      content: executed?.resultSummary || `${tool.key} completed.`,
      metadata: {
        actionPlanId: actionPlan.id,
        toolKey: tool.key,
        agent: agentMeta
          ? {
              mode: text(agentMeta.mode) || 'skill',
              skillKey: text(agentMeta.skillKey) || null,
              skillName: text(agentMeta.skillName) || null
            }
          : null,
        deepLink: executed?.deepLink || null
      }
    });

    const emittedEvents = Array.from(new Set(['scrolitha:action_completed', ...(executed?.emittedEvents || [])]));
    const eventPayload = {
      actionId: actionPlan.id,
      toolKey: tool.key,
      actionKey: actionPlan.actionKey,
      actorId: actor.id,
      status: 'completed',
      resultSummary: executed?.resultSummary || null,
      agent:
        agentMeta
          ? {
              mode: text(agentMeta.mode) || 'skill',
              skillKey: text(agentMeta.skillKey) || null,
              skillName: text(agentMeta.skillName) || null
            }
          : null,
      emittedEvents,
      timestamp: new Date().toISOString()
    };

    for (const eventName of emittedEvents) {
      emitScrolithaEvents(app, eventName, eventPayload);
    }

    await writeScrolithaAuditLog({
      actor,
      conversationId: actionPlan.conversationId,
      actionPlanId: actionPlan.id,
      eventType: 'action_executed',
      intent: actionPlan.actionKey,
      toolKey: actionPlan.toolKey,
      requestPayload: mergedParams,
      redactedPayload: redactedParams,
      resultStatus: 'ok',
      resultSummary: executed?.resultSummary || `${tool.key} completed.`,
      confirmationStatus: requiresConfirmation ? 'confirmed' : 'not_required'
    });

    return {
      success: true,
      result: executed?.result || null,
      summary: executed?.resultSummary || null,
      agent:
        agentMeta
          ? {
              mode: text(agentMeta.mode) || 'skill',
              skillKey: text(agentMeta.skillKey) || null,
              skillName: text(agentMeta.skillName) || null
            }
          : null,
      emittedEvents,
      actionId: actionPlan.id,
      deepLink: executed?.deepLink || null
    };
  } catch (error: any) {
    const message = String(error?.message || 'Scrolitha action failed.');
    await prisma.scrolithaActionPlan.update({
      where: { id: actionPlan.id },
      data: {
        status: 'failed',
        executedAt: new Date(),
        resultPayload: error?.scrolithaAgentTrace ? { steps: error.scrolithaAgentTrace } : undefined,
        errorCode: 'SCROLITHA_ACTION_FAILED',
        errorMessage: message
      }
    });

    await writeScrolithaAuditLog({
      actor,
      conversationId: actionPlan.conversationId,
      actionPlanId: actionPlan.id,
      eventType: 'action_failed',
      intent: actionPlan.actionKey,
      toolKey: actionPlan.toolKey,
      requestPayload: mergedParams,
      redactedPayload: redactedParams,
      resultStatus: 'error',
      resultSummary: message,
      confirmationStatus: requiresConfirmation ? 'confirmed' : 'not_required'
    });

    throw new Error(message);
  }
};

export const scrolithaHistory = async (actor: ScrolithaActor, limit?: unknown) => {
  return listConversationHistory({ actor, limit });
};

export const scrolithaFeedback = async (input: ScrolithaFeedbackInput, actor: ScrolithaActor) => {
  const conversationId = text(input.conversationId);
  const rating = Math.max(1, Math.min(5, Math.floor(Number(input.rating || 0))));
  if (!conversationId) throw new Error('conversationId is required.');
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new Error('rating must be between 1 and 5.');
  }

  const conversation = await prisma.scrolithaConversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new Error('Conversation not found.');
  if (conversation.userId !== actor.id || conversation.scope !== actor.scope) {
    throw new Error('Not allowed to rate this conversation.');
  }

  const saved = await saveConversationFeedback({
    conversationId,
    userId: actor.id,
    rating,
    note: text(input.note)
  });

  await writeScrolithaAuditLog({
    actor,
    conversationId,
    eventType: 'feedback_submitted',
    intent: 'feedback',
    requestPayload: { rating, note: text(input.note) },
    redactedPayload: { rating, note: text(input.note) ? '[REDACTED]' : null },
    resultStatus: 'ok',
    resultSummary: 'Feedback recorded.'
  });

  return saved;
};

export const getScrolithaConfigForAdmin = async (scope?: unknown) => {
  const requested = text(scope).toLowerCase();
  if (requested === 'user' || requested === 'admin') {
    return ensureScrolithaConfig(requested);
  }

  const [user, admin] = await Promise.all([ensureScrolithaConfig('user'), ensureScrolithaConfig('admin')]);
  return { user, admin };
};

export const saveScrolithaConfigForAdmin = async (payload: Record<string, any>, actor: ScrolithaActor) => {
  const scope = text(payload.scope).toLowerCase() || 'admin';
  if (scope !== 'user' && scope !== 'admin') throw new Error('scope must be user or admin.');
  return updateScrolithaConfig({
    scope,
    enabled: payload.enabled,
    safeMode: payload.safeMode,
    requireConfirmationByDefault: payload.requireConfirmationByDefault,
    lowRiskAutoExecute: payload.lowRiskAutoExecute,
    denyListedTools: payload.denyListedTools,
    promptBlocklist: payload.promptBlocklist,
    userRateLimitPerMinute: payload.userRateLimitPerMinute,
    adminActionCapPerMinute: payload.adminActionCapPerMinute,
    metadata: payload.metadata,
    updatedBy: actor.id
  });
};

export const listScrolithaSkillsForAdmin = async (includeInactive?: unknown) => {
  const include = String(includeInactive || '').toLowerCase() === 'true';
  const skills = await listSkillsForScope('admin', 'admin', include);
  return skills;
};

export const createScrolithaSkill = async (payload: Record<string, any>, actor: ScrolithaActor) => {
  const key = text(payload.key).toLowerCase();
  const name = text(payload.name);
  if (!key) throw new Error('key is required.');
  if (!name) throw new Error('name is required.');

  return prisma.scrolithaSkill.create({
    data: {
      key,
      name,
      roleScope: Array.isArray(payload.roleScope) ? payload.roleScope.map((entry: unknown) => text(entry).toLowerCase()).filter(Boolean) : [],
      description: text(payload.description) || `Skill: ${name}`,
      inputsSchema: payload.inputs || payload.inputsSchema || [],
      stepsSchema: payload.steps || payload.stepsSchema || [],
      successCriteria: payload.successCriteria || [],
      isActive: payload.isActive !== false,
      version: Math.max(1, Math.floor(Number(payload.version || 1))),
      createdBy: actor.id,
      updatedBy: actor.id
    }
  });
};

export const updateScrolithaSkill = async (id: string, payload: Record<string, any>, actor: ScrolithaActor) => {
  const skillId = text(id);
  if (!skillId) throw new Error('Skill id is required.');

  const existing = await prisma.scrolithaSkill.findUnique({ where: { id: skillId } });
  if (!existing) throw new Error('Skill not found.');

  return prisma.scrolithaSkill.update({
    where: { id: skillId },
    data: {
      key: payload.key !== undefined ? text(payload.key).toLowerCase() || existing.key : existing.key,
      name: payload.name !== undefined ? text(payload.name) || existing.name : existing.name,
      roleScope: Array.isArray(payload.roleScope)
        ? payload.roleScope.map((entry: unknown) => text(entry).toLowerCase()).filter(Boolean)
        : existing.roleScope,
      description: payload.description !== undefined ? text(payload.description) || existing.description : existing.description,
      inputsSchema: payload.inputs !== undefined || payload.inputsSchema !== undefined ? payload.inputs || payload.inputsSchema || [] : existing.inputsSchema,
      stepsSchema: payload.steps !== undefined || payload.stepsSchema !== undefined ? payload.steps || payload.stepsSchema || [] : existing.stepsSchema,
      successCriteria: payload.successCriteria !== undefined ? payload.successCriteria || [] : existing.successCriteria,
      isActive: typeof payload.isActive === 'boolean' ? payload.isActive : existing.isActive,
      version: payload.bumpVersion === true ? existing.version + 1 : existing.version,
      updatedBy: actor.id
    }
  });
};

export const deleteScrolithaSkill = async (id: string) => {
  const skillId = text(id);
  if (!skillId) throw new Error('Skill id is required.');

  const existing = await prisma.scrolithaSkill.findUnique({ where: { id: skillId } });
  if (!existing) return null;
  await prisma.scrolithaSkill.delete({ where: { id: skillId } });
  return { id: skillId };
};

export const getScrolithaAuditForAdmin = async (query: { cursor?: unknown; limit?: unknown; actorId?: unknown; scope?: unknown }) => {
  return listScrolithaAuditLogs({
    cursor: text(query.cursor) || undefined,
    limit: Number(query.limit || 50),
    actorId: text(query.actorId) || undefined,
    scope: text(query.scope) || undefined
  });
};

export const getScrolithaAnalyticsForAdmin = async () => {
  const [
    actionPlans,
    feedbackAgg,
    convCount,
    auditCount,
    toolUsage,
    runtimeLogs,
    runtimeAlerts
  ] = await Promise.all([
    prisma.scrolithaActionPlan.findMany({
      select: {
        id: true,
        actionKey: true,
        status: true,
        createdAt: true,
        executedAt: true
      }
    }),
    prisma.scrolithaFeedback.aggregate({
      _avg: { rating: true },
      _count: { _all: true }
    }),
    prisma.scrolithaConversation.count(),
    prisma.scrolithaAuditLog.count(),
    prisma.scrolithaActionPlan.groupBy({
      by: ['toolKey'],
      _count: { _all: true }
    }),
    prisma.aICopilotLog.findMany({
      where: {
        scope: { in: ['admin', 'user'] }
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: {
        id: true,
        scope: true,
        riskLevel: true,
        metadata: true,
        createdAt: true
      }
    }),
    prisma.scrolithaAuditLog.findMany({
      where: {
        eventType: { in: ['SCROLITHA_RUNTIME_ALERT', 'SCROLITHA_PROMPT_BLOCKED'] }
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        eventType: true,
        resultStatus: true,
        resultSummary: true,
        createdAt: true
      }
    })
  ]);

  const totalActions = actionPlans.length;
  const failedActions = actionPlans.filter((entry) => entry.status === 'failed').length;
  const completedActions = actionPlans.filter((entry) => entry.status === 'executed').length;

  const avgDurationSeconds = completedActions
    ? actionPlans
        .filter((entry) => entry.status === 'executed' && entry.executedAt)
        .reduce((acc, entry) => {
          const duration = (entry.executedAt!.getTime() - entry.createdAt.getTime()) / 1000;
          return acc + Math.max(0, duration);
        }, 0) / completedActions
    : 0;

  const now = Date.now();
  const last24Hours = now - 24 * 60 * 60 * 1000;
  const runtimeEntries = runtimeLogs.map((entry) => {
    const metadata =
      entry.metadata && typeof entry.metadata === 'object' && !Array.isArray(entry.metadata)
        ? (entry.metadata as Record<string, any>)
        : {};
    return {
      id: entry.id,
      scope: entry.scope,
      createdAt: entry.createdAt,
      routeKey: String(metadata.routeKey || 'unknown').trim() || 'unknown',
      provider: String(metadata.provider || 'scrolitha').trim() || 'scrolitha',
      model: String(metadata.model || 'scrolitha-core').trim() || 'scrolitha-core',
      blocked: Boolean(metadata.blocked),
      usedFallback: Boolean(metadata.usedFallback),
      warningCode: String(metadata.warningCode || '').trim() || null,
      runtimeStatus: String(metadata.runtimeStatus || 'ok').trim() || 'ok',
      latencyMs: Number.isFinite(Number(metadata.latencyMs)) ? Number(metadata.latencyMs) : null,
      riskLevel: String(entry.riskLevel || 'low').trim() || 'low'
    };
  });
  const runtimeLast24h = runtimeEntries.filter((entry) => entry.createdAt.getTime() >= last24Hours);
  const runtimeTotal = runtimeEntries.length;
  const blockedCount = runtimeEntries.filter((entry) => entry.blocked).length;
  const fallbackCount = runtimeEntries.filter((entry) => entry.usedFallback).length;
  const successfulEntries = runtimeEntries.filter((entry) => !entry.blocked);
  const latencyValues = successfulEntries
    .map((entry) => (entry.latencyMs && entry.latencyMs >= 0 ? entry.latencyMs : null))
    .filter((entry): entry is number => entry !== null)
    .sort((a, b) => a - b);
  const avgLatencyMs = latencyValues.length
    ? latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length
    : 0;
  const p95LatencyMs = latencyValues.length
    ? latencyValues[Math.min(latencyValues.length - 1, Math.floor(latencyValues.length * 0.95))]
    : 0;

  type RuntimeRouteAggregate = {
    routeKey: string;
    count: number;
    blocked: number;
    fallbacks: number;
    totalLatencyMs: number;
    latencySamples: number;
  };

  const routeMap = runtimeEntries.reduce(
    (acc, entry) => {
      const current = acc[entry.routeKey] || {
        routeKey: entry.routeKey,
        count: 0,
        blocked: 0,
        fallbacks: 0,
        totalLatencyMs: 0,
        latencySamples: 0
      };
      current.count += 1;
      if (entry.blocked) current.blocked += 1;
      if (entry.usedFallback) current.fallbacks += 1;
      if (typeof entry.latencyMs === 'number' && entry.latencyMs >= 0) {
        current.totalLatencyMs += entry.latencyMs;
        current.latencySamples += 1;
      }
      acc[entry.routeKey] = current;
      return acc;
    },
    {} as Record<string, RuntimeRouteAggregate>
  );
  const routeEntries = Object.values(routeMap) as RuntimeRouteAggregate[];

  const warningCodeMap = runtimeEntries.reduce((acc, entry) => {
    if (!entry.warningCode) return acc;
    acc[entry.warningCode] = (acc[entry.warningCode] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const providerMap = runtimeEntries.reduce((acc, entry) => {
    const key = `${entry.provider}:${entry.model}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const recentAlerts = [
    ...(fallbackCount
      ? [
          {
            type: 'fallback_rate',
            severity: runtimeLast24h.filter((entry) => entry.usedFallback).length >= 5 ? 'warning' : 'info',
            count: runtimeLast24h.filter((entry) => entry.usedFallback).length,
            message: `${runtimeLast24h.filter((entry) => entry.usedFallback).length} fallback runtime events in the last 24 hours.`,
            lastSeenAt: runtimeLast24h.find((entry) => entry.usedFallback)?.createdAt?.toISOString?.() || null
          }
        ]
      : []),
    ...(blockedCount
      ? [
          {
            type: 'prompt_policy',
            severity: 'warning',
            count: runtimeLast24h.filter((entry) => entry.blocked).length,
            message: `${runtimeLast24h.filter((entry) => entry.blocked).length} prompt-policy blocks in the last 24 hours.`,
            lastSeenAt: runtimeLast24h.find((entry) => entry.blocked)?.createdAt?.toISOString?.() || null
          }
        ]
      : []),
    ...(runtimeLast24h.some((entry) => (entry.latencyMs || 0) >= 15_000)
      ? [
          {
            type: 'latency',
            severity: p95LatencyMs >= 20_000 ? 'warning' : 'info',
            count: runtimeLast24h.filter((entry) => (entry.latencyMs || 0) >= 15_000).length,
            message: `Scrolitha p95 latency is ${Math.round(p95LatencyMs)}ms with ${runtimeLast24h.filter((entry) => (entry.latencyMs || 0) >= 15_000).length} slow requests in the last 24 hours.`,
            lastSeenAt:
              runtimeLast24h.find((entry) => (entry.latencyMs || 0) >= 15_000)?.createdAt?.toISOString?.() || null
          }
        ]
      : []),
    ...runtimeAlerts.slice(0, 10).map((entry) => ({
      type: String(entry.eventType || 'runtime_alert').toLowerCase(),
      severity: entry.resultStatus === 'warning' ? 'warning' : 'info',
      count: 1,
      message: String(entry.resultSummary || entry.eventType || 'Scrolitha runtime alert'),
      lastSeenAt: entry.createdAt.toISOString()
    }))
  ]
    .filter((entry, index, arr) => arr.findIndex((item) => item.type === entry.type && item.message === entry.message) === index)
    .slice(0, 10);

  return {
    totals: {
      conversations: convCount,
      auditEvents: auditCount,
      actions: totalActions,
      completedActions,
      failedActions,
      failureRate: totalActions ? failedActions / totalActions : 0,
      avgDurationSeconds,
      avgRating: Number(feedbackAgg._avg.rating || 0),
      feedbackCount: feedbackAgg._count._all || 0,
      estimatedMinutesSaved: completedActions * 2,
      runtimeRequests: runtimeTotal,
      runtimeFallbacks: fallbackCount,
      runtimePromptBlocks: blockedCount,
      runtimeAvgLatencyMs: Number(avgLatencyMs.toFixed(2)),
      runtimeP95LatencyMs: p95LatencyMs
    },
    topTools: toolUsage
      .map((entry) => ({ toolKey: entry.toolKey, count: entry._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    taskBreakdown: actionPlans
      .reduce((acc: Record<string, number>, entry) => {
        acc[entry.actionKey] = (acc[entry.actionKey] || 0) + 1;
        return acc;
      }, {}),
    runtime: {
      totalRequests: runtimeTotal,
      blockedCount,
      fallbackCount,
      fallbackRate: runtimeTotal ? fallbackCount / runtimeTotal : 0,
      promptBlockRate: runtimeTotal ? blockedCount / runtimeTotal : 0,
      avgLatencyMs: Number(avgLatencyMs.toFixed(2)),
      p95LatencyMs,
      requestsLast24h: runtimeLast24h.length,
      warningCodes: Object.entries(warningCodeMap)
        .map(([warningCode, count]) => ({ warningCode, count: Number(count || 0) }))
        .sort((a, b) => b.count - a.count),
      providers: Object.entries(providerMap)
        .map(([providerModel, count]) => ({ providerModel, count: Number(count || 0) }))
        .sort((a, b) => b.count - a.count),
      routes: routeEntries
        .map((entry) => ({
          routeKey: entry.routeKey,
          count: entry.count,
          blocked: entry.blocked,
          fallbacks: entry.fallbacks,
          avgLatencyMs: entry.latencySamples ? Number((entry.totalLatencyMs / entry.latencySamples).toFixed(2)) : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12),
      recentAlerts
    }
  };
};

export const getScrolithaToolRegistry = () => {
  return listScrolithaTools();
};

export const getScrolithaKnowledgeForActor = async (actor: ScrolithaActor, query?: { message?: unknown }) => {
  const config = await ensureScrolithaConfig(actor.scope);
  const userMessage = text(query?.message) || 'platform overview and capabilities';
  const bundle = getScrolithaKnowledgeBundle(config.metadata);
  const context = buildScrolithaKnowledgeContext({
    actor,
    userMessage,
    metadata: config.metadata
  });

  return {
    generatedAt: new Date().toISOString(),
    role: actor.role,
    scope: actor.scope,
    knowledge: bundle,
    context
  };
};

export const getScrolithaCommunicationRecords = async (
  actor: ScrolithaActor,
  query?: { limit?: unknown; conversationId?: unknown }
) => {
  const limit = Math.max(1, Math.min(50, Math.floor(Number(query?.limit || 20))));
  const conversationId = text(query?.conversationId);
  const where: Record<string, any> = {
    userId: actor.id,
    scope: actor.scope
  };
  if (conversationId) where.id = conversationId;

  const conversations = await prisma.scrolithaConversation.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 120
      },
      actionPlans: {
        orderBy: { createdAt: 'desc' },
        take: 25
      },
      feedback: {
        orderBy: { createdAt: 'desc' },
        take: 5
      }
    }
  });

  return {
    total: conversations.length,
    items: conversations.map((entry) => ({
      id: entry.id,
      userId: entry.userId,
      userRole: entry.userRole,
      scope: entry.scope,
      status: entry.status,
      pageContext: entry.pageContext,
      entityContextId: entry.entityContextId,
      summary: entry.summary || null,
      metadata: entry.metadata || null,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      messageCount: entry.messages.length,
      actionCount: entry.actionPlans.length,
      feedbackCount: entry.feedback.length,
      messages: entry.messages.map((msg) => ({
        id: msg.id,
        sender: msg.sender,
        content: msg.content,
        createdAt: msg.createdAt
      })),
      actions: entry.actionPlans.map((action) => ({
        id: action.id,
        actionKey: action.actionKey,
        toolKey: action.toolKey,
        status: action.status,
        confirmationStatus: action.confirmationStatus,
        createdAt: action.createdAt,
        executedAt: action.executedAt
      })),
      feedback: entry.feedback.map((fb) => ({
        id: fb.id,
        rating: fb.rating,
        note: fb.note,
        createdAt: fb.createdAt
      }))
    }))
  };
};

export const getScrolithaLearningInsightsForAdminReport = async (query?: { limitUsers?: unknown }) => {
  return getScrolithaLearningInsightsForAdmin(query);
};

const DEFAULT_CHAT_WIDGET_CONFIG = {
  enabled: true,
  assistantName: 'Scrolitha',
  assistantRoleLabel: 'Support',
  textColor: '#1e293b',
  accentColor: '#4f46e5',
  agentBubbleColor: '#f3f4f6',
  userBubbleColor: '#4f46e5',
  logoUrl: '',
  logoFileId: '',
  welcomeText: "Hi! I'm Scrolitha. I can help you navigate Scrolith. What describes you best?",
  typingText: 'Scrolitha is thinking...',
  placeholderText: 'Ask Scrolitha a question...',
  emptyStateText: 'Ask about support, gigs, jobs, files, orders, notifications, or account help.',
  offlineMessage: "I'm having trouble connecting right now. Please try again in a moment.",
  disclaimerText: 'Scrolitha keeps actions inside approved platform tools and confirmation rules.',
  starterPrompts: ['Create a gig draft', 'Generate a structured project brief', 'Show my latest orders'],
  guestStarterPrompts: ['How do I get started?', 'How do gigs and jobs work?', 'How do I contact support?'],
  allowVoiceInput: true,
  allowFileUpload: true,
  showStatusBadge: true,
  maxHistoryItems: 24
};

const sanitizeWidgetConfig = (input: any) => {
  const src = input && typeof input === 'object' ? input : {};
  const readString = (keyOrKeys: string | string[], fallback = '') => {
    const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
    for (const key of keys) {
      const raw = src?.[key];
      if (raw === undefined || raw === null) continue;
      const value = String(raw).trim();
      if (value || value === '') return value;
    }
    return String(fallback || '').trim();
  };
  const readColor = (keyOrKeys: string | string[], fallback: string) => {
    const value = readString(keyOrKeys, fallback);
    if (!value) return fallback;
    const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    const rgb = /^rgba?\([\d\s.,%]+\)$/i;
    return hex.test(value) || rgb.test(value) ? value : fallback;
  };
  const readBool = (keyOrKeys: string | string[], fallback: boolean) => {
    const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
    for (const key of keys) {
      const raw = src?.[key];
      if (typeof raw === 'boolean') return raw;
    }
    return fallback;
  };
  const readInteger = (keyOrKeys: string | string[], fallback: number, min: number, max: number) => {
    const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
    for (const key of keys) {
      const raw = Number(src?.[key]);
      if (Number.isFinite(raw)) return Math.max(min, Math.min(max, Math.floor(raw)));
    }
    return fallback;
  };
  const readStringList = (keyOrKeys: string | string[], fallback: string[]) => {
    const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
    for (const key of keys) {
      const raw = src?.[key];
      if (Array.isArray(raw)) return uniqueStrings(raw, 8);
      if (typeof raw === 'string') return uniqueStrings(raw.split(/[\n,]/g), 8);
    }
    return fallback;
  };

  return {
    enabled: src?.enabled !== false,
    assistantName: readString(['assistantName', 'assistant_name'], DEFAULT_CHAT_WIDGET_CONFIG.assistantName),
    assistantRoleLabel: readString(
      ['assistantRoleLabel', 'roleLabel', 'assistant_role_label'],
      DEFAULT_CHAT_WIDGET_CONFIG.assistantRoleLabel
    ),
    textColor: readColor(['textColor', 'text_color'], DEFAULT_CHAT_WIDGET_CONFIG.textColor),
    accentColor: readColor(['accentColor', 'accent_color'], DEFAULT_CHAT_WIDGET_CONFIG.accentColor),
    agentBubbleColor: readColor(
      ['agentBubbleColor', 'botBubbleColor', 'agent_bubble_color'],
      DEFAULT_CHAT_WIDGET_CONFIG.agentBubbleColor
    ),
    userBubbleColor: readColor(['userBubbleColor', 'user_bubble_color'], DEFAULT_CHAT_WIDGET_CONFIG.userBubbleColor),
    logoUrl: readString(['logoUrl', 'chatLogoUrl', 'chat_logo_url', 'logo_url', 'chatLogo']),
    logoFileId: readString(['logoFileId', 'chatLogoFileId', 'chat_logo_file_id', 'logo_file_id']),
    welcomeText: readString(['welcomeText', 'welcomeMessage', 'welcome_message'], DEFAULT_CHAT_WIDGET_CONFIG.welcomeText),
    typingText: readString(['typingText', 'typingMessage', 'typing_message'], DEFAULT_CHAT_WIDGET_CONFIG.typingText),
    placeholderText: readString(['placeholderText', 'placeholder_text'], DEFAULT_CHAT_WIDGET_CONFIG.placeholderText),
    emptyStateText: readString(['emptyStateText', 'empty_state_text'], DEFAULT_CHAT_WIDGET_CONFIG.emptyStateText),
    offlineMessage: readString(['offlineMessage', 'offline_message'], DEFAULT_CHAT_WIDGET_CONFIG.offlineMessage),
    disclaimerText: readString(['disclaimerText', 'disclaimer_text'], DEFAULT_CHAT_WIDGET_CONFIG.disclaimerText),
    starterPrompts: readStringList(['starterPrompts', 'starter_prompts'], DEFAULT_CHAT_WIDGET_CONFIG.starterPrompts),
    guestStarterPrompts: readStringList(
      ['guestStarterPrompts', 'guest_starter_prompts'],
      DEFAULT_CHAT_WIDGET_CONFIG.guestStarterPrompts
    ),
    allowVoiceInput: readBool(['allowVoiceInput', 'allow_voice_input'], DEFAULT_CHAT_WIDGET_CONFIG.allowVoiceInput),
    allowFileUpload: readBool(['allowFileUpload', 'allow_file_upload'], DEFAULT_CHAT_WIDGET_CONFIG.allowFileUpload),
    showStatusBadge: readBool(['showStatusBadge', 'show_status_badge'], DEFAULT_CHAT_WIDGET_CONFIG.showStatusBadge),
    maxHistoryItems: readInteger(['maxHistoryItems', 'max_history_items'], DEFAULT_CHAT_WIDGET_CONFIG.maxHistoryItems, 8, 60)
  };
};

export const getScrolithaWidgetConfigPublic = async () => {
  const adminConfig = await ensureScrolithaConfig('admin');
  const metadata = adminConfig?.metadata && typeof adminConfig.metadata === 'object' ? adminConfig.metadata : {};
  const source =
    (metadata as any).chatWidget ||
    (metadata as any).chat_widget ||
    (metadata as any).widget ||
    {};
  return sanitizeWidgetConfig(source);
};

export const getScrolithaChatRecordsForAdmin = async (query?: {
  limit?: unknown;
  userId?: unknown;
  scope?: unknown;
  conversationId?: unknown;
}) => {
  const limit = Math.max(1, Math.min(50, Math.floor(Number(query?.limit || 20))));
  const userId = text(query?.userId);
  const scope = text(query?.scope).toLowerCase();
  const conversationId = text(query?.conversationId);

  const where: any = {};
  if (userId) where.userId = userId;
  if (scope === 'user' || scope === 'admin') where.scope = scope;
  if (conversationId) where.id = conversationId;

  const conversations = await prisma.scrolithaConversation.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 120
      }
    }
  });

  const userIds = Array.from(new Set(conversations.map((entry) => entry.userId).filter(Boolean)));
  const preferenceRows = userIds.length
    ? await prisma.scrolithaUserPreference.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, metadata: true }
      })
    : [];
  const preferenceMap = new Map<string, any>();
  for (const row of preferenceRows) {
    const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, any>)
      : {};
    preferenceMap.set(row.userId, (metadata as any).learningProfile || null);
  }

  return {
    items: conversations.map((entry) => {
      const messages = Array.isArray(entry.messages)
        ? entry.messages.map((msg) => ({
            id: msg.id,
            sender: msg.sender,
            content: msg.content,
            createdAt: msg.createdAt
          }))
        : [];
      return {
        id: entry.id,
        userId: entry.userId,
        userRole: entry.userRole,
        scope: entry.scope,
        status: entry.status,
        pageContext: entry.pageContext,
        entityContextId: entry.entityContextId,
        summary: entry.summary || null,
        metadata: entry.metadata || null,
        learningProfile: preferenceMap.get(entry.userId) || null,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        messageCount: messages.length,
        lastMessage: messages.length ? messages[messages.length - 1] : null,
        messages
      };
    })
  };
};
