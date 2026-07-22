/**
 * Phase 33.3 — Native intelligence, skills, copilot, orchestration, routing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setAIFeatureFlags } from '../config';
import { updateAIConsent } from '../consent';
import { routeModel } from '../router';
import { nativeProvider, detectIntentLocal } from '../providers/nativeProvider';
import { listSkills, runSkills, pickPrimarySkill } from '../skills';
import { planToolsFromIntent, invokePlatformTools } from '../orchestration';
import { runCopilot, copilotStatus } from '../copilot';
import { setBetaAllowlist, isBetaAllowed } from '../allowlist';
import { ScrolithaAI } from '../execute';

const USER = 'user-core-333';
const ADMIN = 'admin-core-333';

async function enableCore() {
  await setAIFeatureFlags({
    masterEnabled: true,
    killSwitch: false,
    enableProviderCalls: false,
    ASSISTANT_CHAT: true,
    INTENT_DETECTION: true,
    TASK_PLANNING: true,
    COPILOT_CONTEXT: true,
    SKILL_INVOCATION: true,
    PLATFORM_TOOL_PLAN: true,
    WORKFLOW_ORCHESTRATION: true,
    nativeIntelligenceEnabled: true,
    platformCopilotEnabled: true,
    skillsFrameworkEnabled: true,
    toolOrchestrationEnabled: true,
    betaAllowlistOnly: true,
    SEMANTIC_SEARCH_PREPARATION: true,
    recommendationsEnabled: true,
    searchSuggestionsEnabled: true,
    SEARCH_QUERY_SUGGESTION: true,
    aiMemoryEnabled: true
  });
  await updateAIConsent(USER, {
    aiFeaturesEnabled: true,
    aiSuggestionsAllowed: true,
    personalizationAllowed: true,
    externalProviderProcessingAllowed: false
  });
  await setBetaAllowlist([USER]);
}

describe('Phase 33.3 native provider', () => {
  it('detects intents locally', () => {
    expect(detectIntentLocal('rewrite my post').intent).toBe('rewrite');
    expect(detectIntentLocal('find remote jobs').intent).toBe('jobs');
    expect(detectIntentLocal('summarize this').intent).toBe('summarize');
  });

  it('generates text without network', async () => {
    const r = await nativeProvider.generateText({
      messages: [
        { role: 'system', content: 'Detect intent' },
        { role: 'user', content: 'I need a job cover letter draft' }
      ]
    });
    expect(r.provider).toBe('NATIVE');
    expect(r.text.length).toBeGreaterThan(0);
  });

  it('health operational', async () => {
    const h = await nativeProvider.healthCheck();
    expect(h.status).toBe('operational');
  });
});

describe('Phase 33.3 routing native-first', () => {
  it('prefers NATIVE for intent detection', () => {
    const r = routeModel({
      capability: 'INTENT_DETECTION',
      privacyLevel: 'PERSONAL',
      externalConsent: false,
      preferNative: true,
      localFirst: true
    });
    expect(r.provider).toBe('NATIVE');
    expect(r.reason).toMatch(/native/i);
  });

  it('keeps OLLAMA before external for summarization', () => {
    const r = routeModel({
      capability: 'TEXT_SUMMARIZATION',
      privacyLevel: 'PUBLIC',
      externalConsent: true,
      preferNative: false
    });
    expect(r.provider).toBe('OLLAMA');
    expect(r.fallbackChain.some((f) => f.provider === 'GEMINI' || f.provider === 'OPENAI')).toBe(true);
  });

  it('blocks prohibited', () => {
    const r = routeModel({
      capability: 'ASSISTANT_CHAT',
      privacyLevel: 'PROHIBITED',
      externalConsent: true
    });
    expect(r.provider).toBe('DISABLED');
  });
});

describe('Phase 33.3 skills', () => {
  it('lists all modular skills', () => {
    const skills = listSkills();
    expect(skills.length).toBeGreaterThanOrEqual(11);
    expect(skills.map((s) => s.id)).toContain('FeedSkill');
    expect(skills.map((s) => s.id)).toContain('JobSkill');
  });

  it('runs skill suggestions as non-autonomous', async () => {
    const results = await runSkills('draft a cover letter for backend engineer', {
      userId: USER,
      surface: 'jobs',
      memoryTopics: ['react']
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].suggestions.every((s) => s.requiresUserAction === true)).toBe(true);
  });

  it('picks primary skill by surface', () => {
    expect(pickPrimarySkill('hello', 'notifications')).toBe('NotificationSkill');
  });
});

describe('Phase 33.3 orchestration', () => {
  it('plans internal tools only', () => {
    const tools = planToolsFromIntent('search');
    expect(tools).toContain('search_suggest');
    expect(tools.every((t) => !String(t).includes('send_message'))).toBe(true);
  });

  it('invokes tools when flag on', async () => {
    await enableCore();
    const results = await invokePlatformTools({
      userId: USER,
      tools: [{ tool: 'memory_read' }]
    });
    expect(results[0].ok).toBe(true);
    expect(results[0].executed).toBe(true);
  });

  it('blocks tools when flag off', async () => {
    await setAIFeatureFlags({ toolOrchestrationEnabled: false, masterEnabled: true });
    const results = await invokePlatformTools({
      userId: USER,
      tools: [{ tool: 'memory_read' }]
    });
    expect(results[0].ok).toBe(false);
    expect(results[0].reason).toMatch(/SURFACE_FLAG/);
  });
});

describe('Phase 33.3 allowlist', () => {
  it('enforces beta allowlist', async () => {
    await setBetaAllowlist([USER]);
    expect(await isBetaAllowed(USER, false)).toBe(true);
    expect(await isBetaAllowed('stranger', false)).toBe(false);
    expect(await isBetaAllowed('stranger', true)).toBe(true);
  });
});

describe('Phase 33.3 copilot', () => {
  beforeEach(async () => {
    await enableCore();
  });

  it('returns status with routing priority', async () => {
    const s = await copilotStatus(USER, false);
    expect(s.phase).toBe('33.3');
    expect(s.routingPriority[0]).toBe('NATIVE');
    expect(s.autonomous).toBe(false);
    expect(s.betaAllowed).toBe(true);
  });

  it('blocks non-allowlisted users', async () => {
    const r = await runCopilot({
      userId: 'not-allowed-user',
      message: 'help with my feed',
      surface: 'feed'
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('USER_NOT_IN_BETA_ALLOWLIST');
    expect(r.disclosure.autonomous).toBe(false);
  });

  it('runs contextual copilot with skills', async () => {
    const r = await runCopilot({
      userId: USER,
      message: 'Help me improve this job application draft for a React role',
      surface: 'jobs',
      pagePath: '/jobs/123',
      includeTools: false
    });
    expect(r.ok).toBe(true);
    expect(r.disclosure.nativeFirst).toBe(true);
    expect(r.disclosure.autonomous).toBe(false);
    expect(r.primarySkill).toBeTruthy();
    expect(r.text.length).toBeGreaterThan(0);
  });
});

describe('Phase 33.3 execute uses NATIVE offline', () => {
  it('completes INTENT_DETECTION via native without network providers', async () => {
    await enableCore();
    const r = await ScrolithaAI.execute({
      capability: 'INTENT_DETECTION',
      userId: USER,
      input: 'summarize my notifications please'
    });
    expect(r.ok).toBe(true);
    expect(r.disclosure?.provider).toBe('NATIVE');
  });
});
