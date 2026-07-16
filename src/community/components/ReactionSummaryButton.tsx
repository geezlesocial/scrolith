import React, { useMemo } from 'react';

type AllowedReaction = {
  key: string;
  label: string;
  emoji: string;
  enabled?: boolean;
};

type ReactionSummaryButtonProps = {
  counts?: Record<string, number>;
  allowed?: AllowedReaction[];
  onClick: (event: React.SyntheticEvent) => void;
  className?: string;
  variant?: 'light' | 'dark';
  compact?: boolean;
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

const toSafeCount = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
};

const ReactionSummaryButton: React.FC<ReactionSummaryButtonProps> = ({
  counts,
  allowed,
  onClick,
  className = '',
  variant = 'light',
  compact = false
}) => {
  const allowedMap = useMemo(() => {
    const map = new Map<string, AllowedReaction>();
    (Array.isArray(allowed) && allowed.length ? allowed : DEFAULT_ALLOWED).forEach((entry) => {
      const key = String(entry?.key || '').trim().toLowerCase();
      if (key && entry?.emoji) map.set(key, entry);
    });
    DEFAULT_ALLOWED.forEach((entry) => {
      if (!map.has(entry.key)) map.set(entry.key, entry);
    });
    return map;
  }, [allowed]);

  const topReactions = useMemo(
    () =>
      Object.entries(counts || {})
        .map(([key, value]) => ({
          key,
          count: toSafeCount(value),
          meta: allowedMap.get(String(key || '').trim().toLowerCase()) || DEFAULT_ALLOWED[0]
        }))
        .filter((entry) => entry.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
    [allowedMap, counts]
  );

  const totalCount = useMemo(
    () => Object.values(counts || {}).reduce((sum, value) => sum + toSafeCount(value), 0),
    [counts]
  );

  if (!totalCount) return null;

  const buttonClassName =
    variant === 'dark'
      ? 'border-white/12 bg-black/45 text-white hover:bg-black/65'
      : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700';

  const subLabelClassName = variant === 'dark' ? 'text-white/70' : 'text-slate-500';
  const emojiShellClassName = variant === 'dark' ? 'border-black/60 bg-white/95' : 'border-white bg-slate-100';

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      className={[
        'inline-flex min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 text-left shadow-sm transition',
        buttonClassName,
        className
      ]
        .filter(Boolean)
        .join(' ')}
      title="View people who reacted"
      aria-label={`View people who reacted. ${totalCount} total reactions.`}
    >
      <span className="inline-flex shrink-0 -space-x-1.5">
        {topReactions.map((item) => (
          <span
            key={item.key}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[12px] shadow-sm ${emojiShellClassName}`}
          >
            {item.meta.emoji}
          </span>
        ))}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold">
          {totalCount.toLocaleString()} reaction{totalCount === 1 ? '' : 's'}
        </span>
        {!compact ? <span className={`block truncate text-[11px] ${subLabelClassName}`}>View people who reacted</span> : null}
      </span>
    </button>
  );
};

export default ReactionSummaryButton;
