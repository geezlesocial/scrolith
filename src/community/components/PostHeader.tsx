import React from 'react';
import { ShieldCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import FollowButton from './FollowButton';
import VerifiedBadge from '../../components/common/VerifiedBadge';
import { resolveVerificationLevel } from '../../utils/verification';

type PostHeaderAuthor = {
  id?: string | null;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  type?: string | null;
  businessSlug?: string | null;
  isVerified?: boolean;
  isPro?: boolean;
  verificationLevel?: string | null;
  verification_level?: string | null;
  /** Optional professional headline / context line */
  headline?: string | null;
};

type PostHeaderProps = {
  author: PostHeaderAuthor;
  createdAt?: string | null;
  currentUserId?: string | null;
  initialIsFollowing?: boolean;
  showFollow?: boolean;
  metaBadges?: React.ReactNode;
  rightSlot?: React.ReactNode;
  /** Extra quiet metadata (audience, privacy, community) */
  secondaryMeta?: React.ReactNode;
  sponsoredLabel?: React.ReactNode;
  onRequireLogin?: () => void;
  onFollowSuccess?: (isFollowing: boolean) => void;
  onFollowError?: (message: string) => void;
};

const resolveProfileUrl = (author: PostHeaderAuthor, currentUserId?: string | null) => {
  const type = String(author.type || 'user').toLowerCase();
  const businessSlug = String(author.businessSlug || '').trim();
  if (type === 'business' && businessSlug) return `/company/${businessSlug}`;

  const handle = String(author.username || '').trim().replace(/^@+/, '');
  if (handle) return `/u/${handle}`;

  const id = String(author.id || '').trim();
  if (id) return `/profile/${id}`;

  if (currentUserId) return `/profile/${currentUserId}`;
  return '/profile/edit';
};

const formatPostHeaderTimestamp = (createdAt?: string | null) => {
  if (!createdAt) return 'Just now';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

/**
 * Enterprise post header — stable avatar, strong author name, quiet metadata.
 * Shared by member-home and /community.
 */
const PostHeader: React.FC<PostHeaderProps> = ({
  author,
  createdAt,
  currentUserId,
  initialIsFollowing,
  showFollow = true,
  metaBadges,
  rightSlot,
  secondaryMeta,
  sponsoredLabel,
  onRequireLogin,
  onFollowSuccess,
  onFollowError
}) => {
  const profileUrl = resolveProfileUrl(author, currentUserId);
  const authorName = author.displayName || 'Community member';
  const authorType = String(author.type || 'user').toLowerCase();
  const verificationLevel = resolveVerificationLevel(author);
  const authorHandle = String(author.username || '').trim().replace(/^@+/, '');
  const headline = String(author.headline || '').trim();
  const formattedCreatedAt = formatPostHeaderTimestamp(createdAt);
  const isBusinessAuthor = authorType === 'business' || authorType === 'page' || authorType === 'company';
  const canShowFollow =
    showFollow &&
    Boolean(author.id) &&
    (isBusinessAuthor || (authorType === 'user' && String(author.id || '') !== String(currentUserId || '')));

  return (
    <header className="flex min-w-0 items-start gap-3 sm:gap-3.5">
      <Link
        to={profileUrl}
        aria-label={`${authorName} profile`}
        className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-sm sm:h-14 sm:w-14"
      >
        {author.avatarUrl ? (
          <img
            src={author.avatarUrl}
            alt=""
            className="h-full w-full object-cover"
            width={56}
            height={56}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <Users className="mx-auto mt-3 h-5 w-5 text-slate-400 sm:mt-3.5 sm:h-6 sm:w-6" aria-hidden="true" />
        )}
      </Link>

      <div className="min-w-0 flex-1 pt-0.5">
        {sponsoredLabel ? <div className="mb-1.5">{sponsoredLabel}</div> : null}

        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
              <Link
                to={profileUrl}
                className="block min-w-0 max-w-full truncate text-[15px] font-semibold leading-snug text-slate-950 hover:text-slate-700 sm:text-base"
                title={authorName}
              >
                {authorName}
              </Link>
              {verificationLevel ? (
                <VerifiedBadge
                  level={verificationLevel}
                  size={16}
                  className="shrink-0"
                  subjectType={author.type || 'user'}
                  subjectRole={authorType === 'business' ? 'business' : 'user'}
                />
              ) : null}
              {author.isPro ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700"
                  title="Professional account"
                >
                  <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                  Pro
                </span>
              ) : null}
            </div>

            {headline ? (
              <p className="mt-0.5 line-clamp-1 text-sm leading-snug text-slate-600" title={headline}>
                {headline}
              </p>
            ) : null}

            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-snug text-slate-500 sm:text-[13px]">
              <time className="whitespace-nowrap font-medium text-slate-500" dateTime={createdAt || undefined}>
                {formattedCreatedAt}
              </time>
              {authorHandle ? (
                <span className="max-w-[12rem] truncate text-slate-500" title={`@${authorHandle}`}>
                  · @{authorHandle}
                </span>
              ) : null}
              {authorType === 'business' ? (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                  Page
                </span>
              ) : null}
              {secondaryMeta}
            </div>

            {metaBadges ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">{metaBadges}</div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
            {canShowFollow ? (
              <FollowButton
                targetUserId={author.id}
                targetType={isBusinessAuthor ? 'page' : 'user'}
                currentUserId={currentUserId}
                initialIsFollowing={initialIsFollowing}
                onRequireLogin={onRequireLogin}
                onSuccess={onFollowSuccess}
                onError={onFollowError}
                className="h-9 min-h-9 border-slate-200 bg-white px-3.5 text-xs font-semibold uppercase tracking-wide text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
              />
            ) : null}
            {rightSlot}
          </div>
        </div>
      </div>
    </header>
  );
};

export default PostHeader;
