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
};

type PostHeaderProps = {
  author: PostHeaderAuthor;
  createdAt?: string | null;
  currentUserId?: string | null;
  initialIsFollowing?: boolean;
  showFollow?: boolean;
  metaBadges?: React.ReactNode;
  rightSlot?: React.ReactNode;
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

const PostHeader: React.FC<PostHeaderProps> = ({
  author,
  createdAt,
  currentUserId,
  initialIsFollowing,
  showFollow = true,
  metaBadges,
  rightSlot,
  onRequireLogin,
  onFollowSuccess,
  onFollowError
}) => {
  const profileUrl = resolveProfileUrl(author, currentUserId);
  const authorName = author.displayName || 'Community member';
  const authorType = String(author.type || 'user').toLowerCase();
  const verificationLevel = resolveVerificationLevel(author);
  const authorHandle = String(author.username || '').trim().replace(/^@+/, '');
  const formattedCreatedAt = createdAt
    ? `${new Date(createdAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric'
      })} • ${new Date(createdAt).toLocaleString(undefined, {
        hour: 'numeric',
        minute: '2-digit'
      })}`
    : 'Just now';
  const canShowFollow =
    showFollow &&
    authorType === 'user' &&
    Boolean(author.id) &&
    String(author.id || '') !== String(currentUserId || '');

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <Link
          to={profileUrl}
          className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[18px] border border-slate-200 bg-gradient-to-br from-slate-100 via-white to-slate-50 shadow-sm ring-1 ring-white sm:h-14 sm:w-14 sm:rounded-[22px]"
        >
          {author.avatarUrl ? (
            <img src={author.avatarUrl} alt={authorName} className="h-full w-full object-cover" />
          ) : (
            <Users className="mx-auto mt-3 h-5 w-5 text-slate-400 sm:mt-4 sm:h-6 sm:w-6" />
          )}
        </Link>
        <div className="min-w-0 pt-0.5">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5">
            <Link to={profileUrl} className="text-sm font-semibold leading-6 text-slate-950 hover:text-slate-700 sm:text-[15px]">
              {authorName}
            </Link>
            {verificationLevel ? (
              <VerifiedBadge
                level={verificationLevel}
                size={18}
                className="ml-1"
                subjectType={author.type || 'user'}
                subjectRole={authorType === 'business' ? 'business' : 'user'}
              />
            ) : null}
            {author.isPro ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700"
                title="Professional account"
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Pro
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 sm:gap-2 sm:text-xs">
            <span className="font-medium text-slate-600">{formattedCreatedAt}</span>
            {authorHandle ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                @{authorHandle}
              </span>
            ) : null}
            {authorType === 'business' ? (
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                Business Page
              </span>
            ) : null}
          </div>
          {metaBadges ? <div className="mt-2 flex flex-wrap items-center gap-2">{metaBadges}</div> : null}
        </div>
      </div>
      <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:items-start">
        {canShowFollow ? (
          <FollowButton
            targetUserId={author.id}
            currentUserId={currentUserId}
            initialIsFollowing={initialIsFollowing}
            onRequireLogin={onRequireLogin}
            onSuccess={onFollowSuccess}
            onError={onFollowError}
            className="h-9 border-slate-200 bg-white px-3.5 text-[11px] uppercase tracking-[0.16em] text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
          />
        ) : null}
        {rightSlot}
      </div>
    </div>
  );
};

export default PostHeader;
