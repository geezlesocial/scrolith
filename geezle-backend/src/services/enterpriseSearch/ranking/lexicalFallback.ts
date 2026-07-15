import type { SearchCandidate, SearchResult } from '../contracts/types';
import { mapCandidateToSearchResult } from '../dto/mappers';

/** Stable lexical order: score desc, then title */
export const lexicalRankCandidates = (candidates: SearchCandidate[], limit: number): SearchResult[] => {
  const sorted = [...candidates].sort((a, b) => {
    const sa = Number(a.lexicalScore) || 0;
    const sb = Number(b.lexicalScore) || 0;
    if (sb !== sa) return sb - sa;
    return String(a.title).localeCompare(String(b.title));
  });
  return sorted.slice(0, limit).map((c, index) =>
    mapCandidateToSearchResult(c, {
      rank: index + 1,
      authority: 'lexical_fallback',
      rankingModelVersion: 'lexical-v1'
    })
  );
};
