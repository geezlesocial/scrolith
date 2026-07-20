import { describe, expect, it } from 'vitest';
import {
  buildCommunityUrlSearch,
  createCommunityFeedSession,
  getCommunityItemKey,
  mergeCommunityItemsAppendOnly,
  parseCommunityUrlState,
  shouldSkipStaleCommunitySearch
} from '../communitySessionStability';
import {
  COMMUNITY_LEARNING_WEIGHTS,
  createCommunityLearningEvent,
  scoreCommunityLearningEvents
} from '../communityLearningEngine';
import {
  communityBreakpoints,
  communityTouchTargets
} from '../../community/design/communityTokens';

describe('Phase 24 community session stability', () => {
  it('creates a community-scoped session', () => {
    const session = createCommunityFeedSession();
    expect(session.surface).toBe('community');
    expect(session.orderFrozen).toBe(true);
    expect(session.sessionId.startsWith('community-')).toBe(true);
  });

  it('merges append-only without duplicates or reorder of existing', () => {
    const existing = [{ id: 'a' }, { id: 'b' }];
    const { items, duplicates } = mergeCommunityItemsAppendOnly(existing, [
      { id: 'b' },
      { id: 'c' },
      { id: 'a' }
    ]);
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(duplicates).toBe(2);
  });

  it('parses and builds community URL state', () => {
    const parsed = parseCommunityUrlState('?tab=joined&q=design&sort=trending&category=tech');
    expect(parsed.tab).toBe('joined');
    expect(parsed.q).toBe('design');
    expect(parsed.sort).toBe('trending');
    expect(parsed.category).toBe('tech');
    const search = buildCommunityUrlSearch({ tab: 'joined', q: 'design' });
    expect(search).toContain('tab=joined');
    expect(search).toContain('q=design');
  });

  it('skips stale search sequences', () => {
    expect(shouldSkipStaleCommunitySearch(1, 2)).toBe(true);
    expect(shouldSkipStaleCommunitySearch(3, 3)).toBe(false);
  });

  it('resolves stable community item keys', () => {
    expect(getCommunityItemKey({ id: 'x' })).toBe('x');
    expect(getCommunityItemKey({ postId: 'p1' })).toBe('p1');
  });
});

describe('Phase 24 community learning', () => {
  it('scores join higher than short impression', () => {
    const events = [
      createCommunityLearningEvent('community_impression'),
      createCommunityLearningEvent('community_joined', { entityId: 'c1', entityType: 'COMMUNITY' })
    ];
    const score = scoreCommunityLearningEvents(events);
    expect(score).toBeGreaterThan(COMMUNITY_LEARNING_WEIGHTS.community_impression);
    expect(events[0].surface).toBe('community');
  });

  it('treats report and not-interested as negative', () => {
    expect(COMMUNITY_LEARNING_WEIGHTS.community_reported).toBeLessThan(0);
    expect(COMMUNITY_LEARNING_WEIGHTS.community_not_interested).toBeLessThan(0);
  });
});

describe('Phase 24 design tokens', () => {
  it('defines mobile breakpoints and touch targets', () => {
    expect(communityBreakpoints.xs).toBe(320);
    expect(communityBreakpoints.md).toBe(390);
    expect(communityTouchTargets.min).toContain('min-h-11');
  });
});
