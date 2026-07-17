/**
 * Phase 19.1 — low-cardinality, privacy-safe in-process counters.
 * No PII, no bodies, no vectors.
 */

type CounterMap = Record<string, number>;

const counters: CounterMap = Object.create(null);

const bump = (key: string, by = 1) => {
  counters[key] = (counters[key] || 0) + by;
};

export const intelligenceMetrics = {
  recordMemberFeedIntelligenceFill(item: {
    primaryReason?: string | null;
    reasons?: string[] | null;
    reasonCodes?: string[] | null;
    score?: number | null;
  }) {
    bump('intel.items');
    if (item.primaryReason) bump('intel.primaryReason');
    if (Array.isArray(item.reasons) && item.reasons.length) bump('intel.reasons');
    if (Array.isArray(item.reasonCodes) && item.reasonCodes.length) bump('intel.reasonCodes');
    if (item.score != null && Number.isFinite(item.score)) bump('intel.score');
  },
  recordMobileOrchestrator(event: 'request' | 'success' | 'fallback' | 'auth_fail', reason?: string) {
    bump(`mobile.orch.${event}`);
    if (reason) bump(`mobile.orch.reason.${String(reason).slice(0, 32)}`);
  },
  recordPreferenceMap(source: string, intent: string) {
    bump(`pref.source.${String(source || 'default').slice(0, 24)}`);
    bump(`pref.intent.${String(intent || 'for_you').slice(0, 24)}`);
  },
  snapshot(): CounterMap {
    return { ...counters };
  },
  resetForTests() {
    for (const key of Object.keys(counters)) delete counters[key];
  }
};
