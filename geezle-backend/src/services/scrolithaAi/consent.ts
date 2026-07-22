/**
 * Phase 33.0 — Versioned, revocable AI consent (privacy-preserving defaults).
 */
import prisma from '../../utils/prismaClient';
import {
  CONSENT_VERSION,
  DEFAULT_AI_CONSENT,
  type AICapabilityId,
  type AIConsentState,
  type PrivacyLevel
} from './types';

const isMissing = (err: any) =>
  err?.code === 'P2021' || err instanceof TypeError || /does not exist/i.test(String(err?.message || ''));

const memory = new Map<string, AIConsentState>();

function normalize(raw: unknown): AIConsentState {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    aiFeaturesEnabled: Boolean(src.aiFeaturesEnabled),
    privateMessageAnalysisAllowed: Boolean(src.privateMessageAnalysisAllowed),
    personalizationAllowed: Boolean(src.personalizationAllowed),
    externalProviderProcessingAllowed: Boolean(src.externalProviderProcessingAllowed),
    aiSuggestionsAllowed: Boolean(src.aiSuggestionsAllowed),
    aiActivityHistoryEnabled: Boolean(src.aiActivityHistoryEnabled),
    productImprovementDataAllowed: Boolean(src.productImprovementDataAllowed),
    consentVersion: String(src.consentVersion || CONSENT_VERSION),
    updatedAt: src.updatedAt ? String(src.updatedAt) : null
  };
}

export async function getAIConsent(userId?: string | null): Promise<AIConsentState> {
  if (!userId) return { ...DEFAULT_AI_CONSENT };
  if (memory.has(userId)) return { ...memory.get(userId)! };
  try {
    const row = await (prisma as any).aIConsent?.findUnique?.({ where: { userId } });
    if (row) {
      const state = normalize({
        aiFeaturesEnabled: row.aiFeaturesEnabled,
        privateMessageAnalysisAllowed: row.privateMessageAnalysisAllowed,
        personalizationAllowed: row.personalizationAllowed,
        externalProviderProcessingAllowed: row.externalProviderProcessingAllowed,
        aiSuggestionsAllowed: row.aiSuggestionsAllowed,
        aiActivityHistoryEnabled: row.aiActivityHistoryEnabled,
        productImprovementDataAllowed: row.productImprovementDataAllowed,
        consentVersion: row.consentVersion,
        updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt
      });
      memory.set(userId, state);
      return state;
    }
  } catch (err) {
    if (!isMissing(err)) {
      /* defaults */
    }
  }
  return { ...DEFAULT_AI_CONSENT };
}

export async function updateAIConsent(
  userId: string,
  partial: Partial<AIConsentState>
): Promise<AIConsentState> {
  const current = await getAIConsent(userId);
  const next: AIConsentState = {
    ...current,
    ...partial,
    consentVersion: CONSENT_VERSION,
    updatedAt: new Date().toISOString()
  };
  // Explicit booleans only
  next.aiFeaturesEnabled = Boolean(next.aiFeaturesEnabled);
  next.privateMessageAnalysisAllowed = Boolean(next.privateMessageAnalysisAllowed);
  next.personalizationAllowed = Boolean(next.personalizationAllowed);
  next.externalProviderProcessingAllowed = Boolean(next.externalProviderProcessingAllowed);
  next.aiSuggestionsAllowed = Boolean(next.aiSuggestionsAllowed);
  next.aiActivityHistoryEnabled = Boolean(next.aiActivityHistoryEnabled);
  next.productImprovementDataAllowed = Boolean(next.productImprovementDataAllowed);

  memory.set(userId, next);
  try {
    await (prisma as any).aIConsent?.upsert?.({
      where: { userId },
      create: {
        userId,
        aiFeaturesEnabled: next.aiFeaturesEnabled,
        privateMessageAnalysisAllowed: next.privateMessageAnalysisAllowed,
        personalizationAllowed: next.personalizationAllowed,
        externalProviderProcessingAllowed: next.externalProviderProcessingAllowed,
        aiSuggestionsAllowed: next.aiSuggestionsAllowed,
        aiActivityHistoryEnabled: next.aiActivityHistoryEnabled,
        productImprovementDataAllowed: next.productImprovementDataAllowed,
        consentVersion: next.consentVersion
      },
      update: {
        aiFeaturesEnabled: next.aiFeaturesEnabled,
        privateMessageAnalysisAllowed: next.privateMessageAnalysisAllowed,
        personalizationAllowed: next.personalizationAllowed,
        externalProviderProcessingAllowed: next.externalProviderProcessingAllowed,
        aiSuggestionsAllowed: next.aiSuggestionsAllowed,
        aiActivityHistoryEnabled: next.aiActivityHistoryEnabled,
        productImprovementDataAllowed: next.productImprovementDataAllowed,
        consentVersion: next.consentVersion
      }
    });
    try {
      await (prisma as any).aIAuditLog?.create?.({
        data: {
          action: 'consent.updated',
          actorUserId: userId,
          targetUserId: userId,
          metadata: { consentVersion: next.consentVersion, flags: next },
          correlationId: null
        }
      });
    } catch {
      /* soft */
    }
  } catch (err) {
    if (!isMissing(err)) {
      /* memory only */
    }
  }
  return next;
}

export async function resetAIConsent(userId: string): Promise<AIConsentState> {
  return updateAIConsent(userId, { ...DEFAULT_AI_CONSENT });
}

export type ConsentCheckResult =
  | { allowed: true; consent: AIConsentState }
  | { allowed: false; reason: string; consent: AIConsentState };

/**
 * Server-side consent enforcement for a capability + privacy level.
 */
export async function assertConsentForRequest(input: {
  userId?: string | null;
  capability: AICapabilityId;
  privacyLevel: PrivacyLevel;
  requiresExternal?: boolean;
}): Promise<ConsentCheckResult> {
  const consent = await getAIConsent(input.userId);
  if (!consent.aiFeaturesEnabled) {
    return { allowed: false, reason: 'CONSENT_AI_FEATURES_DISABLED', consent };
  }
  const suggestionCaps = new Set([
    'NOTIFICATION_SUMMARIZATION',
    'NOTIFICATION_PRIORITIZATION',
    'ASSISTANT_CHAT',
    'DRAFT_COMPOSITION',
    'COMPOSER_ASSIST',
    'SEARCH_QUERY_SUGGESTION',
    'TEXT_TRANSLATION',
    'TEXT_REWRITING',
    'TEXT_SUMMARIZATION'
  ]);
  if (suggestionCaps.has(input.capability) && !consent.aiSuggestionsAllowed) {
    return { allowed: false, reason: 'CONSENT_SUGGESTIONS_DISABLED', consent };
  }
  if (
    (input.privacyLevel === 'SENSITIVE' || input.privacyLevel === 'HIGHLY_SENSITIVE') &&
    !consent.privateMessageAnalysisAllowed
  ) {
    // Private/sensitive analysis requires explicit private-content consent
    if (input.capability === 'ASSISTANT_CHAT' || input.capability === 'COMPOSER_ASSIST') {
      return { allowed: false, reason: 'CONSENT_PRIVATE_CONTENT_DENIED', consent };
    }
  }
  if (input.requiresExternal && !consent.externalProviderProcessingAllowed) {
    return { allowed: false, reason: 'CONSENT_EXTERNAL_PROVIDER_DENIED', consent };
  }
  return { allowed: true, consent };
}

export default {
  getAIConsent,
  updateAIConsent,
  resetAIConsent,
  assertConsentForRequest
};
