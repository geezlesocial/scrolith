/**
 * Priority placeholders for future Discovery / Scrolitha / list reordering (Phase 10.4).
 * Explicit no-ops so later phases can wire signals without redesigning the engine surface.
 */
import type { DiscoveryPrioritySignals, ScrolithaPrioritySignals } from './priority.types';

export const emptyDiscoveryPrioritySignals = (): DiscoveryPrioritySignals => ({
  relevanceScore: null,
  reserved: true
});

export const emptyScrolithaPrioritySignals = (): ScrolithaPrioritySignals => ({
  urgencyHint: null,
  reserved: true
});

/**
 * Phase 10.4 must never reorder notification arrays.
 * Helper documents intent and is a pure identity for dual-run safety checks.
 */
export const applyPriorityOrderingPlaceholder = <T>(items: T[]): T[] => {
  // Intentionally no-op — reordering requires NOTIF_INTEL_PRIORITY_LIST in a later phase
  return items;
};
