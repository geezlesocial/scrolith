const mockGenerate = jest.fn();

jest.mock('../../utils/prismaClient', () => ({
  __esModule: true,
  default: {}
}));

jest.mock('../../utils/realtime', () => ({
  __esModule: true,
  default: {
    emitToUser: jest.fn()
  }
}));

jest.mock('../scrolitha/scrolitha.audit', () => ({
  writeScrolithaAuditLog: jest.fn()
}));

jest.mock('../scrolitha/scrolitha.cache', () => ({
  incrementMinuteCounter: jest.fn(() => 1)
}));

jest.mock('../scrolitha/scrolitha.ollama', () => ({
  SCROLITHA_BACKUP_WARNING_CODE: 'SCROLITHA_BACKUP',
  SCROLITHA_BACKUP_WARNING_MESSAGE: 'Scrolitha used backup processing for this suggestion. Please review before applying.'
}));

jest.mock('../scrolitha/scrolitha.policy', () => ({
  ensureScrolithaConfig: jest.fn(),
  isScrolithaPromptPolicyError: jest.fn(() => false)
}));

jest.mock('../../modules/scrolitha/inference/scrolitha.service', () => ({
  ScrolithaService: {
    generate: (...args: any[]) => mockGenerate(...args)
  },
  createSystemScrolithaActor: jest.fn(() => ({
    id: 'system-user',
    role: 'user',
    scope: 'user',
    isAdmin: false,
    ipAddress: null,
    userAgent: null
  }))
}));

import { enhancePostDraftWithAi } from '../postAi.service';

describe('enhancePostDraftWithAi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('repairs truncated grammar output from the model into a clean response', async () => {
    mockGenerate.mockResolvedValue({
      text: 'hell, than yo for th respn',
      model: 'qwen3:14b',
      usedFallback: false
    });

    const result = await enhancePostDraftWithAi({
      text: 'hell, than yo for th respn',
      mode: 'grammar',
      scope: 'user'
    });

    expect(result.enhancedText).toBe('Hello, thank you for the response.');
    expect(result.fallbackUsed).toBe(false);
    expect(result.model).toBe('qwen3:14b');
  });

  it('accepts the final sanitized model response instead of dropping to heuristic fallback', async () => {
    mockGenerate
      .mockResolvedValueOnce({
        text: 'Can you please provide more context for this rewrite?',
        model: 'qwen3:14b',
        usedFallback: false
      })
      .mockResolvedValueOnce({
        text: 'I appreciate your feedback. Hello, thank you for the response.',
        model: 'qwen3:14b',
        usedFallback: false
      });

    const result = await enhancePostDraftWithAi({
      text: 'hell, than yo for th respn',
      mode: 'grammar',
      scope: 'user'
    });

    expect(result.enhancedText).toBe('I appreciate your feedback. Hello, thank you for the response.');
    expect(result.fallbackUsed).toBe(false);
    expect(result.warning).toBeUndefined();
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });
});
