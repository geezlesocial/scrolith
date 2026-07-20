import React from 'react';
import { Users } from 'lucide-react';
import type { CommunityClub } from '../../../types';
import {
  communityCardMetrics,
  communityRadius,
  communitySurface,
  communityTouchTargets,
  communityTypography
} from '../../design/communityTokens';
import CommunityBadge from './CommunityBadge';

type Props = {
  community: CommunityClub;
  active?: boolean;
  onSelect?: (community: CommunityClub) => void;
  onJoin?: (community: CommunityClub) => void;
  onLeave?: (community: CommunityClub) => void;
  busy?: boolean;
};

const CommunityCard: React.FC<Props> = ({
  community,
  active = false,
  onSelect,
  onJoin,
  onLeave,
  busy = false
}) => {
  const isPrivate = String(community.visibility || '').toLowerCase() === 'private';
  const joined = Boolean(community.isJoined);
  const pending = Boolean(community.pendingRequest || community.pendingInvite);
  const description = String(community.summary || community.description || '').trim();
  const memberCount = Number(community.memberCount || 0);

  return (
    <article
      className={`${communityRadius.card} border ${communitySurface.panel} overflow-hidden ${
        active ? 'border-indigo-300 bg-indigo-50/40 shadow-sm ring-1 ring-indigo-100' : `${communitySurface.border} hover:border-slate-300`
      } transition`}
      data-testid="community-card"
      data-community-id={community.id}
    >
      <button
        type="button"
        onClick={() => onSelect?.(community)}
        className="block w-full text-left"
        aria-current={active ? 'true' : undefined}
        aria-label={`${community.name}${joined ? ', joined' : ''}`}
      >
        <div className={`${communityCardMetrics.coverAspect} relative bg-gradient-to-br from-slate-100 via-indigo-50 to-sky-100`}>
          {community.coverImage ? (
            <img
              src={community.coverImage}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : null}
          <div className="absolute bottom-3 left-3 flex items-end gap-2">
            <div
              className={`${communityCardMetrics.avatar} overflow-hidden rounded-2xl border-2 border-white bg-white/90 shadow`}
            >
              {community.avatarImage ? (
                <img src={community.avatarImage} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <Users className="h-5 w-5" aria-hidden />
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="space-y-2 p-3.5 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className={`min-w-0 truncate ${communityTypography.cardTitle}`}>{community.name}</h3>
            {joined ? (
              <CommunityBadge variant="joined">Joined</CommunityBadge>
            ) : pending ? (
              <CommunityBadge variant="pending">Pending</CommunityBadge>
            ) : null}
          </div>
          {description ? (
            <p className="line-clamp-2 text-sm leading-5 text-slate-600" title={description}>
              {description}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <CommunityBadge variant={isPrivate ? 'private' : 'public'} icon={isPrivate ? 'private' : 'public'}>
              {isPrivate ? 'Private' : 'Public'}
            </CommunityBadge>
            <CommunityBadge variant="category" icon="members">
              {memberCount} members
            </CommunityBadge>
            {community.category ? <CommunityBadge variant="category">{community.category}</CommunityBadge> : null}
            {community.membershipRole ? (
              <CommunityBadge variant="role" icon="role">
                {String(community.membershipRole)}
              </CommunityBadge>
            ) : null}
          </div>
        </div>
      </button>
      {!joined && !pending && onJoin ? (
        <div className="border-t border-slate-100 px-3.5 py-2.5 sm:px-4">
          <button
            type="button"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onJoin(community);
            }}
            className={`w-full ${communityTouchTargets.action} rounded-full bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60`}
          >
            {busy ? 'Joining…' : isPrivate ? 'Request to join' : 'Join'}
          </button>
        </div>
      ) : null}
      {joined && onLeave ? (
        <div className="border-t border-slate-100 px-3.5 py-2.5 sm:px-4">
          <button
            type="button"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onLeave(community);
            }}
            className={`w-full ${communityTouchTargets.action} rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60`}
          >
            {busy ? 'Updating…' : 'Leave'}
          </button>
        </div>
      ) : null}
    </article>
  );
};

export default CommunityCard;
