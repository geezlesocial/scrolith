/**
 * Enterprise Spacing Scale — single source for layout geometry.
 *
 * Every post card, comment card, AI Coach card, survey, marketplace card,
 * profile card, and feed chrome should consume these tokens instead of
 * inventing individual pixel values.
 *
 * Tailwind mapping (default 4px base):
 *   xs  4  → gap-1 / p-1
 *   sm  8  → gap-2 / p-2
 *   md 12  → gap-3 / p-3
 *   lg 16  → gap-4 / p-4
 *   xl 20  → gap-5 / p-5
 *   xxl 24 → gap-6 / p-6
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24
} as const;

export type SpacingToken = keyof typeof spacing;

/** Semantic aliases used by product surfaces */
export const spacingSemantic = {
  /** Tight inline gaps (icon + label, badge clusters) */
  inlineTight: spacing.xs,
  /** Chip rails, stats-to-actions, small control gaps */
  control: spacing.sm,
  /** Default section stack between major card blocks */
  section: spacing.md,
  /** Card padding (horizontal + vertical) */
  card: spacing.lg,
  /** Panel / rail padding */
  panel: spacing.xl,
  /** Large surface separation (composer, empty states) */
  surface: spacing.xxl
} as const;

/**
 * Tailwind utility fragments keyed by scale step.
 * Prefer these over hardcoding gap-3 / px-4 in new code.
 */
export const spacingClass = {
  gap: {
    xs: 'gap-1',
    sm: 'gap-2',
    md: 'gap-3',
    lg: 'gap-4',
    xl: 'gap-5',
    xxl: 'gap-6'
  },
  p: {
    xs: 'p-1',
    sm: 'p-2',
    md: 'p-3',
    lg: 'p-4',
    xl: 'p-5',
    xxl: 'p-6'
  },
  px: {
    xs: 'px-1',
    sm: 'px-2',
    md: 'px-3',
    lg: 'px-4',
    xl: 'px-5',
    xxl: 'px-6'
  },
  py: {
    xs: 'py-1',
    sm: 'py-2',
    md: 'py-3',
    lg: 'py-4',
    xl: 'py-5',
    xxl: 'py-6'
  },
  mt: {
    xs: 'mt-1',
    sm: 'mt-2',
    md: 'mt-3',
    lg: 'mt-4',
    xl: 'mt-5',
    xxl: 'mt-6'
  },
  mb: {
    xs: 'mb-1',
    sm: 'mb-2',
    md: 'mb-3',
    lg: 'mb-4',
    xl: 'mb-5',
    xxl: 'mb-6'
  },
  /** Title → body is intentionally between sm and md (10px ≈ gap-2.5) */
  titleToBody: 'gap-2.5'
} as const;

/** Resolve a scale step to px (for tests / non-Tailwind consumers) */
export const spacingPx = (token: SpacingToken): number => spacing[token];

/**
 * CSS custom properties for progressive adoption outside Tailwind.
 * Mount once on :root / document if needed by non-React shells.
 */
export const spacingCssVariables = {
  '--scrolith-space-xs': `${spacing.xs}px`,
  '--scrolith-space-sm': `${spacing.sm}px`,
  '--scrolith-space-md': `${spacing.md}px`,
  '--scrolith-space-lg': `${spacing.lg}px`,
  '--scrolith-space-xl': `${spacing.xl}px`,
  '--scrolith-space-xxl': `${spacing.xxl}px`
} as const;
