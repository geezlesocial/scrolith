import React, { useEffect, useMemo, useState } from 'react';
import { CommunityService } from '../../services/community';
import { applyFollowUpdatePayload, setFollowStatus, useFollowStatus } from '../followState';

type FollowButtonProps = {
  targetUserId?: string | null;
  currentUserId?: string | null;
  initialIsFollowing?: boolean;
  disabled?: boolean;
  onRequireLogin?: () => void;
  onSuccess?: (isFollowing: boolean) => void;
  onError?: (message: string) => void;
  tone?: 'default' | 'overlay';
  className?: string;
};

const isUnauthorizedError = (error: any) => Number(error?.response?.status) === 401;

const getFollowErrorMessage = (error: any) => {
  const apiMessage = error?.response?.data?.message;
  if (typeof apiMessage === 'string' && apiMessage.trim()) return apiMessage.trim();
  const message = typeof error?.message === 'string' ? error.message.trim() : '';
  if (!message || message.startsWith('Request failed with status code')) {
    return 'Unable to update follow status.';
  }
  return message;
};

const FollowButton: React.FC<FollowButtonProps> = ({
  targetUserId,
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
  const selfId = String(currentUserId || '').trim();
  const followStatus = useFollowStatus(id, initialIsFollowing);
  const isFollowing = followStatus === true;
  const isSelf = Boolean(id && selfId && id === selfId);
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
    if (busy) return '...';
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

    setBusy(true);
    setFollowStatus(id, next);

    try {
      if (next) {
        await CommunityService.followTarget({ targetType: 'user', targetId: id });
      } else {
        await CommunityService.unfollowUser(id);
      }
      try {
        window.dispatchEvent(
          new CustomEvent('community:follow_updated', {
            detail: {
              actorUserId: selfId,
              targetUserId: id,
              targetType: 'user',
              targetId: id,
              isFollowing: next,
              action: next ? 'follow' : 'unfollow'
            }
          })
        );
      } catch {}
      if (onSuccess) onSuccess(next);
    } catch (error: any) {
      setFollowStatus(id, previous);
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
        ? 'border-emerald-300/45 bg-emerald-500/20 text-white hover:bg-emerald-500/30'
        : 'border-white/15 bg-white/10 text-white hover:bg-white/20'
      : isFollowing
        ? 'border-slate-300 text-slate-700 hover:bg-slate-50'
        : 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      aria-label={label}
      title={label}
      className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition ${className} ${stateClass} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {label}
    </button>
  );
};

export default FollowButton;
