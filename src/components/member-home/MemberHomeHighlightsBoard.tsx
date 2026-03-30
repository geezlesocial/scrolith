import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

type HighlightTone = 'slate' | 'blue' | 'emerald' | 'amber' | 'violet' | 'rose';

export type MemberHomeHighlightPill = {
  label: string;
  value: string;
};

export type MemberHomeHighlightItem = {
  id: string;
  title: string;
  description: string;
  eyebrow?: string;
  meta?: string;
  badge?: string;
  ctaLabel?: string;
  href?: string;
  onClick?: () => void;
  mediaUrl?: string | null;
  fallbackMediaUrl?: string | null;
  icon?: React.ReactNode;
  tone?: HighlightTone;
};

const BRAND_LOGO_URL = '/logo.png';

const toneClasses: Record<HighlightTone, { ring: string; badge: string; icon: string }> = {
  slate: {
    ring: 'border-slate-200 bg-white',
    badge: 'bg-slate-100 text-slate-700',
    icon: 'bg-slate-100 text-slate-700'
  },
  blue: {
    ring: 'border-blue-200 bg-gradient-to-br from-blue-50 via-white to-indigo-50',
    badge: 'bg-blue-100 text-blue-700',
    icon: 'bg-blue-100 text-blue-700'
  },
  emerald: {
    ring: 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50',
    badge: 'bg-emerald-100 text-emerald-700',
    icon: 'bg-emerald-100 text-emerald-700'
  },
  amber: {
    ring: 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50',
    badge: 'bg-amber-100 text-amber-700',
    icon: 'bg-amber-100 text-amber-700'
  },
  violet: {
    ring: 'border-violet-200 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50',
    badge: 'bg-violet-100 text-violet-700',
    icon: 'bg-violet-100 text-violet-700'
  },
  rose: {
    ring: 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-pink-50',
    badge: 'bg-rose-100 text-rose-700',
    icon: 'bg-rose-100 text-rose-700'
  }
};

const ActionSurface = ({
  item,
  children
}: {
  item: MemberHomeHighlightItem;
  children: React.ReactNode;
}) => {
  if (item.onClick) {
    return (
      <button
        type="button"
        onClick={item.onClick}
        className="group flex h-full w-full flex-col text-left"
      >
        {children}
      </button>
    );
  }

  if (item.href) {
    return (
      <Link to={item.href} className="group flex h-full w-full flex-col text-left">
        {children}
      </Link>
    );
  }

  return <div className="flex h-full w-full flex-col text-left">{children}</div>;
};

const HighlightMedia = ({
  item,
  compact
}: {
  item: MemberHomeHighlightItem;
  compact: boolean;
}) => {
  const fallbackMediaUrl = String(item.fallbackMediaUrl || BRAND_LOGO_URL).trim();
  const initialSrc = String(item.mediaUrl || '').trim();
  const [src, setSrc] = React.useState(initialSrc || fallbackMediaUrl || '');
  const [hidden, setHidden] = React.useState(!initialSrc && !fallbackMediaUrl);

  React.useEffect(() => {
    const nextSrc = String(item.mediaUrl || '').trim();
    const nextFallback = String(item.fallbackMediaUrl || BRAND_LOGO_URL).trim();
    setSrc(nextSrc || nextFallback || '');
    setHidden(!nextSrc && !nextFallback);
  }, [item.fallbackMediaUrl, item.mediaUrl]);

  if (hidden || !src) return null;

  const isBrandFallback = src === BRAND_LOGO_URL || src === fallbackMediaUrl && fallbackMediaUrl === BRAND_LOGO_URL;

  return (
    <div className="relative mt-3 overflow-hidden rounded-2xl border border-white/70 bg-white/80">
      <img
        src={src}
        alt={item.title}
        className={[
          compact ? 'h-24 w-full' : 'h-28 w-full',
          isBrandFallback ? 'object-contain bg-slate-50 p-4' : 'object-cover'
        ].join(' ')}
        loading="lazy"
        decoding="async"
        onError={() => {
          if (src !== fallbackMediaUrl && fallbackMediaUrl) {
            setSrc(fallbackMediaUrl);
            return;
          }
          setHidden(true);
        }}
      />
    </div>
  );
};

export default function MemberHomeHighlightsBoard({
  title,
  subtitle,
  pills,
  items,
  compact = false,
  className = ''
}: {
  title: string;
  subtitle: string;
  pills?: MemberHomeHighlightPill[];
  items: MemberHomeHighlightItem[];
  compact?: boolean;
  className?: string;
}) {
  if (!items.length) return null;

  return (
    <section
      className={[
        'rounded-3xl border border-white/70 bg-white p-4 shadow-sm',
        compact ? 'space-y-3' : 'space-y-4 sm:p-5',
        className
      ].join(' ')}
    >
      <div className={compact ? 'space-y-3' : 'flex flex-wrap items-start justify-between gap-4'}>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-500">Discover</p>
          <h2 className={compact ? 'mt-1 text-lg font-semibold text-slate-900' : 'mt-1 text-xl font-semibold text-slate-900'}>
            {title}
          </h2>
          <p className={compact ? 'mt-1 text-sm text-slate-500' : 'mt-2 max-w-2xl text-sm text-slate-500'}>
            {subtitle}
          </p>
        </div>
        {pills?.length ? (
          <div className="flex flex-wrap gap-2">
            {pills.slice(0, compact ? 3 : 5).map((pill) => (
              <div
                key={`${pill.label}:${pill.value}`}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
              >
                {pill.label}: {pill.value}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className={compact ? 'grid grid-cols-1 gap-3' : 'grid gap-3 md:grid-cols-2 xl:grid-cols-3'}>
        {items.map((item) => {
          const tone = toneClasses[item.tone || 'slate'];
          return (
            <div
              key={item.id}
              className={[
                'overflow-hidden rounded-3xl border p-4 shadow-sm transition hover:shadow-md',
                tone.ring
              ].join(' ')}
            >
              <ActionSurface item={item}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {item.eyebrow ? (
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {item.eyebrow}
                      </p>
                    ) : null}
                    <h3 className="mt-1 text-base font-semibold text-slate-900 break-words [overflow-wrap:anywhere]">
                      {item.title}
                    </h3>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {item.badge ? (
                      <span className={['rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide', tone.badge].join(' ')}>
                        {item.badge}
                      </span>
                    ) : null}
                    {item.icon ? (
                      <span className={['inline-flex h-10 w-10 items-center justify-center rounded-2xl', tone.icon].join(' ')}>
                        {item.icon}
                      </span>
                    ) : null}
                  </div>
                </div>

                <HighlightMedia item={item} compact={compact} />

                <p className="mt-3 text-sm leading-6 text-slate-600 break-words [overflow-wrap:anywhere]">
                  {item.description}
                </p>
                {item.meta ? <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-400">{item.meta}</p> : null}
                {item.ctaLabel ? (
                  <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span>{item.ctaLabel}</span>
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </div>
                ) : null}
              </ActionSurface>
            </div>
          );
        })}
      </div>
    </section>
  );
}
