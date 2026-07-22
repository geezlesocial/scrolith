/**
 * Phase 33.0 — Deterministic MOCK provider (no network). Default when calls disabled.
 */
import type {
  AIEmbeddingRequest,
  AIEmbeddingResponse,
  AIModerationRequest,
  AIModerationResponse,
  AIProvider,
  AIProviderHealth,
  AIStructuredRequest,
  AIStructuredResponse,
  AITextRequest,
  AITextResponse
} from '../types';

function mockSummary(text: string): string {
  const clean = String(text || '').replace(/<<<UNTRUSTED_USER_CONTENT>>>|<<<END_UNTRUSTED_USER_CONTENT>>>/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= 40) return `[Mock summary] ${clean.slice(0, 400)}`;
  return `[Mock summary] ${words.slice(0, 40).join(' ')}…`;
}

export class MockAIProvider implements AIProvider {
  readonly id = 'MOCK' as const;

  async generateText(request: AITextRequest): Promise<AITextResponse> {
    const started = Date.now();
    const user = [...request.messages].reverse().find((m) => m.role === 'user')?.content || '';
    const system = request.messages.find((m) => m.role === 'system')?.content || '';
    let text: string;
    if (/rewrite/i.test(system) || /rewrite/i.test(user)) {
      text = `[Mock rewrite] ${user.replace(/^[\s\S]*?:\n\n/, '').slice(0, 800)}`;
    } else if (/classif/i.test(system)) {
      text = 'label=general confidence=0.7';
    } else if (/priority/i.test(system)) {
      text = JSON.stringify({
        suggestions: [{ priority: 'NORMAL', reason: 'Mock prioritization' }]
      });
    } else if (/JSON/i.test(system) || /structured/i.test(system)) {
      text = JSON.stringify({ summary: mockSummary(user), keyItems: [], generatedAt: new Date().toISOString() });
    } else {
      text = mockSummary(user);
    }
    return {
      text,
      provider: 'MOCK',
      model: request.model || 'mock-foundation',
      usage: {
        promptTokens: Math.ceil(user.length / 4),
        completionTokens: Math.ceil(text.length / 4),
        totalTokens: Math.ceil((user.length + text.length) / 4)
      },
      latencyMs: Date.now() - started,
      finishReason: 'stop'
    };
  }

  async generateStructured<T>(request: AIStructuredRequest<T>): Promise<AIStructuredResponse<T>> {
    const raw = await this.generateText(request);
    let attempts = 1;
    try {
      const data = request.parse(raw.text);
      if (!request.validate(data)) throw new Error('validation failed');
      return {
        data,
        rawText: raw.text,
        provider: 'MOCK',
        model: raw.model,
        usage: raw.usage,
        latencyMs: raw.latencyMs,
        parseAttempts: attempts
      };
    } catch {
      attempts = 2;
      const fallback = request.parse('{}') as T;
      return {
        data: fallback,
        rawText: raw.text,
        provider: 'MOCK',
        model: raw.model,
        usage: raw.usage,
        latencyMs: raw.latencyMs,
        parseAttempts: attempts
      };
    }
  }

  async embed(request: AIEmbeddingRequest): Promise<AIEmbeddingResponse> {
    const started = Date.now();
    const inputs = Array.isArray(request.input) ? request.input : [request.input];
    const vectors = inputs.map((t) => {
      const v = new Array(8).fill(0).map((_, i) => ((t.charCodeAt(i % Math.max(1, t.length)) || 0) % 100) / 100);
      return v;
    });
    return { vectors, provider: 'MOCK', model: request.model || 'mock-embed', latencyMs: Date.now() - started };
  }

  async moderate(request: AIModerationRequest): Promise<AIModerationResponse> {
    const started = Date.now();
    const unsafe = /\b(bomb|csam)\b/i.test(request.text);
    return {
      allowed: !unsafe,
      categories: unsafe ? ['violence'] : [],
      provider: 'MOCK',
      model: 'mock-mod',
      latencyMs: Date.now() - started
    };
  }

  async healthCheck(): Promise<AIProviderHealth> {
    return {
      provider: 'MOCK',
      status: 'operational',
      latencyMs: 0,
      checkedAt: new Date().toISOString(),
      message: 'Deterministic mock provider'
    };
  }
}

export const mockProvider = new MockAIProvider();
export default mockProvider;
