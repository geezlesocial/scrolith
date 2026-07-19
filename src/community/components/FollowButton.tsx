import React, { useEffect, useMemo, useState } from 'react';
import { CommunityService } from '../../services/community';
import { getApiErrorMessage, isUnauthorizedError } from '../../utils/apiErrorMessage';
import { applyFollowUpdatePayload, setFollowStatus, useFollowStatus } from '../followState';

type FollowButtonProps = {
  targetUserId?: string | null;
  /** User or Page follow target. Pages use the same follow graph with targetType=page. */
  targetType?: 'user' | 'page';
  currentUserId?: string | null;
  initialIsFollowing?: boolean;
  disabled?: boolean;
  onRequireLogin?: () => void;
  onSuccess?: (isFollowing: boolean) => void;
  onError?: (message: string) => void;
  tone?: 'default' | 'overlay';
  className?: string;
};

const getFollowErrorMessage = (error: any) =>
  getApiErrorMessage(error, 'Unable to update follow status.');

const FollowButton: React.FC<FollowButtonProps> = ({
  targetUserId,
  targetType = 'user',
  currentUserId,
  initialIsFollowing,
  disabled,
  onRequireLogin,
  onSuccess,
  onError,
  tone = 'default',
  className = ''
}) => {
  const [busy, setBusy] = useState(false);
  const id = String(targetUserId || '').trim();
  const resolvedType: 'user' | 'page' = targetType === 'page' ? 'page' : 'user';
  const selfId = String(currentUserId || '').trim();
  const followStatus = useFollowStatus(id, initialIsFollowing);
  const isFollowing = followStatus === true;
  const isSelf = Boolean(resolvedType === 'user' && id && selfId && id === selfId);
  const isDisabled = Boolean(disabled || busy || !id || isSelf);

  // If the caller didn't provide an initial follow state, lazily resolve it
  // once so "Follow" doesn't incorrectly show for already-followed authors.
  useEffect(() => {
    if (!id || !selfId) return;
    if (followStatus !== undefined) return;

    let active = true;
    CommunityService.getFollowStatus([id])
      .then((map) => {
        if (!active) return;
        const value = (map as any)?.[id];
        if (typeof value === 'boolean') setFollowStatus(id, value);
      })
      .catch((error) => {
        // Non-fatal: keep button usable even if status lookup fails.
        if (isUnauthorizedError(error)) return;
      });

    return () => {
      active = false;
    };
  }, [id, selfId, followStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onFollowUpdated = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      applyFollowUpdatePayload(detail, selfId);
    };
    window.addEventListener('community:follow_updated', onFollowUpdated as EventListener);
    return () => window.removeEventListener('community:follow_updated', onFollowUpdated as EventListener);
  }, [selfId]);

  const label = useMemo(() => {
    if (busy) return isFollowing ? 'Following' : 'Follow';
    if (!isFollowing) return 'Follow';
    return 'Following';
  }, [busy, isFollowing]);

  if (!id || isSelf) return null;

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isDisabled) return;

    if (!selfId) {
      if (onRequireLogin) onRequireLogin();
      else window.location.href = '/auth/login';
      return;
    }

    const previous = isFollowing;
    const next = !previous;

    if (!next) {
      const ok = window.confirm(
        'Are you sure you want to unfollow the account?\n\nPress OK to unfollow, or Cancel to keep following.'
      );
      if (!ok) return;
    }

    // Instant optimistic UI — never wait for network to flip the label.
    setBusy(true);
    setFollowStatus(id, next);
    try {
      window.dispatchEvent(
        new CustomEvent('community:follow_updated', {
          detail: {
            actorUserId: selfId,
            targetUserId: id,
            targetType: resolvedType,
            targetId: id,
            isFollowing: next,
            action: next ? 'follow' : 'unfollow',
            optimistic: true
          }
        })
      );
    } catch {}

    try {
      if (next) {
        await CommunityService.followTarget({ targetType: resolvedType, targetId: id });
      } else if (resolvedType === 'page') {
        // Phase 20.10: DELETE accepts follow-record id OR page id for current user.
        await CommunityService.unfollowTarget(id);
      } else {
        // Prefer unfollow by user id; DELETE also accepts followee id as fallback.
        try {
          await CommunityService.unfollowUser(id);
        } catch {
          await CommunityService.unfollowTarget(id);
        }
      }
      try {
        window.dispatchEvent(
          new CustomEvent('community:follow_updated', {
            detail: {
              actorUserId: selfId,
              targetUserId: id,
              targetType: resolvedType,
              targetId: id,
              isFollowing: next,
              action: next ? 'follow' : 'unfollow',
              optimistic: false
            }
          })
        );
      } catch {}
      if (onSuccess) onSuccess(next);
    } catch (error: any) {
      setFollowStatus(id, previous);
      try {
        window.dispatchEvent(
          new CustomEvent('community:follow_updated', {
            detail: {
              actorUserId: selfId,
              targetUserId: id,
              targetType: resolvedType,
              targetId: id,
              isFollowing: previous,
              action: previous ? 'follow' : 'unfollow',
              optimistic: false,
              rolledBack: true
            }
          })
        );
      } catch {}
      if (isUnauthorizedError(error)) {
        if (onRequireLogin) onRequireLogin();
        else window.location.href = '/auth/login';
        return;
      }
      if (onError) onError(getFollowErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const stateClass =
    tone === 'overlay'
      ? isFollowing
        ? 'border-emerald-300/45 bg-emerald-500/25 text-white hover:bg-emerald-500/35'
        : 'border-white/20 bg-white/12 text-white hover:bg-white/22'
      : isFollowing
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
        : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      aria-label={label}
      aria-pressed={isFollowing}
      title={label}
      className={`inline-flex h-9 min-h-9 min-w-[6.5rem] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-3.5 text-xs font-semibold leading-none transition duration-150 active:scale-[0.97] motion-reduce:active:scale-100 ${className} ${stateClass} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {isFollowing ? (
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white" aria-hidden>
          ✓
        </span>
      ) : null}
      {label}
    </button>
  );
};

export default FollowButton;
