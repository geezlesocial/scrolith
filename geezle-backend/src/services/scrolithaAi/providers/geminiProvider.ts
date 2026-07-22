/**
 * Phase 33.0 — Gemini adapter (optional external).
 * Credentials from env/Secret Manager only — never returned to clients.
 * Only invoked when enableProviderCalls + external consent + routing allow.
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
  return String(process.env.GOOGLE_GEMINI_KEY || process.env.GEMINI_API_KEY || '').trim();
}

export class GeminiAIProvider implements AIProvider {
  readonly id = 'GEMINI' as const;

  async generateText(request: AITextRequest): Promise<AITextResponse> {
    const started = Date.now();
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
    }
    // Dynamic import keeps cold path light when unused
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = request.model || process.env.SCROLITHA_GEMINI_MODEL || 'gemini-pro';
    const model = genAI.getGenerativeModel({ model: modelName });
    const system = request.messages.find((m) => m.role === 'system')?.content || '';
    const user = request.messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('\n\n');
    const prompt = system ? `${system}\n\n${user}` : user;
    const timeoutMs = request.timeoutMs || 30_000;
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('GEMINI_TIMEOUT')), timeoutMs))
    ]);
    const text = String((result as any)?.response?.text?.() || '');
    return {
      text,
      provider: 'GEMINI',
      model: modelName,
      usage: undefined,
      latencyMs: Date.now() - started,
      finishReason: 'stop'
    };
  }

  async generateStructured<T>(request: AIStructuredRequest<T>): Promise<AIStructuredResponse<T>> {
    const maxAttempts = 2;
    let lastRaw = '';
    let latency = 0;
    let model = request.model || 'gemini-pro';
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
          provider: 'GEMINI',
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
      provider: 'GEMINI',
      model,
      latencyMs: latency,
      parseAttempts: maxAttempts
    };
  }

  async healthCheck(): Promise<AIProviderHealth> {
    const hasKey = Boolean(getApiKey());
    return {
      provider: 'GEMINI',
      status: hasKey ? 'operational' : 'disabled',
      latencyMs: 0,
      checkedAt: new Date().toISOString(),
      message: hasKey ? 'API key configured' : 'No Gemini API key'
    };
  }
}

export const geminiProvider = new GeminiAIProvider();
export default geminiProvider;
