import { describe, expect, it } from 'vitest';
import {
  computeScrollVirtualWindow,
  isIndexInVirtualWindow,
  resolveScrollPreloadMode,
  shouldAttemptAutoplay
} from '../scrollPlayerEngine';
import {
  computeCompletionRate,
  mapLearningToEngageType,
  scoreLearningEvents,
  SCROLL_LEARNING_WEIGHTS
} from '../scrollLearningEngine';
import {
  applyOptimisticMetricDelta,
  mapEngageTypeToMetricField
} from '../scrollEngagementOptimistic';
import { validateScrollReportReason } from '../scrollModerationClient';

describe('Phase 23 scroll player engine', () => {
  it('computes a virtual window around the active index', () => {
    const win = computeScrollVirtualWindow(0, 10, 2);
    expect(win.start).toBe(0);
    expect(win.end).toBe(2);
    expect(isIndexInVirtualWindow(1, win)).toBe(true);
    expect(isIndexInVirtualWindow(9, win)).toBe(false);
  });

  it('uses adaptive preload for active vs neighbor', () => {
    expect(
      resolveScrollPreloadMode({
        isActive: true,
        isNeighbor: false,
        autoplayEnabled: true,
        dataSaver: false,
        networkClass: 'fast'
      })
    ).toBe('metadata');
    expect(
      resolveScrollPreloadMode({
        isActive: false,
        isNeighbor: true,
        autoplayEnabled: true,
        dataSaver: true,
        networkClass: 'slow'
      })
    ).toBe('none');
  });

  it('gates autoplay correctly', () => {
    expect(
      shouldAttemptAutoplay({
        isActive: true,
        autoplayEnabled: true,
        playbackBlocked: false,
        documentHidden: false
      })
    ).toBe(true);
    expect(
      shouldAttemptAutoplay({
        isActive: true,
        autoplayEnabled: true,
        documentHidden: true
      })
    ).toBe(false);
  });
});

describe('Phase 23 learning engine', () => {
  it('maps learning signals to engage types', () => {
    expect(mapLearningToEngageType('completion')).toBe('learn_complete');
    expect(mapLearningToEngageType('replay')).toBe('learn_replay');
    expect(mapLearningToEngageType('like')).toBeNull();
  });

  it('scores completion higher than pause', () => {
    const score = scoreLearningEvents([
      { scrollId: 'a', type: 'completion', at: 1 },
      { scrollId: 'a', type: 'pause', at: 2 }
    ]);
    expect(score).toBeCloseTo(SCROLL_LEARNING_WEIGHTS.completion + SCROLL_LEARNING_WEIGHTS.pause);
    expect(computeCompletionRate(9, 10)).toBeCloseTo(0.9);
  });
});

describe('Phase 23 engagement optimistic + moderation', () => {
  it('applies optimistic metric deltas with rollback snapshot', () => {
    const { next, snapshot } = applyOptimisticMetricDelta({ likes: 3, shares: 1 }, 'likes', 1);
    expect(next.likes).toBe(4);
    expect(snapshot.likes).toBe(3);
    expect(mapEngageTypeToMetricField('view_95')).toBe('views95pct');
    expect(mapEngageTypeToMetricField('learn_pause')).toBeNull();
  });

  it('validates report reasons', () => {
    expect(validateScrollReportReason('')).toEqual({ ok: false, error: expect.any(String) });
    expect(validateScrollReportReason('ab')).toEqual({ ok: false, error: expect.any(String) });
    expect(validateScrollReportReason('spam content')).toEqual({ ok: true, reason: 'spam content' });
  });
});
