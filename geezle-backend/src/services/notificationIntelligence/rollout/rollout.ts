/**
 * Notification Intelligence rollout — safe-by-default (Phase 10.2).
 * User-facing capabilities stay OFF until explicitly enabled.
 * Pattern aligned with Discovery / Scrolitha / Enterprise Search.
 */

export type NotificationIntelRolloutFlags = {
  master: boolean;
  /** Future: write path through NI-CORE */
  write: boolean;
  /** Phase 10.3: preference engine evaluation active (still defaults OFF) */
  preferences: boolean;
  /** Phase 10.4: priority evaluation active (still defaults OFF; no reordering) */
  priority: boolean;
  /** Future: apply priority-ordered list responses */
  priorityList: boolean;
  /** Phase 10.5: delivery strategy planning (still defaults OFF; no actual send) */
  delivery: boolean;
  /** Future: unified push/email execution path */
  deliveryUnified: boolean;
  /** Future: digests */
  digest: boolean;
  /** Phase 10.6: EventEnvelope → NotificationEvaluationRequest (still defaults OFF) */
  eventIntegration: boolean;
  /** Future: bus consumer runtime */
  busConsumer: boolean;
  /** Future: AI summary */
  aiSummary: boolean;
  /** Diagnostics / metrics only — default ON like Discovery diagnostics */
  diagnostics: boolean;
};

export const DEFAULT_NOTIF_INTEL_FLAGS: NotificationIntelRolloutFlags = {
  master: false,
  write: false,
  preferences: false,
  priority: false,
  priorityList: false,
  delivery: false,
  deliveryUnified: false,
  digest: false,
  eventIntegration: false,
  busConsumer: false,
  aiSummary: false,
  diagnostics: true
};

const ENV_MAP: Record<keyof NotificationIntelRolloutFlags, string> = {
  master: 'NOTIF_INTEL_MASTER',
  write: 'NOTIF_INTEL_WRITE',
  preferences: 'NOTIF_INTEL_PREFERENCES',
  priority: 'NOTIF_INTEL_PRIORITY',
  priorityList: 'NOTIF_INTEL_PRIORITY_LIST',
  delivery: 'NOTIF_INTEL_DELIVERY',
  deliveryUnified: 'NOTIF_INTEL_DELIVERY_UNIFIED',
  digest: 'NOTIF_INTEL_DIGEST',
  eventIntegration: 'NOTIF_INTEL_EVENT_INTEGRATION',
  busConsumer: 'NOTIF_INTEL_BUS_CONSUMER',
  aiSummary: 'NOTIF_INTEL_AI_SUMMARY',
  diagnostics: 'NOTIF_INTEL_DIAGNOSTICS'
};

const asBool = (value: unknown, fallback: boolean) => {
  if (typeof value === 'boolean') return value;
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(raw)) return false;
  return fallback;
};

let cached: { at: number; flags: NotificationIntelRolloutFlags } | null = null;
const CACHE_MS = 10_000;

export const invalidateNotificationIntelRolloutCache = () => {
  cached = null;
};

export const resolveNotificationIntelRolloutFlags = (
  env: NodeJS.ProcessEnv = process.env
): NotificationIntelRolloutFlags => {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS && env === process.env) return cached.flags;

  const flags: NotificationIntelRolloutFlags = { ...DEFAULT_NOTIF_INTEL_FLAGS };
  for (const key of Object.keys(DEFAULT_NOTIF_INTEL_FLAGS) as (keyof NotificationIntelRolloutFlags)[]) {
    flags[key] = asBool(env[ENV_MAP[key]], DEFAULT_NOTIF_INTEL_FLAGS[key]);
  }

  // Master OFF forces all user-facing capabilities OFF (diagnostics may remain).
  if (!flags.master) {
    flags.write = false;
    flags.preferences = false;
    flags.priority = false;
    flags.priorityList = false;
    flags.delivery = false;
    flags.deliveryUnified = false;
    flags.digest = false;
    flags.eventIntegration = false;
    flags.busConsumer = false;
    flags.aiSummary = false;
  }

  if (env === process.env) {
    cached = { at: now, flags };
  }
  return flags;
};

export const isNotificationIntelMasterEnabled = () => resolveNotificationIntelRolloutFlags().master;

export const getNotificationIntelRolloutSummary = () => ({
  service: 'notification-intelligence',
  defaultsOff: true,
  flags: resolveNotificationIntelRolloutFlags(),
  envKeys: ENV_MAP
});
