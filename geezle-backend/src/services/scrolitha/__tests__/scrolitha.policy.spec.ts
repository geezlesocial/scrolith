jest.mock('../../../utils/prismaClient', () => ({
  __esModule: true,
  default: {}
}));

jest.mock('../scrolitha.knowledge', () => ({
  getScrolithaKnowledgeBundle: jest.fn(() => ({ topics: [] }))
}));

import { sanitizeScrolithaMetadata } from '../scrolitha.policy';

describe('sanitizeScrolithaMetadata', () => {
  test('normalizes branded local runtime settings and clamps unsafe numeric values', () => {
    const metadata = sanitizeScrolithaMetadata('admin', {
      llm: {
        provider: 'scrolitha',
        host: 'localhost:11434/',
        model: 'qwen3:14b',
        sidecarMode: true,
        maxTokens: 999999,
        temperature: 9,
        topP: 0,
        timeoutMs: 999999,
        allowGeminiFallback: false
      }
    });

    // Production clamp ceiling is 240_000ms; unsafe input 999999 must clamp there.
    expect(metadata.llm).toEqual(
      expect.objectContaining({
        provider: 'core',
        host: 'http://localhost:11434',
        coreEndpoint: 'http://localhost:11434',
        ollamaHost: 'http://localhost:11434',
        model: 'qwen3:14b',
        coreModel: 'qwen3:14b',
        ollamaModel: 'qwen3:14b',
        sidecarMode: true,
        coreSidecarMode: true,
        enabled: true,
        enableStreaming: false,
        maxTokens: 8192,
        temperature: 1.5,
        topP: 0.05,
        timeoutMs: 240000,
        allowGeminiFallback: false
      })
    );
  });

  test('rejects local runtime mode for non-local endpoints', () => {
    expect(() =>
      sanitizeScrolithaMetadata('admin', {
        llm: {
          provider: 'core',
          host: 'https://ai.example.com',
          model: 'qwen3:14b',
          sidecarMode: true
        }
      })
    ).toThrow('Local Scrolitha runtime mode only supports localhost endpoints.');
  });

  test('rejects insecure public remote endpoints', () => {
    expect(() =>
      sanitizeScrolithaMetadata('admin', {
        llm: {
          provider: 'core',
          host: 'http://ai.example.com',
          model: 'qwen3:14b',
          sidecarMode: false
        }
      })
    ).toThrow('Remote Scrolitha Core endpoints must use HTTPS unless they are local or private network addresses.');
  });
});
