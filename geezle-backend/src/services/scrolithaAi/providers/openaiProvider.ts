/**
 * Phase 33.0 — OpenAI adapter (optional external).
 * Credentials from env only. Never returned to clients.
 */
import type {
  AIProvider,
  AIProviderHealth,
  AIStructuredRequest,
  AIStructuredResponse,
  AITextRequest,
  AITextResponse
} from '../types';

function getApiKey(): string {
  return String(process.env.OPENAI_API_KEY || '').trim();
}

export class OpenAIProvider implements AIProvider {
  readonly id = 'OPENAI' as const;

  async generateText(request: AITextRequest): Promise<AITextResponse> {
    const started = Date.now();
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('OPENAI_API_KEY_NOT_CONFIGURED');
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey });
    const model = request.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const timeoutMs = request.timeoutMs || 30_000;
    const completion = await Promise.race([
      client.chat.completions.create({
        model,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: request.maxTokens || 1024,
        temperature: request.temperature ?? 0.3
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('OPENAI_TIMEOUT')), timeoutMs))
    ]);
    const text = String((completion as any)?.choices?.[0]?.message?.content || '');
    const usage = (completion as any)?.usage;
    return {
      text,
      provider: 'OPENAI',
      model,
      usage: usage
        ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens
          }
        : undefined,
      latencyMs: Date.now() - started,
      finishReason: String((completion as any)?.choices?.[0]?.finish_reason || 'stop')
    };
  }

  async generateStructured<T>(request: AIStructuredRequest<T>): Promise<AIStructuredResponse<T>> {
    const maxAttempts = 2;
    let lastRaw = '';
    let latency = 0;
    let model = request.model || 'gpt-4o-mini';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const raw = await this.generateText(request);
      lastRaw = raw.text;
      latency = raw.latencyMs;
      model = raw.model;
      try {
        const data = request.parse(raw.text);
        if (!request.validate(data)) throw new Error('invalid');
        return {
          data,
          rawText: raw.text,
          provider: 'OPENAI',
          model: raw.model,
          usage: raw.usage,
          latencyMs: latency,
          parseAttempts: attempt
        };
      } catch {
        /* retry */
      }
    }
    return {
      data: request.parse('{}') as T,
      rawText: lastRaw,
      provider: 'OPENAI',
      model,
      latencyMs: latency,
      parseAttempts: maxAttempts
    };
  }

  async healthCheck(): Promise<AIProviderHealth> {
    const hasKey = Boolean(getApiKey());
    return {
      provider: 'OPENAI',
      status: hasKey ? 'operational' : 'disabled',
      latencyMs: 0,
      checkedAt: new Date().toISOString(),
      message: hasKey ? 'API key configured' : 'No OpenAI API key'
    };
  }
}

export const openaiProvider = new OpenAIProvider();
export default openaiProvider;
