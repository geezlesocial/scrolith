/**
 * Phase 22.1B — FeedMixedCard scroll destination contract (pure helpers).
 */
import { describe, expect, it } from 'vitest';
import { buildScrollVideoUrl, normalizeScrollVideoRecommendation, isScrollHomeFallback } from '../scrollVideoRoutes';
import { resolveStreamKind, toStreamEntry } from '../feedStream';

describe('phase221B feed mixed scroll card routing', () => {
  it('maps SCROLL_VIDEO type to scroll kind', () => {
    expect(resolveStreamKind('SCROLL_VIDEO')).toBe('scroll');
  });

  it('never builds /home for valid scroll recommendations', () => {
    const entry = toStreamEntry({
      type: 'SCROLL_VIDEO',
      id: 'cmtestscroll001',
      feedKey: 'SCROLL_VIDEO:cmtestscroll001',
      media: { url: 'https://example.com/v.mp4', thumbnailUrl: 'https://example.com/p.jpg' },
      author: { id: 'u1', displayName: 'Pat', username: 'pat' },
      payload: { id: 'cmtestscroll001', title: 'Launch day' },
      why: 'Scroll video'
    });
    const target = normalizeScrollVideoRecommendation(entry);
    expect(target?.scrollVideoId).toBe('cmtestscroll001');
    const href = buildScrollVideoUrl(target!.scrollVideoId);
    expect(href).toBe('/scroll?scroll=cmtestscroll001');
    expect(isScrollHomeFallback(href)).toBe(false);
    expect(href.includes('/home')).toBe(false);
  });

  it('returns null target when identity missing (disable nav, no /home)', () => {
    const target = normalizeScrollVideoRecommendation({ data: { title: 'No id' }, kind: 'scroll' });
    expect(target).toBeNull();
  });
});
