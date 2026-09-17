/**
 * Ranking pipeline v8.1: generate → eligibility → score → diversity → explain → page.
 */
import { createHash, createHmac, randomUUID } from 'crypto';
import type {
  DiscoveryEntityType,
  DiscoveryRecommendationRequest,
  DiscoveryRecommendationResponse,
  DiscoverySurface,
  RankedRecommendation,
  RecommendationCandidate
} from './discoveryEngine.types';
import { ALL_ENTITY_TYPES, DISCOVERY_MODEL_VERSION } from './discoveryEngine.types';
import { isDiscoverySurfaceEnabled, resolveDiscoveryRolloutFlags } from './discoveryEngine.rollout';
import { buildViewerInterestProfile } from './discoveryEngine.interest';
import { getDiscoveryPrivacyControls, loadBlockedUserIds } from './discoveryEngine.privacy';
import { runAllGenerators, type GeneratorContext } from './discoveryEngine.generators';
import { scoreCandidate, combineScores } from './discoveryEngine.scoring';
import { applyDiversityPolicy, DIVERSITY_POLICY_VERSION } from './discoveryEngine.diversity';
import { buildExplanation, buildTrackingToken } from './discoveryEngine.explain';
import { loadNegativeKeys, loadPositiveAffinity } from './discoveryEngine.feedback';
import { getScrolithaDiscoveryHints, applyScrolithaHints } from './discoveryEngine.scrolithaAdapter';
import { logDiscoveryLifecycle, recordDiscoveryMetric } from './discoveryEngine.observability';
import { discoveryCache } from './discoveryEngine.cache';
import { filterEligibleCandidates } from './discoveryEngine.eligibility';
import { loadRelationshipContext, scoreRelationshipFeatures } from './discoveryEngine.relationship';
import {
  buildCollaborativeIndex,
  scoreCollaborativeForCandidate,
  isMeaningfulCollaborative
} from './discoveryEngine.collaborative';
import { buildTrendingScores, applyTrendingFeatures } from './discoveryEngine.trending';
import { DISCOVERY_POLICY_VERSION } from './discoveryEngine.versions';
import { requiredSecret } from '../../utils/security/requiredSecret';

const text = (v: unknown) => String(v || '').trim();
const CURSOR_SECRET = () => String(
  process.env.DISCOVERY_CURSOR_HMAC || requiredSecret('JWT_SECRET', 'discovery-dev-cursor')
).slice(0, 64);

const normalizeSurface = (raw: unknown): DiscoverySurface => {
  const s = text(raw).toLowerCase();
  const allowed: DiscoverySurface[] = [
    'member_home',
    'discovery',
    'who_to_follow',
    'jobs',
    'marketplace',
    'communities',
    'sidebar',
    'search_suggest',
    'onboarding',
    'global'
  ];
  return (allowed.includes(s as DiscoverySurface) ? s : 'discovery') as DiscoverySurface;
};

const normalizeLimit = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 12;
  return Math.max(1, Math.min(40, Math.floor(n)));
};

const parseEntityTypes = (raw?: DiscoveryEntityType[]): Set<DiscoveryEntityType> => {
  if (!raw?.length) {
    return new Set<DiscoveryEntityType>([
      'post',
      'person',
      'job',
      'freelancer',
      'service',
      'community',
      'page',
      'company',
      'marketplace_listing',
      'group',
      'discussion',
      'product'
    ]);
  }
  const set = new Set<DiscoveryEntityType>();
  for (const t of raw) {
    if (ALL_ENTITY_TYPES.includes(t)) set.add(t);
  }
  return set.size ? set : new Set(ALL_ENTITY_TYPES);
};

type CursorState = {
  v: 2;
  o: number;
  s: string[];
  m: string;
  p: string;
  d: string;
  sig?: string;
};

const signCursor = (payload: Omit<CursorState, 'sig'>) => {
  const body = JSON.stringify(payload);
  const sig = createHmac('sha256', CURSOR_SECRET()).update(body).digest('base64url').slice(0, 16);
  return Buffer.from(JSON.stringify({ ...payload, sig }), 'utf8').toString('base64url');
};

export const decodeDiscoveryCursor = (
  raw?: string | null
): { ok: true; state: CursorState } | { ok: false; error: string } => {
  if (!raw) {
    return {
      ok: true,
      state: {
        v: 2,
        o: 0,
        s: [],
        m: DISCOVERY_MODEL_VERSION,
        p: DISCOVERY_POLICY_VERSION,
        d: DIVERSITY_POLICY_VERSION
      }
    };
  }
  try {
    const json = Buffer.from(String(raw), 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (parsed?.v === 1) {
      // legacy soft accept
      return {
        ok: true,
        state: {
          v: 2,
          o: Math.max(0, Number(parsed.o) || 0),
          s: Array.isArray(parsed.s) ? parsed.s.map(String).slice(-200) : [],
          m: DISCOVERY_MODEL_VERSION,
          p: DISCOVERY_POLICY_VERSION,
          d: DIVERSITY_POLICY_VERSION
        }
      };
    }
    const payload: CursorState = {
      v: 2,
      o: Math.max(0, Number(parsed.o) || 0),
      s: Array.isArray(parsed.s) ? parsed.s.map(String).slice(-200) : [],
      m: String(parsed.m || ''),
      p: String(parsed.p || ''),
      d: String(parsed.d || ''),
      sig: parsed.sig
    };
    if (payload.m && payload.m !== DISCOVERY_MODEL_VERSION) {
      return { ok: false, error: 'cursor_model_mismatch' };
    }
    if (payload.sig) {
      const expect = createHmac('sha256', CURSOR_SECRET())
        .update(
          JSON.stringify({
            v: payload.v,
            o: payload.o,
            s: payload.s,
            m: payload.m,
            p: payload.p,
            d: payload.d
          })
        )
        .digest('base64url')
        .slice(0, 16);
      if (expect !== payload.sig) return { ok: false, error: 'cursor_tampered' };
    }
    return { ok: true, state: payload };
  } catch {
    return { ok: false, error: 'cursor_invalid' };
  }
};

export const encodeDiscoveryCursor = (state: Omit<CursorState, 'sig' | 'v'> & { v?: 2 }) =>
  signCursor({
    v: 2,
    o: state.o,
    s: state.s.slice(-200),
    m: state.m || DISCOVERY_MODEL_VERSION,
    p: state.p || DISCOVERY_POLICY_VERSION,
    d: state.d || DIVERSITY_POLICY_VERSION
  });

const candidateKey = (c: RecommendationCandidate) =>
  `${c.entityType}:${c.entityId}`.toLowerCase();

export const runDiscoveryRecommendationPipeline = async (
  input: DiscoveryRecommendationRequest
): Promise<DiscoveryRecommendationResponse> => {
  const started = Date.now();
  const requestId = text(input.requestId) || randomUUID();
  const surface = normalizeSurface(input.surface);
  const limit = normalizeLimit(input.limit);
  const flags = resolveDiscoveryRolloutFlags();

  recordDiscoveryMetric('requests', 1);
  logDiscoveryLifecycle({ requestId, phase: 'start', surface });

  const cursorDecoded = decodeDiscoveryCursor(input.cursor);
  if (cursorDecoded.ok === false) {
    recordDiscoveryMetric('cursor_error', 1);
    const err = new Error(cursorDecoded.error);
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_CURSOR';
    throw err;
  }
  const cursor = cursorDecoded.state;

  if (!isDiscoverySurfaceEnabled(surface)) {
    recordDiscoveryMetric('disabled', 1);
    return {
      items: [],
      nextCursor: null,
      requestId,
      modelVersion: DISCOVERY_MODEL_VERSION,
      generatedAt: new Date().toISOString(),
      fallbackUsed: false,
      surface,
      diagnostics: flags.diagnostics
        ? {
            generatorCounts: {},
            filteredCount: 0,
            scoredCount: 0,
            latencyMs: Date.now() - started,
            generatorsFailed: []
          }
        : undefined
    };
  }

  const privacy = await getDiscoveryPrivacyControls(input.viewerId);
  const viewerKey = input.viewerId || 'anon';
  const cacheHash = createHash('sha256')
    .update(
      JSON.stringify({
        v: DISCOVERY_MODEL_VERSION,
        p: DISCOVERY_POLICY_VERSION,
        d: DIVERSITY_POLICY_VERSION,
        g: discoveryCache.generation,
        viewerId: viewerKey,
        surface,
        types: input.entityTypes || [],
        cursor: input.cursor || '',
        limit,
        q: input.context?.query || '',
        topic: input.context?.topic || '',
        personalization: privacy.personalizationEnabled
      })
    )
    .digest('hex')
    .slice(0, 40);
  // Viewer-scoped prefix enables targeted invalidation without clearing other users.
  const cacheKey = `resp:v:${viewerKey}:${cacheHash}`;

  const cached = discoveryCache.get<DiscoveryRecommendationResponse>(cacheKey);
  if (cached) {
    recordDiscoveryMetric('cache_hit', 1);
    return { ...cached, requestId, generatedAt: new Date().toISOString() };
  }
  recordDiscoveryMetric('cache_miss', 1);

  // In-flight dedupe for identical concurrent cold requests (same response shape).
  const built = await discoveryCache.getOrLoad(cacheKey, 25_000, async () => {
    return buildRecommendationPayload({
      input,
      requestId,
      surface,
      limit,
      flags,
      cursor,
      privacy,
      started
    });
  });

  if (built.requestId !== requestId) {
    // Served from concurrent builder — retag request id for this caller
    return { ...built, requestId, generatedAt: new Date().toISOString() };
  }
  return built;
};

type BuildArgs = {
  input: DiscoveryRecommendationRequest;
  requestId: string;
  surface: DiscoverySurface;
  limit: number;
  flags: ReturnType<typeof resolveDiscoveryRolloutFlags>;
  cursor: { v: 2; o: number; s: string[]; m: string; p: string; d: string; sig?: string };
  privacy: Awaited<ReturnType<typeof getDiscoveryPrivacyControls>>;
  started: number;
};

const buildRecommendationPayload = async (
  args: BuildArgs
): Promise<DiscoveryRecommendationResponse> => {
  const { input, requestId, surface, limit, flags, cursor, privacy, started } = args;

  const [profile, blockedUserIds, negativeKeys, positiveAffinity, rel, collabIndex, trending] =
    await Promise.all([
      buildViewerInterestProfile(input.viewerId),
      loadBlockedUserIds(input.viewerId),
      loadNegativeKeys(input.viewerId),
      loadPositiveAffinity(input.viewerId),
      loadRelationshipContext(input.viewerId),
      buildCollaborativeIndex(),
      buildTrendingScores()
    ]);

  const entityTypes = parseEntityTypes(input.entityTypes);
  const genCtx: GeneratorContext = {
    viewerId: input.viewerId,
    profile,
    blockedUserIds,
    entityTypes,
    limitPerGenerator: Math.max(6, Math.min(20, limit * 2)),
    query: input.context?.query,
    region: input.context?.region
  };

  const generatorResults = await runAllGenerators(genCtx);
  const generatorCounts: Record<string, number> = {};
  const generatorsFailed: string[] = [];
  const merged: RecommendationCandidate[] = [];
  const seen = new Set<string>(cursor.s.map((s) => s.toLowerCase()));

  for (const ex of input.exclusions || []) {
    seen.add(`${ex.entityType}:${ex.entityId}`.toLowerCase());
  }

  for (const gr of generatorResults) {
    generatorCounts[gr.name] = gr.candidates.length;
    if (gr.error) generatorsFailed.push(gr.name);
    if (gr.supported === false) generatorCounts[`${gr.name}:unsupported`] = 0;
    for (const c of gr.candidates) {
      const key = candidateKey(c);
      if (!key || key.endsWith(':')) continue;
      if (seen.has(key)) continue;
      if (c.authorOrOwnerId && blockedUserIds.has(c.authorOrOwnerId)) continue;
      if (negativeKeys.has(key)) continue;
      if (profile.negativeTokens.includes(key)) continue;
      if (!entityTypes.has(c.entityType)) continue;
      seen.add(key);
      merged.push(applyTrendingFeatures(c, trending));
    }
  }

  const { eligible, filteredCount } = filterEligibleCandidates(merged, {
    viewerId: input.viewerId,
    blockedUserIds
  });

  const positiveKeys = new Set(positiveAffinity.keys());
  const collaborativeAllowed =
    privacy.collaborativeEnabled && privacy.personalizationEnabled && collabIndex.cohortOk;

  const scored = eligible.map((candidate, idx) => {
    const key = candidateKey(candidate);
    const negativeHit = negativeKeys.has(key);
    const positiveAffinityScore = positiveAffinity.get(key) || 0;
    const relFeat = scoreRelationshipFeatures({ candidate, profile, rel });
    const collab = scoreCollaborativeForCandidate({
      candidate,
      positiveEntityKeys: positiveKeys,
      index: collabIndex,
      allowed: collaborativeAllowed
    });

    const result = scoreCandidate({
      candidate,
      profile,
      query: input.context?.query,
      sharedCommunity: relFeat.sharedCommunity,
      followedAuthor: relFeat.followedAuthor,
      relationshipScore: relFeat.score,
      positiveAffinity: positiveAffinityScore,
      negativeHit,
      coEngageScore: collab,
      collaborativeAllowed: collaborativeAllowed && isMeaningfulCollaborative(collab),
      seed: idx + 1 + cursor.o
    });

    if (!privacy.behavioralRankingEnabled) {
      result.components.behavioral = 0.15;
    }
    if (!privacy.personalizationEnabled) {
      result.components.interest = 0.15;
      result.components.content = 0.15;
    }
    // Privacy overrides require a recombine; relationship/trending/collab already finalized in scoreCandidate.
    if (!privacy.behavioralRankingEnabled || !privacy.personalizationEnabled) {
      result.score = combineScores(result.components);
    }

    // Reason labels for graph signals (score thresholds may omit mid-band collaborative).
    if (isMeaningfulCollaborative(collab) && !result.reasonCodes.includes('because_you_engaged')) {
      result.reasonCodes.push('because_you_engaged');
    }

    return {
      candidate,
      score: result.score,
      components: result.components,
      reasonCodes: result.reasonCodes,
      exposedBefore: false
    };
  });

  const hintMap = new Map<string, number>();
  for (const row of scored) hintMap.set(candidateKey(row.candidate), row.score);
  const hints = await getScrolithaDiscoveryHints({
    viewerId: input.viewerId,
    surface,
    candidates: eligible
  });
  applyScrolithaHints(hintMap, hints);
  for (const row of scored) {
    const boosted = hintMap.get(candidateKey(row.candidate));
    if (typeof boosted === 'number') row.score = boosted;
  }

  const diversified = applyDiversityPolicy(scored);
  const ordered = diversified;

  const page = ordered.slice(cursor.o, cursor.o + limit);
  const nextOffset = cursor.o + page.length;
  const hasMore = nextOffset < ordered.length;

  const generatedAt = new Date().toISOString();
  const items: RankedRecommendation[] = page.map((row, index) => {
    const rank = cursor.o + index + 1;
    const reasonCodes = [...(row.reasonCodes || ['new_for_you'])];
    return {
      entityType: row.candidate.entityType,
      entityId: row.candidate.entityId,
      score: Number(row.score.toFixed(4)),
      scoreComponents: input.includeDebug ? row.components : undefined,
      explanation: buildExplanation(reasonCodes as any, privacy.showExplanations),
      reasonCodes: reasonCodes as any,
      source: row.candidate.source,
      rank,
      trackingToken: buildTrackingToken({
        requestId,
        entityType: row.candidate.entityType,
        entityId: row.candidate.entityId,
        rank
      }),
      generatedAt,
      label: row.candidate.label || row.candidate.entityId,
      summary: row.candidate.summary,
      hrefHint: row.candidate.hrefHint,
      category: row.candidate.category,
      authorOrOwnerId: row.candidate.authorOrOwnerId
    };
  });

  const fallbackUsed = items.length === 0 && eligible.length > 0;
  if (fallbackUsed) recordDiscoveryMetric('fallback', 1);
  if (!items.length) recordDiscoveryMetric('empty', 1);
  else recordDiscoveryMetric('success', 1);

  const response: DiscoveryRecommendationResponse = {
    items,
    nextCursor: hasMore
      ? encodeDiscoveryCursor({
          o: nextOffset,
          s: [...cursor.s, ...page.map((p) => candidateKey(p.candidate))].slice(-200),
          m: DISCOVERY_MODEL_VERSION,
          p: DISCOVERY_POLICY_VERSION,
          d: DIVERSITY_POLICY_VERSION
        })
      : null,
    requestId,
    modelVersion: DISCOVERY_MODEL_VERSION,
    generatedAt,
    fallbackUsed,
    surface,
    diagnostics:
      flags.diagnostics && (input.includeDebug || process.env.NODE_ENV !== 'production')
        ? {
            generatorCounts,
            filteredCount: filteredCount + (merged.length - eligible.length),
            scoredCount: scored.length,
            latencyMs: Date.now() - started,
            generatorsFailed
          }
        : undefined
  };

  logDiscoveryLifecycle({
    requestId,
    phase: 'complete',
    surface,
    latencyMs: Date.now() - started,
    itemCount: items.length,
    fallbackUsed,
    generatorsFailed: generatorsFailed.length
  });
  // Caller (getOrLoad) persists to cache under the viewer-scoped key.
  return response;
};
