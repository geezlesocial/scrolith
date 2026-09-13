/**
 * Phase 33.2 — Admin discovery analytics (process + ledger aggregates).
 * No sensitive prompts. Fairness/diversity are lightweight proxies for foundation.
 */
import prisma from '../../utils/prismaClient';
import { getAIMetricsSnapshot } from './observability';
import { getCircuitSnapshot } from './reliability';
import { healthAllProviders } from './providers';
import { loadAIFeatureFlags, loadProviderConfig } from './config';

const isMissing = (err: any) =>
  err?.code === 'P2021' || err instanceof TypeError || /does not exist/i.test(String(err?.message || ''));

export async function getDiscoveryAnalytics() {
  const metrics = getAIMetricsSnapshot();
  const flags = await loadAIFeatureFlags();
  const providers = await loadProviderConfig();
  const health = await healthAllProviders();
  const circuits = getCircuitSnapshot();

  let feedbackRows: any[] = [];
  let eventRows: any[] = [];
  let signalCount = 0;
  try {
    feedbackRows =
      (await (prisma as any).aIRecommendationFeedback?.findMany?.({
        orderBy: { createdAt: 'desc' },
        take: 200
      })) || [];
  } catch (err) {
    if (!isMissing(err)) feedbackRows = [];
  }
  try {
    signalCount =
      (await (prisma as any).aILearningSignal?.count?.()) || metrics.learningSignals || 0;
  } catch {
    signalCount = metrics.learningSignals || 0;
  }
  try {
    eventRows =
      (await (prisma as any).aIRecommendationEvent?.findMany?.({
        where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        select: { eventType: true, latencyMs: true },
        take: 5000
      })) || [];
  } catch (err) {
    if (!isMissing(err)) eventRows = [];
  }

  const useful = feedbackRows.filter((r) => r.action === 'useful').length;
  const notInterested = feedbackRows.filter((r) => r.action === 'not_interested').length;
  const hide = feedbackRows.filter((r) => r.action === 'hide_similar').length;
  const totalFb = useful + notInterested + hide || 1;

  const byType: Record<string, number> = {};
  for (const r of feedbackRows) {
    const t = String(r.entityType || 'unknown');
    byType[t] = (byType[t] || 0) + 1;
  }
  const typeValues = Object.values(byType);
  const diversityProxy =
    typeValues.length <= 1
      ? 0
      : 1 - Math.max(...typeValues) / typeValues.reduce((a, b) => a + b, 0);

  // Fairness proxy: penalize if one entity type dominates >70% of feedback
  const fairnessProxy = diversityProxy >= 0.3 ? 'balanced_proxy' : 'concentrated_proxy';

  return {
    phase: '33.2',
    capturedAt: new Date().toISOString(),
    flags: {
      recommendationsEnabled: flags.recommendationsEnabled,
      feedScoringEnabled: flags.feedScoringEnabled,
      semanticSearchEnabled: flags.semanticSearchEnabled,
      enableProviderCalls: flags.enableProviderCalls
    },
    recommendation: {
      acceptanceRate: useful / totalFb,
      // CTR proxy: useful / issued (process lifetime)
      ctrProxy:
        metrics.recommendationsIssued > 0 ? useful / metrics.recommendationsIssued : 0,
      dismissalRate: (notInterested + hide) / totalFb,
      useful,
      notInterested,
      hideSimilar: hide,
      sampleSize: feedbackRows.length
    },
    quality: {
      impressions: eventRows.filter((r) => r.eventType === 'impression').length || metrics.recoImpressions,
      opens: eventRows.filter((r) => r.eventType === 'open').length || metrics.recoOpens,
      openRate:
        (eventRows.filter((r) => r.eventType === 'impression').length || metrics.recoImpressions) > 0
          ? (eventRows.filter((r) => r.eventType === 'open').length || metrics.recoOpens) /
            (eventRows.filter((r) => r.eventType === 'impression').length || metrics.recoImpressions)
          : 0,
      averageLatencyMs: eventRows.filter((r) => Number.isFinite(r.latencyMs)).length
        ? Math.round(eventRows.filter((r) => Number.isFinite(r.latencyMs)).reduce((sum, r) => sum + Number(r.latencyMs), 0) / eventRows.filter((r) => Number.isFinite(r.latencyMs)).length)
        : metrics.recoImpressions > 0 ? Math.round(metrics.recoLatencyTotalMs / metrics.recoImpressions) : 0,
      persistedEvents: eventRows.length,
      telemetryWriteFailures: metrics.recoTelemetryWriteFailures,
      qualityReadFailures: metrics.recoQualityReadFailures,
      rankingPolicy: 'bounded_feedback_calibration',
      calibrationWindowDays: 30
    },
    diversity: {
      byEntityType: byType,
      diversityScore: Math.round(diversityProxy * 1000) / 1000,
      fairnessProxy,
      note: 'Lightweight proxies for foundation — not production fairness certification.'
    },
    aiUsage: metrics,
    learningSignals: signalCount,
    provider: {
      config: {
        emergencyShutdown: providers.emergencyShutdown,
        OLLAMA: providers.OLLAMA?.enabled,
        GEMINI: providers.GEMINI?.enabled,
        OPENAI: providers.OPENAI?.enabled
      },
      health,
      circuits
    },
    routing: {
      note: 'See Phase 33.0 model router; discovery uses preferInternal + MOCK when provider calls disabled.'
    }
  };
}

export default { getDiscoveryAnalytics };
