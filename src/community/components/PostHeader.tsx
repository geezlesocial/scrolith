import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import FollowButton from './FollowButton';
import VerifiedBadge from '../../components/common/VerifiedBadge';
import EnterpriseAvatar from '../../components/common/EnterpriseAvatar';
import PublicAvailabilityStatus from '../../components/common/PublicAvailabilityStatus';
import {
  identityTrustStateLabel,
  resolveIdentityTrustState,
  resolveVerificationLevel
} from '../../utils/verification';
import {
  postCardAvatarClass,
  postCardFollowButtonClass,
  postCardHeaderClass,
  postCardHeaderMainClass,
  postCardHeaderRightClass,
  postCardHeaderRowClass,
  postCardType
} from '../../components/enterprise/postCardDesign';

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
  kycStatus?: string | null;
  kyc_status?: string | null;
  verificationStatus?: string | null;
  verification_status?: string | null;
  availability?: any;
  hiring?: any;
  availableForHire?: boolean;
  weAreHiring?: boolean;
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
 * Enterprise post header — fixed avatar, truncated name/username, fixed right cluster.
 * Shared by member-home, /community, and mobile feed shells.
 *
 * Layout: Avatar | Name + Username + Date | Spacer | Following | More
 * Following badge never moves vertically; long usernames truncate.
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
  const identityTrustState = resolveIdentityTrustState(author);
  const authorHandle = String(author.username || '').trim().replace(/^@+/, '');
  const normalizeIdentity = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  // Some API projections use a display name as the username fallback. Do not
  // render that same identity twice in a compact post header.
  const showAuthorHandle = Boolean(authorHandle) && normalizeIdentity(authorHandle) !== normalizeIdentity(authorName);
  const headline = String(author.headline || '').trim();
  const formattedCreatedAt = formatPostHeaderTimestamp(createdAt);
  const isBusinessAuthor = authorType === 'business' || authorType === 'page' || authorType === 'company';
  const canShowFollow =
    showFollow &&
    Boolean(author.id) &&
    (isBusinessAuthor || (authorType === 'user' && String(author.id || '') !== String(currentUserId || '')));

  return (
    <header className={postCardHeaderClass} data-testid="post-header">
      <Link
        to={profileUrl}
        aria-label={`${authorName} profile`}
        className={postCardAvatarClass}
      >
        <EnterpriseAvatar
          user={author}
          name={authorName}
          src={author.avatarUrl}
          availableForHire={author.availableForHire}
          weAreHiring={author.weAreHiring}
          accountType={author.type}
          size="lg"
          className="!h-full !w-full"
          alt={`${authorName} avatar`}
        />
      </Link>

      <div className={postCardHeaderMainClass}>
        {sponsoredLabel ? <div className="mb-1.5">{sponsoredLabel}</div> : null}

        <div className={postCardHeaderRowClass}>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-x-1.5 gap-y-0.5">
              <Link
                to={profileUrl}
                className={`block min-w-0 max-w-full truncate hover:text-slate-700 ${postCardType.name}`}
                title={authorName}
              >
                {authorName}
              </Link>
              {verificationLevel && identityTrustState === 'verified' ? (
                <VerifiedBadge
                  level={verificationLevel}
                  size={16}
                  className="shrink-0"
                  subjectType={author.type || 'user'}
                  subjectRole={authorType === 'business' ? 'business' : 'user'}
                />
              ) : null}
              {identityTrustState === 'pending' || identityTrustState === 'needs_action' ? (
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    identityTrustState === 'pending'
                      ? 'bg-amber-50 text-amber-700'
                      : identityTrustState === 'needs_action'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                  title={identityTrustStateLabel(identityTrustState)}
                >
                  {identityTrustStateLabel(identityTrustState)}
                </span>
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
              <PublicAvailabilityStatus
                availableForHire={author.availableForHire}
                weAreHiring={author.weAreHiring}
                accountType={author.type}
                compact
              />
            </div>

            {showAuthorHandle ? (
              <p className={`mt-0.5 max-w-full truncate ${postCardType.username}`} title={`@${authorHandle}`}>
                @{authorHandle}
              </p>
            ) : null}

            {headline ? (
              <p className="mt-0.5 line-clamp-1 text-[13px] leading-snug text-slate-600" title={headline}>
                {headline}
              </p>
            ) : null}

            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <time className={`whitespace-nowrap ${postCardType.date}`} dateTime={createdAt || undefined}>
                {formattedCreatedAt}
              </time>
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

          <div className={postCardHeaderRightClass}>
            {canShowFollow ? (
              <FollowButton
                targetUserId={author.id}
                targetType={isBusinessAuthor ? 'page' : 'user'}
                currentUserId={currentUserId}
                initialIsFollowing={initialIsFollowing}
                onRequireLogin={onRequireLogin}
                onSuccess={onFollowSuccess}
                onError={onFollowError}
                className={postCardFollowButtonClass}
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
