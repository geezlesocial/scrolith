import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw, UserRound, X } from 'lucide-react';
import { ReactionsService, ReactionTargetType, ReactionUser } from '../../services/reactions';
import { resolveResponsiveAssetUrl } from '../../utils/assetUrl';

type AllowedReaction = {
  key: string;
  label: string;
  emoji: string;
  enabled?: boolean;
};

type ReactionReactorsModalProps = {
  open: boolean;
  onClose: () => void;
  targetType: ReactionTargetType;
  targetId: string;
  counts?: Record<string, number>;
  allowed?: AllowedReaction[];
  initialReactionKey?: string | null;
  title?: string;
};

const DEFAULT_ALLOWED: AllowedReaction[] = [
  { key: 'like', label: 'Like', emoji: '\u{1F44D}', enabled: true },
  { key: 'love', label: 'Love', emoji: '\u2764\uFE0F', enabled: true },
  { key: 'good', label: 'Good', emoji: '\u2705', enabled: true },
  { key: 'happy', label: 'Happy', emoji: '\u{1F604}', enabled: true },
  { key: 'handwave', label: 'Handwave', emoji: '\u{1F44B}', enabled: true },
  { key: 'angry', label: 'Angry', emoji: '\u{1F621}', enabled: true },
  { key: 'cry', label: 'Cry', emoji: '\u{1F622}', enabled: true },
  { key: 'mad', label: 'Mad', emoji: '\u{1F92C}', enabled: true },
  { key: 'sorry', label: 'Sorry', emoji: '\u{1F64F}', enabled: true }
];

const normalizeAllowed = (value?: AllowedReaction[]) => {
  const source = Array.isArray(value) && value.length ? value : DEFAULT_ALLOWED;
  const cleaned = source
    .map((entry) => ({
      key: String(entry?.key || '').trim().toLowerCase(),
      label: String(entry?.label || '').trim() || 'Reaction',
      emoji: String(entry?.emoji || '').trim(),
      enabled: entry?.enabled !== false
    }))
    .filter((entry) => entry.key && entry.emoji && entry.enabled !== false);
  return cleaned.length ? cleaned : DEFAULT_ALLOWED;
};

const toSafeCount = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
};

const getProfilePath = (reactor: ReactionUser) => {
  const username = String(reactor.username || '').trim().replace(/^@+/, '');
  if (username) return `/u/${encodeURIComponent(username)}`;
  return `/profile/${encodeURIComponent(String(reactor.userId || ''))}`;
};

const formatTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const matchesReactionTarget = (detail: any, targetType: ReactionTargetType, targetId: string) => {
  const eventTargetType = String(detail?.targetType || '').toUpperCase();
  const eventTargetId = String(detail?.targetId || detail?.postId || detail?.scrollId || '').trim();
  if (!eventTargetId || eventTargetId !== String(targetId)) return false;
  if (!eventTargetType) return targetType === 'POST' || targetType === 'SCROLL';
  return eventTargetType === targetType;
};

const ReactionReactorsModal: React.FC<ReactionReactorsModalProps> = ({
  open,
  onClose,
  targetType,
  targetId,
  counts,
  allowed,
  initialReactionKey,
  title
}) => {
  const allowedList = useMemo(() => normalizeAllowed(allowed), [allowed]);
  const allowedMap = useMemo(() => {
    const map = new Map<string, AllowedReaction>();
    allowedList.forEach((item) => map.set(item.key, item));
    return map;
  }, [allowedList]);

  const [activeKey, setActiveKey] = useState<string>('all');
  const [localCounts, setLocalCounts] = useState<Record<string, number>>(counts || {});
  const [reactors, setReactors] = useState<ReactionUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    setLocalCounts(counts || {});
  }, [counts, targetId, targetType]);

  const reactionTabs = useMemo(() => {
    const knownKeys = new Set(allowedList.map((item) => item.key));
    Object.keys(localCounts || {}).forEach((key) => knownKeys.add(String(key || '').trim().toLowerCase()));
    return Array.from(knownKeys)
      .map((key) => {
        const fallback = allowedMap.get(key) || DEFAULT_ALLOWED.find((item) => item.key === key);
        return {
          key,
          label: fallback?.label || key,
          emoji: fallback?.emoji || '\u{1F44D}',
          count: toSafeCount(localCounts?.[key])
        };
      })
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [allowedList, allowedMap, localCounts]);

  const totalCount = useMemo(
    () => reactionTabs.reduce((total, item) => total + item.count, 0),
    [reactionTabs]
  );

  useEffect(() => {
    if (!open) return;
    const normalizedInitial = String(initialReactionKey || '').trim().toLowerCase();
    setActiveKey(normalizedInitial && toSafeCount(localCounts?.[normalizedInitial]) > 0 ? normalizedInitial : 'all');
  }, [initialReactionKey, localCounts, open, targetId, targetType]);

  useEffect(() => {
    if (!open) return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open || !targetId) return undefined;
    let timer: number | null = null;
    const onUpdated = (event: Event) => {
      const raw = (event as CustomEvent).detail;
      const detail = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
      if (!matchesReactionTarget(detail, targetType, targetId)) return;
      const nextCounts = detail?.counts || detail?.reactions;
      if (nextCounts && typeof nextCounts === 'object' && !Array.isArray(nextCounts)) {
        setLocalCounts(nextCounts as Record<string, number>);
      }
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => setRefreshToken((value) => value + 1), 250);
    };
    window.addEventListener('reactions:updated', onUpdated as EventListener);
    window.addEventListener('community:post_reaction_updated', onUpdated as EventListener);
    window.addEventListener('scroll:reaction_updated', onUpdated as EventListener);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener('reactions:updated', onUpdated as EventListener);
      window.removeEventListener('community:post_reaction_updated', onUpdated as EventListener);
      window.removeEventListener('scroll:reaction_updated', onUpdated as EventListener);
    };
  }, [open, targetId, targetType]);

  useEffect(() => {
    if (!open || !targetId) return;
    let active = true;
    const keys = activeKey === 'all' ? reactionTabs.map((item) => item.key) : [activeKey];
    if (!keys.length) {
      setReactors([]);
      setError('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    Promise.all(keys.map((key) => ReactionsService.getUsers(targetType, targetId, key)))
      .then((rows) => {
        if (!active) return;
        const byUser = new Map<string, ReactionUser>();
        rows.flat().forEach((row) => {
          const userId = String(row.userId || '').trim();
          if (!userId) return;
          const existing = byUser.get(userId);
          if (!existing || new Date(row.reactedAt).getTime() > new Date(existing.reactedAt).getTime()) {
            byUser.set(userId, row);
          }
        });
        setReactors(
          Array.from(byUser.values()).sort(
            (a, b) => new Date(b.reactedAt).getTime() - new Date(a.reactedAt).getTime()
          )
        );
      })
      .catch((loadError: any) => {
        if (!active) return;
        const status = Number(loadError?.response?.status || 0);
        if (status === 403) {
          setError(loadError?.response?.data?.error || 'Viewing reactors is disabled for this content.');
        } else if (status === 401) {
          setError('Log in to view who reacted.');
        } else {
          setError(loadError?.response?.data?.error || loadError?.message || 'Unable to load reaction profiles.');
        }
        setReactors([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeKey, open, reactionTabs, refreshToken, targetId, targetType]);

  if (!open) return null;

  const activeLabel =
    activeKey === 'all' ? 'All reactions' : allowedMap.get(activeKey)?.label || activeKey || 'Reaction';

  return (
    <div
      className="fixed inset-0 z-[1300] flex items-end justify-center bg-slate-950/60 px-3 py-3 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[min(92dvh,42rem)] w-full max-w-lg flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_32px_100px_rgba(15,23,42,0.38)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'People who reacted'}
      >
        <div className="border-b border-slate-200 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-slate-950">{title || 'People who reacted'}</p>
              <p className="mt-1 text-xs text-slate-500">
                {totalCount > 0 ? `${totalCount} total reaction${totalCount === 1 ? '' : 's'} - ${activeLabel}` : 'No reactions yet'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRefreshToken((value) => value + 1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                aria-label="Refresh reaction profiles"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                aria-label="Close reaction profiles"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveKey('all')}
              className={[
                'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                activeKey === 'all'
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              ].join(' ')}
            >
              All
              <span className={activeKey === 'all' ? 'text-white/80' : 'text-slate-400'}>{totalCount}</span>
            </button>
            {reactionTabs.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveKey(item.key)}
                className={[
                  'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                  activeKey === item.key
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                ].join(' ')}
              >
                <span>{item.emoji}</span>
                <span>{item.label}</span>
                <span className={activeKey === item.key ? 'text-white/80' : 'text-slate-400'}>{item.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-[14rem] flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex min-h-[12rem] items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading profiles...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : reactors.length ? (
            <div className="space-y-2">
              {reactors.map((reactor) => {
                const meta = allowedMap.get(reactor.reactionKey) || DEFAULT_ALLOWED.find((item) => item.key === reactor.reactionKey);
                const avatar = resolveResponsiveAssetUrl(reactor.avatar || '', { width: 96, height: 96, fit: 'cover' });
                const profilePath = getProfilePath(reactor);
                const name = String(reactor.name || reactor.username || 'Scrolith member').trim();
                const username = String(reactor.username || '').trim().replace(/^@+/, '');
                return (
                  <Link
                    key={`${reactor.userId}-${reactor.reactionKey}`}
                    to={profilePath}
                    onClick={onClose}
                    className="group flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2.5 transition hover:border-blue-100 hover:bg-blue-50/60"
                  >
                    <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
                      {avatar ? (
                        <img src={avatar} alt={name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                      ) : (
                        <UserRound className="h-5 w-5" />
                      )}
                      <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-white text-[12px] shadow-sm">
                        {meta?.emoji || '\u{1F44D}'}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900 group-hover:text-blue-700">{name}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {username ? `@${username}` : 'View profile'}{formatTime(reactor.reactedAt) ? ` - ${formatTime(reactor.reactedAt)}` : ''}
                      </span>
                    </span>
                    <span className="hidden rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 sm:inline-flex">
                      View
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-[12rem] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl shadow-sm">{'\u{1F44D}'}</div>
              <p className="mt-3 text-sm font-semibold text-slate-800">No reactors to show yet</p>
              <p className="mt-1 max-w-xs text-xs text-slate-500">When people react, their public profiles will appear here in real time.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReactionReactorsModal;
