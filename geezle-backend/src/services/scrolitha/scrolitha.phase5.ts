/**
 * Phase 5: production-safe feedback calibration and continuous evaluation.
 *
 * This module intentionally stores only bounded aggregate counters. It never
 * accepts prompts, response bodies, profile fields, or identifiers in the
 * calibration record. Ranking changes are advisory until quality gates pass.
 */
import { enterpriseCache } from './scrolitha.enterpriseCache';

export const SCROLITHA_PHASE5_VERSION = 'phase5-calibration-v1';
const KEY = `calibration:${SCROLITHA_PHASE5_VERSION}`;
const MAX_LATENCIES = 500;

export type CalibrationSignal =
  | 'accepted'
  | 'dismissed'
  | 'corrected'
  | 'positive_feedback'
  | 'negative_feedback'
  | 'safety_blocked';

type CalibrationState = {
  version: string;
  windowStartedAt: string;
  updatedAt: string;
  signals: Record<CalibrationSignal, number>;
  latencyMs: number[];
  relevanceSum: number;
  relevanceSamples: number;
};

const emptyState = (): CalibrationState => ({
  version: SCROLITHA_PHASE5_VERSION,
  windowStartedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  signals: {
    accepted: 0,
    dismissed: 0,
    corrected: 0,
    positive_feedback: 0,
    negative_feedback: 0,
    safety_blocked: 0
  },
  latencyMs: [],
  relevanceSum: 0,
  relevanceSamples: 0
});

const read = () => enterpriseCache.get<CalibrationState>('analytics', KEY) || emptyState();
const write = (state: CalibrationState) => enterpriseCache.set('analytics', KEY, state, 24 * 60 * 60_000);

const percentile = (values: number[], p: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
};

export const recordCalibrationSignal = (input: {
  signal: CalibrationSignal;
  latencyMs?: number;
  relevance?: number;
}) => {
  const state = read();
  state.signals[input.signal] += 1;
  if (Number.isFinite(input.latencyMs) && Number(input.latencyMs) >= 0) {
    state.latencyMs = [...state.latencyMs, Math.round(Number(input.latencyMs))].slice(-MAX_LATENCIES);
  }
  if (Number.isFinite(input.relevance)) {
    state.relevanceSum += Math.max(0, Math.min(1, Number(input.relevance)));
    state.relevanceSamples += 1;
  }
  state.updatedAt = new Date().toISOString();
  write(state);
  return { accepted: true, version: state.version };
};

export const getCalibrationSnapshot = () => {
  const state = read();
  const totalDecisions = state.signals.accepted + state.signals.dismissed + state.signals.corrected;
  const positive = state.signals.accepted + state.signals.positive_feedback;
  const negative = state.signals.dismissed + state.signals.corrected + state.signals.negative_feedback;
  const acceptanceRate = totalDecisions ? positive / (positive + negative) : null;
  const relevance = state.relevanceSamples ? state.relevanceSum / state.relevanceSamples : null;
  const qualityGate = {
    minimumSamplesMet: totalDecisions >= 20,
    relevanceFloorMet: relevance === null || relevance >= 0.55,
    acceptanceFloorMet: acceptanceRate === null || acceptanceRate >= 0.45,
    safetyRegressionDetected: state.signals.safety_blocked > 0
  };
  return {
    version: state.version,
    windowStartedAt: state.windowStartedAt,
    updatedAt: state.updatedAt,
    signals: state.signals,
    sampleSize: totalDecisions,
    acceptanceRate: acceptanceRate === null ? null : Number(acceptanceRate.toFixed(4)),
    meanRelevance: relevance === null ? null : Number(relevance.toFixed(4)),
    latencyMs: {
      samples: state.latencyMs.length,
      p50: percentile(state.latencyMs, 0.5),
      p95: percentile(state.latencyMs, 0.95)
    },
    qualityGate,
    calibrationActive: Object.values(qualityGate).every(Boolean),
    privacy: 'Aggregate counters only; no prompts, responses, identifiers, or private content.'
  };
};

