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
  const canShowFollow =
    showFollow &&
    authorType === 'user' &&
    Boolean(author.id) &&
    String(author.id || '') !== String(currentUserId || '');

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <Link to={profileUrl} className="h-12 w-12 overflow-hidden rounded-2xl bg-slate-100">
          {author.avatarUrl ? (
            <img src={author.avatarUrl} alt={authorName} className="h-full w-full object-cover" />
          ) : (
            <Users className="mx-auto mt-3 h-6 w-6 text-slate-400" />
          )}
        </Link>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={profileUrl} className="text-sm font-semibold text-slate-900 hover:text-slate-700">
              {authorName}
            </Link>
            {verificationLevel ? <VerifiedBadge level={verificationLevel} size={18} className="ml-1" /> : null}
            {author.isPro ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700"
                title="Professional account"
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Pro
              </span>
            ) : null}
            {metaBadges}
          </div>
          <p className="text-xs text-slate-500">{createdAt ? new Date(createdAt).toLocaleString() : 'Just now'}</p>
        </div>
      </div>
      <div className="flex items-start gap-2">
        {canShowFollow ? (
          <FollowButton
            targetUserId={author.id}
            currentUserId={currentUserId}
            initialIsFollowing={initialIsFollowing}
            onRequireLogin={onRequireLogin}
            onSuccess={onFollowSuccess}
            onError={onFollowError}
          />
        ) : null}
        {rightSlot}
      </div>
    </div>
  );
};

export default PostHeader;
