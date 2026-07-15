/**
 * Phase 10.4 — Notification Priority Engine contracts (dark launch).
 * Evaluation only: does not reorder lists, change delivery, or migrate producers.
 */

import type { PreferenceCategoryKey } from '../preferences/preference.types';

/** Canonical priority bands (extends 10.2 bands with background) */
export type PriorityBand = 'critical' | 'high' | 'normal' | 'low' | 'background';

export type PriorityFactorKey =
  | 'category'
  | 'type_hint'
  | 'relationship'
  | 'engagement'
  | 'recency'
  | 'user_preferences'
  | 'discovery_signals'
  | 'scrolitha_signals';

export type PriorityFactorContribution = {
  key: PriorityFactorKey;
  /** Relative weight used in the blend (0 when placeholder/inactive) */
  weight: number;
  /** Factor score in [0, 1] before weight */
  score: number;
  /** weight * score contribution */
  weighted: number;
  detail?: string;
  /** True when factor is reserved for a future phase */
  placeholder?: boolean;
};

export type RelationshipPriorityInput = {
  isClose?: boolean;
  isFollowing?: boolean;
  isFollower?: boolean;
  isConnection?: boolean;
  /** Optional explicit strength 0..1 */
  strength?: number | null;
};

export type EngagementPriorityInput = {
  /** Recipient engagement with actor/content, 0..1 */
  score?: number | null;
  recentInteractionCount?: number | null;
};

export type PreferencePriorityInput = {
  categoryEnabled?: boolean | null;
  globalEnabled?: boolean | null;
};

/** Future Discovery relevance — reserved; weight 0 until wired */
export type DiscoveryPrioritySignals = {
  relevanceScore?: number | null;
  reserved: true;
};

/** Future Scrolitha urgency — reserved; weight 0 until wired */
export type ScrolithaPrioritySignals = {
  urgencyHint?: number | null;
  reserved: true;
};

export type PriorityEvaluationInput = {
  /** Notification recipient */
  userId: string;
  type?: string | null;
  category?: PreferenceCategoryKey | string | null;
  actorId?: string | null;
  createdAt?: Date | string | null;
  relationship?: RelationshipPriorityInput | null;
  engagement?: EngagementPriorityInput | null;
  preferences?: PreferencePriorityInput | null;
  discoverySignals?: DiscoveryPrioritySignals | null;
  scrolithaSignals?: ScrolithaPrioritySignals | null;
  meta?: Record<string, unknown> | null;
};

export type PriorityExplanation = {
  summary: string;
  topFactors: string[];
  bandRule: string;
};

export type PriorityEvaluationResult = {
  band: PriorityBand;
  /** Normalized importance score in [0, 1] */
  score: number;
  engineActive: boolean;
  reason: 'evaluated' | 'priority_engine_inactive' | 'validation_defaults';
  factors: PriorityFactorContribution[];
  explanation: PriorityExplanation;
  /**
   * Always false in Phase 10.4 — engine must not reorder notification lists.
   * Reserved for a later priorityList rollout phase.
   */
  orderingApplied: false;
  evaluatedAt: string;
};

export type PriorityEngineDiagnostics = {
  service: 'notification-priority';
  engineActive: boolean;
  orderingApplied: false;
  supportedBands: PriorityBand[];
  factorKeys: PriorityFactorKey[];
  placeholders: Array<'discovery_signals' | 'scrolitha_signals' | 'list_reordering'>;
  defaultsOff: true;
  envKey: 'NOTIF_INTEL_PRIORITY';
};

export const ALL_PRIORITY_BANDS: PriorityBand[] = [
  'critical',
  'high',
  'normal',
  'low',
  'background'
];

export const ALL_PRIORITY_FACTOR_KEYS: PriorityFactorKey[] = [
  'category',
  'type_hint',
  'relationship',
  'engagement',
  'recency',
  'user_preferences',
  'discovery_signals',
  'scrolitha_signals'
];
