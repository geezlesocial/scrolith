/**
 * Phase 20.2.5 — mobile social hardening contracts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

/** Mirrors MobileFeed relationship intelligence target selection. */
const resolveNetworkRecoTargetId = (peopleCount: number, pagesCount: number) => {
  if (peopleCount > 0) return 'mobile-member-home-people-suggestions';
  if (pagesCount > 0) return 'mobile-member-home-page-suggestions';
  return 'mobile-member-home-network-recommendations';
};

/** Mirrors series thumb play gate (coarse pointer + reduced motion). */
const shouldPlaySeriesPreview = (opts: {
  hasVideo: boolean;
  hoverPreview: boolean;
  isCoarsePointer: boolean;
  prefersReducedMotion: boolean;
  hoverActive: boolean;
  previewAllowed: boolean;
}) => {
  if (!opts.hasVideo || opts.prefersReducedMotion) return false;
  if (!opts.hoverPreview) return true;
  if (opts.isCoarsePointer) return true;
  return opts.hoverActive && opts.previewAllowed;
};

test('relationship intelligence targets people section when available', () => {
  assert.equal(resolveNetworkRecoTargetId(3, 2), 'mobile-member-home-people-suggestions');
});

test('relationship intelligence falls back to pages then network anchor', () => {
  assert.equal(resolveNetworkRecoTargetId(0, 2), 'mobile-member-home-page-suggestions');
  assert.equal(resolveNetworkRecoTargetId(0, 0), 'mobile-member-home-network-recommendations');
});

test('series preview autoplays on coarse/mobile without hover', () => {
  assert.equal(
    shouldPlaySeriesPreview({
      hasVideo: true,
      hoverPreview: true,
      isCoarsePointer: true,
      prefersReducedMotion: false,
      hoverActive: false,
      previewAllowed: false
    }),
    true
  );
});

test('series preview stays hover-gated on desktop fine pointer', () => {
  assert.equal(
    shouldPlaySeriesPreview({
      hasVideo: true,
      hoverPreview: true,
      isCoarsePointer: false,
      prefersReducedMotion: false,
      hoverActive: false,
      previewAllowed: false
    }),
    false
  );
  assert.equal(
    shouldPlaySeriesPreview({
      hasVideo: true,
      hoverPreview: true,
      isCoarsePointer: false,
      prefersReducedMotion: false,
      hoverActive: true,
      previewAllowed: true
    }),
    true
  );
});

test('reduced motion disables series autoplay', () => {
  assert.equal(
    shouldPlaySeriesPreview({
      hasVideo: true,
      hoverPreview: true,
      isCoarsePointer: true,
      prefersReducedMotion: true,
      hoverActive: true,
      previewAllowed: true
    }),
    false
  );
});
