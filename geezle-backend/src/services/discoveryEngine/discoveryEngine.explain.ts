/**
 * Safe user-facing explanations — never expose private signals or raw scores.
 */
import type { DiscoveryReasonCode } from './discoveryEngine.types';

const REASON_COPY: Record<DiscoveryReasonCode, string> = {
  shared_interest: 'Matches topics and skills on your profile',
  shared_community: 'Recommended because you share professional communities',
  followed_similar: 'From people and pages related to who you follow',
  trending_now: 'Trending with quality engagement right now',
  high_quality: 'Strong profile or listing quality signals',
  fresh_content: 'Recently updated or published',
  skills_match: 'Aligns with your skills and categories',
  location_affinity: 'Relevant to your region',
  popular_in_network: 'Popular with people in your network',
  new_for_you: 'New discovery for you',
  because_you_engaged: 'Similar to content you engaged with',
  exploration: 'A diverse pick to broaden your feed',
  cold_start: 'Popular starting points for new members'
};

export const buildExplanation = (
  reasonCodes: DiscoveryReasonCode[],
  showExplanations: boolean
): string => {
  if (!showExplanations) return 'Recommended for you';
  const primary = reasonCodes[0] || 'new_for_you';
  const secondary = reasonCodes[1];
  if (secondary && secondary !== primary) {
    return `${REASON_COPY[primary]}. ${REASON_COPY[secondary]}.`.slice(0, 160);
  }
  return REASON_COPY[primary] || 'Recommended for you';
};

export const buildTrackingToken = (input: {
  requestId: string;
  entityType: string;
  entityId: string;
  rank: number;
}): string => {
  const raw = `${input.requestId}|${input.entityType}|${input.entityId}|${input.rank}`;
  // Opaque-ish token without secrets
  return Buffer.from(raw).toString('base64url').slice(0, 64);
};
