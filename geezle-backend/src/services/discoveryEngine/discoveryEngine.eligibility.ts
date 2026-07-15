/**
 * Domain-specific eligibility — ranking must never restore ineligible entities.
 */
import type { DiscoveryEntityType, RecommendationCandidate } from './discoveryEngine.types';

export type EligibilityResult = {
  eligible: boolean;
  reasons: string[];
};

const text = (v: unknown) => String(v || '').trim().toLowerCase();

const isPublicVisibility = (v?: string | null) => {
  const x = text(v);
  return !x || x === 'public' || x === 'open' || x === 'everyone';
};

export const evaluateCandidateEligibility = (
  candidate: RecommendationCandidate,
  ctx: {
    viewerId: string | null;
    blockedUserIds: Set<string>;
    mutedUserIds?: Set<string>;
  }
): EligibilityResult => {
  const reasons: string[] = [];
  const owner = candidate.authorOrOwnerId || '';
  const f = candidate.baseFeatures || {};

  if (!candidate.entityId) {
    return { eligible: false, reasons: ['missing_id'] };
  }

  if (owner && ctx.blockedUserIds.has(owner)) {
    return { eligible: false, reasons: ['blocked'] };
  }
  if (owner && ctx.mutedUserIds?.has(owner)) {
    return { eligible: false, reasons: ['muted'] };
  }
  if (owner && ctx.viewerId && owner === ctx.viewerId) {
    // Self content can appear in some feeds but not as discovery recommendation
    return { eligible: false, reasons: ['self'] };
  }

  if (f.active === false || f.isActive === false) reasons.push('inactive');
  if (f.suspended === true || f.isSuspended === true) reasons.push('suspended');
  if (f.deleted === true || f.isDeleted === true) reasons.push('deleted');
  if (f.expired === true || f.isExpired === true) reasons.push('expired');
  if (f.moderationExcluded === true) reasons.push('moderation');
  if (f.hidden === true) reasons.push('hidden');
  if (f.available === false) reasons.push('unavailable');

  const type = candidate.entityType as DiscoveryEntityType;
  switch (type) {
    case 'post':
    case 'discussion': {
      if (!isPublicVisibility(candidate.visibility)) reasons.push('visibility');
      if (f.status && !['active', 'published', 'approved'].includes(text(String(f.status)))) {
        reasons.push('status');
      }
      break;
    }
    case 'person':
    case 'freelancer': {
      if (f.discoverable === false) reasons.push('not_discoverable');
      if (f.profilePrivate === true) reasons.push('private_profile');
      break;
    }
    case 'job': {
      if (f.filled === true || f.closed === true) reasons.push('closed');
      if (f.isVisible === false) reasons.push('not_visible');
      break;
    }
    case 'service':
    case 'product':
    case 'marketplace_listing': {
      if (f.sold === true) reasons.push('sold');
      if (f.quantity === 0) reasons.push('out_of_stock');
      if (f.reviewStatus && !['approved', 'active', 'published'].includes(text(String(f.reviewStatus)))) {
        reasons.push('review_status');
      }
      break;
    }
    case 'community':
    case 'group': {
      if (f.status && text(String(f.status)) === 'deleted') reasons.push('deleted');
      if (candidate.visibility && !isPublicVisibility(candidate.visibility) && f.member !== true) {
        reasons.push('private_community');
      }
      break;
    }
    case 'company':
    case 'page': {
      if (f.status && !['active', 'published'].includes(text(String(f.status)))) {
        reasons.push('status');
      }
      break;
    }
    case 'event':
    case 'course':
    case 'project': {
      if (f.supported === false) reasons.push('unsupported_domain');
      break;
    }
    default:
      break;
  }

  return { eligible: reasons.length === 0, reasons };
};

export const filterEligibleCandidates = (
  candidates: RecommendationCandidate[],
  ctx: {
    viewerId: string | null;
    blockedUserIds: Set<string>;
    mutedUserIds?: Set<string>;
  }
): { eligible: RecommendationCandidate[]; filteredCount: number } => {
  const eligible: RecommendationCandidate[] = [];
  let filteredCount = 0;
  for (const c of candidates) {
    const result = evaluateCandidateEligibility(c, ctx);
    if (!result.eligible) {
      filteredCount += 1;
      continue;
    }
    eligible.push({
      ...c,
      eligibility: { visible: true, reasons: [] }
    });
  }
  return { eligible, filteredCount };
};
