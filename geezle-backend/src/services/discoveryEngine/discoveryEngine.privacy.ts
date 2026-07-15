/**
 * Privacy controls for discovery personalization.
 * Uses existing user preference JSON when present; fail-open to generic when off.
 */
import prisma from '../../utils/prismaClient';
import { discoveryCache } from './discoveryEngine.cache';

export type DiscoveryPrivacyControls = {
  personalizationEnabled: boolean;
  interestTrackingEnabled: boolean;
  behavioralRankingEnabled: boolean;
  collaborativeEnabled: boolean;
  showExplanations: boolean;
};

export const DEFAULT_DISCOVERY_PRIVACY: DiscoveryPrivacyControls = {
  personalizationEnabled: true,
  interestTrackingEnabled: true,
  behavioralRankingEnabled: true,
  collaborativeEnabled: true,
  showExplanations: true
};

const text = (v: unknown) => String(v || '').trim();

export const getDiscoveryPrivacyControls = async (
  viewerId: string | null
): Promise<DiscoveryPrivacyControls> => {
  if (!viewerId) {
    return {
      ...DEFAULT_DISCOVERY_PRIVACY,
      personalizationEnabled: false,
      interestTrackingEnabled: false,
      behavioralRankingEnabled: false,
      collaborativeEnabled: false
    };
  }
  const cacheKey = `privacy:${viewerId}`;
  const cached = discoveryCache.get<DiscoveryPrivacyControls>(cacheKey);
  if (cached) return cached;

  try {
    // Prefer scrolitha preference metadata if table exists; soft-fail otherwise
    const pref = await (prisma as any).scrolithaUserPreference
      ?.findUnique?.({
        where: { userId: viewerId },
        select: { metadata: true }
      })
      .catch?.(() => null);

    const meta =
      pref?.metadata && typeof pref.metadata === 'object' && !Array.isArray(pref.metadata)
        ? (pref.metadata as Record<string, any>)
        : {};
    const discovery = meta.discoveryPrivacy || meta.privacyControls || {};
    const controls: DiscoveryPrivacyControls = {
      personalizationEnabled:
        discovery.personalizationEnabled !== undefined
          ? Boolean(discovery.personalizationEnabled)
          : DEFAULT_DISCOVERY_PRIVACY.personalizationEnabled,
      interestTrackingEnabled:
        discovery.interestTrackingEnabled !== undefined
          ? Boolean(discovery.interestTrackingEnabled)
          : DEFAULT_DISCOVERY_PRIVACY.interestTrackingEnabled,
      behavioralRankingEnabled:
        discovery.behavioralRankingEnabled !== undefined
          ? Boolean(discovery.behavioralRankingEnabled)
          : DEFAULT_DISCOVERY_PRIVACY.behavioralRankingEnabled,
      collaborativeEnabled:
        discovery.collaborativeEnabled !== undefined
          ? Boolean(discovery.collaborativeEnabled)
          : DEFAULT_DISCOVERY_PRIVACY.collaborativeEnabled,
      showExplanations:
        discovery.showExplanations !== undefined
          ? Boolean(discovery.showExplanations)
          : DEFAULT_DISCOVERY_PRIVACY.showExplanations
    };
    discoveryCache.set(cacheKey, controls, 30_000);
    return controls;
  } catch {
    return { ...DEFAULT_DISCOVERY_PRIVACY };
  }
};

export const isBlockedPair = async (viewerId: string, otherId: string): Promise<boolean> => {
  if (!viewerId || !otherId || viewerId === otherId) return false;
  try {
    const block = await (prisma as any).userBlock?.findFirst?.({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: otherId },
          { blockerId: otherId, blockedId: viewerId }
        ]
      },
      select: { id: true }
    });
    return Boolean(block);
  } catch {
    return false;
  }
};

export const loadBlockedUserIds = async (viewerId: string | null): Promise<Set<string>> => {
  const out = new Set<string>();
  if (!viewerId) return out;
  try {
    const rows = await (prisma as any).userBlock?.findMany?.({
      where: {
        OR: [{ blockerId: viewerId }, { blockedId: viewerId }]
      },
      select: { blockerId: true, blockedId: true },
      take: 500
    });
    for (const row of rows || []) {
      if (row.blockerId === viewerId) out.add(row.blockedId);
      if (row.blockedId === viewerId) out.add(row.blockerId);
    }
  } catch {
    // optional
  }
  return out;
};

export const privacySafeExplanation = (textIn: string, show: boolean) => {
  if (!show) return 'Recommended for you';
  return text(textIn).slice(0, 160) || 'Recommended for you';
};
