import React, { useEffect, useMemo, useState } from 'react';
import { SmilePlus } from 'lucide-react';
import { useContent } from '../../context/ContentContext';
import { useUser } from '../../context/UserContext';
import { ReactionsService, ReactionTargetType } from '../../services/reactions';

type AllowedReaction = {
  key: string;
  label: string;
  emoji: string;
  enabled?: boolean;
};

type ReactionBarProps = {
  targetType: ReactionTargetType;
  targetId: string;
  initialCounts?: Record<string, number>;
  initialUserReaction?: string | null;
  disabled?: boolean;
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

const ReactionBar: React.FC<ReactionBarProps> = ({
  targetType,
  targetId,
  initialCounts,
  initialUserReaction,
  disabled,
  className = ''
}) => {
  const { user } = useUser();
  const { settings } = useContent();
  const reactionsSettings = (settings as any)?.reactions || {};
  const memberHomeSettings = (settings as any)?.memberHome || {};
  const showCounts = memberHomeSettings?.feed?.showReactionCounts !== false;

  const featureEnabled = useMemo(() => {
    const master = reactionsSettings?.enabled ?? true;
    if (!master) return false;
    if (targetType === 'POST') return reactionsSettings?.postsEnabled ?? reactionsSettings?.posts_enabled ?? true;
    if (targetType === 'COMMENT') return reactionsSettings?.commentsEnabled ?? reactionsSettings?.comments_enabled ?? true;
    if (targetType === 'MESSAGE') return reactionsSettings?.messagesEnabled ?? reactionsSettings?.messages_enabled ?? true;
    if (targetType === 'STORY') return reactionsSettings?.storiesEnabled ?? reactionsSettings?.stories_enabled ?? true;
    return reactionsSettings?.scrollEnabled ?? reactionsSettings?.scroll_enabled ?? true;
  }, [reactionsSettings, targetType]);

  const allowed = useMemo(
    () => normalizeAllowed(reactionsSettings?.allowed),
    [reactionsSettings?.allowed]
  );

  const [counts, setCounts] = useState<Record<string, number>>(initialCounts || {});
  const [userReaction, setUserReaction] = useState<string | null>(initialUserReaction || null);
  const [busy, setBusy] = useState(false);
  const [openMore, setOpenMore] = useState(false);

  useEffect(() => {
    setCounts(initialCounts || {});
  }, [initialCounts, targetId]);

  useEffect(() => {
    setUserReaction(initialUserReaction || null);
  }, [initialUserReaction, targetId]);

  useEffect(() => {
    if (!targetId || !featureEnabled) return;
    let active = true;
    ReactionsService.getSummary(targetType, targetId)
      .then((summary) => {
        if (!active || !summary) return;
        setCounts(summary.counts || {});
        setUserReaction(summary.userReaction || null);
      })
      .catch((error) => {
        const status = error?.response?.status;
        if (status !== 404 && status !== 403 && status !== 401) {
          console.warn('Failed to load reaction summary', error);
        }
      });
    return () => {
      active = false;
    };
  }, [targetType, targetId, featureEnabled]);

  useEffect(() => {
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail) return;
      if (String(detail.targetType || '').toUpperCase() !== targetType) return;
      if (String(detail.targetId || '') !== String(targetId)) return;
      setCounts(detail.counts || {});
      if (detail.actorUserId && user?.id && String(detail.actorUserId) === String(user.id)) {
        setUserReaction(detail.userReaction || null);
      }
    };
    window.addEventListener('reactions:updated', onUpdated as EventListener);
    return () => window.removeEventListener('reactions:updated', onUpdated as EventListener);
  }, [targetType, targetId, user?.id]);

  if (!targetId || !featureEnabled) return null;

  const react = async (event: React.MouseEvent, reactionKey: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled || busy) return;

    if (!user?.id) {
      if (confirm('Log in to react?')) window.location.href = '/auth/login';
      return;
    }

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

    try {
      const summary = await ReactionsService.react(targetType, targetId, reactionKey);
      setCounts(summary?.counts || {});
      setUserReaction(summary?.userReaction || null);
    } catch (error: any) {
      setCounts(previousCounts);
      setUserReaction(previousReaction);
      const message = error?.response?.data?.error || error?.message || 'Unable to update reaction.';
      console.warn(message);
    } finally {
      setBusy(false);
    }
  };

  const quick = allowed.slice(0, 4);
  const more = allowed.slice(4);

  return (
    <div className={`mt-3 flex flex-wrap items-center gap-1.5 ${className}`}>
      {quick.map((item) => {
        const count = counts[item.key] || 0;
        const selected = userReaction === item.key;
        return (
          <button
            key={item.key}
            type="button"
            disabled={busy || disabled}
            onClick={(event) => react(event, item.key)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${
              selected
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            } disabled:cursor-not-allowed disabled:opacity-60`}
            title={item.label}
          >
            <span>{item.emoji}</span>
            {showCounts && count > 0 ? <span className="font-semibold">{count}</span> : null}
          </button>
        );
      })}

      {more.length ? (
        <div className="relative">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpenMore((prev) => !prev);
            }}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            <SmilePlus className="h-3.5 w-3.5" />
            More
          </button>
          {openMore ? (
            <div className="absolute left-0 top-9 z-20 flex max-w-[260px] flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
              {more.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={(event) => {
                    void react(event, item.key);
                    setOpenMore(false);
                  }}
                  className={`rounded-lg px-2 py-1 text-sm transition ${
                    userReaction === item.key ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-100'
                  }`}
                  title={item.label}
                >
                  {item.emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default ReactionBar;

