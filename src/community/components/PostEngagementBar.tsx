import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  EyeIcon as Eye,
  ChevronDownIcon as ChevronDown,
  CoinsIcon as Coins,
  MessageCircleIcon as MessageCircle,
  Repeat2Icon as Repeat2,
  SendIcon as Send
} from '../../components/icons/ShellIcons';
import { useUser } from '../../context/UserContext';
import { useContent } from '../../context/ContentContext';
import { useNotification } from '../../context/NotificationContext';
import { CommunityService } from '../../services/community';
import { postOptionsApi } from '../../services/postOptions';
import { ReactionsService } from '../../services/reactions';
import PostComments from '../../components/PostComments';
import SendGcoinModal from '../../components/SendGcoinModal';
import PostShareModal from './PostShareModal';
import RepostModal from './RepostModal';
import ContentInterestSurvey from '../../components/recommendation/ContentInterestSurvey';
import ReactionReactorsModal from './ReactionReactorsModal';
import ReactionSummaryButton from './ReactionSummaryButton';
import { normalizeShareText } from '../../utils/postShare';

type AllowedReaction = {
  key: string;
  label: string;
  emoji: string;
  enabled?: boolean;
};

type Props = {
  postId: string;
  postTitle?: string | null;
  postContent?: string | null;
  authorId?: string;
  dashGcoinTotal?: number;
  commentPolicy?: string | null;
  postRepostsEnabled?: boolean;
  commentCount: number;
  repostCount?: number;
  shareCount?: number;
  viewCount?: number;
  initialReactionCounts?: Record<string, number>;
  initialUserReaction?: string | null;
  focusCommentId?: string;
  focusMentionToken?: string;
  onCommentCountChange?: (postId: string, count: number) => void;
  interestSurveyEnabled?: boolean;
  initialInterestSignal?: string | null;
  features?: {
    reactions?: boolean;
    comments?: boolean;
    reposts?: boolean;
    send?: boolean;
    dash?: boolean;
  };
  className?: string;
};

type FloatingPosition = {
  left: number;
  top: number;
  width: number;
  placement: 'top' | 'bottom';
};

const DEFAULT_META: Record<string, { label: string; emoji: string; color: string }> = {
  like: { label: 'Like', emoji: '\u{1F44D}', color: '#2563eb' },
  love: { label: 'Love', emoji: '\u{2764}\u{FE0F}', color: '#ef4444' },
  good: { label: 'Good', emoji: '\u{2705}', color: '#16a34a' },
  happy: { label: 'Happy', emoji: '\u{1F604}', color: '#f59e0b' },
  handwave: { label: 'Handwave', emoji: '\u{1F44B}', color: '#0ea5e9' },
  angry: { label: 'Angry', emoji: '\u{1F621}', color: '#f97316' },
  cry: { label: 'Cry', emoji: '\u{1F622}', color: '#6366f1' },
  mad: { label: 'Mad', emoji: '\u{1F92C}', color: '#7c3aed' },
  sorry: { label: 'Sorry', emoji: '\u{1F64F}', color: '#64748b' }
};

const DEFAULT_ALLOWED: AllowedReaction[] = Object.entries(DEFAULT_META).map(([key, meta]) => ({
  key,
  label: meta.label,
  emoji: meta.emoji,
  enabled: true
}));

const toSafeCount = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
};

const formatDashGcoin = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0';
  if (Number.isInteger(numeric)) return String(numeric);
  return numeric.toFixed(numeric >= 100 ? 0 : 2).replace(/\.00$/, '');
};

const sumReactions = (counts?: Record<string, number>) =>
  Object.values(counts || {}).reduce((total, value) => total + toSafeCount(value), 0);

const normalizeAllowed = (value: any): AllowedReaction[] => {
  if (!Array.isArray(value)) return DEFAULT_ALLOWED;
  const list = value
    .map((item) => {
      const key = String(item?.key || item?.id || item?.type || '').trim().toLowerCase();
      if (!key || item?.enabled === false) return null;
      const fallback = DEFAULT_META[key] || DEFAULT_META.like;
      return {
        key,
        label: String(item?.label || fallback.label).trim() || fallback.label,
        emoji: String(item?.emoji || fallback.emoji).trim() || fallback.emoji,
        enabled: true
      } as AllowedReaction;
    })
    .filter(Boolean) as AllowedReaction[];
  return list.length ? list : DEFAULT_ALLOWED;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const computeFloatingPosition = (rect: DOMRect, panelWidth: number, panelHeight: number): FloatingPosition => {
  const viewportW = window.innerWidth || 0;
  const viewportH = window.innerHeight || 0;
  const padding = 10;
  const width = Math.min(Math.max(280, panelWidth), Math.max(280, viewportW - padding * 2));
  const left = clamp(rect.left + rect.width / 2 - width / 2, padding, Math.max(padding, viewportW - width - padding));
  const canTop = rect.top >= panelHeight + 24;
  const canBottom = viewportH - rect.bottom >= panelHeight + 24;
  const placement: 'top' | 'bottom' = canTop || !canBottom ? 'top' : 'bottom';
  const top = placement === 'top' ? rect.top - 10 : rect.bottom + 10;
  return { left, top, width, placement };
};

const useIsCoarsePointer = () => {
  const [coarse, setCoarse] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(hover: none), (pointer: coarse)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(hover: none), (pointer: coarse)');
    const update = () => setCoarse(media.matches);
    update();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  return coarse;
};

const buildPostUrl = (postId: string) =>
  typeof window === 'undefined' ? `/post/${encodeURIComponent(postId)}` : `${window.location.origin}/post/${encodeURIComponent(postId)}`;

const PostEngagementBar: React.FC<Props> = ({
  postId,
  postTitle,
  postContent,
  authorId,
  dashGcoinTotal = 0,
  commentPolicy,
  postRepostsEnabled,
  commentCount,
  repostCount = 0,
  shareCount = 0,
  viewCount = 0,
  initialReactionCounts,
  initialUserReaction,
  focusCommentId,
  focusMentionToken,
  onCommentCountChange,
  interestSurveyEnabled = false,
  initialInterestSignal,
  features,
  className = ''
}) => {
  const { user } = useUser();
  const { settings } = useContent();
  const { showNotification } = useNotification();
  const isCoarsePointer = useIsCoarsePointer();

  const reactionsSettings = (settings as any)?.reactions || {};
  const memberHomeSettings = (settings as any)?.memberHome || {};
  const showCounts = memberHomeSettings?.feed?.showReactionCounts !== false;
  const reactionsEnabled = (reactionsSettings?.enabled ?? true) && (features?.reactions !== false) && (reactionsSettings?.postsEnabled ?? reactionsSettings?.posts_enabled ?? true);
  const commentsEnabled = features?.comments !== false;
  const repostsEnabled = features?.reposts !== false && postRepostsEnabled !== false;
  const sendEnabled = features?.send !== false;
  const dashEnabled = features?.dash !== false && (memberHomeSettings?.feed?.dashEnabled ?? (memberHomeSettings as any)?.feed?.dash_enabled ?? true) !== false;
  const dashEnabledForPost = dashEnabled && !(authorId && user?.id && String(authorId) === String(user.id));
  const shareText = useMemo(() => {
    const heading = normalizeShareText(postTitle, 120);
    const summary = normalizeShareText(postContent, 220);
    if (heading && summary && heading !== summary) return `${heading}\n\n${summary}`;
    return heading || summary || undefined;
  }, [postContent, postTitle]);

  const allowed = useMemo(() => normalizeAllowed(reactionsSettings?.allowed), [reactionsSettings?.allowed]);
  const allowedMap = useMemo(() => {
    const map = new Map<string, AllowedReaction>();
    allowed.forEach((item) => map.set(item.key, item));
    return map;
  }, [allowed]);
  const defaultReactionKey = allowed[0]?.key || 'like';

  const [counts, setCounts] = useState<Record<string, number>>(initialReactionCounts || {});
  const [userReaction, setUserReaction] = useState<string | null>(typeof initialUserReaction === 'undefined' ? null : (initialUserReaction || null));
  const [busy, setBusy] = useState(false);
  const [dashTotal, setDashTotal] = useState<number>(Number(dashGcoinTotal || 0));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPosition, setPickerPosition] = useState<FloatingPosition | null>(null);
  const [reactorsOpen, setReactorsOpen] = useState(false);
  const [reactorsInitialKey, setReactorsInitialKey] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(() => Boolean(focusCommentId));
  const [focusInputKey, setFocusInputKey] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [repostOpen, setRepostOpen] = useState(false);
  const [dashOpen, setDashOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [interestSignal, setInterestSignal] = useState<string | null>(initialInterestSignal || null);

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const commentsAnchorRef = useRef<HTMLDivElement | null>(null);
  const hoverOpenTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearTimers = () => {
    if (hoverOpenTimerRef.current !== null) {
      window.clearTimeout(hoverOpenTimerRef.current);
      hoverOpenTimerRef.current = null;
    }
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => setCounts(initialReactionCounts || {}), [postId, initialReactionCounts]);
  useEffect(() => setDashTotal(Number(dashGcoinTotal || 0)), [dashGcoinTotal, postId]);
  useEffect(() => {
    if (typeof initialUserReaction === 'undefined') return;
    setUserReaction(initialUserReaction || null);
  }, [postId, initialUserReaction]);
  useEffect(() => {
    setInterestSignal(initialInterestSignal || null);
  }, [postId, initialInterestSignal]);

  useEffect(() => {
    const onLegacyUpdated = (event: Event) => {
      const raw = (event as CustomEvent).detail;
      const detail = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
      if (!detail) return;
      const eventPostId = String(detail.postId || detail.post_id || '').trim();
      if (!eventPostId || eventPostId !== String(postId)) return;
      if (detail.reactions && typeof detail.reactions === 'object' && !Array.isArray(detail.reactions)) {
        setCounts(detail.reactions as Record<string, number>);
      }
      const actorId = String(detail.actorId || detail.userId || '').trim();
      if (actorId && user?.id && actorId === String(user.id) && Object.prototype.hasOwnProperty.call(detail, 'userReaction')) {
        const mine = String(detail.userReaction || '').trim().toLowerCase();
        setUserReaction(mine || null);
      }
    };
    // Phase 20.2.3: unified reaction bus (server + ReactionBar).
    const onUnifiedUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail) return;
      if (String(detail.targetType || '').toUpperCase() !== 'POST') return;
      if (String(detail.targetId || '') !== String(postId)) return;
      if (detail.counts && typeof detail.counts === 'object' && !Array.isArray(detail.counts)) {
        setCounts(detail.counts as Record<string, number>);
      }
      const actorId = String(detail.actorUserId || detail.actorId || detail.userId || '').trim();
      if (actorId && user?.id && actorId === String(user.id) && Object.prototype.hasOwnProperty.call(detail, 'userReaction')) {
        const mine = String(detail.userReaction || '').trim().toLowerCase();
        setUserReaction(mine || null);
      }
    };
    const onGcoinDonated = (event: Event) => {
      const raw = (event as CustomEvent).detail;
      const detail = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
      if (!detail) return;
      const eventPostId = String(detail.postId || detail.post_id || '').trim();
      if (!eventPostId || eventPostId !== String(postId)) return;
      setDashTotal(Number(detail.dashGcoinTotal || detail.dash_gcoin_total || 0));
    };
    window.addEventListener('community:post_reaction_updated', onLegacyUpdated as EventListener);
    window.addEventListener('reactions:updated', onUnifiedUpdated as EventListener);
    window.addEventListener('community:gcoin_donated', onGcoinDonated as EventListener);
    return () => {
      window.removeEventListener('community:post_reaction_updated', onLegacyUpdated as EventListener);
      window.removeEventListener('reactions:updated', onUnifiedUpdated as EventListener);
      window.removeEventListener('community:gcoin_donated', onGcoinDonated as EventListener);
    };
  }, [postId, user?.id]);

  useEffect(() => {
    if (!pickerOpen || isCoarsePointer) return;
    const anchorEl = buttonRef.current;
    if (!anchorEl) return;
    const reposition = () => setPickerPosition(computeFloatingPosition(anchorEl.getBoundingClientRect(), 380, 260));
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [pickerOpen, isCoarsePointer]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (buttonRef.current?.contains(target) || pickerRef.current?.contains(target)) return;
      setPickerOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPickerOpen(false); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [pickerOpen]);

  const ensureAuth = () => {
    if (user?.id) return true;
    if (window.confirm('Log in to interact with Scrolith posts. Go to login?')) window.location.href = '/auth/login';
    return false;
  };

  const react = async (key: string) => {
    if (!reactionsEnabled || busy) return;
    if (!ensureAuth()) return;
    const normalized = String(key || '').trim().toLowerCase();
    if (!normalized) return;
    const prevCounts = counts;
    const prevReaction = userReaction;
    const nextCounts = { ...prevCounts };
    if (prevReaction) nextCounts[prevReaction] = Math.max(0, toSafeCount(nextCounts[prevReaction]) - 1);
    if (prevReaction && nextCounts[prevReaction] === 0) delete nextCounts[prevReaction];
    const toggledOff = prevReaction === normalized;
    if (!toggledOff) nextCounts[normalized] = toSafeCount(nextCounts[normalized]) + 1;
    setBusy(true);
    setCounts(nextCounts);
    setUserReaction(toggledOff ? null : normalized);
    setPickerOpen(false);
    try {
      // Phase 20.2.3: always use unified /api/reactions (one reaction per user per post).
      // Backend dual-writes CommunityPostReaction for legacy feed compatibility.
      const summary = await ReactionsService.react('POST', postId, normalized);
      if (summary?.counts && typeof summary.counts === 'object' && !Array.isArray(summary.counts)) {
        setCounts(summary.counts);
      }
      const mine = String(summary?.userReaction || '').trim().toLowerCase();
      setUserReaction(mine || null);
      window.dispatchEvent(
        new CustomEvent('reactions:updated', {
          detail: {
            targetType: 'POST',
            targetId: postId,
            counts: summary?.counts || {},
            userReaction: summary?.userReaction || null,
            actorUserId: user?.id || null
          }
        })
      );
    } catch (error: any) {
      setCounts(prevCounts);
      setUserReaction(prevReaction);
      showNotification('error', 'Reactions', error?.response?.data?.error || error?.message || 'Unable to update reaction.');
    } finally {
      setBusy(false);
    }
  };

  const totalReactions = sumReactions(counts);
  const topReactions = Object.entries(counts || {}).map(([key, value]) => ({ key, count: toSafeCount(value), meta: allowedMap.get(key) || DEFAULT_META[key] || DEFAULT_META.like })).filter((item) => item.count > 0).sort((a, b) => b.count - a.count).slice(0, 3);
  const breakdown = Object.entries(counts || {}).map(([key, value]) => {
    const count = toSafeCount(value);
    const allowedItem = allowedMap.get(key);
    const meta = DEFAULT_META[key] || DEFAULT_META.like;
    return { key, count, label: allowedItem?.label || meta.label, emoji: allowedItem?.emoji || meta.emoji, color: meta.color, pct: totalReactions ? Math.round((count / totalReactions) * 100) : 0 };
  }).filter((item) => item.count > 0).sort((a, b) => b.count - a.count);

  const likeLabel = userReaction ? (allowedMap.get(userReaction)?.label || DEFAULT_META[userReaction]?.label || 'Like') : 'Like';
  const likeEmoji = userReaction ? (allowedMap.get(userReaction)?.emoji || DEFAULT_META[userReaction]?.emoji || DEFAULT_META.like.emoji) : '';
  const reactionCountLabel = totalReactions > 0 ? totalReactions.toLocaleString() : '0';
  const commentCountLabel = Math.max(0, toSafeCount(commentCount)).toLocaleString();
  const repostCountLabel = Math.max(0, toSafeCount(repostCount)).toLocaleString();
  const dashCountLabel = formatDashGcoin(dashTotal);
  const sendCountLabel = Math.max(0, toSafeCount(shareCount)).toLocaleString();
  const viewCountLabel = Math.max(0, toSafeCount(viewCount)).toLocaleString();
  const actionButtonBase =
    'group relative inline-flex min-h-[52px] w-full flex-col items-center justify-center gap-1 rounded-xl border border-transparent bg-transparent px-1 py-2 text-slate-700 transition duration-enterprise hover:bg-slate-100/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 sm:min-h-[56px]';
  const actionIconBase =
    'inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition duration-enterprise group-hover:bg-slate-200 sm:h-10 sm:w-10';
  const actionLabelBase = 'hidden text-[11px] font-semibold tracking-wide text-slate-600 sm:inline';
  const postUrl = buildPostUrl(postId);

  const onReactionButtonHover = () => {
    if (isCoarsePointer) return;
    clearTimers();
    hoverOpenTimerRef.current = window.setTimeout(() => {
      setPickerOpen(true);
      hoverOpenTimerRef.current = null;
    }, 220);
  };

  const onReactionButtonTouchStart = () => {
    if (!isCoarsePointer) return;
    clearTimers();
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setPickerOpen(true);
      longPressTimerRef.current = null;
    }, 360);
  };

  const onReactionButtonTouchEnd = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const onPrimaryReactionClick = () => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    void react(userReaction || defaultReactionKey);
  };

  const stopActionPropagation = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  const triggerAction = (event: React.SyntheticEvent, callback: () => void) => {
    event.preventDefault();
    event.stopPropagation();
    callback();
  };

  const openReactors = (reactionKey?: string | null) => {
    if (!ensureAuth()) return;
    setReactorsInitialKey(reactionKey || null);
    setReactorsOpen(true);
    setPickerOpen(false);
  };

  const handleInterestSurveySubmit = async (signal: 'INTERESTED' | 'NOT_INTERESTED') => {
    if (!ensureAuth()) {
      throw new Error('Authentication required.');
    }
    if (signal === 'INTERESTED') {
      await postOptionsApi.interested(postId, { surface: 'post_interest_survey' });
    } else {
      await postOptionsApi.notInterested(postId, { surface: 'post_interest_survey' });
    }
    setInterestSignal(signal);
  };

  const showInterestSurvey =
    interestSurveyEnabled &&
    Boolean(postId) &&
    Boolean(user?.id) &&
    String(authorId || '').trim() !== String(user?.id || '').trim();

  return (
    <div className={`mt-4 ${className}`}>
      {showInterestSurvey ? (
        <ContentInterestSurvey
          entityId={postId}
          viewerId={user?.id}
          contentType="post"
          initialSignal={interestSignal}
          enabled
          className="mb-3"
          onSubmit={handleInterestSurveySubmit}
        />
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <ReactionSummaryButton
            counts={counts}
            allowed={allowed}
            onClick={(event) => triggerAction(event, () => openReactors(null))}
            className="max-w-full"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 sm:text-sm">
            {Number(commentCount) > 0 ? (
              <span aria-label={`${commentCountLabel} comments`}>{commentCountLabel} comments</span>
            ) : null}
            {Number(repostCount) > 0 ? (
              <span aria-label={`${repostCountLabel} reposts`}>· {repostCountLabel} reposts</span>
            ) : null}
            <span
              className="inline-flex items-center gap-1"
              title={`${viewCountLabel} views`}
              aria-label={`${viewCountLabel} views`}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              {viewCountLabel}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1 border-t border-slate-100 pt-1 sm:gap-1.5">
        {reactionsEnabled ? (
          <button
            ref={buttonRef}
            type="button"
            disabled={busy}
            aria-label={likeLabel}
            title={likeLabel}
            aria-expanded={pickerOpen}
            data-post-action-control="true"
            onMouseDown={stopActionPropagation}
            onTouchStart={(event) => {
              stopActionPropagation(event);
              onReactionButtonTouchStart();
            }}
            onClick={(event) => triggerAction(event, onPrimaryReactionClick)}
            onMouseEnter={onReactionButtonHover}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setPickerOpen(true);
            }}
            onTouchMove={onReactionButtonTouchEnd}
            onTouchEnd={onReactionButtonTouchEnd}
            onTouchCancel={onReactionButtonTouchEnd}
            className={`${actionButtonBase} ${userReaction ? 'bg-blue-50/80 text-blue-700 hover:bg-blue-50' : ''} disabled:opacity-60`}
          >
            <span className="relative inline-flex items-center justify-center">
              <span
                className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-base leading-none transition sm:h-10 sm:w-10 ${
                  userReaction ? 'bg-blue-100 text-blue-700' : actionIconBase
                }`}
              >
                {likeEmoji || DEFAULT_META.like.emoji}
              </span>
              {showCounts && totalReactions > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full border border-white bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-sm">
                  {reactionCountLabel}
                </span>
              ) : null}
            </span>
            <span className={actionLabelBase}>{likeLabel}</span>
            <ChevronDown className={`absolute bottom-1 right-1 h-3 w-3 text-slate-400 transition ${pickerOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        ) : null}

        {commentsEnabled ? (
          <button
            type="button"
            aria-label="Comment"
            title="Comment"
            data-post-action-control="true"
            onMouseDown={stopActionPropagation}
            onTouchStart={stopActionPropagation}
            onClick={(event) =>
              triggerAction(event, () => {
                if (!ensureAuth()) return;
                setCommentsOpen((prev) => !prev);
                setFocusInputKey((prev) => prev + 1);
                window.setTimeout(() => commentsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
              })
            }
            className={actionButtonBase}
            aria-expanded={commentsOpen}
          >
            <span className="relative inline-flex items-center justify-center">
              <span className={actionIconBase}>
                <MessageCircle className="h-4 w-4" />
              </span>
              {showCounts && Number(commentCount) > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full border border-white bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-sm">
                  {commentCountLabel}
                </span>
              ) : null}
            </span>
            <span className={actionLabelBase}>Comment</span>
          </button>
        ) : null}

        {repostsEnabled ? (
          <button
            type="button"
            aria-label="Repost"
            title="Repost"
            data-post-action-control="true"
            onMouseDown={stopActionPropagation}
            onTouchStart={stopActionPropagation}
            onClick={(event) =>
              triggerAction(event, () => {
                if (!ensureAuth()) return;
                setRepostOpen(true);
              })
            }
            className={actionButtonBase}
          >
            <span className="relative inline-flex items-center justify-center">
              <span className={actionIconBase}>
                <Repeat2 className="h-4 w-4" />
              </span>
              {showCounts && Number(repostCount) > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full border border-white bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-sm">
                  {repostCountLabel}
                </span>
              ) : null}
            </span>
            <span className={actionLabelBase}>Repost</span>
          </button>
        ) : null}

        {dashEnabledForPost ? (
          <button
            type="button"
            aria-label="Dash"
            title="Dash"
            data-post-action-control="true"
            onMouseDown={stopActionPropagation}
            onTouchStart={stopActionPropagation}
            onClick={(event) =>
              triggerAction(event, () => {
                if (!ensureAuth()) return;
                setDashOpen(true);
              })
            }
            className={actionButtonBase}
          >
            <span className="relative inline-flex items-center justify-center">
              <span className={actionIconBase}>
                <Coins className="h-4 w-4" />
              </span>
              {showCounts ? (
                <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full border border-white bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-sm">
                  {dashCountLabel}
                </span>
              ) : null}
            </span>
            <span className={actionLabelBase}>Dash</span>
          </button>
        ) : null}

        {sendEnabled ? (
          <button
            type="button"
            aria-label="Send"
            title="Send"
            data-post-action-control="true"
            onMouseDown={stopActionPropagation}
            onTouchStart={stopActionPropagation}
            onClick={(event) => triggerAction(event, () => setShareOpen(true))}
            className={actionButtonBase}
          >
            <span className="relative inline-flex items-center justify-center">
              <span className={actionIconBase}>
                <Send className="h-4 w-4" />
              </span>
              {showCounts && Number(shareCount) > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full border border-white bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-sm">
                  {sendCountLabel}
                </span>
              ) : null}
            </span>
            <span className={actionLabelBase}>Send</span>
          </button>
        ) : null}
        </div>
      </div>

      {pickerOpen && isCoarsePointer ? (
        <div className="fixed inset-0 z-[1200] bg-slate-900/45" onClick={() => setPickerOpen(false)} role="presentation">
          <div
            ref={pickerRef}
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4 shadow-2xl"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Choose a reaction"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">React to this post</p>
              <button type="button" onClick={() => setPickerOpen(false)} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
                Close
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {allowed.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => void react(item.key)}
                  className={[
                    'inline-flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2',
                    userReaction === item.key ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  ].join(' ')}
                >
                  <span className="text-xl leading-none">{item.emoji}</span>
                  <span className="text-[11px] font-semibold">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {pickerOpen && !isCoarsePointer && pickerPosition ? (
        <div
          ref={pickerRef}
          style={{ left: pickerPosition.left, top: pickerPosition.top, width: pickerPosition.width, transform: pickerPosition.placement === 'top' ? 'translateY(-100%)' : undefined }}
          className="fixed z-[1200] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl"
          onMouseEnter={() => {
            if (hoverOpenTimerRef.current !== null) {
              window.clearTimeout(hoverOpenTimerRef.current);
              hoverOpenTimerRef.current = null;
            }
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reactions</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {allowed.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => void react(item.key)}
                className={[
                  'group inline-flex items-center gap-2 rounded-xl border px-2 py-2 text-left transition',
                  userReaction === item.key ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                ].join(' ')}
              >
                <span className="text-xl leading-none transition group-hover:scale-110">{item.emoji}</span>
                <span className="text-xs font-semibold">{item.label}</span>
              </button>
            ))}
          </div>
          {breakdown.length ? (
            <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2">
              {breakdown.slice(0, 5).map((item) => (
                <button
                  key={`summary_${item.key}`}
                  type="button"
                  onClick={(event) => triggerAction(event, () => openReactors(item.key))}
                  className="w-full rounded-lg bg-slate-50 px-2 py-1.5 text-left transition hover:bg-blue-50"
                  title={`View people who reacted with ${item.label}`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-700">{item.emoji} {item.label}</span>
                    <span className="text-slate-500">{item.count} ({item.pct}%)</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(4, item.pct)}%`, backgroundColor: item.color }} />
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <ReactionReactorsModal
        open={reactorsOpen}
        onClose={() => setReactorsOpen(false)}
        targetType="POST"
        targetId={postId}
        counts={counts}
        allowed={allowed}
        initialReactionKey={reactorsInitialKey}
        title="People who reacted"
      />

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

      {dashEnabledForPost ? <SendGcoinModal isOpen={dashOpen} onClose={() => setDashOpen(false)} donatePostId={postId} /> : null}

      {repostsEnabled ? (
        <RepostModal
          isOpen={repostOpen}
          onClose={() => setRepostOpen(false)}
          busy={actionBusy}
          onRepostNow={async () => {
            if (actionBusy || !ensureAuth()) return;
            setActionBusy(true);
            try {
              const ok = await CommunityService.postRepost(postId, { createWrapper: true });
              if (ok) {
                showNotification('success', 'Repost', 'Shared to your feed.');
                setRepostOpen(false);
              } else showNotification('error', 'Repost', 'Unable to repost right now.');
            } finally {
              setActionBusy(false);
            }
          }}
          onRepostWithComment={async (comment) => {
            if (actionBusy || !ensureAuth()) return;
            setActionBusy(true);
            try {
              const ok = await CommunityService.postRepost(postId, { createWrapper: true, content: comment });
              if (ok) {
                showNotification('success', 'Repost', 'Shared to your feed.');
                setRepostOpen(false);
              } else showNotification('error', 'Repost', 'Unable to repost right now.');
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
          shareText={shareText}
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
