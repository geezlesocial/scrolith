/**
 * Delivery eligibility / suppression rules (Phase 10.5).
 * Pure functions — no I/O, no sends.
 */
import type { PriorityBand } from '../priority/priority.types';
import { getChannelCapability } from './delivery.channels';
import type {
  DeliveryChannelDecision,
  DeliveryChannelKey,
  DeliveryEvaluationInput,
  DeliveryPreferenceInput,
  DeliveryPriorityInput,
  DeliveryQuietHoursInput
} from './delivery.types';

export type DeliveryRuleContext = {
  preferences: DeliveryPreferenceInput;
  priority: DeliveryPriorityInput;
  quietHours: DeliveryQuietHoursInput;
  forceSuppress: boolean;
  forceSuppressReason: string | null;
  type: string | null;
  category: string | null;
};

export const buildRuleContext = (input: DeliveryEvaluationInput): DeliveryRuleContext => ({
  preferences: input.preferences || {},
  priority: input.priority || {},
  quietHours: input.quietHours || {},
  forceSuppress: Boolean(input.forceSuppress),
  forceSuppressReason: input.forceSuppressReason ? String(input.forceSuppressReason) : null,
  type: input.type ? String(input.type) : null,
  category: input.category ? String(input.category) : null
});

const isSecurityType = (type: string | null) => {
  const t = String(type || '').toLowerCase();
  return (
    t.includes('security') ||
    t.includes('password') ||
    t.includes('2fa') ||
    t.includes('breach') ||
    t.includes('login_alert') ||
    t.includes('suspicious')
  );
};

/** Global / category preference gates (security types bypass soft mutes) */
export const evaluatePreferenceGate = (
  ctx: DeliveryRuleContext
): { allow: boolean; notes: string[]; globalEnabled: boolean | null; categoryEnabled: boolean | null } => {
  const notes: string[] = [];
  const globalEnabled =
    ctx.preferences.globalEnabled === undefined || ctx.preferences.globalEnabled === null
      ? null
      : Boolean(ctx.preferences.globalEnabled);
  const categoryEnabled =
    ctx.preferences.categoryEnabled === undefined || ctx.preferences.categoryEnabled === null
      ? null
      : Boolean(ctx.preferences.categoryEnabled);

  if (isSecurityType(ctx.type)) {
    notes.push('security_type_preference_bypass');
    return { allow: true, notes, globalEnabled, categoryEnabled };
  }

  if (globalEnabled === false) {
    notes.push('global_preferences_disabled');
    return { allow: false, notes, globalEnabled, categoryEnabled };
  }
  if (categoryEnabled === false) {
    notes.push('category_preferences_disabled');
    return { allow: false, notes, globalEnabled, categoryEnabled };
  }
  if (globalEnabled === true) notes.push('global_preferences_enabled');
  if (categoryEnabled === true) notes.push('category_preferences_enabled');
  if (globalEnabled == null && categoryEnabled == null) notes.push('preferences_unknown_allow');
  return { allow: true, notes, globalEnabled, categoryEnabled };
};

/** Priority compatibility: low/background may defer non-critical channels */
export const evaluatePriorityCompatibility = (
  ctx: DeliveryRuleContext
): { notes: string[]; band: PriorityBand | null; score: number | null; deferExternal: boolean } => {
  const band = (ctx.priority.band as PriorityBand) || null;
  const score =
    typeof ctx.priority.score === 'number' && Number.isFinite(ctx.priority.score)
      ? ctx.priority.score
      : null;
  const notes: string[] = [];

  if (!band && score == null) {
    notes.push('priority_unknown');
    return { notes, band, score, deferExternal: false };
  }

  notes.push(band ? `priority_band:${band}` : `priority_score:${score}`);

  // Background / low: still plan in-app, prefer batching external placeholders
  const deferExternal = band === 'background' || band === 'low' || (score != null && score < 0.35);
  if (deferExternal) notes.push('low_priority_external_defer');
  if (band === 'critical' || band === 'high') notes.push('high_priority_immediate_bias');

  return { notes, band, score, deferExternal };
};

export const evaluateQuietHoursGate = (
  ctx: DeliveryRuleContext,
  channel: DeliveryChannelKey
): { blocked: boolean; notes: string[] } => {
  const notes: string[] = [];
  const active = Boolean(ctx.quietHours.active);
  if (!active) {
    notes.push('quiet_hours_inactive');
    return { blocked: false, notes };
  }

  const cap = getChannelCapability(channel);
  if (!cap.supportsQuietHours) {
    notes.push('quiet_hours_not_applicable_channel');
    return { blocked: false, notes };
  }

  // Critical security may still plan push during quiet hours (plan-only)
  if (isSecurityType(ctx.type) && (channel === 'push' || channel === 'sms')) {
    notes.push('quiet_hours_security_exception');
    return { blocked: false, notes };
  }

  const scoped = ctx.quietHours.channels;
  if (Array.isArray(scoped) && scoped.length > 0) {
    const upper = scoped.map((c) => String(c).toUpperCase());
    const channelToken =
      channel === 'push' ? 'PUSH' : channel === 'email' ? 'EMAIL' : channel === 'sms' ? 'SMS' : channel.toUpperCase();
    if (!upper.includes('ALL') && !upper.includes(channelToken) && !upper.includes(channel.toUpperCase())) {
      notes.push('quiet_hours_channel_not_in_scope');
      return { blocked: false, notes };
    }
  }

  notes.push('quiet_hours_active_defer');
  return { blocked: true, notes };
};

/** Per-channel preference enablement */
export const channelPreferenceEnabled = (
  prefs: DeliveryPreferenceInput,
  channel: DeliveryChannelKey
): boolean | null => {
  const ch = prefs.channels;
  if (!ch) return null;
  if (channel === 'in_app') return ch.inApp === undefined ? null : Boolean(ch.inApp);
  if (channel === 'email') return ch.email === undefined ? null : Boolean(ch.email);
  if (channel === 'push') return ch.push === undefined ? null : Boolean(ch.push);
  return null;
};

export type GlobalSuppression = {
  suppressed: boolean;
  reasons: string[];
};

export const evaluateGlobalSuppression = (ctx: DeliveryRuleContext): GlobalSuppression => {
  const reasons: string[] = [];
  if (ctx.forceSuppress) {
    reasons.push(ctx.forceSuppressReason || 'force_suppress');
    return { suppressed: true, reasons };
  }
  const pref = evaluatePreferenceGate(ctx);
  if (!pref.allow) {
    reasons.push(...pref.notes);
    return { suppressed: true, reasons };
  }
  return { suppressed: false, reasons };
};

/**
 * Decide eligibility for a single channel given global context.
 * Does not schedule — scheduler fills timing.
 */
export const evaluateChannelEligibility = (
  channel: DeliveryChannelKey,
  ctx: DeliveryRuleContext,
  global: GlobalSuppression
): Pick<DeliveryChannelDecision, 'eligible' | 'status' | 'reasons' | 'retryEligible' | 'batchEligible'> => {
  const cap = getChannelCapability(channel);
  const reasons: string[] = [];

  if (channel === 'future') {
    return {
      eligible: false,
      status: 'placeholder',
      reasons: ['future_channel_reserved'],
      retryEligible: false,
      batchEligible: false
    };
  }

  if (global.suppressed) {
    return {
      eligible: false,
      status: 'suppressed',
      reasons: [...global.reasons, 'global_suppression'],
      retryEligible: false,
      batchEligible: false
    };
  }

  const chPref = channelPreferenceEnabled(ctx.preferences, channel);
  if (chPref === false) {
    return {
      eligible: false,
      status: 'suppressed',
      reasons: ['channel_preference_disabled'],
      retryEligible: false,
      batchEligible: false
    };
  }
  if (chPref === true) reasons.push('channel_preference_enabled');

  if (cap.placeholder) {
    reasons.push('channel_placeholder_transport');
  }

  // SMS/webhook only planned for critical/high or security (when priority known)
  const band = ctx.priority.band;
  if ((channel === 'sms' || channel === 'webhook') && band && band !== 'critical' && band !== 'high') {
    if (!isSecurityType(ctx.type)) {
      return {
        eligible: false,
        status: 'ineligible',
        reasons: ['channel_requires_high_priority', ...(band ? [`band:${band}`] : [])],
        retryEligible: false,
        batchEligible: false
      };
    }
  }

  const pri = evaluatePriorityCompatibility(ctx);
  reasons.push(...pri.notes.filter((n) => n.startsWith('priority_') || n.includes('priority')));

  return {
    eligible: true,
    status: cap.placeholder ? 'placeholder' : 'planned',
    reasons: reasons.length ? reasons : ['eligible'],
    retryEligible: cap.supportsRetry,
    batchEligible: cap.supportsBatch && pri.deferExternal
  };
};
