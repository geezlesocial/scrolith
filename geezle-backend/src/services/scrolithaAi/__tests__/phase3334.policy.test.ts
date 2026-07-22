import { routeModel } from '../router';
import { isProviderEnabled } from '../config';

describe('Phase 33.4 production provider policy', () => {
  it('routes user-facing generation to Ollama with no fallback chain', () => {
    const route = routeModel({
      capability: 'COPILOT_CONTEXT',
      privacyLevel: 'PERSONAL',
      externalConsent: true,
      requireOllama: true
    });

    expect(route.provider).toBe('OLLAMA');
    expect(route.model).toBe('qwen3:14b');
    expect(route.fallbackChain).toEqual([]);
  });

  it('rejects native, external, and mock providers in production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const config = {
      NATIVE: { enabled: true },
      OLLAMA: { enabled: true },
      GEMINI: { enabled: true },
      OPENAI: { enabled: true },
      MOCK: { enabled: true },
      emergencyShutdown: false
    } as any;

    expect(isProviderEnabled('OLLAMA', config)).toBe(true);
    expect(isProviderEnabled('NATIVE', config)).toBe(false);
    expect(isProviderEnabled('GEMINI', config)).toBe(false);
    expect(isProviderEnabled('OPENAI', config)).toBe(false);
    expect(isProviderEnabled('MOCK', config)).toBe(false);

    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  });
});
