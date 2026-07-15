import { buildActionCards, resolveActionCardPrompt } from '../scrolitha.actionCards';
import { detectSearchIntent } from '../scrolitha.deepSearch';
import { collectCollaborationHints, listModuleCapabilities } from '../scrolitha.collaboration';
import { resolveAdaptiveSurfaceMode, chunkAnswerForIncrementalRender } from '../scrolitha.os';
import { createRequestHandle, cancelRequest } from '../scrolitha.performance';

describe('scrolitha intelligence OS helpers', () => {
  test('builds prioritized action cards', () => {
    const cards = buildActionCards({
      hasPost: true,
      hasCompany: true,
      hasJob: true,
      claimy: true,
      longText: true,
      role: 'freelancer'
    });
    expect(cards.length).toBeGreaterThan(3);
    expect(cards.some((c) => c.kind === 'verify')).toBe(true);
    expect(cards.some((c) => c.kind === 'summarize')).toBe(true);
    expect(cards[0].priority).toBeGreaterThanOrEqual(cards[cards.length - 1].priority);
    const prompt = resolveActionCardPrompt(cards[0], 'focus on founder claim');
    expect(prompt).toContain('founder');
  });

  test('detects deep search intents', () => {
    expect(detectSearchIntent('find jobs for react developers')).toBe('jobs');
    expect(detectSearchIntent('search companies in fintech')).toBe('companies');
    expect(detectSearchIntent('find freelancers who know design')).toBe('people');
    expect(detectSearchIntent('related communities about AI')).toBe('communities');
    expect(detectSearchIntent('something random')).toBe('mixed');
  });

  test('module collaboration is loosely coupled', () => {
    expect(listModuleCapabilities().length).toBeGreaterThanOrEqual(6);
    const hints = collectCollaborationHints({
      question: 'help me recruit for this job',
      surface: 'job',
      role: 'employer'
    });
    expect(hints.modules).toContain('recruitment');
    expect(hints.hints.length).toBeGreaterThan(0);
  });

  test('adaptive surface modes', () => {
    expect(resolveAdaptiveSurfaceMode({ viewport: 'mobile', surface: 'post' })).toBe('bottom_sheet');
    expect(resolveAdaptiveSurfaceMode({ viewport: 'desktop', surface: 'messaging' })).toBe('side_panel');
    expect(resolveAdaptiveSurfaceMode({ viewport: 'desktop', surface: 'feed' })).toBe('context_card');
    expect(resolveAdaptiveSurfaceMode({ viewport: 'desktop', hasSelection: true })).toBe('inline');
  });

  test('incremental answer chunking', () => {
    const chunks = chunkAnswerForIncrementalRender('Paragraph one.\n\nParagraph two is longer and useful.');
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  test('request cancellation handle', () => {
    const handle = createRequestHandle(['u1', 'test']);
    expect(handle.isStale()).toBe(false);
    expect(cancelRequest(handle.requestId)).toBe(true);
    // second cancel is false
    expect(cancelRequest(handle.requestId)).toBe(false);
  });
});
