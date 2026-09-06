import {
  DESKTOP_MEMBER_HOME_MIN_WIDTH,
  shouldUseMobileShellViewportFor
} from './mobileShellLayoutUtils';

/**
 * Align mobile-shell cutoff with Tailwind `lg` and Member Home 3-column CSS.
 * Previous 1180 + touch≤1366 rule forced MobileHome on common desktop laptops.
 */
export const MOBILE_SHELL_BREAKPOINT = DESKTOP_MEMBER_HOME_MIN_WIDTH;

/** Fixed chrome heights (excluding safe-area insets). Keep in sync with nativeChrome CSS vars. */
export const MOBILE_HEADER_HEIGHT_PX = 52;
export const MOBILE_BOTTOM_NAV_HEIGHT_PX = 56;

export const MOBILE_PAGE_CONTAINER_CLASS = 'mx-auto w-full max-w-[980px] px-3 sm:px-4 md:px-5';
export const MOBILE_PAGE_SECTION_CLASS = `${MOBILE_PAGE_CONTAINER_CLASS} py-4 md:py-5`;
export const MOBILE_HEADER_CONTAINER_CLASS =
  'mx-auto flex w-full min-w-0 max-w-[980px] items-center gap-2 px-3 py-1.5 sm:px-4 md:px-5';
export const MOBILE_HEADER_BAR_CLASS =
  'mx-auto flex w-full min-w-0 max-w-[980px] items-center gap-3 px-3 sm:px-4 md:px-5';
export const MOBILE_BOTTOM_NAV_CONTAINER_CLASS =
  'mx-auto flex w-full max-w-[760px] items-stretch justify-around gap-0.5 px-1.5 py-1 sm:px-3';
/** Shell main content padding: header + bottom nav + safe areas (next-gen chrome). */
export const MOBILE_SHELL_MAIN_PAD_CLASS =
  'pt-[calc(3.25rem+env(safe-area-inset-top,0px))] pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]';
export const MOBILE_SHEET_CARD_CLASS =
  'w-full max-w-[34rem] max-h-[82dvh] overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-2xl sm:rounded-[32px]';
export const MOBILE_MODAL_CARD_CLASS =
  'w-full max-w-[32rem] max-h-[82dvh] overflow-y-auto rounded-[26px] bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-5';
export const MOBILE_STORY_VIEWER_CLASS =
  'relative h-full w-full max-w-[720px] overflow-hidden rounded-[2rem] bg-slate-900';

export const shouldUseMobileShellViewport = () => {
  if (typeof window === 'undefined') return false;
  if ((window as any)?.scrolithDesktop?.shell === 'desktop') return false;
  const hasCoarseTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  return shouldUseMobileShellViewportFor(window.innerWidth, hasCoarseTouch, MOBILE_SHELL_BREAKPOINT);
};
