import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import InlineAutoplayVideo from '../media/InlineAutoplayVideo';

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
  videoUrl?: string | null;
  posterUrl?: string | null;
  fallbackMediaUrl?: string | null;
  icon?: React.ReactNode;
  tone?: HighlightTone;
};

const BRAND_LOGO_URL = '/logo.png';
const isVideoUrl = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return /\.(mp4|webm|mov|m4v|ogg)(?:$|[?#])/.test(normalized);
};

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
  compact,
  showMarginTop = true,
  containerClassName = '',
  heightClassName
}: {
  item: MemberHomeHighlightItem;
  compact: boolean;
  showMarginTop?: boolean;
  containerClassName?: string;
  heightClassName?: string;
}) => {
  const fallbackMediaUrl = String(item.fallbackMediaUrl || BRAND_LOGO_URL).trim();
  const initialSrc = String(item.mediaUrl || '').trim();
  const videoUrl = String(item.videoUrl || '').trim();
  const posterUrl = String(item.posterUrl || '').trim();
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
  const shouldRenderVideo = Boolean(videoUrl && isVideoUrl(videoUrl));
  const resolvedHeightClassName = heightClassName || (compact ? 'h-24 w-full' : 'h-28 w-full');

  return (
    <div
      className={[
        'relative overflow-hidden rounded-2xl border border-white/70 bg-white/80',
        showMarginTop ? 'mt-3' : '',
        containerClassName
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {shouldRenderVideo ? (
        <InlineAutoplayVideo
          src={videoUrl}
          poster={posterUrl || src || fallbackMediaUrl || undefined}
          controls={false}
          loop
          autoplayEnabled
          showMuteToggle={false}
          loadingLabel={false}
          containerClassName="w-full"
          className={[resolvedHeightClassName, 'object-cover'].join(' ')}
          overlay={null}
        />
      ) : (
        <img
          src={src}
          alt={item.title}
          className={[
            resolvedHeightClassName,
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
      )}
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

  if (!compact) {
    const featuredItem = items[0];
    const spotlightItems = items.slice(1, 3);
    const gridItems = items.slice(3, 6);
    const featuredTone = toneClasses[featuredItem.tone || 'slate'];

    return (
      <section className={['overflow-hidden rounded-[2rem] border border-white/80 bg-white p-5 shadow-sm sm:p-6', className].join(' ')}>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-500">Discover</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{subtitle}</p>
            </div>
            {pills?.length ? (
              <div className="flex flex-wrap gap-2 lg:max-w-[28rem] lg:justify-end">
                {pills.slice(0, 5).map((pill) => (
                  <div
                    key={`${pill.label}:${pill.value}`}
                    className="rounded-full border border-slate-200 bg-slate-50/90 px-3 py-1.5"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {pill.label}: <span className="text-slate-900">{pill.value}</span>
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
            <div className={['overflow-hidden rounded-[1.75rem] border p-5 shadow-sm', featuredTone.ring].join(' ')}>
              <ActionSurface item={featuredItem}>
                <div className="flex flex-col gap-5 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_18rem] 2xl:items-stretch">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {featuredItem.eyebrow ? (
                        <span className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {featuredItem.eyebrow}
                        </span>
                      ) : null}
                      {featuredItem.badge ? (
                        <span
                          className={[
                            'rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]',
                            featuredTone.badge
                          ].join(' ')}
                        >
                          {featuredItem.badge}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="text-2xl font-semibold leading-tight text-slate-950 line-clamp-2">{featuredItem.title}</h3>
                        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 line-clamp-3">{featuredItem.description}</p>
                      </div>
                      {featuredItem.icon ? (
                        <span
                          className={[
                            'hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl lg:inline-flex',
                            featuredTone.icon
                          ].join(' ')}
                        >
                          {featuredItem.icon}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      {featuredItem.meta ? (
                        <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                          {featuredItem.meta}
                        </span>
                      ) : null}
                      {featuredItem.ctaLabel ? (
                        <span className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                          {featuredItem.ctaLabel}
                          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <HighlightMedia
                    item={featuredItem}
                    compact={false}
                    showMarginTop={false}
                    containerClassName="h-full rounded-[1.5rem]"
                    heightClassName="h-full min-h-[13rem] w-full"
                  />
                </div>
              </ActionSurface>
            </div>

            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-1">
              {spotlightItems.map((item) => {
                const tone = toneClasses[item.tone || 'slate'];
                return (
                  <div
                    key={item.id}
                    className={['overflow-hidden rounded-[1.5rem] border p-4 shadow-sm transition hover:shadow-md', tone.ring].join(' ')}
                  >
                    <ActionSurface item={item}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {item.eyebrow ? (
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{item.eyebrow}</p>
                          ) : null}
                          <h3 className="mt-1 text-base font-semibold leading-6 text-slate-950 line-clamp-2">{item.title}</h3>
                        </div>
                        {item.badge ? (
                          <span className={['shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide', tone.badge].join(' ')}>
                            {item.badge}
                          </span>
                        ) : item.icon ? (
                          <span className={['inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', tone.icon].join(' ')}>
                            {item.icon}
                          </span>
                        ) : null}
                      </div>
                      <HighlightMedia item={item} compact={false} heightClassName="h-32 w-full" />
                      <p className="mt-3 text-sm leading-6 text-slate-600 line-clamp-3">{item.description}</p>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{item.meta || 'Live on member home'}</span>
                        {item.ctaLabel ? (
                          <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950">
                            {item.ctaLabel}
                            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                          </span>
                        ) : null}
                      </div>
                    </ActionSurface>
                  </div>
                );
              })}
            </div>
          </div>

          {gridItems.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {gridItems.map((item) => {
                const tone = toneClasses[item.tone || 'slate'];
                return (
                  <div
                    key={item.id}
                    className={['overflow-hidden rounded-[1.5rem] border p-4 shadow-sm transition hover:shadow-md', tone.ring].join(' ')}
                  >
                    <ActionSurface item={item}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {item.eyebrow ? (
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{item.eyebrow}</p>
                          ) : null}
                          <h3 className="mt-1 text-base font-semibold leading-6 text-slate-950 line-clamp-2">{item.title}</h3>
                        </div>
                        {item.icon ? (
                          <span className={['inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', tone.icon].join(' ')}>
                            {item.icon}
                          </span>
                        ) : null}
                      </div>
                      {item.badge ? (
                        <span className={['mt-3 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide', tone.badge].join(' ')}>
                          {item.badge}
                        </span>
                      ) : null}
                      {item.meta ? <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">{item.meta}</p> : null}
                      <p className="mt-3 text-sm leading-6 text-slate-600 line-clamp-3">{item.description}</p>
                      {item.ctaLabel ? (
                        <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-950">
                          <span>{item.ctaLabel}</span>
                          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                        </div>
                      ) : null}
                    </ActionSurface>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>
    );
  }

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
