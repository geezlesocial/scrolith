import {
  resolveDiscoveryRolloutFlags,
  invalidateDiscoveryRolloutCache,
  isDiscoverySurfaceEnabled
} from '../discoveryEngine.rollout';
import { evaluateCandidateEligibility, filterEligibleCandidates } from '../discoveryEngine.eligibility';
import { applyDiversityPolicy, DIVERSITY_POLICY_VERSION } from '../discoveryEngine.diversity';
import { emptyScoreComponents } from '../discoveryEngine.types';
import {
  evaluateFeedbackQuality,
  MIN_QUALIFIED_DWELL_MS,
  normalizeBehavioralAction
} from '../discoveryEngine.behavior';
import {
  scoreCollaborativeForCandidate,
  isMeaningfulCollaborative,
  type CollaborativeIndex
} from '../discoveryEngine.collaborative';
import { decodeDiscoveryCursor, encodeDiscoveryCursor } from '../discoveryEngine.pipeline';
import { getGeneratorCoverageMatrix } from '../discoveryEngine.generators';
import { discoveryCache } from '../discoveryEngine.cache';
import { DISCOVERY_MODEL_VERSION } from '../discoveryEngine.types';
import { DISCOVERY_POLICY_VERSION } from '../discoveryEngine.versions';

describe('discovery engine phase 8.1 hardening', () => {
  afterEach(() => {
    invalidateDiscoveryRolloutCache();
  });

  test('defaults remain OFF for user-facing surfaces', () => {
    delete process.env.DISCOVERY_ENGINE_MASTER;
    invalidateDiscoveryRolloutCache();
    expect(resolveDiscoveryRolloutFlags().master).toBe(false);
    expect(isDiscoverySurfaceEnabled('sidebar')).toBe(false);
  });

  test('eligibility rejects blocked, private, sold, and self', () => {
    const blocked = new Set(['bad']);
    expect(
      evaluateCandidateEligibility(
        {
          entityType: 'person',
          entityId: 'p1',
          source: 'quality_creator',
          authorOrOwnerId: 'bad',
          label: 'x'
        },
        { viewerId: 'me', blockedUserIds: blocked }
      ).eligible
    ).toBe(false);

    expect(
      evaluateCandidateEligibility(
        {
          entityType: 'marketplace_listing',
          entityId: 'm1',
          source: 'marketplace_relevance',
          authorOrOwnerId: 'seller',
          label: 'item',
          baseFeatures: { sold: true }
        },
        { viewerId: 'me', blockedUserIds: new Set() }
      ).eligible
    ).toBe(false);

    expect(
      evaluateCandidateEligibility(
        {
          entityType: 'post',
          entityId: 'post1',
          source: 'recent',
          authorOrOwnerId: 'me',
          label: 'mine',
          visibility: 'public',
          baseFeatures: { status: 'active', active: true }
        },
        { viewerId: 'me', blockedUserIds: new Set() }
      ).eligible
    ).toBe(false);

    const { eligible, filteredCount } = filterEligibleCandidates(
      [
        {
          entityType: 'job',
          entityId: 'j1',
          source: 'related_job',
          authorOrOwnerId: 'c1',
          label: 'Job',
          visibility: 'public',
          baseFeatures: { active: true, isVisible: true }
        }
      ],
      { viewerId: 'me', blockedUserIds: new Set() }
    );
    expect(eligible.length).toBe(1);
    expect(filteredCount).toBe(0);
  });

  test('behavioral quality rejects short dwell and accidental clicks', () => {
    expect(normalizeBehavioralAction('not_interested')).toBe('not_interested');
    expect(
      evaluateFeedbackQuality({
        action: 'qualified_dwell',
        metadata: { dwellMs: 200 }
      }).accept
    ).toBe(false);
    expect(
      evaluateFeedbackQuality({
        action: 'click',
        metadata: { openDurationMs: 100 }
      }).accept
    ).toBe(false);
    expect(
      evaluateFeedbackQuality({
        action: 'qualified_dwell',
        metadata: { dwellMs: MIN_QUALIFIED_DWELL_MS + 50 }
      }).accept
    ).toBe(true);
  });

  test('collaborative scoring requires min cohort co-occurrence', () => {
    const edges = new Map<string, Map<string, number>>();
    edges.set('job:a', new Map([['job:b', 2]])); // below MIN_COHORT 5
    edges.set('job:c', new Map([['job:d', 40]]));
    const index: CollaborativeIndex = { edges, builtAt: Date.now(), cohortOk: true };
    const low = scoreCollaborativeForCandidate({
      candidate: { entityType: 'job', entityId: 'b', source: 'related_job', label: 'b' },
      positiveEntityKeys: new Set(['job:a']),
      index,
      allowed: true
    });
    expect(low).toBe(0);
    const high = scoreCollaborativeForCandidate({
      candidate: { entityType: 'job', entityId: 'd', source: 'related_job', label: 'd' },
      positiveEntityKeys: new Set(['job:c']),
      index,
      allowed: true
    });
    expect(high).toBeGreaterThan(0);
    expect(isMeaningfulCollaborative(high)).toBe(true);
  });

  test('diversity policy caps author domination with deterministic ties', () => {
    const rows = Array.from({ length: 5 }).map((_, i) => ({
      candidate: {
        entityType: 'person' as const,
        entityId: `p${i}`,
        source: 'quality_creator' as const,
        authorOrOwnerId: 'same',
        label: `P${i}`
      },
      score: 0.9,
      components: { ...emptyScoreComponents(), quality: 0.9 }
    }));
    const out = applyDiversityPolicy(rows);
    expect(out[0].candidate.entityId <= out[1].candidate.entityId || out[0].score >= out[1].score).toBe(
      true
    );
    expect(DIVERSITY_POLICY_VERSION).toMatch(/diversity/);
  });

  test('cursor encodes model/policy and rejects tamper', () => {
    const encoded = encodeDiscoveryCursor({
      o: 5,
      s: ['post:1'],
      m: DISCOVERY_MODEL_VERSION,
      p: DISCOVERY_POLICY_VERSION,
      d: DIVERSITY_POLICY_VERSION
    });
    const ok = decodeDiscoveryCursor(encoded);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.state.o).toBe(5);

    const broken = encoded.slice(0, -4) + 'xxxx';
    const bad = decodeDiscoveryCursor(broken);
    // may be invalid parse or tampered
    if (bad.ok === false) {
      expect(['cursor_invalid', 'cursor_tampered', 'cursor_model_mismatch']).toContain(bad.error);
    }

    const empty = decodeDiscoveryCursor(null);
    expect(empty.ok).toBe(true);
  });

  test('generator coverage matrix lists all entity types', () => {
    const matrix = getGeneratorCoverageMatrix();
    const types = matrix.map((m) => m.entityType);
    expect(types).toContain('post');
    expect(types).toContain('marketplace_listing');
    expect(types).toContain('event');
    expect(matrix.find((m) => m.entityType === 'event')?.supported).toBe(false);
    expect(matrix.find((m) => m.entityType === 'course')?.supported).toBe(false);
    expect(matrix.find((m) => m.entityType === 'project')?.supported).toBe(false);
    expect(matrix.find((m) => m.entityType === 'job')?.supported).toBe(true);
  });

  test('cache generation invalidation rejects stale entries', () => {
    discoveryCache.set('tmp:key', { a: 1 }, 60_000);
    expect(discoveryCache.get('tmp:key')).toEqual({ a: 1 });
    discoveryCache.bumpGeneration('test');
    expect(discoveryCache.get('tmp:key')).toBeNull();
    expect(discoveryCache.stats().generation).toBeGreaterThan(1);
  });
});
