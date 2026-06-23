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
import { incrementMinuteCounter, scrolithaCache } from '../../../services/scrolitha/scrolitha.cache';
import { writeScrolithaAuditLog } from '../../../services/scrolitha/scrolitha.audit';
import realtime from '../../../utils/realtime';
import { notifyAdmins } from '../../../utils/notify';
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

const SCROLITHA_RUNTIME_ALERT_COOLDOWN_MS = 10 * 60_000;
const SCROLITHA_RUNTIME_ALERT_PREFIX = 'scrolitha:runtime-alert:';

export const createSystemScrolithaActor = (
  scope: ScrolithaScope,
  routeKey: string,
  role = 'system'
): ScrolithaActor => ({
  id: `scrolitha-system:${scope}:${String(routeKey || 'task').trim() || 'task'}`,
  role,
  scope,
  isAdmin: scope === 'admin',
  ipAddress: null,
  userAgent: 'scrolitha-system'
});

const maybeNotifyScrolithaRuntimeAlert = (input: {
  type: 'fallback' | 'latency' | 'prompt_block';
  routeKey: string;
  scope: ScrolithaScope;
  count: number;
  threshold: number;
  message: string;
  severity: 'info' | 'warning';
  warningCode?: string | null;
  latencyMs?: number | null;
}) => {
  if (input.count < input.threshold) return;
  const cacheKey = `${SCROLITHA_RUNTIME_ALERT_PREFIX}${input.type}:${input.scope}:${input.routeKey}`;
  if (scrolithaCache.get(cacheKey)) return;
  scrolithaCache.set(cacheKey, true, SCROLITHA_RUNTIME_ALERT_COOLDOWN_MS);

  const payload = {
    type: 'scrolitha.runtime.alert',
    title: 'Scrolitha runtime alert',
    body: input.message,
    link: '/admin/dashboard?tab=scrolitha',
    meta: {
      alertType: input.type,
      severity: input.severity,
      routeKey: input.routeKey,
      scope: input.scope,
      count: input.count,
      threshold: input.threshold,
      warningCode: input.warningCode || null,
      latencyMs: input.latencyMs || null
    }
  };

  try {
    realtime.emitToRoom('community:admin', 'scrolitha:runtime_alert', {
      ...payload.meta,
      title: payload.title,
      body: payload.body,
      createdAt: new Date().toISOString()
    });
  } catch {}

  notifyAdmins(payload);
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
      const blockCount = incrementMinuteCounter(`scrolitha:runtime:block:${input.scope}:${routeKey}`, 15 * 60_000);
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
      maybeNotifyScrolithaRuntimeAlert({
        type: 'prompt_block',
        routeKey,
        scope: input.scope,
        count: blockCount,
        threshold: 3,
        severity: 'warning',
        message: `Scrolitha blocked ${blockCount} prompt-policy requests on ${routeKey} (${input.scope}) in the last 15 minutes.`
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
      if (usedFallback) {
        const fallbackCount = incrementMinuteCounter(`scrolitha:runtime:fallback:${input.scope}:${routeKey}`, 10 * 60_000);
        maybeNotifyScrolithaRuntimeAlert({
          type: 'fallback',
          routeKey,
          scope: input.scope,
          count: fallbackCount,
          threshold: 2,
          severity: 'warning',
          warningCode: warningCode || null,
          latencyMs,
          message: `Scrolitha fallback triggered ${fallbackCount} times on ${routeKey} (${input.scope}) in the last 10 minutes.`
        });
      }
      if (latencyMs >= 15_000) {
        const slowCount = incrementMinuteCounter(`scrolitha:runtime:latency:${input.scope}:${routeKey}`, 10 * 60_000);
        maybeNotifyScrolithaRuntimeAlert({
          type: 'latency',
          routeKey,
          scope: input.scope,
          count: slowCount,
          threshold: latencyMs >= 30_000 ? 1 : 3,
          severity: latencyMs >= 30_000 ? 'warning' : 'info',
          warningCode: warningCode || null,
          latencyMs,
          message: `Scrolitha latency reached ${latencyMs}ms on ${routeKey} (${input.scope}); ${slowCount} slow requests in the last 10 minutes.`
        });
      }
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
