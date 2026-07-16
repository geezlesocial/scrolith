import React, { useId, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import InlineAutoplayVideo from '../media/InlineAutoplayVideo';
import OptimizedImage from '../media/OptimizedImage';
import { resolveResponsiveAssetUrl } from '../../utils/assetUrl';
import {
  enterpriseCtaPrimary,
  enterprisePanel,
  enterpriseWidgetBody,
  enterpriseWidgetMeta,
  enterpriseWidgetTitle
} from '../enterprise/enterpriseClasses';

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

const isBrandLogoUrl = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized === BRAND_LOGO_URL ||
    normalized.endsWith('/logo.png') ||
    normalized.includes('/logo.png?') ||
    normalized.includes('scrolith-logo')
  );
};

/** Coach / Scrolitha primary assistant card detection — preserves existing item ids. */
export const isScrolithaCoachHighlight = (item: MemberHomeHighlightItem) => {
  const id = String(item.id || '').toLowerCase();
  const eyebrow = String(item.eyebrow || '').toLowerCase();
  const title = String(item.title || '').toLowerCase();
  return (
    id.includes('scrolitha') ||
    eyebrow.includes('scrolitha') ||
    eyebrow.includes('coach') ||
    title.includes('scrolitha coach')
  );
};

const toneClasses: Record<HighlightTone, { ring: string; badge: string; icon: string }> = {
  slate: {
    ring: 'border-slate-200/90 bg-white',
    badge: 'bg-slate-100 text-slate-700',
    icon: 'bg-slate-100 text-slate-700'
  },
  blue: {
    ring: 'border-blue-200/90 bg-white',
    badge: 'bg-blue-100 text-blue-700',
    icon: 'bg-blue-100 text-blue-700'
  },
  emerald: {
    ring: 'border-emerald-200/90 bg-white',
    badge: 'bg-emerald-100 text-emerald-700',
    icon: 'bg-emerald-100 text-emerald-700'
  },
  amber: {
    ring: 'border-amber-200/90 bg-white',
    badge: 'bg-amber-100 text-amber-700',
    icon: 'bg-amber-100 text-amber-700'
  },
  violet: {
    ring: 'border-violet-200/90 bg-white',
    badge: 'bg-violet-100 text-violet-700',
    icon: 'bg-violet-100 text-violet-700'
  },
  rose: {
    ring: 'border-rose-200/90 bg-white',
    badge: 'bg-rose-100 text-rose-700',
    icon: 'bg-rose-100 text-rose-700'
  }
};

const ActionSurface = ({
  item,
  children,
  className = ''
}: {
  item: MemberHomeHighlightItem;
  children: React.ReactNode;
  className?: string;
}) => {
  const surfaceClass = ['group flex h-full w-full flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2', className]
    .filter(Boolean)
    .join(' ');

  if (item.onClick) {
    return (
      <button type="button" onClick={item.onClick} className={surfaceClass} aria-label={item.ctaLabel || item.title}>
        {children}
      </button>
    );
  }

  if (item.href) {
    return (
      <Link to={item.href} className={surfaceClass} aria-label={item.ctaLabel || item.title}>
        {children}
      </Link>
    );
  }

  return <div className={['flex h-full w-full flex-col text-left', className].filter(Boolean).join(' ')}>{children}</div>;
};

const parseCapabilityChips = (meta?: string) =>
  String(meta || '')
    .split(/[·|/,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 6);

const ModuleThumb = ({
  item,
  compact
}: {
  item: MemberHomeHighlightItem;
  compact: boolean;
}) => {
  const fallbackMediaUrl = String(item.fallbackMediaUrl || '').trim();
  const initialSrc = String(item.mediaUrl || '').trim();
  const videoUrl = String(item.videoUrl || '').trim();
  const posterUrl = String(item.posterUrl || '').trim();
  const [src, setSrc] = React.useState(initialSrc);
  const [hidden, setHidden] = React.useState(!initialSrc && !videoUrl);

  React.useEffect(() => {
    const nextSrc = String(item.mediaUrl || '').trim();
    setSrc(nextSrc);
    setHidden(!nextSrc && !String(item.videoUrl || '').trim());
  }, [item.mediaUrl, item.videoUrl]);

  // Brand logo must never become a large module hero — icon badge handles identity.
  if (isBrandLogoUrl(src) || isBrandLogoUrl(initialSrc)) {
    return null;
  }

  if (hidden && !item.icon) return null;
  if (hidden && item.icon) {
    const tone = toneClasses[item.tone || 'slate'];
    return (
      <span
        className={[
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12',
          tone.icon
        ].join(' ')}
        aria-hidden
      >
        {item.icon}
      </span>
    );
  }

  if (hidden || (!src && !videoUrl)) return null;

  const size = compact ? 44 : 48;
  const shouldRenderVideo = Boolean(
    videoUrl && (isVideoUrl(videoUrl) || videoUrl.includes('/api/files/content/') || Boolean(posterUrl))
  );
  const optimizedPosterUrl = shouldRenderVideo
    ? resolveResponsiveAssetUrl(posterUrl || src || fallbackMediaUrl || undefined, {
        width: size * 2,
        height: size * 2,
        fit: 'cover',
        quality: 68
      })
    : '';

  return (
    <div
      className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50 sm:h-12 sm:w-12"
      aria-hidden
    >
      {shouldRenderVideo ? (
        <InlineAutoplayVideo
          src={videoUrl}
          poster={optimizedPosterUrl || undefined}
          controls={false}
          loop
          autoplayEnabled
          threshold={0.25}
          rootMargin="0px 0px 8% 0px"
          showMuteToggle={false}
          loadingLabel={false}
          containerClassName="h-full w-full"
          className="h-full w-full object-cover"
          overlay={null}
          preloadRootMargin="160px 0px 160px 0px"
        />
      ) : (
        <OptimizedImage
          src={src}
          fallbackSrc={fallbackMediaUrl || undefined}
          alt=""
          width={size * 2}
          height={size * 2}
          sizes={`${size}px`}
          fit="cover"
          quality={68}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => {
            if (src !== fallbackMediaUrl && fallbackMediaUrl && !isBrandLogoUrl(fallbackMediaUrl)) {
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

const CoachBrandMark = ({
  mediaUrl,
  icon
}: {
  mediaUrl?: string | null;
  icon?: React.ReactNode;
}) => {
  const src = String(mediaUrl || BRAND_LOGO_URL).trim() || BRAND_LOGO_URL;
  return (
    <div
      className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50 to-white shadow-sm sm:h-14 sm:w-14"
      data-testid="scrolith-discovery-coach-mark"
    >
      <OptimizedImage
        src={src}
        fallbackSrc={BRAND_LOGO_URL}
        alt="Scrolitha"
        width={56}
        height={56}
        sizes="56px"
        fit="contain"
        quality={72}
        loading="eager"
        fetchPriority="high"
        className="h-8 w-8 object-contain sm:h-9 sm:w-9"
      />
      {icon ? (
        <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white bg-violet-600 text-white shadow-sm">
          {icon}
        </span>
      ) : (
        <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white bg-violet-600 text-white shadow-sm">
          <Sparkles className="h-3 w-3" aria-hidden />
        </span>
      )}
    </div>
  );
};

const CoachCard = ({
  item,
  compact
}: {
  item: MemberHomeHighlightItem;
  compact: boolean;
}) => {
  const chips = parseCapabilityChips(item.meta);
  const tone = toneClasses[item.tone || 'violet'];

  return (
    <div
      className={[
        'rounded-2xl border p-3.5 shadow-sm sm:p-4',
        tone.ring,
        'bg-gradient-to-r from-violet-50/80 via-white to-white'
      ].join(' ')}
      data-testid="scrolith-discovery-coach-card"
    >
      <ActionSurface
        item={item}
        className="!flex-col !items-stretch gap-3 sm:!flex-row sm:!items-center sm:gap-4"
      >
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          <CoachBrandMark mediaUrl={item.mediaUrl || BRAND_LOGO_URL} icon={item.icon} />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {item.eyebrow ? (
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-600">
                  {item.eyebrow}
                </span>
              ) : null}
              {item.badge ? (
                <span
                  className={[
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    tone.badge
                  ].join(' ')}
                >
                  {item.badge}
                </span>
              ) : null}
              <span
                className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700"
                title="Assistant available in Member Home"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                Ready
              </span>
            </div>

            <h3
              className={[
                'mt-1 font-semibold leading-snug text-slate-900',
                compact ? 'text-[15px]' : 'text-base sm:text-[17px]'
              ].join(' ')}
            >
              {item.title}
            </h3>
            <p className={['mt-0.5 line-clamp-2', enterpriseWidgetBody].join(' ')}>{item.description}</p>

            {chips.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Coach capabilities">
                {chips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-slate-200/90 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {item.ctaLabel ? (
          <span
            className={[
              enterpriseCtaPrimary,
              'w-full shrink-0 justify-center gap-1.5 px-3.5 py-2 text-xs sm:w-auto sm:self-center sm:text-sm'
            ].join(' ')}
          >
            {item.ctaLabel}
            <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden />
          </span>
        ) : null}
      </ActionSurface>
    </div>
  );
};

const ModuleCard = ({
  item,
  compact
}: {
  item: MemberHomeHighlightItem;
  compact: boolean;
}) => {
  const tone = toneClasses[item.tone || 'slate'];

  return (
    <div
      className={[
        'rounded-2xl border p-3 shadow-sm transition hover:border-slate-300 hover:shadow-md sm:p-3.5',
        tone.ring
      ].join(' ')}
      data-testid="scrolith-discovery-module-card"
    >
      <ActionSurface item={item}>
        <div className="flex items-start gap-3">
          <ModuleThumb item={item} compact={compact} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {item.eyebrow ? (
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{item.eyebrow}</p>
              ) : null}
              {item.badge ? (
                <span
                  className={[
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    tone.badge
                  ].join(' ')}
                >
                  {item.badge}
                </span>
              ) : null}
            </div>
            <h3 className="mt-0.5 text-sm font-semibold leading-snug text-slate-900 line-clamp-2 sm:text-[15px]">
              {item.title}
            </h3>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600 sm:text-sm sm:leading-5">
              {item.description}
            </p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className={['truncate', enterpriseWidgetMeta].join(' ')}>
                {item.meta || 'Live on member home'}
              </span>
              {item.ctaLabel ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-900 sm:text-sm">
                  {item.ctaLabel}
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden />
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </ActionSurface>
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
  const headingId = useId();

  const { coachItem, moduleItems } = useMemo(() => {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    const coach = list.find((item) => isScrolithaCoachHighlight(item)) || null;
    const modules = list.filter((item) => !coach || item.id !== coach.id);
    return { coachItem: coach, moduleItems: modules };
  }, [items]);

  if (!items.length) return null;

  const visiblePills = (pills || []).slice(0, compact ? 4 : 6);

  return (
    <section
      className={[
        enterprisePanel,
        'p-4 sm:p-5',
        className
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="scrolith-member-home-discovery-board"
      aria-labelledby={headingId}
    >
      {/* A. Compact discovery header */}
      <header
        className={
          compact
            ? 'space-y-2.5'
            : 'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4'
        }
        data-testid="scrolith-discovery-header"
      >
        <div className="min-w-0">
          <p className={enterpriseWidgetTitle}>Discover</p>
          <h2
            id={headingId}
            className={[
              'mt-1 font-semibold tracking-tight text-slate-900',
              compact ? 'text-lg' : 'text-lg sm:text-xl'
            ].join(' ')}
          >
            {title}
          </h2>
          <p className={['mt-1 max-w-2xl line-clamp-2', enterpriseWidgetBody].join(' ')}>{subtitle}</p>
        </div>

        {visiblePills.length ? (
          <div
            className="flex flex-wrap gap-1.5 sm:max-w-[22rem] sm:justify-end"
            data-testid="scrolith-discovery-metrics"
            aria-label="Discovery metrics"
          >
            {visiblePills.map((pill) => (
              <div
                key={`${pill.label}:${pill.value}`}
                className="rounded-full border border-slate-200/90 bg-slate-50 px-2.5 py-1"
              >
                <p className="text-[11px] font-semibold tabular-nums text-slate-700">
                  <span className="uppercase tracking-wide text-slate-500">{pill.label}</span>
                  <span className="mx-1 text-slate-300" aria-hidden>
                    ·
                  </span>
                  <span className="text-slate-900">{pill.value}</span>
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </header>

      {/* B. Scrolitha Coach primary card — compact, no hero media */}
      {coachItem ? (
        <div className="mt-3.5 sm:mt-4">
          <CoachCard item={coachItem} compact={compact} />
        </div>
      ) : null}

      {/* C. Secondary discovery modules */}
      {moduleItems.length ? (
        <div
          className={[
            'mt-3.5 sm:mt-4',
            compact ? 'grid grid-cols-1 gap-2.5' : 'grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3'
          ].join(' ')}
          data-testid="scrolith-discovery-module-grid"
        >
          {moduleItems.map((item) => (
            <ModuleCard key={item.id} item={item} compact={compact} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
