/**
 * Mobile / enterprise Post Card Design System.
 *
 * Single source of spacing, typography, and component heights for post cards
 * on Member Home, Community, Scroll surfaces that reuse post chrome, Profile,
 * Search, and Mobile feeds. Screens must not invent their own post spacing.
 *
 * Spacing contract (section stack, top → bottom):
 *   Header → Title 12px | Title → Body 10px | Body → Translation 12px
 *   Translation → AI Coach 12px | Coach → Chips 12px | Chips → Survey 12px
 *   Survey → Stats 12px | Stats → Actions 8px
 */

/** Design tokens (px) — use for tests and non-Tailwind consumers */
export const postCardTokens = {
  cardPaddingX: 16,
  cardPaddingY: 16,
  sectionGap: 12,
  titleToBodyGap: 10,
  statsToActionsGap: 8,
  chipGap: 8,
  chipMinHeight: 32,
  avatarSize: 48,
  followButtonHeight: 36,
  aiCoachMinHeight: 72,
  aiCoachPadding: 16,
  surveyButtonHeight: 42,
  reactionButtonMinHeight: 48,
  actionIconSize: 22,
  touchTargetMin: 44,
  bodyMaxLines: 5,
  borderRadiusCard: 16,
  borderRadiusChip: 999,
  shadow:
    '0 1px 2px rgba(15,23,42,0.04), 0 12px 28px -22px rgba(15,23,42,0.28)',
  animationDurationMs: 150
} as const;

/** Typography scale (mobile-first, readable) */
export const postCardType = {
  name: 'text-[18px] font-semibold leading-snug tracking-tight text-slate-950',
  username: 'text-[13px] leading-snug text-slate-500',
  date: 'text-[12px] font-medium leading-snug text-slate-500',
  title: 'text-[17px] font-bold leading-snug tracking-tight text-slate-950',
  body: 'text-[15px] leading-[1.65] text-slate-700',
  chip: 'text-[11px] font-semibold leading-none sm:text-xs',
  surveyTitle: 'text-[15px] font-medium leading-snug text-slate-900',
  button: 'text-[14px] font-semibold',
  stats: 'text-[13px] font-medium text-slate-500',
  actionLabel: 'text-[11px] font-semibold tracking-wide text-slate-600'
} as const;

/** Shell surface — no hover lift (prevents feed shake) */
export const postCardShellClass =
  'scrolith-post-card overflow-hidden rounded-2xl border border-slate-200/90 bg-white ' +
  'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-22px_rgba(15,23,42,0.28)] ' +
  'transition-shadow duration-150 ease-out ' +
  'hover:shadow-[0_2px_8px_rgba(15,23,42,0.06),0_16px_36px_-22px_rgba(15,23,42,0.32)]';

/** Identical horizontal padding on every card — 16px L/R, no exceptions */
export const postCardPaddingClass = 'box-border px-4 py-4';

/** Compact density still keeps 16px horizontal padding */
export const postCardPaddingCompactClass = 'box-border px-4 py-3.5';

/**
 * Vertical section stack after the header.
 * gap-3 = 12px between major sections (never collapse).
 */
export const postCardSectionStackClass = 'mt-3 flex min-w-0 flex-col gap-3';

/** Title → body gap (10px) inside the text block */
export const postCardTextBlockClass = 'flex min-w-0 flex-col gap-2.5';

/** Stats row → actions: 8px */
export const postCardStatsRowClass =
  'flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2';

export const postCardActionsRowClass =
  'mt-2 grid grid-cols-5 gap-1 border-t border-slate-100 pt-1 sm:gap-1.5';

/** Equal-width, equal-height action cells — centered, never stretch content */
export const postCardActionButtonClass =
  'group relative inline-flex min-h-12 w-full min-w-0 flex-col items-center justify-center gap-0.5 ' +
  'rounded-xl border border-transparent bg-transparent px-0.5 py-1.5 text-slate-700 transition ' +
  'duration-150 hover:bg-slate-100/90 focus-visible:outline focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 focus-visible:outline-slate-400';

export const postCardActionIconClass =
  'inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center text-[22px] leading-none sm:h-6 sm:w-6 sm:text-2xl';

export const postCardActionIconWrapClass =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 ' +
  'transition duration-150 group-hover:bg-slate-200 sm:h-10 sm:w-10';

/** Recommendation / intel chips — wrap, 8px gap, stable min height, never overlap */
export const postCardChipRailClass = 'flex min-w-0 flex-wrap gap-2';

export const postCardChipClass =
  'inline-flex min-h-8 max-w-full items-center truncate rounded-full border border-slate-200/90 ' +
  'bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold leading-none text-slate-600 sm:text-xs';

export const postCardChipWhyClass =
  'inline-flex min-h-8 max-w-full items-center truncate rounded-full border border-sky-200 ' +
  'bg-sky-50 px-2.5 py-1.5 text-[11px] font-semibold leading-none text-sky-800 sm:text-xs';

export const postCardChipMatchClass =
  'inline-flex min-h-8 max-w-full items-center truncate rounded-full border border-indigo-200 ' +
  'bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold leading-none text-indigo-800 sm:text-xs';

/** AI Coach card — fixed min height, stable padding, button right-aligned */
export const postCardAiCoachClass =
  'box-border flex min-h-[72px] items-center rounded-2xl border border-violet-100 ' +
  'bg-gradient-to-r from-violet-50 to-indigo-50 p-4';

export const postCardAiCoachInnerClass =
  'flex w-full min-w-0 items-center justify-between gap-3';

export const postCardAiCoachButtonClass =
  'inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-violet-200 ' +
  'bg-white px-3 text-[11px] font-semibold uppercase tracking-wide text-violet-700 transition ' +
  'hover:bg-violet-100';

/** Interest survey shell + equal buttons */
export const postCardSurveyShellClass =
  'rounded-[22px] border border-slate-200/80 bg-white/92 px-3.5 py-3 text-slate-900 shadow-sm';

export const postCardSurveyButtonsRowClass = 'grid grid-cols-2 gap-2';

export const postCardSurveyButtonClass =
  'inline-flex h-[42px] w-full min-w-0 items-center justify-center whitespace-nowrap rounded-full ' +
  'border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60';

/** Avatar 48px; follow 36px */
export const postCardAvatarClass =
  'relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full ' +
  'border border-slate-200 shadow-sm';

export const postCardFollowButtonClass =
  'h-9 min-h-9 border-slate-200 bg-white px-3.5 text-xs font-semibold uppercase tracking-wide ' +
  'text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50';

/** Header right cluster stays fixed (Follow + More) — never wraps under name */
export const postCardHeaderClass = 'flex min-w-0 items-start gap-3';

export const postCardHeaderMainClass = 'min-w-0 flex-1 pt-0.5';

export const postCardHeaderRowClass = 'flex min-w-0 items-start justify-between gap-2';

export const postCardHeaderRightClass =
  'flex shrink-0 items-center gap-2 self-start';

/** Body collapsed to 5 lines */
export const postCardBodyClampClass = 'line-clamp-5 whitespace-pre-wrap break-words';

export const postCardBodyExpandedClass = 'whitespace-pre-wrap break-words';

/** Media frame — reserves space before load (aspect ratio placeholder) */
export const postCardMediaFrameClass =
  'relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100';

export const postCardMediaAspectDefault = '16 / 9';
