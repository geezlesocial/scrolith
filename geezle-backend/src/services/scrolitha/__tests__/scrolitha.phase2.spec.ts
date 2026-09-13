import {
  normalizeSemanticQuery,
  rerankHybridHits,
  semanticCacheKey,
  toStructuredChatResponse,
  toStructuredSearchResponse,
  SCROLITHA_PHASE2_VERSION
} from '../scrolitha.phase2';

describe('Scrolitha Phase 2 retrieval and structured outputs', () => {
  test('normalizes equivalent semantic queries deterministically', () => {
    expect(normalizeSemanticQuery('Find jobs for React developers')).toBe(
      normalizeSemanticQuery('react developers jobs')
    );
    expect(semanticCacheKey({ viewerUserId: 'u1', intent: 'jobs', query: 'React jobs', limit: 10 }))
      .toHaveLength(40);
  });

  test('reranks merged lexical and semantic candidates without duplicates', () => {
    const hits = rerankHybridHits({
      query: 'react developer',
      lexical: [
        { type: 'job', id: '1', label: 'React developer', summary: 'Frontend role', score: 0.7, sourceLabel: 'jobs' },
        { type: 'job', id: '2', label: 'Designer', summary: 'Product design', score: 0.8, sourceLabel: 'jobs' }
      ],
      semantic: [
        { type: 'job', id: '1', label: 'React developer', summary: 'Frontend role', score: 0.8, sourceLabel: 'jobs' },
        { type: 'job', id: '3', label: 'Frontend engineer', summary: 'React and web', score: 0.75, sourceLabel: 'jobs' }
      ],
      limit: 10
    });
    expect(hits.map((hit) => hit.id)).toEqual(['1', '2', '3']);
    expect(new Set(hits.map((hit) => `${hit.type}:${hit.id}`)).size).toBe(hits.length);
  });

  test('validates structured search and chat contracts', () => {
    const search = toStructuredSearchResponse({
      intent: 'jobs',
      query: 'react jobs',
      hits: [],
      provider: 'hybrid',
      cacheHit: false,
      phase2: {
        version: SCROLITHA_PHASE2_VERSION,
        mode: 'hybrid',
        semanticCacheHit: false,
        lexicalCandidates: 0,
        semanticCandidates: 0,
        rerankedCandidates: 0
      }
    });
    const chat = toStructuredChatResponse({
      intent: 'general_assist',
      reply: 'Done',
      responseMode: 'fallback',
      confidence: 0.8
    });
    expect(search.phase2.version).toBe('phase2-v1');
    expect(chat.reply).toBe('Done');
  });
});
