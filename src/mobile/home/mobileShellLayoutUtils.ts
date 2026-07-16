/**
 * Decide whether the authenticated app should use the mobile shell
 * (MobileHome + compact chrome) vs the desktop Member Home / enterprise header.
 *
 * History:
 * - A prior rule treated any coarse-touch device with width ≤ 1366 as mobile.
 *   That misclassified Windows touch laptops and zoomed desktop browsers,
 *   so MemberHomeSection never mounted and the owner saw a narrow vertical
 *   mobile feed with an incomplete header.
 *
 * Contract (aligned with Tailwind `lg` / Member Home 3-column CSS):
 * - Width < desktopFloor (default 1024) → mobile shell
 * - Width ≥ desktopFloor → desktop shell, even on hybrid touch laptops
 * - Pure touch tablets below the floor stay mobile; desktop multi-column
 *   composition and full enterprise header activate at lg+.
 */
export const DESKTOP_MEMBER_HOME_MIN_WIDTH = 1024;

export const shouldUseMobileShellViewportFor = (
  viewportWidth: number,
  _hasCoarseTouch: boolean,
  breakpoint: number = DESKTOP_MEMBER_HOME_MIN_WIDTH
) => {
  const floor = Number.isFinite(breakpoint) && breakpoint > 0 ? breakpoint : DESKTOP_MEMBER_HOME_MIN_WIDTH;
  // Coarse-touch no longer forces mobile up to 1366 — that blocked desktop composition.
  return viewportWidth < floor;
};
