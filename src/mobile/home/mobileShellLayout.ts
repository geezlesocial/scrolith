export const MOBILE_SHELL_BREAKPOINT = 1180;

export const MOBILE_PAGE_CONTAINER_CLASS = 'mx-auto w-full max-w-[980px] px-3 sm:px-4 md:px-5';
export const MOBILE_PAGE_SECTION_CLASS = `${MOBILE_PAGE_CONTAINER_CLASS} py-4 md:py-5`;
export const MOBILE_HEADER_CONTAINER_CLASS =
  'mx-auto flex w-full min-w-0 max-w-[980px] items-center gap-2 px-3 py-2 sm:px-4 md:px-5';
export const MOBILE_HEADER_BAR_CLASS =
  'mx-auto flex w-full min-w-0 max-w-[980px] items-center gap-3 px-3 sm:px-4 md:px-5';
export const MOBILE_BOTTOM_NAV_CONTAINER_CLASS =
  'mx-auto flex w-full max-w-[760px] items-center justify-around px-2 py-2 sm:px-3';
export const MOBILE_SHEET_CARD_CLASS =
  'w-full max-w-[720px] overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl';
export const MOBILE_MODAL_CARD_CLASS = 'w-full max-w-[720px] rounded-3xl bg-white p-4 shadow-2xl';
export const MOBILE_STORY_VIEWER_CLASS =
  'relative h-full w-full max-w-[720px] overflow-hidden rounded-[2rem] bg-slate-900';

export const shouldUseMobileShellViewport = () => {
  if (typeof window === 'undefined') return false;
  const hasCoarseTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  return window.innerWidth < MOBILE_SHELL_BREAKPOINT || (hasCoarseTouch && window.innerWidth <= 1366);
};
