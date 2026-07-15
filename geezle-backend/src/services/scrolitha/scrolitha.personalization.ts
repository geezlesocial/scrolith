/**
 * Personalized Intelligence — adapts recommendations, explanations, summaries,
 * writing assistance, learning/job/community suggestions using memory + learning loop.
 * Always respects privacy controls and permissions.
 */
import {
  getLayeredMemorySnapshot,
  type LayeredMemorySnapshot
} from './scrolitha.memoryLayers';
import {
  getUserPrivacyControls,
  isRecommendationCategoryAllowed,
  recommendationKindToCategory,
  type ScrolithaPrivacyControls
} from './scrolitha.privacyControls';
import { getUserTopicAffinity } from './scrolitha.learningLoop';
import { freshnessBoost } from './scrolitha.knowledgeFreshness';
import type { RecommendationItem } from './scrolitha.recommendationEngine';

export type PersonalizationContext = {
  userId: string;
  privacy: ScrolithaPrivacyControls;
  memory: LayeredMemorySnapshot;
  topicAffinity: Record<string, number>;
  active: boolean;
  promptHints: string;
};

export type PersonalizedBundle<T> = {
  items: T[];
  personalizationApplied: boolean;
  suppressedCategories: string[];
  reason: string;
};

const text = (v: unknown) => String(v || '').trim();

export const buildPersonalizationContext = async (input: {
  userId: string;
  sessionKey?: string | null;
}): Promise<PersonalizationContext> => {
  const userId = text(input.userId);
  const privacy = await getUserPrivacyControls(userId);
  const memory = await getLayeredMemorySnapshot({
    userId,
    sessionKey: input.sessionKey
  });
  const topicAffinity =
    privacy.personalizationEnabled && privacy.allowLearningLoop
      ? await getUserTopicAffinity(userId)
      : {};

  const active = privacy.personalizationEnabled && privacy.memoryEnabled !== false;

  const hintParts: string[] = [];
  if (privacy.personalizationEnabled && memory.promptSafeSummary) {
    hintParts.push(`Personalization memory: ${memory.promptSafeSummary}`);
  }
  const topTopics = Object.entries(topicAffinity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t, c]) => `${t}(${c})`);
  if (topTopics.length) {
    hintParts.push(`Topic affinity: ${topTopics.join(', ')}`);
  }
  if (!privacy.proactiveSuggestionsEnabled) {
    hintParts.push('Proactive suggestions disabled by user.');
  }

  return {
    userId,
    privacy,
    memory,
    topicAffinity,
    active,
    promptHints: hintParts.join(' | ').slice(0, 1200)
  };
};

const kindAffinityBoost = (
  kind: string,
  affinity: Record<string, number>
): number => {
  const cat = recommendationKindToCategory(kind);
  if (!cat) return 0;
  const score = affinity[cat] || affinity[kind] || 0;
  if (score <= 0) return 0;
  return Math.min(0.25, score / 40);
};

/**
 * Filter and re-rank recommendations using privacy + affinity + freshness.
 */
export const personalizeRecommendations = (
  items: RecommendationItem[],
  ctx: PersonalizationContext
): PersonalizedBundle<RecommendationItem> => {
  const suppressed: string[] = [];
  if (!ctx.privacy.personalizationEnabled) {
    // Still apply hard category disables if any
  }

  const filtered: RecommendationItem[] = [];
  for (const item of items) {
    const cat = recommendationKindToCategory(item.kind);
    if (cat && !isRecommendationCategoryAllowed(ctx.privacy, cat)) {
      if (!suppressed.includes(cat)) suppressed.push(cat);
      continue;
    }
    filtered.push(item);
  }

  if (!ctx.active) {
    return {
      items: filtered,
      personalizationApplied: false,
      suppressedCategories: suppressed,
      reason: 'Personalization inactive — category filters only'
    };
  }

  const ranked = filtered
    .map((item) => {
      const boost =
        kindAffinityBoost(item.kind, ctx.topicAffinity) +
        // light title keyword match against memory skills
        (ctx.memory.layers.professionalProfile.some((m) =>
          m.value.toLowerCase().split(/[,\s]+/).some((tok) => tok.length > 2 && item.title.toLowerCase().includes(tok))
        )
          ? 0.1
          : 0);
      return {
        ...item,
        score: Math.max(0, Math.min(1.5, item.score + boost)),
        reason: boost > 0.05 ? `${item.reason} · personalized` : item.reason
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    items: ranked,
    personalizationApplied: true,
    suppressedCategories: suppressed,
    reason: 'Ranked by topic affinity, profile skills, and privacy filters'
  };
};

export const personalizeProactiveSuggestions = (
  suggestions: string[],
  ctx: PersonalizationContext
): string[] => {
  if (!ctx.privacy.proactiveSuggestionsEnabled) return [];
  if (!ctx.active) return suggestions.slice(0, 5);

  const affinityEntries = Object.entries(ctx.topicAffinity).map(([k, v]) => ({
    key: k.toLowerCase(),
    weight: Number(v) || 0,
    aliases: (() => {
      const key = k.toLowerCase();
      const aliases = [key];
      if (key.endsWith('s') && key.length > 3) aliases.push(key.slice(0, -1));
      else aliases.push(`${key}s`);
      return aliases;
    })()
  }));
  const scored = suggestions.map((s) => {
    const lower = s.toLowerCase();
    let score = 0;
    const matched = new Set<string>();
    for (const entry of affinityEntries) {
      if (entry.weight <= 0) continue;
      for (const alias of entry.aliases) {
        if (alias.length > 2 && lower.includes(alias) && !matched.has(entry.key)) {
          matched.add(entry.key);
          // Strong weight from historical affinity so high-interest topics win
          score += 1 + entry.weight;
          break;
        }
      }
    }
    // Professional skill mentions
    for (const m of ctx.memory.layers.professionalProfile) {
      if (m.key === 'skills') {
        for (const skill of m.value.toLowerCase().split(',').map((x) => x.trim())) {
          if (skill.length > 2 && lower.includes(skill)) score += 3;
        }
      }
    }
    return { s, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.s).slice(0, 8);
};

export const personalizeExplanationTone = (
  explanationSummary: string,
  ctx: PersonalizationContext
): string => {
  if (!ctx.active) return explanationSummary;
  const tone = ctx.memory.layers.userPreference.find((e) => e.key === 'assistantTone')?.value;
  if (tone === 'detailed') {
    return explanationSummary;
  }
  if (tone === 'concise' || !tone) {
    // Keep first sentence only if long
    const parts = explanationSummary.split(/(?<=\.)\s+/);
    if (parts.length > 2) return parts.slice(0, 2).join(' ');
  }
  return explanationSummary;
};

export const buildWritingAssistanceHints = (ctx: PersonalizationContext): string[] => {
  if (!ctx.active) return [];
  const hints: string[] = [];
  const title = ctx.memory.layers.professionalProfile.find((e) => e.key === 'title')?.value;
  const skills = ctx.memory.layers.professionalProfile.find((e) => e.key === 'skills')?.value;
  if (title) hints.push(`Match voice to professional role: ${title}`);
  if (skills) hints.push(`Emphasize relevant skills when drafting: ${skills.split(',').slice(0, 5).join(', ')}`);
  const tone = ctx.memory.layers.userPreference.find((e) => e.key === 'assistantTone')?.value;
  if (tone) hints.push(`Preferred assistant tone: ${tone}`);
  return hints.slice(0, 5);
};

export const buildLearningSuggestions = (ctx: PersonalizationContext): string[] => {
  if (!ctx.privacy.proactiveSuggestionsEnabled) return [];
  if (!isRecommendationCategoryAllowed(ctx.privacy, 'learning')) return [];
  const topics = Object.entries(ctx.topicAffinity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);
  if (!topics.length) {
    return ['Explore platform guides for jobs, services, and community best practices.'];
  }
  return topics.map((t) => `Continue learning about ${t} based on your recent interests.`);
};

export const applyFreshnessToScore = (
  score: number,
  updatedAt?: string | null
): number => Math.max(0, score + freshnessBoost(updatedAt));
