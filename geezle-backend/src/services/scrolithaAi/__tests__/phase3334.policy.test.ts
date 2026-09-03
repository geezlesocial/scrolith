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
    expect(route.model).toBe('llama3.2:3b');
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

  it('enforces the local Scrolitha runtime policy without mock fallback', () => {
    const previous = process.env.SCROLITHA_AI_LOCAL_ONLY;
    process.env.SCROLITHA_AI_LOCAL_ONLY = 'true';
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
    expect(routeModel({
      capability: 'TEXT_REWRITING',
      privacyLevel: 'PERSONAL',
      externalConsent: true,
      requireOllama: true
    })).toMatchObject({ provider: 'OLLAMA', model: 'llama3.2:3b', fallbackChain: [] });

    if (previous === undefined) delete process.env.SCROLITHA_AI_LOCAL_ONLY;
    else process.env.SCROLITHA_AI_LOCAL_ONLY = previous;
  });
});
