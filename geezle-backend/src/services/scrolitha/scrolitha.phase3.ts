/**
 * Scrolitha Phase 3: tiered local model routing and domain prompt packs.
 *
 * Routing is deterministic, bounded, and provider-neutral. Environment model
 * overrides are optional; when absent, the resolved production model remains
 * the source of truth. Prompt packs contain no user data or secrets.
 */
import type { ScrolithaLlmRuntime } from './scrolitha.ollama';

export type ScrolithaDomain =
  | 'career'
  | 'marketplace'
  | 'profile'
  | 'messaging'
  | 'support'
  | 'moderation'
  | 'general';

export type ModelTier = 'fast' | 'standard' | 'advanced';

export type Phase3RoutingDecision = {
  domain: ScrolithaDomain;
  tier: ModelTier;
  model: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  promptPack: string;
  reason: string;
};

const PACKS: Record<ScrolithaDomain, string> = {
  career:
    'Career mode: prioritize actionable, skills-based guidance, clear next steps, and realistic role or hiring context. Do not invent employers, salaries, credentials, or outcomes.',
  marketplace:
    'Marketplace mode: emphasize buyer/seller intent, scope, deliverables, pricing clarity, trust, and safe transactions. Never imply payment or order completion without confirmation.',
  profile:
    'Profile mode: give concise, professional improvement advice grounded only in supplied profile context. Separate recommendations from facts and never expose private fields.',
  messaging:
    'Messaging mode: be concise, warm, and directly useful. Preserve the user\'s intent, avoid repeating conversation history, and never send or modify a message without explicit confirmation.',
  support:
    'Support mode: identify the issue, state what is known, provide safe troubleshooting steps, and clearly identify when human support or verification is required.',
  moderation:
    'Moderation mode: distinguish signals from conclusions, avoid irreversible enforcement recommendations, and provide neutral evidence with a confidence level.',
  general:
    'General mode: answer directly, distinguish facts from suggestions, ask one focused clarification when needed, and avoid unsupported claims.'
};

const text = (value: unknown) => String(value || '').trim().toLowerCase();

export const detectScrolithaDomain = (input: {
  message: string;
  intent?: string | null;
  page?: string | null;
  messagingFastPath?: boolean;
}): ScrolithaDomain => {
  const value = `${text(input.message)} ${text(input.intent)} ${text(input.page)}`;
  if (input.messagingFastPath || /message|inbox|chat|conversation/.test(value)) return 'messaging';
  if (/moderation|report|abuse|harassment|misinformation|safety/.test(value)) return 'moderation';
  if (/support|help|ticket|problem|error|bug/.test(value)) return 'support';
  if (/profile|resume|cv|portfolio|bio|skills|hire me/.test(value)) return 'profile';
  if (/marketplace|listing|seller|buyer|gig|service|order|price/.test(value)) return 'marketplace';
  if (/job|career|hire|hiring|recruit|interview|freelance|freelancer/.test(value)) return 'career';
  return 'general';
};

export const selectModelTier = (input: {
  message: string;
  intent?: string | null;
  domain: ScrolithaDomain;
  hasActions?: boolean;
  safeMode?: boolean;
}): ModelTier => {
  const value = text(input.message);
  if (input.safeMode || input.domain === 'moderation' || input.domain === 'support') return 'advanced';
  if (input.hasActions || /compare|analy[sz]e|plan|strategy|review|improve|draft|summarize|why|explain/.test(value)) {
    return 'standard';
  }
  if (value.length > 700 || (input.intent || '').length > 40) return 'standard';
  return 'fast';
};

const configuredModel = (tier: ModelTier, fallback: string) => {
  const key = tier === 'fast' ? 'SCROLITHA_MODEL_FAST' : tier === 'advanced' ? 'SCROLITHA_MODEL_ADVANCED' : 'SCROLITHA_MODEL_STANDARD';
  return String(process.env[key] || '').trim() || fallback;
};

export const routeScrolithaModel = (input: {
  runtime: ScrolithaLlmRuntime;
  message: string;
  intent?: string | null;
  page?: string | null;
  messagingFastPath?: boolean;
  hasActions?: boolean;
  safeMode?: boolean;
}): Phase3RoutingDecision => {
  const domain = detectScrolithaDomain(input);
  const tier = selectModelTier({
    message: input.message,
    intent: input.intent,
    domain,
    hasActions: input.hasActions,
    safeMode: input.safeMode
  });
  const model = configuredModel(tier, input.runtime.model);
  const maxTokens = tier === 'fast'
    ? Math.min(input.runtime.maxTokens, input.messagingFastPath ? 384 : 640)
    : tier === 'advanced'
      ? Math.max(768, input.runtime.maxTokens)
      : input.runtime.maxTokens;
  const temperature = tier === 'advanced'
    ? Math.min(input.runtime.temperature, 0.35)
    : tier === 'standard'
      ? Math.min(input.runtime.temperature, 0.55)
      : Math.min(input.runtime.temperature, 0.7);
  return {
    domain,
    tier,
    model,
    maxTokens,
    temperature,
    topP: input.runtime.topP,
    promptPack: PACKS[domain],
    reason: `${tier} tier selected for ${domain} domain; model override ${model === input.runtime.model ? 'not configured' : 'configured'}`
  };
};

export const getDomainPromptPack = (domain: ScrolithaDomain) => PACKS[domain];
