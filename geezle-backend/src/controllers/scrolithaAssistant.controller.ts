/**
 * Phase 33.1 — Assistant / composer / rewrite / translation / history / feedback APIs.
 */
import { Request, Response } from 'express';
import { ScrolithaAssistant } from '../services/scrolithaAi/assistant';
import {
  listConversations,
  createConversation,
  getConversation,
  updateConversation,
  deleteConversation,
  clearAllConversations,
  listMessages,
  exportConversations
} from '../services/scrolithaAi/conversations';
import {
  listPromptLibrary,
  promptLibraryCategories,
  getPromptLibraryItem
} from '../services/scrolithaAi/promptLibrary';
import { submitFeedback } from '../services/scrolithaAi/feedback';
import { loadAIFeatureFlags } from '../services/scrolithaAi/config';
import { getAIConsent } from '../services/scrolithaAi/consent';

const userIdOf = (req: Request) =>
  String((req as any).user?.id || (req as any).userId || '').trim() || null;

export async function assistantStatus(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const [flags, consent] = await Promise.all([loadAIFeatureFlags(), getAIConsent(userId)]);
    return res.json({
      success: true,
      data: {
        phase: '33.1',
        disclosure:
          'Scrolitha AI generates drafts and suggestions only. Outputs may be incorrect. Nothing is auto-published, sent, applied, or charged.',
        surfaces: {
          assistant: Boolean(flags.assistantEnabled && flags.ASSISTANT_CHAT),
          composer: Boolean(flags.composerEnabled && flags.COMPOSER_ASSIST),
          rewrite: Boolean(flags.rewriteEnabled && flags.TEXT_REWRITING),
          translation: Boolean(flags.translationEnabled && flags.TEXT_TRANSLATION),
          promptLibrary: Boolean(flags.promptLibraryEnabled),
          history: Boolean(flags.conversationHistoryEnabled),
          feedback: Boolean(flags.feedbackEnabled),
          search: Boolean(flags.searchSuggestionsEnabled),
          jobsDrafting: Boolean(flags.jobsDraftingEnabled),
          marketplaceDrafting: Boolean(flags.marketplaceDraftingEnabled),
          businessPageDrafting: Boolean(flags.businessPageDraftingEnabled)
        },
        consent: {
          aiFeaturesEnabled: consent.aiFeaturesEnabled,
          aiSuggestionsAllowed: consent.aiSuggestionsAllowed,
          externalProviderProcessingAllowed: consent.externalProviderProcessingAllowed,
          aiActivityHistoryEnabled: consent.aiActivityHistoryEnabled
        },
        settingsPath: '/settings/ai',
        draftOnly: true
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'status_failed' });
  }
}

export async function assistantChat(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const result = await ScrolithaAssistant.chat({
      userId,
      message: String(req.body?.message || req.body?.text || ''),
      conversationId: req.body?.conversationId || null,
      locale: req.body?.locale,
      privacyLevel: req.body?.privacyLevel,
      correlationId: String(req.headers['x-correlation-id'] || '') || undefined
    });
    const status = result.ok ? 200 : result.blocked ? 403 : 503;
    return res.status(status).json({ success: result.ok, data: result, error: result.reason });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'chat_failed' });
  }
}

export async function assistantRewrite(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const result = await ScrolithaAssistant.rewrite({
      userId,
      text: String(req.body?.text || ''),
      mode: (req.body?.mode || 'rewrite') as any,
      locale: req.body?.locale
    });
    const status = result.ok ? 200 : result.blocked ? 403 : 503;
    return res.status(status).json({ success: result.ok, data: result, error: result.reason });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'rewrite_failed' });
  }
}

export async function assistantComposer(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const result = await ScrolithaAssistant.composer({
      userId,
      text: String(req.body?.text || ''),
      mode: (req.body?.mode || 'improve') as any,
      surface: req.body?.surface,
      locale: req.body?.locale
    });
    const status = result.ok ? 200 : result.blocked ? 403 : 503;
    return res.status(status).json({ success: result.ok, data: result, error: result.reason });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'composer_failed' });
  }
}

export async function assistantTranslate(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const result = await ScrolithaAssistant.translate({
      userId,
      text: String(req.body?.text || ''),
      targetLocale: String(req.body?.targetLocale || req.body?.locale || 'en'),
      sourceLocale: req.body?.sourceLocale
    });
    const status = result.ok ? 200 : result.blocked ? 403 : 503;
    return res.status(status).json({ success: result.ok, data: result, error: result.reason });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'translate_failed' });
  }
}

export async function assistantDraft(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const result = await ScrolithaAssistant.draft({
      userId,
      kind: (req.body?.kind || 'post') as any,
      topic: String(req.body?.topic || req.body?.text || ''),
      extra: req.body?.extra,
      locale: req.body?.locale
    });
    const status = result.ok ? 200 : result.blocked ? 403 : 503;
    return res.status(status).json({ success: result.ok, data: result, error: result.reason });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'draft_failed' });
  }
}

export async function assistantSearchSuggest(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const result = await ScrolithaAssistant.searchSuggestions({
      userId,
      domain: (req.body?.domain || 'posts') as any,
      query: String(req.body?.query || req.body?.text || ''),
      locale: req.body?.locale
    });
    const status = result.ok ? 200 : result.blocked ? 403 : 503;
    return res.status(status).json({ success: result.ok, data: result, error: result.reason });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'search_failed' });
  }
}

export async function assistantNotificationAssist(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const result = await ScrolithaAssistant.notificationAssist({
      userId,
      action: (req.body?.action || 'summarize') as any,
      items: Array.isArray(req.body?.items) ? req.body.items : [],
      locale: req.body?.locale
    });
    const status = result.ok ? 200 : result.blocked ? 403 : 503;
    return res.status(status).json({ success: result.ok, data: result, error: result.reason });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'notif_assist_failed' });
  }
}

// Conversations
export async function listConvos(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const flags = await loadAIFeatureFlags();
    if (!flags.conversationHistoryEnabled) {
      return res.json({ success: true, data: [], message: 'Conversation history disabled by flag' });
    }
    const rows = await listConversations(userId, {
      q: String(req.query.q || ''),
      limit: Number(req.query.limit || 50)
    });
    return res.json({ success: true, data: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'list_failed' });
  }
}

export async function createConvo(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const row = await createConversation(userId, String(req.body?.title || 'New chat'));
    return res.status(201).json({ success: true, data: row });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'create_failed' });
  }
}

export async function getConvo(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const id = String(req.params.id || '');
    const row = await getConversation(userId, id);
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    const messages = await listMessages(userId, id);
    return res.json({ success: true, data: { conversation: row, messages } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'get_failed' });
  }
}

export async function patchConvo(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const row = await updateConversation(userId, String(req.params.id || ''), {
      title: req.body?.title,
      pinned: req.body?.pinned,
      archived: req.body?.archived
    });
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    return res.json({ success: true, data: row });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'patch_failed' });
  }
}

export async function deleteConvo(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const result = await deleteConversation(userId, String(req.params.id || ''));
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'delete_failed' });
  }
}

export async function clearConvos(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const result = await clearAllConversations(userId);
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'clear_failed' });
  }
}

export async function exportConvos(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await exportConversations(userId);
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'export_failed' });
  }
}

// Prompt library
export async function listPrompts(req: Request, res: Response) {
  try {
    const flags = await loadAIFeatureFlags();
    if (!flags.promptLibraryEnabled && !flags.assistantEnabled) {
      // Still allow listing templates offline for UI preview when master off?
      // Spec: feature flagged — return empty when disabled
      if (!flags.promptLibraryEnabled) {
        return res.json({
          success: true,
          data: { items: [], categories: promptLibraryCategories() },
          message: 'Prompt library disabled by flag'
        });
      }
    }
    const items = listPromptLibrary({
      category: String(req.query.category || ''),
      q: String(req.query.q || ''),
      locale: String(req.query.locale || 'en')
    });
    return res.json({
      success: true,
      data: { items, categories: promptLibraryCategories() }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'prompts_failed' });
  }
}

export async function usePrompt(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const promptId = String(req.params.id || req.body?.promptId || '');
    if (!getPromptLibraryItem(promptId)) {
      return res.status(404).json({ success: false, error: 'Prompt not found' });
    }
    const result = await ScrolithaAssistant.usePromptLibrary({
      userId,
      promptId,
      topic: String(req.body?.topic || ''),
      locale: req.body?.locale,
      conversationId: req.body?.conversationId
    });
    const status = result.ok ? 200 : result.blocked ? 403 : 503;
    return res.status(status).json({ success: result.ok, data: result, error: result.reason });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'use_prompt_failed' });
  }
}

export async function postFeedback(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const flags = await loadAIFeatureFlags();
    if (!flags.feedbackEnabled) {
      return res.status(403).json({ success: false, error: 'SURFACE_FLAG_DISABLED:feedbackEnabled' });
    }
    const rating = req.body?.rating === 'helpful' ? 'helpful' : 'not_helpful';
    const rec = await submitFeedback({
      userId,
      rating,
      comment: req.body?.comment,
      capability: req.body?.capability,
      correlationId: req.body?.correlationId,
      conversationId: req.body?.conversationId,
      messageId: req.body?.messageId
    });
    return res.status(201).json({ success: true, data: rec });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'feedback_failed' });
  }
}
