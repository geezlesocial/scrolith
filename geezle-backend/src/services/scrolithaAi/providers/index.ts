/**
 * Phase 33.0 — Provider registry. Feature code must use ScrolithaAI.execute only.
 */
import type { AIProvider, AIProviderId } from '../types';
import { mockProvider } from './mockProvider';
import { ollamaProvider } from './ollamaProvider';
import { geminiProvider } from './geminiProvider';
import { openaiProvider } from './openaiProvider';

const registry: Record<Exclude<AIProviderId, 'DISABLED'>, AIProvider> = {
  MOCK: mockProvider,
  OLLAMA: ollamaProvider,
  GEMINI: geminiProvider,
  OPENAI: openaiProvider
};

export function getProvider(id: AIProviderId): AIProvider | null {
  if (id === 'DISABLED') return null;
  return registry[id] || null;
}

export async function healthAllProviders() {
  const results = await Promise.all(
    (Object.keys(registry) as Array<Exclude<AIProviderId, 'DISABLED'>>).map(async (id) => {
      try {
        return await registry[id].healthCheck();
      } catch (err: any) {
        return {
          provider: id,
          status: 'unavailable' as const,
          latencyMs: null,
          checkedAt: new Date().toISOString(),
          message: String(err?.message || 'error')
        };
      }
    })
  );
  return results;
}

export { mockProvider, ollamaProvider, geminiProvider, openaiProvider };
export default getProvider;
