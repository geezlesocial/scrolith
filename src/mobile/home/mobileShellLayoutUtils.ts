export const shouldUseMobileShellViewportFor = (
  viewportWidth: number,
  hasCoarseTouch: boolean,
  breakpoint: number
) =>
  viewportWidth < breakpoint || (hasCoarseTouch && viewportWidth <= 1366);
