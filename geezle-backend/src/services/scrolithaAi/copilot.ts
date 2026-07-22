/**
 * Phase 33.3 — Platform Copilot.
 * Contextual assistance across Scrolith surfaces. Suggestions & drafts only.
 */
import { ScrolithaAI } from './execute';
import { loadAIFeatureFlags } from './config';
import { getAIConsent } from './consent';
import { getAIMemory } from './memory';
import { runSkills, pickPrimarySkill, listSkills } from './skills';
import { planToolsFromIntent, invokePlatformTools } from './orchestration';
import { isBetaAllowed } from './allowlist';
import { detectIntentLocal } from './providers/nativeProvider';
import { inc, logAIEvent } from './observability';
import type { CopilotSurface } from './types';

export type CopilotRequest = {
  userId: string;
  message: string;
  surface: CopilotSurface;
  pagePath?: string;
  entityId?: string | null;
  entityType?: string | null;
  locale?: string;
  isAdmin?: boolean;
  includeTools?: boolean;
  correlationId?: string;
};

export type CopilotResponse = {
  ok: boolean;
  blocked?: boolean;
  reason?: string;
  surface: CopilotSurface;
  intent: string;
  primarySkill: string;
  text: string;
  suggestions: Array<{
    id: string;
    title: string;
    body: string;
    kind: string;
    requiresUserAction: true;
    hrefHint?: string;
    skillId: string;
  }>;
  toolResults?: unknown[];
  plan?: string[];
  disclosure: {
    generatedByAI: boolean;
    provider: string;
    model: string;
    nativeFirst: true;
    autonomous: false;
    generatedAt: string;
  };
  latencyMs: number;
  correlationId?: string;
};

async function assertCopilotAccess(userId: string, isAdmin?: boolean) {
  const flags = await loadAIFeatureFlags();
  if (flags.killSwitch) return { ok: false as const, reason: 'COPILOT_FEATURE_DISABLED' };
  if (!flags.masterEnabled) return { ok: false as const, reason: 'COPILOT_FEATURE_DISABLED' };
  if (!flags.platformCopilotEnabled && !flags.nativeIntelligenceEnabled) {
    return { ok: false as const, reason: 'COPILOT_FEATURE_DISABLED' };
  }
  if (flags.betaAllowlistOnly) {
    const allowed = await isBetaAllowed(userId, isAdmin);
    if (!allowed) return { ok: false as const, reason: 'USER_NOT_IN_BETA_ALLOWLIST' };
  }
  const consent = await getAIConsent(userId);
  if (!consent.aiFeaturesEnabled || !consent.aiSuggestionsAllowed) {
    return { ok: false as const, reason: 'AI_CONSENT_REQUIRED' };
  }
  return { ok: true as const, flags, consent };
}

export async function runCopilot(input: CopilotRequest): Promise<CopilotResponse> {
  const started = Date.now();
  const surface = input.surface || 'generic';
  const message = String(input.message || '').trim().slice(0, 8000);

  const gate = await assertCopilotAccess(input.userId, input.isAdmin);
  if (!gate.ok) {
    return {
      ok: false,
      blocked: true,
      reason: gate.reason,
      surface,
      intent: 'blocked',
      primarySkill: 'none',
      text: '',
      suggestions: [],
      disclosure: {
        generatedByAI: true,
        provider: 'NATIVE',
        model: 'scrolitha-native-33.3',
        nativeFirst: true,
        autonomous: false,
        generatedAt: new Date().toISOString()
      },
      latencyMs: Date.now() - started
    };
  }

  if (!message) {
    return {
      ok: false,
      reason: 'EMPTY_MESSAGE',
      surface,
      intent: 'none',
      primarySkill: 'none',
      text: '',
      suggestions: [],
      disclosure: {
        generatedByAI: true,
        provider: 'NATIVE',
        model: 'scrolitha-native-33.3',
        nativeFirst: true,
        autonomous: false,
        generatedAt: new Date().toISOString()
      },
      latencyMs: Date.now() - started
    };
  }

  const memory = await getAIMemory(input.userId);
  const intentInfo = detectIntentLocal(message);
  const primarySkill = pickPrimarySkill(message, surface);

  const skillResults =
    gate.flags.skillsFrameworkEnabled !== false
      ? await runSkills(message, {
          userId: input.userId,
          surface,
          locale: input.locale,
          pagePath: input.pagePath,
          entityId: input.entityId,
          entityType: input.entityType,
          memoryTopics: memory.preferredTopics,
          recentActions: [],
          workspaceHint: input.pagePath || null
        })
      : [];

  const suggestions = skillResults.flatMap((r) => r.suggestions).slice(0, 8);

  // Native copilot text via gateway (NATIVE provider)
  const exec = await ScrolithaAI.execute({
    capability: gate.flags.COPILOT_CONTEXT ? 'COPILOT_CONTEXT' : 'ASSISTANT_CHAT',
    userId: input.userId,
    input: `surface=${surface}\npath=${input.pagePath || ''}\nentity=${input.entityType || ''}:${input.entityId || ''}\n\n${message}`,
    locale: input.locale || 'en',
    policy: {
      privacyLevel: 'PERSONAL',
      preferInternalProvider: true,
      requireOllama: process.env.NODE_ENV === 'production',
      allowCache: false,
      maxTokens: 600
    },
    correlationId: input.correlationId,
    metadata: { surface: 'platform_copilot', primarySkill, intent: intentInfo.intent }
  });

  // Deterministic skills may prepare context, but generative responses never fall back to native or MOCK.
  let text = exec.ok ? exec.text || '' : '';
  if (!exec.ok) {
    return {
      ok: false,
      blocked: false,
      reason: exec.reason || 'OLLAMA_UNAVAILABLE',
      surface,
      intent: intentInfo.intent,
      primarySkill,
      text: '',
      suggestions: [],
      disclosure: {
        generatedByAI: true,
        provider: 'OLLAMA',
        model: 'qwen3:14b',
        nativeFirst: true,
        autonomous: false,
        generatedAt: new Date().toISOString()
      },
      latencyMs: Date.now() - started,
      correlationId: exec.correlationId
    };
  }

  let toolResults: unknown[] | undefined;
  if (input.includeTools && gate.flags.toolOrchestrationEnabled) {
    const tools = planToolsFromIntent(intentInfo.intent).map((tool) => ({
      tool,
      args: {
        query: message,
        limit: 5,
        candidates: []
      }
    }));
    toolResults = await invokePlatformTools({
      userId: input.userId,
      tools,
      isAdmin: input.isAdmin
    });
  }

  inc('assistantMessages');
  logAIEvent('info', 'copilot.completed', {
    surface,
    intent: intentInfo.intent,
    skill: primarySkill,
    correlationId: exec.correlationId
  });

  return {
    ok: true,
    surface,
    intent: intentInfo.intent,
    primarySkill,
    text,
    suggestions,
    toolResults,
    plan: skillResults.flatMap((r) => r.plan || []).slice(0, 10),
    disclosure: {
      generatedByAI: true,
      provider: exec.disclosure?.provider || 'NATIVE',
      model: exec.disclosure?.model || 'scrolitha-native-33.3',
      nativeFirst: true,
      autonomous: false,
      generatedAt: new Date().toISOString()
    },
    latencyMs: Date.now() - started,
    correlationId: exec.correlationId
  };
}

export async function copilotStatus(userId: string, isAdmin?: boolean) {
  const flags = await loadAIFeatureFlags();
  const consent = await getAIConsent(userId);
  const beta = flags.betaAllowlistOnly ? await isBetaAllowed(userId, isAdmin) : true;
  return {
    phase: '33.3',
    platformCopilotEnabled: Boolean(flags.platformCopilotEnabled),
    nativeIntelligenceEnabled: Boolean(flags.nativeIntelligenceEnabled),
    skillsFrameworkEnabled: Boolean(flags.skillsFrameworkEnabled),
    toolOrchestrationEnabled: Boolean(flags.toolOrchestrationEnabled),
    betaAllowlistOnly: Boolean(flags.betaAllowlistOnly),
    betaAllowed: beta,
    consentOk: Boolean(consent.aiFeaturesEnabled && consent.aiSuggestionsAllowed),
    skills: listSkills(),
    routingPriority:
      process.env.NODE_ENV === 'production'
        ? ['OLLAMA']
        : ['NATIVE', 'OLLAMA', 'GEMINI', 'OPENAI', 'MOCK'],
    productionProvider: 'OLLAMA',
    productionModel: 'qwen3:14b',
    externalProvidersEnabled: false,
    mockEnabledForProduction: false,
    autonomous: false,
    disclosure:
      'Scrolitha Copilot provides contextual suggestions and drafts only. It never posts, messages, moderates, hires, or moves money for you.'
  };
}

export default { runCopilot, copilotStatus };
