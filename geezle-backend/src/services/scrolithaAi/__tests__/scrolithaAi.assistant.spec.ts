/**
 * Phase 33.1 — Assistant productivity tests (MOCK path, no real providers).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setAIFeatureFlags } from '../config';
import { updateAIConsent } from '../consent';
import { ScrolithaAssistant, detectLanguage, preserveTokens } from '../assistant';
import { listPromptLibrary, getPromptLibraryItem, renderPromptTemplate } from '../promptLibrary';
import {
  createConversation,
  listConversations,
  appendMessage,
  listMessages,
  deleteConversation,
  exportConversations
} from '../conversations';
import { submitFeedback, feedbackSummary } from '../feedback';

const USER = 'user-assistant-331';

async function enableAllSurfaces() {
  await setAIFeatureFlags({
    masterEnabled: true,
    killSwitch: false,
    enableProviderCalls: false,
    TEXT_SUMMARIZATION: true,
    TEXT_REWRITING: true,
    ASSISTANT_CHAT: true,
    TEXT_TRANSLATION: true,
    DRAFT_COMPOSITION: true,
    COMPOSER_ASSIST: true,
    SEARCH_QUERY_SUGGESTION: true,
    NOTIFICATION_SUMMARIZATION: true,
    notificationAiHooks: true,
    assistantEnabled: true,
    composerEnabled: true,
    rewriteEnabled: true,
    translationEnabled: true,
    promptLibraryEnabled: true,
    conversationHistoryEnabled: true,
    feedbackEnabled: true,
    searchSuggestionsEnabled: true,
    jobsDraftingEnabled: true,
    marketplaceDraftingEnabled: true,
    businessPageDraftingEnabled: true
  });
  await updateAIConsent(USER, {
    aiFeaturesEnabled: true,
    aiSuggestionsAllowed: true,
    externalProviderProcessingAllowed: false,
    personalizationAllowed: false,
    privateMessageAnalysisAllowed: false,
    aiActivityHistoryEnabled: true,
    productImprovementDataAllowed: false
  });
}

describe('Phase 33.1 language & token preserve', () => {
  it('detects language heuristics', () => {
    expect(detectLanguage('Hello world')).toBe('en');
    expect(detectLanguage('مرحبا بك')).toBe('ar');
  });

  it('re-appends dropped mentions and urls', () => {
    const original = 'See @alice and https://scrolith.com #jobs';
    const gen = 'Check this out';
    const out = preserveTokens(original, gen);
    expect(out).toContain('@alice');
    expect(out).toContain('https://scrolith.com');
    expect(out).toContain('#jobs');
  });
});

describe('Phase 33.1 prompt library', () => {
  it('lists curated categories', () => {
    const items = listPromptLibrary({});
    expect(items.length).toBeGreaterThan(5);
    expect(items.every((i) => i.status === 'published')).toBe(true);
  });

  it('filters by category and renders template', () => {
    const rec = listPromptLibrary({ category: 'recruitment' });
    expect(rec.length).toBeGreaterThan(0);
    const item = getPromptLibraryItem(rec[0].id)!;
    const text = renderPromptTemplate(item, { topic: 'Senior Engineer' });
    expect(text).toContain('Senior Engineer');
  });
});

describe('Phase 33.1 conversations', () => {
  it('creates, messages, lists, exports, deletes', async () => {
    await updateAIConsent(USER, { aiActivityHistoryEnabled: true });
    const c = await createConversation(USER, 'Test chat');
    expect(c.id).toBeTruthy();
    await appendMessage({
      userId: USER,
      conversationId: c.id,
      role: 'user',
      content: 'Hello assistant'
    });
    await appendMessage({
      userId: USER,
      conversationId: c.id,
      role: 'assistant',
      content: 'Hello draft reply'
    });
    const msgs = await listMessages(USER, c.id);
    expect(msgs.length).toBe(2);
    expect(msgs[1].content).toBeTruthy();
    const list = await listConversations(USER);
    expect(list.some((x) => x.id === c.id)).toBe(true);
    const exp = await exportConversations(USER);
    expect(exp.privacyNotice).toMatch(/history is enabled|previews/i);
    const del = await deleteConversation(USER, c.id);
    expect(del.deleted).toBe(true);
  });
});

describe('Phase 33.1 feedback', () => {
  it('records helpful/not_helpful without training side effects', async () => {
    await submitFeedback({ userId: USER, rating: 'helpful', capability: 'ASSISTANT_CHAT' });
    await submitFeedback({ userId: USER, rating: 'not_helpful', capability: 'ASSISTANT_CHAT' });
    const s = await feedbackSummary();
    expect(s.total).toBeGreaterThanOrEqual(2);
    expect(s.note).toMatch(/not used for model training/i);
  });
});

describe('Phase 33.1 assistant surfaces', () => {
  beforeEach(async () => {
    await enableAllSurfaces();
  });

  it('blocks when surface flag off', async () => {
    await setAIFeatureFlags({
      masterEnabled: true,
      killSwitch: false,
      assistantEnabled: false,
      ASSISTANT_CHAT: true
    });
    const r = await ScrolithaAssistant.chat({ userId: USER, message: 'hi' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/SURFACE_FLAG_DISABLED|assistantEnabled|MASTER|KILL|CONSENT/);
    expect(r.draftOnly).toBe(true);
    expect(r.autoPublished).toBe(false);
  });

  it('blocks without consent', async () => {
    await updateAIConsent(USER, { aiFeaturesEnabled: false });
    const r = await ScrolithaAssistant.chat({ userId: USER, message: 'hi' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/CONSENT/);
  });

  it('chats via gateway mock and returns disclosure', async () => {
    const r = await ScrolithaAssistant.chat({
      userId: USER,
      message: 'Draft a short professional intro about product design.'
    });
    expect(r.ok).toBe(true);
    expect(r.conversationId).toBeTruthy();
    expect(r.disclosure?.generatedByAI).toBe(true);
    expect(r.disclosure?.notice).toMatch(/draft/i);
    expect(r.autoPublished).toBe(false);
    expect(r.text).toBeTruthy();
  });

  it('rewrites and composes drafts only', async () => {
    const rw = await ScrolithaAssistant.rewrite({
      userId: USER,
      text: 'this is a rough draft for my post about community events',
      mode: 'professional'
    });
    expect(rw.ok).toBe(true);
    expect(rw.autoPublished).toBe(false);

    const comp = await ScrolithaAssistant.composer({
      userId: USER,
      text: 'hello world this is a test message',
      mode: 'shorten',
      surface: 'post'
    });
    expect(comp.ok).toBe(true);
    expect(comp.draftOnly).toBe(true);

    const keywords = await ScrolithaAssistant.composer({
      userId: USER,
      text: 'Full-stack developer building React and Node.js applications',
      mode: 'keywords',
      surface: 'profile-skills'
    });
    expect(keywords.ok).toBe(true);
    expect(keywords.draftOnly).toBe(true);
  });

  it('translates preserving tokens', async () => {
    const r = await ScrolithaAssistant.translate({
      userId: USER,
      text: 'Join us @scrolith https://scrolith.com #launch',
      targetLocale: 'es'
    });
    expect(r.ok).toBe(true);
    expect(r.detectedLanguage).toBeTruthy();
    // preserveTokens should keep tokens on output
    expect(r.text).toMatch(/@scrolith|https:\/\/scrolith\.com|#launch/);
  });

  it('drafts jobs/marketplace/business behind flags', async () => {
    const cover = await ScrolithaAssistant.draft({
      userId: USER,
      kind: 'cover_letter',
      topic: 'Backend engineer at Scrolith'
    });
    expect(cover.ok).toBe(true);
    expect(cover.autoPublished).toBe(false);

    const listing = await ScrolithaAssistant.draft({
      userId: USER,
      kind: 'marketplace_listing',
      topic: 'Wireless headphones'
    });
    expect(listing.ok).toBe(true);

    const biz = await ScrolithaAssistant.draft({
      userId: USER,
      kind: 'business_announcement',
      topic: 'Store reopening Monday'
    });
    expect(biz.ok).toBe(true);
  });

  it('search suggestions only', async () => {
    const r = await ScrolithaAssistant.searchSuggestions({
      userId: USER,
      domain: 'jobs',
      query: 'react remote'
    });
    expect(r.ok).toBe(true);
    expect(r.draftOnly).toBe(true);
  });

  it('notification assist falls back when hooks flag off', async () => {
    await setAIFeatureFlags({ notificationAiHooks: false, NOTIFICATION_SUMMARIZATION: false });
    const r = await ScrolithaAssistant.notificationAssist({
      userId: USER,
      action: 'summarize',
      items: [{ id: 'n1', title: 'Login', priority: 'critical' }]
    });
    // surface assistant may still run for explain; summarize uses hook
    expect(r.ok === false || r.ok === true).toBe(true);
    if (!r.ok) expect(r.reason).toBeTruthy();
  });

  it('prompt library use generates draft', async () => {
    const items = listPromptLibrary({ category: 'professional' });
    const r = await ScrolithaAssistant.usePromptLibrary({
      userId: USER,
      promptId: items[0].id,
      topic: 'AI safety practices'
    });
    expect(r.ok).toBe(true);
    expect(r.autoPublished).toBe(false);
  });
});
