/**
 * Phase 8.2 — offline load bench (no DB, no network).
 * Run: npx tsx src/services/discoveryEngine/__tests__/discoveryEngine.loadBench.ts
 */
import { scoreCandidate } from '../discoveryEngine.scoring';
import { applyDiversityPolicy } from '../discoveryEngine.diversity';
import { filterEligibleCandidates } from '../discoveryEngine.eligibility';
import { evaluateFeedbackQuality } from '../discoveryEngine.behavior';
import { discoveryCache } from '../discoveryEngine.cache';
import { decodeDiscoveryCursor, encodeDiscoveryCursor } from '../discoveryEngine.pipeline';
import { DISCOVERY_MODEL_VERSION } from '../discoveryEngine.types';
import { DISCOVERY_POLICY_VERSION } from '../discoveryEngine.versions';
import { DIVERSITY_POLICY_VERSION } from '../discoveryEngine.diversity';
import {
  resolveDiscoveryRolloutFlags,
  isDiscoverySurfaceEnabled
} from '../discoveryEngine.rollout';
import { scoreCollaborativeForCandidate } from '../discoveryEngine.collaborative';
import { getGeneratorCoverageMatrix } from '../discoveryEngine.generators';

const profile = {
  viewerId: 'u1',
  skills: ['typescript', 'react', 'node'],
  topics: ['jobs', 'hire'],
  communities: ['builders'],
  categories: ['engineering'],
  locations: ['remote'],
  negativeTokens: [] as string[],
  explicitWeight: 0.7,
  implicitWeight: 0.3,
  coldStart: false,
  personalizationAllowed: true
};

const start = Date.now();
const N = 5000;
const t0 = process.hrtime.bigint();
for (let i = 0; i < N; i++) {
  scoreCandidate({
    candidate: {
      entityType: i % 3 === 0 ? 'job' : i % 3 === 1 ? 'post' : 'person',
      entityId: `e${i}`,
      source: 'recent',
      label: `TypeScript role ${i}`,
      summary: 'React and node work',
      tags: ['typescript', 'react'],
      authorOrOwnerId: `a${i % 50}`,
      createdAt: new Date().toISOString(),
      baseFeatures: { completeness: 0.8, engagement: 0.4, isVerified: true, velocity: 0.2 }
    },
    profile,
    sharedCommunity: i % 5 === 0,
    followedAuthor: i % 7 === 0,
    positiveAffinity: (i % 10) / 10,
    coEngageScore: (i % 8) / 10,
    collaborativeAllowed: true,
    seed: i
  });
}
const t1 = process.hrtime.bigint();
const scoreMs = Number(t1 - t0) / 1e6;

const rows = Array.from({ length: 200 }, (_, i) => ({
  candidate: {
    entityType: (i % 2 ? 'job' : 'person') as 'job' | 'person',
    entityId: `x${i}`,
    source: 'recent' as const,
    authorOrOwnerId: `auth${i % 20}`,
    label: `L${i}`,
    category: `cat${i % 5}`
  },
  score: 0.9 - (i % 30) * 0.01,
  components: {
    interest: 0.5,
    relationship: 0.3,
    behavioral: 0.2,
    quality: 0.6,
    freshness: 0.7,
    trending: 0.2,
    content: 0.4,
    collaborative: 0.1,
    diversity: 0,
    exploration: 0.05,
    coldStart: 0,
    penalty: 0
  }
}));
const d0 = process.hrtime.bigint();
for (let k = 0; k < 200; k++) {
  applyDiversityPolicy(rows.map((r) => ({ ...r, components: { ...r.components } })));
}
const d1 = process.hrtime.bigint();
const diversityMs = Number(d1 - d0) / 1e6;

discoveryCache.bumpGeneration('bench');
const c0 = process.hrtime.bigint();
for (let i = 0; i < 10000; i++) discoveryCache.set(`k${i % 500}`, { i }, 30000);
let hits = 0;
let misses = 0;
for (let i = 0; i < 10000; i++) {
  const v = discoveryCache.get(`k${i % 500}`);
  if (v) hits += 1;
  else misses += 1;
}
const c1 = process.hrtime.bigint();
const cacheMs = Number(c1 - c0) / 1e6;

const cands = Array.from({ length: 1000 }, (_, i) => ({
  entityType: 'job' as const,
  entityId: `j${i}`,
  source: 'related_job' as const,
  authorOrOwnerId: `c${i % 100}`,
  label: 'J',
  visibility: 'public',
  baseFeatures: { active: true, isVisible: true, sold: i % 50 === 0 }
}));
const e0 = process.hrtime.bigint();
for (let i = 0; i < 100; i++) {
  filterEligibleCandidates(cands, { viewerId: 'me', blockedUserIds: new Set(['c1', 'c2']) });
}
const e1 = process.hrtime.bigint();
const eligMs = Number(e1 - e0) / 1e6;

const cur0 = process.hrtime.bigint();
for (let i = 0; i < 2000; i++) {
  const last = encodeDiscoveryCursor({
    o: i,
    s: [`post:${i}`],
    m: DISCOVERY_MODEL_VERSION,
    p: DISCOVERY_POLICY_VERSION,
    d: DIVERSITY_POLICY_VERSION
  });
  decodeDiscoveryCursor(last);
}
const cur1 = process.hrtime.bigint();
const cursorMs = Number(cur1 - cur0) / 1e6;

// concurrent identical warm gets (sync loop approximates repeated identical requests)
discoveryCache.bumpGeneration('warm');
const warmKey = 'resp:warmbench';
const w0 = process.hrtime.bigint();
discoveryCache.set(warmKey, { items: Array.from({ length: 12 }, (_, i) => ({ id: i })) }, 25000);
let warmHits = 0;
for (let u = 0; u < 200; u++) {
  for (let i = 0; i < 25; i++) {
    if (discoveryCache.get(warmKey)) warmHits += 1;
  }
}
const w1 = process.hrtime.bigint();
const warmMs = Number(w1 - w0) / 1e6;

const f0 = process.hrtime.bigint();
for (let i = 0; i < 10000; i++) {
  evaluateFeedbackQuality({
    action: i % 2 ? 'click' : 'qualified_dwell',
    metadata: { dwellMs: 2000, openDurationMs: 500 }
  });
}
const f1 = process.hrtime.bigint();
const feedbackMs = Number(f1 - f0) / 1e6;

// collab score microbench
const edges = new Map<string, Map<string, number>>();
edges.set('job:c', new Map([['job:d', 40]]));
const collabIndex = { edges, builtAt: Date.now(), cohortOk: true };
const col0 = process.hrtime.bigint();
for (let i = 0; i < 10000; i++) {
  scoreCollaborativeForCandidate({
    candidate: { entityType: 'job', entityId: 'd', source: 'related_job', label: 'd' },
    positiveEntityKeys: new Set(['job:c']),
    index: collabIndex,
    allowed: true
  });
}
const col1 = process.hrtime.bigint();
const collabMs = Number(col1 - col0) / 1e6;

// cold-start persona scoring sample
const coldProfile = { ...profile, coldStart: true, skills: [], topics: [], communities: [], personalizationAllowed: true };
const cold0 = process.hrtime.bigint();
for (let i = 0; i < 1000; i++) {
  scoreCandidate({
    candidate: {
      entityType: 'post',
      entityId: `cold${i}`,
      source: 'exploration',
      label: 'Popular post',
      tags: ['general'],
      createdAt: new Date().toISOString(),
      baseFeatures: { completeness: 0.7, engagement: 0.8 }
    },
    profile: coldProfile,
    seed: i
  });
}
const cold1 = process.hrtime.bigint();
const coldMs = Number(cold1 - cold0) / 1e6;

const mem = process.memoryUsage();
const report = {
  scoreIterations: N,
  scoreTotalMs: Number(scoreMs.toFixed(3)),
  scorePerOpUs: Number(((scoreMs * 1000) / N).toFixed(3)),
  diversity200x200Ms: Number(diversityMs.toFixed(3)),
  diversityPerRerankMs: Number((diversityMs / 200).toFixed(3)),
  cacheOps: 20000,
  cacheTotalMs: Number(cacheMs.toFixed(3)),
  cacheHits: hits,
  cacheMisses: misses,
  cacheHitRatio: Number((hits / (hits + misses)).toFixed(4)),
  cacheStats: discoveryCache.stats(),
  eligibility100x1000Ms: Number(eligMs.toFixed(3)),
  cursor2000RoundtripMs: Number(cursorMs.toFixed(3)),
  cursorPerOpUs: Number(((cursorMs * 1000) / 2000).toFixed(3)),
  concurrentWarmGets: 5000,
  concurrentWarmMs: Number(warmMs.toFixed(3)),
  concurrentWarmHits: warmHits,
  feedbackQuality10kMs: Number(feedbackMs.toFixed(3)),
  collabScore10kMs: Number(collabMs.toFixed(3)),
  coldStart1kMs: Number(coldMs.toFixed(3)),
  coldStartPerOpUs: Number(((coldMs * 1000) / 1000).toFixed(3)),
  heapUsedMB: Number((mem.heapUsed / 1024 / 1024).toFixed(2)),
  rssMB: Number((mem.rss / 1024 / 1024).toFixed(2)),
  rolloutMaster: resolveDiscoveryRolloutFlags().master,
  surfaceEnabled: isDiscoverySurfaceEnabled('discovery'),
  coverage: getGeneratorCoverageMatrix(),
  totalBenchMs: Date.now() - start
};

console.log(JSON.stringify(report, null, 2));
