/**
 * Explainability helpers — presentation only; Discovery owns rank explanations.
 */
import type { SearchExplanation, SearchReasonCode } from '../contracts/types';

const HEADLINES: Partial<Record<SearchReasonCode, string>> = {
  shared_interest: 'Similar interests',
  shared_community: 'Shared community',
  followed_similar: 'Because of people you follow',
  trending_now: 'Trending now',
  high_quality: 'High quality',
  fresh_content: 'Recent',
  skills_match: 'Skills match',
  location_affinity: 'Near you',
  popular_in_network: 'Popular in your network',
  new_for_you: 'New for you',
  because_you_engaged: 'Because you engaged',
  exploration: 'Explore something new',
  cold_start: 'Getting started',
  lexical_match: 'Matches your search',
  editorial_pin: 'Featured',
  query_title_match: 'Title match',
  scrolitha_hint: 'AI-assisted suggestion'
};

export const headlineForCodes = (codes: SearchReasonCode[], fallback = 'Recommended for you'): string => {
  for (const c of codes) {
    if (HEADLINES[c]) return HEADLINES[c] as string;
  }
  return fallback;
};

export const buildFallbackExplanation = (codes: SearchReasonCode[] = ['lexical_match']): SearchExplanation => ({
  codes,
  headline: headlineForCodes(codes),
  from: 'search_fallback',
  i18nKey: codes[0] ? `search.explain.${codes[0]}` : 'search.explain.lexical_match'
});

/** Design-doc UI aliases → canonical codes (for docs/tests only) */
export const UI_REASON_ALIAS: Record<string, SearchReasonCode> = {
  FOLLOWING: 'followed_similar',
  SIMILAR_INTEREST: 'shared_interest',
  TRENDING: 'trending_now',
  POPULAR: 'popular_in_network',
  NEARBY: 'location_affinity',
  RECENT: 'fresh_content',
  COMMUNITY_MATCH: 'shared_community',
  SCROLITHA_HINT: 'scrolitha_hint'
};
