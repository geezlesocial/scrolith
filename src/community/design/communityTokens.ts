/**
 * Phase 24 — Community design tokens (scoped; does not replace global enterprise tokens).
 */

export const communityBreakpoints = {
  xs: 320,
  sm: 360,
  md: 390,
  lg: 768,
  xl: 1024,
  '2xl': 1280
} as const;

export const communitySpacing = {
  pageX: 'px-3 sm:px-4 lg:px-6',
  pageY: 'py-3 sm:py-5 lg:py-6',
  section: 'space-y-4 sm:space-y-5',
  stack: 'space-y-3',
  cardPad: 'p-3.5 sm:p-4',
  chipGap: 'gap-2',
  railGap: 'gap-3'
} as const;

export const communityTypography = {
  pageTitle: 'text-xl font-bold tracking-tight text-slate-900 sm:text-2xl',
  pageSubtitle: 'text-sm leading-6 text-slate-600',
  sectionTitle: 'text-base font-semibold text-slate-900 sm:text-lg',
  cardTitle: 'text-sm font-semibold text-slate-900 sm:text-base',
  cardMeta: 'text-xs text-slate-500',
  body: 'text-sm leading-6 text-slate-700',
  eyebrow: 'text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-600'
} as const;

export const communityRadius = {
  card: 'rounded-2xl sm:rounded-[24px]',
  chip: 'rounded-full',
  media: 'rounded-xl sm:rounded-2xl',
  shell: 'rounded-[28px] sm:rounded-[32px]'
} as const;

export const communityElevation = {
  card: 'shadow-sm',
  sticky: 'shadow-sm backdrop-blur',
  hero: 'shadow-xl'
} as const;

export const communityTouchTargets = {
  min: 'min-h-11 min-w-11',
  chip: 'min-h-10 px-3 py-2',
  action: 'min-h-11 px-4 py-2.5'
} as const;

export const communityCardMetrics = {
  coverAspect: 'aspect-[16/7]',
  avatar: 'h-12 w-12 sm:h-14 sm:w-14',
  mediaAspect: 'aspect-[4/3]'
} as const;

export const communitySurface = {
  page: 'bg-slate-50',
  panel: 'bg-white',
  muted: 'bg-slate-100',
  accent: 'bg-indigo-50 text-indigo-700',
  border: 'border-slate-200'
} as const;
