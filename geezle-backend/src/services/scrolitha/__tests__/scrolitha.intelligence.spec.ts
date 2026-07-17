import { detectIntelligenceIntent } from '../scrolitha.multiSourceContext';
import { analyzeModerationAssist } from '../scrolitha.moderationAssist';
import {
  appendSessionTurn,
  buildSessionKey,
  clearSessionMemory,
  dismissSessionSuggestion,
  ensureSessionMemory,
  formatSessionMemoryForPrompt,
  isSuggestionDismissedInSession
} from '../scrolitha.sessionMemory';
import { estimateTokenCount } from '../scrolitha.observability';

describe('scrolitha intelligence platform helpers', () => {
  test('detects cross-feature intents', () => {
    expect(detectIntelligenceIntent('explain this job posting').intent).toBe('explain_job');
    expect(detectIntelligenceIntent('summarize the company page').intent).toBe('summarize_company');
    expect(detectIntelligenceIntent('recommend related jobs').intent).toBe('recommend');
    expect(detectIntelligenceIntent('help me write a reply').intent).toBe('writing_help');
    expect(detectIntelligenceIntent('is this claim true?').intent).toBe('verify_claim');
    expect(detectIntelligenceIntent('flag possible misinformation').intent).toBe('moderation_assist');
  });

  test('moderation assist never auto-removes content', () => {
    const result = analyzeModerationAssist({
      postContent: 'This cure is 100% true and guaranteed by scientists.',
      commentContent: 'Buy now click here http://a http://b http://c',
      threadSnippets: ['same line', 'same line'],
      communityRules: 'No promo spam allowed'
    });
    expect(result.autoActionTaken).toBe(false);
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.disclosure.toLowerCase()).toContain('never');
  });

  test('session memory is scoped, dismissable, and formattable', () => {
    const userId = 'user-test-1';
    const sessionKey = buildSessionKey({ userId, sessionId: 's1', surface: 'post', entityId: 'p1' });
    clearSessionMemory(sessionKey);
    ensureSessionMemory({ userId, sessionKey });
    appendSessionTurn({
      userId,
      sessionKey,
      turn: { role: 'user', text: 'Summarize this post', surface: 'post', entityId: 'p1' }
    });
    appendSessionTurn({
      userId,
      sessionKey,
      turn: {
        role: 'assistant',
        text: 'Here is a short summary.',
        classification: 'informational',
        sources: ['Public post']
      }
    });
    const prompt = formatSessionMemoryForPrompt(sessionKey, 4);
    expect(prompt).toContain('User:');
    expect(prompt).toContain('Scrolitha:');

    dismissSessionSuggestion({ userId, sessionKey, suggestionKey: 'verify' });
    expect(isSuggestionDismissedInSession(sessionKey, 'verify')).toBe(true);
    clearSessionMemory(sessionKey);
  });

  test('token estimate is non-negative', () => {
    expect(estimateTokenCount('')).toBe(0);
    expect(estimateTokenCount('abcd'.repeat(10))).toBeGreaterThan(0);
  });
});
