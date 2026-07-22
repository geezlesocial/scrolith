/**
 * Phase 33.2 — Intelligent search assistance.
 * AI suggests enhanced queries; deterministic search remains the execution engine.
 */
import { ScrolithaAI } from './execute';
import { loadAIFeatureFlags } from './config';
import { getAIConsent } from './consent';
import { getAIMemory } from './memory';
import { inc } from './observability';
import type { SearchDomain } from './types';

export type SemanticSearchAssistResult = {
  enabled: boolean;
  reason?: string;
  originalQuery: string;
  detectedIntent: string;
  correctedQuery: string;
  expandedQueries: string[];
  suggestions: string[];
  /** Client must call existing /api/search — AI does not execute search */
  executionEngine: 'deterministic_search';
  aiExecutesSearch: false;
  typoHints: string[];
};

const INTENT_MAP: Array<{ re: RegExp; intent: string }> = [
  { re: /\b(job|hiring|career|vacancy|position)\b/i, intent: 'jobs' },
  { re: /\b(buy|sell|gig|service|marketplace|product)\b/i, intent: 'marketplace' },
  { re: /\b(community|group|club|forum)\b/i, intent: 'communities' },
  { re: /\b(people|who is|profile|connect)\b/i, intent: 'people' },
  { re: /\b(event|meetup|webinar|conference)\b/i, intent: 'events' }
];

export function simpleTypoExpand(q: string): string[] {
  const out: string[] = [];
  // Common tech typos
  const pairs: Array<[RegExp, string]> = [
    [/\breac\b/i, 'react'],
    [/\bjavascrip\b/i, 'javascript'],
    [/\btypescrip\b/i, 'typescript'],
    [/\bnodejs\b/i, 'node.js'],
    [/\bfrelancer\b/i, 'freelancer']
  ];
  let corrected = q;
  for (const [re, fix] of pairs) {
    if (re.test(corrected)) {
      corrected = corrected.replace(re, fix);
      out.push(`Did you mean “${fix}”?`);
    }
  }
  return out;
}

export function detectIntent(q: string, domain?: SearchDomain | string): string {
  if (domain) return String(domain);
  for (const { re, intent } of INTENT_MAP) {
    if (re.test(q)) return intent;
  }
  return 'general';
}

export async function assistSearchQuery(input: {
  userId: string;
  query: string;
  domain?: SearchDomain | string;
  locale?: string;
}): Promise<SemanticSearchAssistResult> {
  const originalQuery = String(input.query || '').trim();
  const base: SemanticSearchAssistResult = {
    enabled: false,
    originalQuery,
    detectedIntent: 'general',
    correctedQuery: originalQuery,
    expandedQueries: [],
    suggestions: [],
    executionEngine: 'deterministic_search',
    aiExecutesSearch: false,
    typoHints: []
  };

  if (!originalQuery) {
    return { ...base, reason: 'EMPTY_QUERY' };
  }

  const flags = await loadAIFeatureFlags();
  if (!flags.masterEnabled || flags.killSwitch || !flags.semanticSearchEnabled) {
    return { ...base, reason: 'SURFACE_FLAG_DISABLED:semanticSearchEnabled' };
  }
  const consent = await getAIConsent(input.userId);
  if (!consent.aiFeaturesEnabled || !consent.aiSuggestionsAllowed) {
    return { ...base, reason: 'CONSENT_REQUIRED' };
  }

  const typoHints = simpleTypoExpand(originalQuery);
  let correctedQuery = originalQuery;
  for (const hint of typoHints) {
    const m = hint.match(/“([^”]+)”/);
    if (m) correctedQuery = correctedQuery.replace(/\breac\b|\bjavascrip\b|\btypescrip\b|\bfrelancer\b/i, m[1]);
  }

  const intent = detectIntent(correctedQuery, input.domain);
  const memory = await getAIMemory(input.userId);
  const topicBoost = memory.preferredTopics.slice(0, 3);

  const expandedQueries = Array.from(
    new Set(
      [
        correctedQuery,
        topicBoost.length ? `${correctedQuery} ${topicBoost[0]}` : '',
        intent !== 'general' ? `${correctedQuery} ${intent}` : '',
        `${correctedQuery} remote`,
        correctedQuery.replace(/\s+/g, ' ').trim()
      ].filter(Boolean)
    )
  ).slice(0, 6);

  let suggestions = expandedQueries.slice();

  if (flags.SEMANTIC_QUERY_EXPANSION || flags.SEMANTIC_SEARCH_PREPARATION) {
    try {
      const cap = flags.SEMANTIC_QUERY_EXPANSION
        ? 'SEMANTIC_QUERY_EXPANSION'
        : 'SEMANTIC_SEARCH_PREPARATION';
      const result = await ScrolithaAI.execute({
        capability: cap as any,
        userId: input.userId,
        input: `Domain: ${intent}\nQuery: ${correctedQuery}\nUser topics: ${topicBoost.join(', ')}`,
        locale: input.locale || 'en',
        policy: { privacyLevel: 'PUBLIC', preferInternalProvider: true, allowCache: true, maxTokens: 200 },
        metadata: { surface: 'semantic_search', advisory: true }
      });
      if (result.ok && result.text) {
        const lines = result.text
          .split(/\n+/)
          .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
          .filter((l) => l.length > 1 && l.length < 120)
          .slice(0, 5);
        if (lines.length) suggestions = Array.from(new Set([...lines, ...suggestions])).slice(0, 8);
      }
    } catch {
      /* heuristic only */
    }
  }

  inc('semanticExpansions');
  return {
    enabled: true,
    originalQuery,
    detectedIntent: intent,
    correctedQuery,
    expandedQueries,
    suggestions,
    executionEngine: 'deterministic_search',
    aiExecutesSearch: false,
    typoHints
  };
}

export default { assistSearchQuery, detectIntent, simpleTypoExpand };
