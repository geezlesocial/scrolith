import { createHash } from 'crypto';
import { ollamaChat, resolveScrolithaLlmRuntime } from '../../../services/scrolitha/scrolitha.ollama';
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
  async generate(input: GenerateInput): Promise<{ text: string; provider: string; model: string }> {
    const runtime = await resolveScrolithaLlmRuntime(input.scope);
    const prompt = String(input.prompt || '').trim();
    if (!prompt) throw new Error('Prompt is required.');

    let text = '';
    let provider = runtime.provider;
    let model = runtime.model || 'heuristic';

    if (runtime.enabled && runtime.provider === 'ollama' && runtime.runtimeConfigured && runtime.host && runtime.model) {
      try {
        const response = await ollamaChat({
          host: runtime.host,
          model: runtime.model,
          messages: [
            {
              role: 'system',
              content:
                String(input.system || '').trim() ||
                'You are Scrolitha, a precise and professional assistant for marketplace growth tasks.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          maxTokens: input.maxTokens || runtime.maxTokens,
          temperature: input.temperature ?? runtime.temperature,
          topP: runtime.topP,
          timeoutMs: runtime.timeoutMs
        });
        text = String(response.text || '').trim();
      } catch (error) {
        console.warn('[scrolitha] generate fallback used:', error);
      }
    }

    if (!text) {
      provider = runtime.enabled ? 'core' : 'disabled';
      model = runtime.enabled ? 'scrolitha-core' : 'heuristic-fallback';
      text = `Draft suggestion:\n${prompt}\n\nRefine this copy for clarity, outcomes, and professional tone before publishing.`;
    }

    const promptHash = hashPrompt(prompt);
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
          model
        }
      }
    });

    await writeScrolithaAuditLog({
      actor: input.actor,
      eventType: 'SCROLITHA_GENERATE',
      requestPayload: { scope: input.scope, promptHash },
      redactedPayload: { scope: input.scope, promptHash },
      resultStatus: 'ok',
      resultSummary: `Generated ${text.length} chars`
    });

    return { text, provider, model };
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
