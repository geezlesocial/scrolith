/**
 * Phase 22.1B — Scroll deep-link contract + recommendation identity.
 */
import { describe, expect, it } from 'vitest';
import {
  buildScrollVideoUrl,
  isScrollHomeFallback,
  isScrollRecommendationKind,
  normalizeScrollVideoRecommendation,
  parseScrollVideoIdFromSearch,
  resolveScrollVideoId
} from '../scrollVideoRoutes';
import { toStreamEntry } from '../feedStream';
import {
  getScrollRecommendationCounters,
  resetScrollRecommendationCounters,
  trackScrollRecommendationClick
} from '../scrollRecommendationAnalytics';

describe('phase221B scroll video routes', () => {
  it('builds canonical /scroll?scroll= deep links', () => {
    expect(buildScrollVideoUrl('abc123')).toBe('/scroll?scroll=abc123');
    expect(buildScrollVideoUrl('')).toBe('/scroll');
    expect(isScrollHomeFallback(buildScrollVideoUrl('x'))).toBe(false);
  });

  it('parses scroll and video query aliases', () => {
    expect(parseScrollVideoIdFromSearch('?scroll=vid1')).toBe('vid1');
    expect(parseScrollVideoIdFromSearch('?video=vid2')).toBe('vid2');
    expect(parseScrollVideoIdFromSearch('?series=s1&scroll=vid3')).toBe('vid3');
  });

  it('resolves scrollVideoId from multiple payload shapes', () => {
    expect(resolveScrollVideoId({ id: 's1' })).toBe('s1');
    expect(resolveScrollVideoId({ scrollVideoId: 's2' })).toBe('s2');
    expect(resolveScrollVideoId({ sourceId: 's3', type: 'SCROLL_VIDEO' })).toBe('s3');
    expect(resolveScrollVideoId({ feedKey: 'SCROLL_VIDEO:s4', id: 's4' })).toBe('s4');
    expect(resolveScrollVideoId({ feedKey: 'SCROLL_VIDEO:s5' })).toBe('s5');
  });

  it('normalizes recommendation without falling back to /home', () => {
    const target = normalizeScrollVideoRecommendation({
      kind: 'scroll',
      data: {
        id: 'scroll-xyz',
        title: 'Demo reel',
        media: { url: 'https://cdn.example/v.mp4', thumbnailUrl: 'https://cdn.example/p.jpg' },
        author: { id: 'u1', name: 'Ada', username: 'ada' }
      },
      raw: { why: 'For you', type: 'SCROLL_VIDEO' },
      key: 'SCROLL_VIDEO:scroll-xyz'
    });
    expect(target?.scrollVideoId).toBe('scroll-xyz');
    expect(target?.mediaUrl).toContain('v.mp4');
    expect(target?.thumbnailUrl).toContain('p.jpg');
    expect(buildScrollVideoUrl(target!.scrollVideoId)).not.toMatch(/\/home/);
  });

  it('stream entry promotes media onto data for SCROLL_VIDEO', () => {
    const entry = toStreamEntry({
      type: 'SCROLL_VIDEO',
      id: 'sv1',
      sourceId: 'sv1',
      feedKey: 'SCROLL_VIDEO:sv1',
      media: { url: 'https://cdn.example/a.mp4', thumbnailUrl: 'https://cdn.example/t.jpg' },
      author: { id: 'a1', displayName: 'Creator' },
      payload: { id: 'sv1', title: 'Hello', fileId: 'f1' },
      why: 'Scroll video'
    });
    expect(entry?.kind).toBe('scroll');
    expect(entry?.data?.media?.url).toContain('a.mp4');
    expect(isScrollRecommendationKind(entry?.kind)).toBe(true);
    const href = buildScrollVideoUrl(resolveScrollVideoId(entry?.data));
    expect(href).toBe('/scroll?scroll=sv1');
    expect(isScrollHomeFallback(href)).toBe(false);
  });

  it('click analytics never records /home destination', () => {
    resetScrollRecommendationCounters();
    trackScrollRecommendationClick({
      recommendationId: 'SCROLL_VIDEO:sv1',
      scrollVideoId: 'sv1',
      sourceSurface: 'member_home',
      sourcePosition: 3,
      destination: '/scroll'
    });
    const c = getScrollRecommendationCounters();
    expect(c.scroll_recommendation_click_total).toBe(1);
    expect(c.scroll_recommendation_home_fallback_total).toBe(0);
  });
});
