/**
 * Phase 4 — shared enterprise member-home / feed visual primitives.
 * Pure class strings so MemberHomeSection and CommunityHome stay behavior-identical.
 *
 * Hotfix (layout collapse): structural `scrolith-mh-*` classes pair with
 * index.css rules so desktop columns cannot shrink to a single ~300px track
 * when Tailwind arbitrary grid utilities fail to apply or nested <main> quirks
 * break auto-placement. Keep Tailwind utilities as progressive enhancement.
 */

/** Outer page shell: centered, ~1440–1560px. Always fill available width. */
export const enterprisePageShell =
  'scrolith-mh-shell relative mx-auto box-border w-full min-w-0 max-w-[1560px] px-4 sm:px-6 lg:px-8 xl:px-10';

/**
 * Desktop multi-column grid.
 * - default / <lg: single column stack (mobile)
 * - lg+: left rail + main feed (right stacks or sits in third track via CSS)
 * - xl+: left + main + right
 *
 * `scrolith-mh-grid` carries the authoritative grid-template-columns in CSS.
 */
export const enterpriseMemberHomeGrid =
  'scrolith-mh-grid relative z-0 grid w-full min-w-0 items-start gap-5 ' +
  'lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)] lg:gap-6 ' +
  'xl:grid-cols-[minmax(280px,300px)_minmax(0,1fr)_minmax(300px,340px)] xl:gap-6 ' +
  '2xl:grid-cols-[minmax(300px,320px)_minmax(0,1fr)_minmax(320px,340px)] 2xl:gap-7';

/** Sticky rail that respects desktop header (~6rem) without nested scroll traps on mobile. */
export const enterpriseStickyRail =
  'lg:sticky lg:top-24 lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-0.5 ' +
  '[scrollbar-gutter:stable]';

export const enterpriseStickyRailRight =
  'xl:sticky xl:top-24 xl:max-h-[calc(100vh-6.5rem)] xl:overflow-y-auto xl:overscroll-contain ' +
  '[scrollbar-gutter:stable]';

/** Side widgets / panels */
export const enterprisePanel =
  'overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_8px_24px_-18px_rgba(15,23,42,0.18)]';

export const enterprisePanelPadding = 'p-5 sm:p-6';

export const enterpriseWidgetTitle =
  'text-[13px] font-semibold uppercase tracking-[0.14em] text-slate-500';

export const enterpriseWidgetHeading =
  'text-base font-semibold leading-snug text-slate-900 sm:text-[17px]';

export const enterpriseWidgetBody = 'text-sm leading-relaxed text-slate-600 sm:text-[15px]';

export const enterpriseWidgetMeta = 'text-xs leading-snug text-slate-500 sm:text-sm';

export const enterpriseWidgetRow =
  'flex w-full items-start gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 text-left transition ' +
  'hover:border-slate-300 hover:bg-slate-50/80 focus-visible:outline focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 focus-visible:outline-slate-400';

export const enterpriseAvatarLg =
  'h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-2xl bg-slate-100 ring-4 ring-white sm:h-20 sm:w-20';

export const enterpriseAvatarMd =
  'h-12 w-12 shrink-0 overflow-hidden rounded-full bg-slate-100 sm:h-14 sm:w-14';

export const enterpriseAvatarSm =
  'h-11 w-11 shrink-0 overflow-hidden rounded-full bg-slate-100';

export const enterpriseCta =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-4 ' +
  'text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400';

export const enterpriseCtaPrimary =
  'inline-flex min-h-11 items-center justify-center rounded-full bg-slate-900 px-4 text-sm font-semibold ' +
  'text-white transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 focus-visible:outline-slate-400';

/**
 * Post card shell — stable surface, no hover lift (avoids feed shake).
 */
export const enterprisePostCard =
  'overflow-hidden rounded-2xl border border-slate-200/90 bg-white ' +
  'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-22px_rgba(15,23,42,0.28)] ' +
  'transition-shadow duration-150 ease-out hover:shadow-[0_2px_8px_rgba(15,23,42,0.06),0_16px_36px_-22px_rgba(15,23,42,0.32)]';

export const enterprisePostCardPadding = 'p-5 sm:p-6';

export const enterprisePostCardCompact = 'p-4 sm:p-5';

export const enterpriseSponsoredLabel =
  'inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold ' +
  'uppercase tracking-wide text-amber-800';

/**
 * Main feed column — grows with the center track (minmax(0,1fr)).
 * Soft max-width keeps readability without collapsing the page shell.
 * Do NOT use nested <main> for this column (invalid HTML; can break grid placement).
 */
export const enterpriseFeedColumn =
  'scrolith-mh-feed order-1 min-w-0 w-full max-w-full space-y-4 lg:order-2 ' +
  'xl:max-w-[760px] xl:justify-self-stretch 2xl:max-w-[760px]';

export const enterpriseLeftColumn =
  `scrolith-mh-left order-2 min-w-0 w-full space-y-4 lg:order-1 ${enterpriseStickyRail}`;

/**
 * Right rail — stays a single grid cell (never lg:col-span-2).
 * Spanning 2 cols at lg forced a full-width second row and made the page look
 * like a narrow left stack with empty right space on scaled desktops.
 */
export const enterpriseRightColumn =
  `scrolith-mh-right order-3 min-w-0 w-full space-y-4 ${enterpriseStickyRailRight}`;
