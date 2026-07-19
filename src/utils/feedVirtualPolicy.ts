/**
 * Phase 21.0.2 — when to enable virtualization by default.
 * Validated against long-session synthetic runs before default-on.
 */

export const FEED_VIRTUAL_POLICY_VERSION = '21.0.2';

export type VirtualPolicyInput = {
  itemCount: number;
  /** Force off for reduced motion / a11y labs if needed */
  reducedMotion?: boolean;
  /** Low-end / data saver devices prefer progressive window only */
  dataSaver?: boolean;
  /** Explicit operator override */
  force?: boolean | null;
};

/**
 * Enable virtualization by default for long mixed streams.
 * Short lists stay full-render (identical visuals, less overhead).
 */
export const shouldEnableFeedVirtualization = (input: VirtualPolicyInput): boolean => {
  if (input.force === true) return true;
  if (input.force === false) return false;
  if (input.reducedMotion) return false;
  if (input.dataSaver) {
    // Still virtualize very long sessions to protect memory on mobile data-saver.
    return Number(input.itemCount || 0) >= 24;
  }
  return Number(input.itemCount || 0) >= 12;
};

export const resolveVirtualOverscan = (params: {
  dataSaver?: boolean;
  isMobile?: boolean;
}): number => {
  if (params.dataSaver) return 2;
  if (params.isMobile) return 3;
  return 5;
};

export const resolveVirtualEstimateSize = (params: {
  isMobile?: boolean;
  compact?: boolean;
}): number => {
  if (params.compact) return 220;
  if (params.isMobile) return 340;
  return 380;
};
