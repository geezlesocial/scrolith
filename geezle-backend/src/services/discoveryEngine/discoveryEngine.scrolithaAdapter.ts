/**
 * Optional Scrolitha assist adapter — provider-neutral interface.
 * Does NOT import unmerged Phase 7 Scrolitha modules.
 * When DISCOVERY_ENGINE_SCROLITHA=true and a future adapter is registered, it may
 * supply soft ranking hints. Default: no-op.
 */
import type { RecommendationCandidate } from './discoveryEngine.types';
import { resolveDiscoveryRolloutFlags } from './discoveryEngine.rollout';

export type ScrolithaDiscoveryHint = {
  entityType: string;
  entityId: string;
  boost: number;
  reason?: string;
};

export type ScrolithaDiscoveryAdapter = {
  name: string;
  getHints: (input: {
    viewerId: string | null;
    surface: string;
    candidates: RecommendationCandidate[];
  }) => Promise<ScrolithaDiscoveryHint[]>;
};

let registered: ScrolithaDiscoveryAdapter | null = null;

/** Future Phase 7+ integration point */
export const registerScrolithaDiscoveryAdapter = (adapter: ScrolithaDiscoveryAdapter | null) => {
  registered = adapter;
};

export const getScrolithaDiscoveryHints = async (input: {
  viewerId: string | null;
  surface: string;
  candidates: RecommendationCandidate[];
}): Promise<ScrolithaDiscoveryHint[]> => {
  const flags = resolveDiscoveryRolloutFlags();
  if (!flags.master || !flags.scrolithaAssist) return [];
  if (!registered) return [];
  try {
    const hints = await registered.getHints(input);
    return Array.isArray(hints) ? hints.slice(0, 40) : [];
  } catch {
    return [];
  }
};

export const applyScrolithaHints = (
  scores: Map<string, number>,
  hints: ScrolithaDiscoveryHint[]
) => {
  for (const h of hints) {
    const key = `${h.entityType}:${h.entityId}`.toLowerCase();
    const boost = Math.max(-0.15, Math.min(0.15, Number(h.boost) || 0));
    scores.set(key, Math.max(0, Math.min(1.2, (scores.get(key) || 0) + boost)));
  }
};
