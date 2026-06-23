import { createHash } from 'crypto';
import {
  generateScrolithaText,
  SCROLITHA_BACKUP_WARNING_CODE,
  SCROLITHA_BACKUP_WARNING_MESSAGE
} from '../../../services/scrolitha/scrolitha.ollama';
import {
  createScrolithaPromptPolicyError,
  detectPromptInjectionAttempt,
  ensureScrolithaConfig
} from '../../../services/scrolitha/scrolitha.policy';
import type { ScrolithaActor, ScrolithaScope } from '../../../services/scrolitha/scrolitha.types';
import { writeScrolithaAuditLog } from '../../../services/scrolitha/scrolitha.audit';
import prisma from '../../../utils/prismaClient';

type GenerateInput = {
  scope: ScrolithaScope;
  actor: ScrolithaActor;
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  routeKey?: string;
};

const hashPrompt = (value: string) => createHash('sha256').update(String(value || '')).digest('hex');

const tokenize = (text: string) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);

const lexicalEmbedding = (text: string, dimensions = 128): number[] => {
  const vec = new Array<number>(dimensions).fill(0);
  tokenize(text).forEach((token, idx) => {
    const hash = createHash('md5').update(`${idx}:${token}`).digest();
    const bucket = hash[0] % dimensions;
    vec[bucket] += 1;
  });
  const norm = Math.sqrt(vec.reduce((acc, item) => acc + item * item, 0)) || 1;
  return vec.map((value) => Number((value / norm).toFixed(6)));
};

const keywordToxicityScore = (text: string) => {
  const source = String(text || '').toLowerCase();
  const severe = ['kill', 'hate you', 'racist', 'die', 'terrorist', 'nazi'];
  const medium = ['stupid', 'idiot', 'trash', 'dumb', 'loser', 'shut up'];
  let score = 0;
  severe.forEach((token) => {
    if (source.includes(token)) score += 30;
  });
  medium.forEach((token) => {
    if (source.includes(token)) score += 12;
  });
  if (source.includes('!!!')) score += 5;
  return Math.max(0, Math.min(100, score));
};

export const ScrolithaService = {
  async generate(input: GenerateInput): Promise<{
    text: string;
    provider: string;
    model: string;
    usedFallback?: boolean;
    warning?: string;
    warningCode?: string;
  }> {
    const prompt = String(input.prompt || '').trim();
    if (!prompt) throw new Error('Prompt is required.');
    const routeKey = String(input.routeKey || 'scrolitha_generate').trim() || 'scrolitha_generate';
    const promptHash = hashPrompt(prompt);
    const startedAt = Date.now();
    const config = await ensureScrolithaConfig(input.scope);
    const blocked = detectPromptInjectionAttempt(prompt, config.promptBlocklist || []);
    if (blocked.blocked) {
      await prisma.aICopilotLog.create({
        data: {
          userId: input.actor.id || null,
          scope: input.scope,
          promptHash,
          inputSummary: prompt.slice(0, 500),
          outputSummary: null,
          riskLevel: 'high',
          metadata: {
            provider: 'scrolitha',
            model: 'scrolitha-core',
            routeKey,
            blocked: true,
            promptPattern: blocked.pattern || null,
            latencyMs: Date.now() - startedAt,
            usedFallback: false,
            warningCode: null,
            runtimeStatus: 'blocked'
          }
        }
      });
      await writeScrolithaAuditLog({
        actor: input.actor,
        eventType: 'SCROLITHA_PROMPT_BLOCKED',
        intent: routeKey,
        requestPayload: { scope: input.scope, promptHash, routeKey, blocked: true },
        redactedPayload: { scope: input.scope, promptHash, routeKey, blocked: true },
        resultStatus: 'blocked',
        resultSummary: blocked.pattern ? `Matched prompt policy pattern: ${blocked.pattern}` : 'Prompt policy blocked request.'
      });
      throw createScrolithaPromptPolicyError(blocked.pattern);
    }

    let text = '';
    let provider = 'scrolitha';
    let model = 'scrolitha-core';
    let usedFallback = false;
    let warning: string | undefined;
    let warningCode: string | undefined;
    let runtimeStatus: 'ok' | 'fallback' = 'ok';

    try {
      const response = await generateScrolithaText({
        scope: input.scope,
        routeKey,
        systemPrompt:
          String(input.system || '').trim() ||
          'You are Scrolitha, a precise and professional assistant for marketplace growth tasks.',
        userPrompt: prompt,
        maxTokens: input.maxTokens,
        temperature: input.temperature
      });
      text = String(response.text || '').trim();
      model = String(response.model || 'scrolitha-core').trim() || 'scrolitha-core';
      usedFallback = Boolean(response.usedBackupProcessing);
      warning = response.warning || undefined;
      warningCode = response.warningCode || undefined;
      runtimeStatus = usedFallback ? 'fallback' : 'ok';
    } catch (error: any) {
      usedFallback = true;
      warning = SCROLITHA_BACKUP_WARNING_MESSAGE;
      warningCode = SCROLITHA_BACKUP_WARNING_CODE;
       runtimeStatus = 'fallback';
      console.warn('[scrolitha] provider path failed, using backup processing', {
        scope: input.scope,
        error: String(error?.message || 'unknown error').slice(0, 220)
      });
    }

    if (!text) {
      usedFallback = true;
      warning = warning || SCROLITHA_BACKUP_WARNING_MESSAGE;
      warningCode = warningCode || SCROLITHA_BACKUP_WARNING_CODE;
      runtimeStatus = 'fallback';
      text = `Draft suggestion:\n${prompt}\n\nRefine this copy for clarity, outcomes, and professional tone before publishing.`;
    }

    const latencyMs = Date.now() - startedAt;
    await prisma.aICopilotLog.create({
      data: {
        userId: input.actor.id || null,
        scope: input.scope,
        promptHash,
        inputSummary: prompt.slice(0, 500),
        outputSummary: text.slice(0, 1200),
        riskLevel: 'low',
        metadata: {
          provider,
          model,
          routeKey,
          blocked: false,
          latencyMs,
          usedFallback,
          warningCode: warningCode || null,
          runtimeStatus
        }
      }
    });

    await writeScrolithaAuditLog({
      actor: input.actor,
      eventType: 'SCROLITHA_GENERATE',
      intent: routeKey,
      requestPayload: { scope: input.scope, promptHash, routeKey },
      redactedPayload: { scope: input.scope, promptHash, routeKey },
      resultStatus: 'ok',
      resultSummary: `Generated ${text.length} chars in ${latencyMs}ms`
    });

    if (usedFallback || latencyMs >= 15_000) {
      await writeScrolithaAuditLog({
        actor: input.actor,
        eventType: 'SCROLITHA_RUNTIME_ALERT',
        intent: routeKey,
        requestPayload: { scope: input.scope, promptHash, routeKey },
        redactedPayload: {
          scope: input.scope,
          promptHash,
          routeKey,
          usedFallback,
          latencyMs,
          warningCode: warningCode || null
        },
        resultStatus: usedFallback ? 'warning' : 'ok',
        resultSummary: usedFallback
          ? `Fallback used for ${routeKey}${warningCode ? ` (${warningCode})` : ''}`
          : `High latency detected for ${routeKey}: ${latencyMs}ms`
      });
    }

    return { text, provider, model, usedFallback, warning, warningCode };
  },

  async embed(text: string): Promise<number[]> {
    return lexicalEmbedding(text, 128);
  },

  async classifySafety(text: string): Promise<{ score: number; riskLevel: 'low' | 'medium' | 'high' }> {
    const score = keywordToxicityScore(text);
    const riskLevel = score >= 75 ? 'high' : score >= 45 ? 'medium' : 'low';
    return { score, riskLevel };
  }
};
