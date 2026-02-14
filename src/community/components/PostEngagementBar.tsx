import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Repeat2, Send, ThumbsUp } from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { useContent } from '../../context/ContentContext';
import { useNotification } from '../../context/NotificationContext';
import { ReactionsService, ReactionTargetType } from '../../services/reactions';
import { CommunityService } from '../../services/community';
import PostComments from '../../components/PostComments';
import PostShareModal from './PostShareModal';
import RepostModal from './RepostModal';
import { useSocket } from '../../context/SocketContext';

type AllowedReaction = {
  key: string;
  label: string;
  emoji: string;
  enabled?: boolean;
};

type Props = {
  postId: string;
  authorId?: string;
  commentPolicy?: string | null;
  commentCount: number;
  repostCount?: number;
  shareCount?: number;
  viewCount?: number;
  initialReactionCounts?: Record<string, number>;
  initialUserReaction?: string | null;
  focusCommentId?: string;
  focusMentionToken?: string;
  onCommentCountChange?: (postId: string, count: number) => void;
  features?: {
    reactions?: boolean;
    comments?: boolean;
    reposts?: boolean;
    send?: boolean;
  };
  className?: string;
};

const DEFAULT_ALLOWED: AllowedReaction[] = [
  { key: 'like', label: 'Like', emoji: '👍', enabled: true },
  { key: 'love', label: 'Love', emoji: '❤️', enabled: true },
  { key: 'good', label: 'Good', emoji: '✅', enabled: true },
  { key: 'happy', label: 'Happy', emoji: '😄', enabled: true },
  { key: 'handwave', label: 'Handwave', emoji: '👋', enabled: true },
  { key: 'angry', label: 'Angry', emoji: '😡', enabled: true },
  { key: 'cry', label: 'Cry', emoji: '😢', enabled: true },
  { key: 'mad', label: 'Mad', emoji: '🤬', enabled: true },
  { key: 'sorry', label: 'Sorry', emoji: '🙏', enabled: true }
];

const normalizeAllowed = (value: any): AllowedReaction[] => {
  if (!Array.isArray(value)) return DEFAULT_ALLOWED;
  const items = value
    .map((entry) => ({
      key: String(entry?.key || '').trim().toLowerCase(),
      label: String(entry?.label || '').trim() || 'Reaction',
      emoji: String(entry?.emoji || '').trim(),
      enabled: entry?.enabled !== false
    }))
    .filter((entry) => entry.key && entry.emoji && entry.enabled !== false);
  return items.length ? items : DEFAULT_ALLOWED;
};

const sumReactions = (counts?: Record<string, number>) =>
  Object.values(counts || {}).reduce((total, value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return total;
    return total + Math.max(0, Math.trunc(numeric));
  }, 0);

const buildPostUrl = (postId: string) => `${window.location.origin}/community/posts/${encodeURIComponent(postId)}`;

const PostEngagementBar: React.FC<Props> = ({
  postId,
  authorId,
  commentPolicy,
  commentCount,
  repostCount = 0,
  shareCount = 0,
  viewCount = 0,
  initialReactionCounts,
  initialUserReaction,
  focusCommentId,
  focusMentionToken,
  onCommentCountChange,
  features,
  className = ''
}) => {
  const { user } = useUser();
  const { settings } = useContent();
  const { showNotification } = useNotification();
  const { isConnected } = useSocket();

  const reactionsSettings = (settings as any)?.reactions || {};
  const memberHomeSettings = (settings as any)?.memberHome || {};
  const showCounts = memberHomeSettings?.feed?.showReactionCounts !== false;

  const reactionsEnabled = useMemo(() => {
    const master = reactionsSettings?.enabled ?? true;
    if (!master) return false;
    if (features?.reactions === false) return false;
    return reactionsSettings?.postsEnabled ?? reactionsSettings?.posts_enabled ?? true;
  }, [features?.reactions, reactionsSettings]);

  const commentsEnabled = features?.comments !== false;
  const repostsEnabled = features?.reposts !== false;
  const sendEnabled = features?.send !== false;
  const actionCols = Math.max(1, [reactionsEnabled, commentsEnabled, repostsEnabled, sendEnabled].filter(Boolean).length);

  const allowed = useMemo(
    () => normalizeAllowed(reactionsSettings?.allowed),
    [reactionsSettings?.allowed]
  );

  const allowedMap = useMemo(() => {
    const map = new Map<string, AllowedReaction>();
    allowed.forEach((item) => map.set(item.key, item));
    return map;
  }, [allowed]);

  const [counts, setCounts] = useState<Record<string, number>>(initialReactionCounts || {});
  const [userReaction, setUserReaction] = useState<string | null>(
    typeof initialUserReaction === 'undefined' ? null : (initialUserReaction || null)
  );
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(() => Boolean(focusCommentId));
  const [focusInputKey, setFocusInputKey] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [repostOpen, setRepostOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const likeButtonRef = useRef<HTMLButtonElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const commentsAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCounts(initialReactionCounts || {});
  }, [postId, initialReactionCounts]);

  useEffect(() => {
    if (typeof initialUserReaction === 'undefined') return;
    setUserReaction(initialUserReaction || null);
  }, [postId, initialUserReaction]);

  useEffect(() => {
    if (!postId || !reactionsEnabled) return;
    const hasInitialCounts = typeof initialReactionCounts !== 'undefined';
    const hasInitialReaction = typeof initialUserReaction !== 'undefined';
    if (hasInitialCounts && hasInitialReaction) return;
    let active = true;
    ReactionsService.getSummary('POST', postId)
      .then((summary) => {
        if (!active || !summary) return;
        setCounts(summary.counts || {});
        setUserReaction(summary.userReaction || null);
      })
      .catch((error) => {
        const status = error?.response?.status;
        if (status !== 404 && status !== 403 && status !== 401) {
          console.warn('Failed to load post reaction summary', error);
        }
      });
    return () => {
      active = false;
    };
  }, [postId, reactionsEnabled, initialReactionCounts, initialUserReaction]);

  useEffect(() => {
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail) return;
      if (String(detail.targetType || '').toUpperCase() !== ('POST' as ReactionTargetType)) return;
      if (String(detail.targetId || '') !== String(postId)) return;
      setCounts(detail.counts || {});
      if (detail.actorUserId && user?.id && String(detail.actorUserId) === String(user.id)) {
        setUserReaction(detail.userReaction || null);
      }
    };
    window.addEventListener('reactions:updated', onUpdated as EventListener);
    return () => window.removeEventListener('reactions:updated', onUpdated as EventListener);
  }, [postId, user?.id]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (pickerRef.current?.contains(target)) return;
      if (likeButtonRef.current?.contains(target)) return;
      setPickerOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPickerOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pickerOpen]);

  const checkAuth = () => {
    if (!user?.id) {
      if (confirm('Log in to interact with Scrolith posts. Go to login?')) {
        window.location.href = '/auth/login';
      }
      return false;
    }
    return true;
  };

  const react = async (reactionKey: string) => {
    if (!reactionsEnabled) return;
    if (busy) return;
    if (!checkAuth()) return;

    const previousCounts = counts;
    const previousReaction = userReaction;
    const nextCounts = { ...previousCounts };
    if (previousReaction) {
      nextCounts[previousReaction] = Math.max(0, (nextCounts[previousReaction] || 0) - 1);
      if (nextCounts[previousReaction] === 0) delete nextCounts[previousReaction];
    }
    const toggledOff = previousReaction === reactionKey;
    if (!toggledOff) {
      nextCounts[reactionKey] = (nextCounts[reactionKey] || 0) + 1;
    }

    setBusy(true);
    setCounts(nextCounts);
    setUserReaction(toggledOff ? null : reactionKey);
    setPickerOpen(false);

    try {
      const summary = await ReactionsService.react('POST', postId, reactionKey);
      setCounts(summary?.counts || {});
      setUserReaction(summary?.userReaction || null);
    } catch (error: any) {
      setCounts(previousCounts);
      setUserReaction(previousReaction);
      const message = error?.response?.data?.error || error?.message || 'Unable to update reaction.';
      showNotification('error', 'Reactions', message);
    } finally {
      setBusy(false);
    }
  };

  const totalReactions = sumReactions(counts);
  const top = useMemo(() => {
    const entries = Object.entries(counts || {})
      .map(([key, value]) => ({ key, count: Number(value) || 0 }))
      .filter((row) => row.key && row.count > 0)
      .sort((a, b) => b.count - a.count);
    return entries.slice(0, 3);
  }, [counts]);

  const likeLabel = userReaction ? allowedMap.get(userReaction)?.label || 'Like' : 'Like';
  const likeEmoji = userReaction ? allowedMap.get(userReaction)?.emoji : null;
  const likeSelected = !!userReaction;

  const postUrl = buildPostUrl(postId);

  return (
    <div className={`mt-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          {showCounts && reactionsEnabled && totalReactions > 0 ? (
            <div className="inline-flex items-center gap-1">
              <div className="inline-flex -space-x-1">
                {top.map((row) => (
                  <span
                    key={row.key}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white bg-slate-50 text-[11px]"
                    title={allowedMap.get(row.key)?.label || row.key}
                  >
                    {allowedMap.get(row.key)?.emoji || '👍'}
                  </span>
                ))}
              </div>
              <span className="font-semibold text-slate-700">{totalReactions}</span>
            </div>
          ) : (
            <span className="text-slate-400"> </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {commentsEnabled ? (
            <button
              type="button"
              onClick={() => {
                setCommentsOpen(true);
                setFocusInputKey((prev) => prev + 1);
                window.setTimeout(() => {
                  commentsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 40);
              }}
              className="hover:text-slate-700"
            >
              <span className="font-semibold text-slate-700">{commentCount}</span> comments
            </button>
          ) : (
            <span>
              <span className="font-semibold text-slate-700">{commentCount}</span> comments
            </span>
          )}
          <span>
            <span className="font-semibold text-slate-700">{repostCount}</span> reposts
          </span>
          <span>
            <span className="font-semibold text-slate-700">{shareCount}</span> shares
          </span>
          <span>
            <span className="font-semibold text-slate-700">{viewCount}</span> views
          </span>
        </div>
      </div>

      <div
        className="mt-3 grid gap-1 rounded-2xl border border-slate-100 bg-white p-1 shadow-sm"
        style={{ gridTemplateColumns: `repeat(${actionCols}, minmax(0, 1fr))` }}
      >
        {reactionsEnabled ? (
        <div className="relative">
          <button
            ref={likeButtonRef}
            type="button"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!reactionsEnabled) {
                if (!checkAuth()) return;
                showNotification('info', 'Reactions', 'Reactions are disabled for posts.');
                return;
              }
              setPickerOpen((prev) => !prev);
            }}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
              likeSelected ? 'text-blue-700 hover:bg-blue-50' : 'text-slate-700 hover:bg-slate-50'
            } disabled:opacity-60`}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
          >
            <ThumbsUp className={`h-4 w-4 ${likeSelected ? 'fill-current' : ''}`} />
            <span>{likeEmoji ? `${likeEmoji} ` : ''}{likeLabel}</span>
          </button>

          {pickerOpen ? (
            <div
              ref={pickerRef}
              className="absolute left-1/2 top-[-10px] z-20 w-[320px] -translate-x-1/2 -translate-y-full rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
            >
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {allowed.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void react(item.key);
                    }}
                    className={`group inline-flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm transition hover:bg-slate-50 ${
                      userReaction === item.key ? 'bg-blue-50' : ''
                    }`}
                    title={item.label}
                  >
                    <span className="text-xl leading-none">{item.emoji}</span>
                    <span className="hidden text-xs font-semibold text-slate-700 group-hover:inline">{item.label}</span>
                  </button>
                ))}
              </div>
              {!isConnected ? (
                <div className="mt-2 text-center text-[11px] text-slate-400">
                  Realtime is offline; counts may update with a delay.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        ) : null}

        {commentsEnabled ? (
          <button
            type="button"
            onClick={() => {
              if (!checkAuth()) return;
              setCommentsOpen((prev) => !prev);
              setFocusInputKey((prev) => prev + 1);
              window.setTimeout(() => {
                commentsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 40);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <MessageCircle className="h-4 w-4" />
            <span>Comment</span>
          </button>
        ) : null}

        {repostsEnabled ? (
          <button
            type="button"
            onClick={() => {
              if (!checkAuth()) return;
              setRepostOpen(true);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Repeat2 className="h-4 w-4" />
            <span>Repost</span>
          </button>
        ) : null}

        {sendEnabled ? (
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Send className="h-4 w-4" />
            <span>Send</span>
          </button>
        ) : null}
      </div>

      <div ref={commentsAnchorRef} />
      {commentsEnabled ? (
        <PostComments
          postId={postId}
          authorId={authorId}
          commentPolicy={commentPolicy}
          initialCount={commentCount}
          focusCommentId={focusCommentId}
          focusMentionToken={focusMentionToken}
          expanded={commentsOpen}
          focusInputKey={focusInputKey}
          onCountChange={onCommentCountChange}
        />
      ) : null}

      {repostsEnabled ? (
        <RepostModal
          isOpen={repostOpen}
          onClose={() => setRepostOpen(false)}
          busy={actionBusy}
          onRepostNow={async () => {
            if (actionBusy) return;
            if (!checkAuth()) return;
            setActionBusy(true);
            try {
              const ok = await CommunityService.postRepost(postId, { createWrapper: true });
              if (ok) {
                showNotification('success', 'Repost', 'Shared to your feed.');
                setRepostOpen(false);
              } else {
                showNotification('error', 'Repost', 'Unable to repost right now.');
              }
            } finally {
              setActionBusy(false);
            }
          }}
          onRepostWithComment={async (comment) => {
            if (actionBusy) return;
            if (!checkAuth()) return;
            setActionBusy(true);
            try {
              const ok = await CommunityService.postRepost(postId, { createWrapper: true, content: comment });
              if (ok) {
                showNotification('success', 'Repost', 'Shared to your feed.');
                setRepostOpen(false);
              } else {
                showNotification('error', 'Repost', 'Unable to repost right now.');
              }
            } finally {
              setActionBusy(false);
            }
          }}
        />
      ) : null}

      {sendEnabled ? (
        <PostShareModal
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
          postId={postId}
          postUrl={postUrl}
          onShareToNetwork={() => {
            if (!repostsEnabled) {
              showNotification('info', 'Share', 'Share-to-network is disabled right now.');
              return;
            }
            setRepostOpen(true);
          }}
        />
      ) : null}
    </div>
  );
};

export default PostEngagementBar;
