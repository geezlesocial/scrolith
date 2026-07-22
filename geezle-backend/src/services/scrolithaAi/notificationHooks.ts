/**
 * Phase 33.0 — Notification AI foundation hooks (feature flags OFF by default).
 * AI may SUGGEST only. Deterministic Phase 32 priority remains authoritative.
 * On any failure, return null so callers fall back to Phase 32 behavior.
 */
import ScrolithaAI from './execute';
import { loadAIFeatureFlags } from './config';
import type { NotificationSummary, NotificationPrioritySuggestions } from './structured';

export type NotificationDigestItem = {
  id: string;
  title?: string;
  body?: string;
  category?: string;
  priority?: string;
  createdAt?: string;
};

/**
 * Suggest a digest summary. Never overrides security/emergency policy.
 */
export async function suggestNotificationDigestSummary(input: {
  userId: string;
  items: NotificationDigestItem[];
  locale?: string;
  correlationId?: string;
}): Promise<{
  suggestion: NotificationSummary | null;
  usedAI: boolean;
  reason?: string;
}> {
  const flags = await loadAIFeatureFlags();
  if (!flags.notificationAiHooks || !flags.NOTIFICATION_SUMMARIZATION) {
    return { suggestion: null, usedAI: false, reason: 'FLAG_DISABLED' };
  }

  // Never send HIGHLY_SENSITIVE raw content — minimize to titles/priorities
  const content = input.items
    .slice(0, 40)
    .map((i) => {
      const p = String(i.priority || 'normal').toLowerCase();
      // Security items stay labeled; AI cannot lower them
      return `- [${i.id}] (${p}) ${String(i.title || '').slice(0, 120)}: ${String(i.body || '').slice(0, 200)}`;
    })
    .join('\n');

  try {
    const result = await ScrolithaAI.execute<NotificationSummary>({
      capability: 'NOTIFICATION_SUMMARIZATION',
      userId: input.userId,
      input: content,
      structured: true,
      locale: input.locale || 'en',
      policy: {
        privacyLevel: 'PERSONAL',
        preferInternalProvider: true,
        allowCache: false,
        maxTokens: 800
      },
      correlationId: input.correlationId,
      dryRun: false,
      metadata: { source: 'notification_digest_hook' }
    });

    if (!result.ok || !result.data) {
      return { suggestion: null, usedAI: false, reason: result.reason || 'AI_FAILED' };
    }

    // Enforce: security/critical labels cannot be demoted in suggestions
    const data = result.data;
    if (data.keyItems) {
      for (const item of data.keyItems) {
        const original = input.items.find((i) => i.id === item.notificationId);
        const origPri = String(original?.priority || '').toLowerCase();
        if (origPri === 'critical' || origPri === 'emergency' || origPri === 'security') {
          item.priority = 'CRITICAL';
          item.reason = `${item.reason} (platform policy: security/critical retained)`.slice(0, 500);
        }
      }
    }

    return { suggestion: data, usedAI: true };
  } catch (err: any) {
    return { suggestion: null, usedAI: false, reason: String(err?.message || 'ERROR') };
  }
}

/**
 * Suggest relative priorities. Platform policy overrides AI.
 */
export async function suggestNotificationPriorities(input: {
  userId: string;
  items: NotificationDigestItem[];
  locale?: string;
  correlationId?: string;
}): Promise<{
  suggestion: NotificationPrioritySuggestions | null;
  usedAI: boolean;
  reason?: string;
}> {
  const flags = await loadAIFeatureFlags();
  if (!flags.notificationAiHooks || !flags.NOTIFICATION_PRIORITIZATION) {
    return { suggestion: null, usedAI: false, reason: 'FLAG_DISABLED' };
  }

  const content = input.items
    .slice(0, 40)
    .map((i) => `- [${i.id}] cat=${i.category || 'unknown'} title=${String(i.title || '').slice(0, 100)}`)
    .join('\n');

  try {
    const result = await ScrolithaAI.execute<NotificationPrioritySuggestions>({
      capability: 'NOTIFICATION_PRIORITIZATION',
      userId: input.userId,
      input: content,
      structured: true,
      locale: input.locale || 'en',
      policy: {
        privacyLevel: 'PERSONAL',
        preferInternalProvider: true,
        allowCache: false
      },
      correlationId: input.correlationId,
      metadata: { source: 'notification_priority_hook' }
    });

    if (!result.ok || !result.data) {
      return { suggestion: null, usedAI: false, reason: result.reason || 'AI_FAILED' };
    }
    return { suggestion: result.data, usedAI: true };
  } catch (err: any) {
    return { suggestion: null, usedAI: false, reason: String(err?.message || 'ERROR') };
  }
}

/**
 * Placeholder for NL notification search prep — disabled by default.
 */
export async function prepareNotificationSearchQuery(input: {
  userId: string;
  query: string;
  locale?: string;
}): Promise<{ preparedQuery: string; usedAI: boolean; reason?: string }> {
  const flags = await loadAIFeatureFlags();
  if (!flags.notificationAiHooks || !flags.SEMANTIC_SEARCH_PREPARATION) {
    return { preparedQuery: input.query, usedAI: false, reason: 'FLAG_DISABLED' };
  }
  try {
    const result = await ScrolithaAI.execute({
      capability: 'SEMANTIC_SEARCH_PREPARATION',
      userId: input.userId,
      input: input.query,
      locale: input.locale || 'en',
      policy: { privacyLevel: 'PERSONAL', preferInternalProvider: true }
    });
    if (!result.ok || !result.text) {
      return { preparedQuery: input.query, usedAI: false, reason: result.reason };
    }
    return { preparedQuery: result.text.trim() || input.query, usedAI: true };
  } catch {
    return { preparedQuery: input.query, usedAI: false, reason: 'ERROR' };
  }
}

export default {
  suggestNotificationDigestSummary,
  suggestNotificationPriorities,
  prepareNotificationSearchQuery
};
