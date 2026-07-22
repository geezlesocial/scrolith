/**
 * Phase 33.2 — Discovery / recommendations / memory / search assist APIs.
 */
import { Request, Response } from 'express';
import { scoreFeedCandidates } from '../services/scrolithaAi/feedScoring';
import {
  getRecommendations,
  getDashboardRecommendations,
  submitRecoFeedback
} from '../services/scrolithaAi/recommendations';
import { assistSearchQuery } from '../services/scrolithaAi/semanticSearch';
import {
  getAIMemory,
  updateAIMemory,
  deleteAIMemory,
  exportAIMemory
} from '../services/scrolithaAi/memory';
import { recordLearningSignal } from '../services/scrolithaAi/learning';
import { getDiscoveryAnalytics } from '../services/scrolithaAi/discoveryAnalytics';
import { loadAIFeatureFlags } from '../services/scrolithaAi/config';
import { getAIConsent } from '../services/scrolithaAi/consent';
import { suggestNotificationPriorities } from '../services/scrolithaAi/notificationHooks';

const userIdOf = (req: Request) =>
  String((req as any).user?.id || (req as any).userId || '').trim() || null;

export async function discoveryStatus(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const [flags, consent, memory] = await Promise.all([
      loadAIFeatureFlags(),
      getAIConsent(userId),
      getAIMemory(userId)
    ]);
    return res.json({
      success: true,
      data: {
        phase: '33.2',
        disclosure:
          'Recommendations and scores are suggestions only. Feed ranking and search execution remain deterministic. Security notifications are never overridden.',
        surfaces: {
          feedScoring: Boolean(flags.feedScoringEnabled),
          recommendations: Boolean(flags.recommendationsEnabled),
          semanticSearch: Boolean(flags.semanticSearchEnabled),
          aiMemory: Boolean(flags.aiMemoryEnabled),
          learning: Boolean(flags.learningSignalsEnabled),
          dashboard: Boolean(flags.dashboardRecommendationsEnabled),
          feedback: Boolean(flags.recommendationFeedbackEnabled)
        },
        consent: {
          aiFeaturesEnabled: consent.aiFeaturesEnabled,
          personalizationAllowed: consent.personalizationAllowed,
          aiSuggestionsAllowed: consent.aiSuggestionsAllowed
        },
        memorySummary: {
          preferredTopics: memory.preferredTopics.length,
          mutedTopics: memory.mutedTopics.length,
          version: memory.version
        },
        policy: {
          aiMayReorderFeed: false,
          aiExecutesSearch: false,
          autoAct: false
        }
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'status_failed' });
  }
}

export async function postFeedScores(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const candidates = Array.isArray(req.body?.candidates) ? req.body.candidates : [];
    const result = await scoreFeedCandidates({
      userId,
      candidates,
      locale: req.body?.locale,
      useModelAssist: Boolean(req.body?.useModelAssist)
    });
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'score_failed' });
  }
}

export async function getRecos(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const types = req.query.types
      ? String(req.query.types)
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;
    const result = await getRecommendations({
      userId,
      types: types as any,
      limit: Number(req.query.limit || 12),
      locale: String(req.query.locale || 'en')
    });
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'reco_failed' });
  }
}

export async function getDashboardRecos(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const result = await getDashboardRecommendations({
      userId,
      locale: String(req.query.locale || 'en')
    });
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'dashboard_failed' });
  }
}

export async function postRecoFeedback(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const result = await submitRecoFeedback({
      userId,
      entityType: req.body?.entityType || 'post',
      entityId: String(req.body?.entityId || ''),
      action: req.body?.action || 'not_interested',
      topic: req.body?.topic,
      recommendationId: req.body?.recommendationId,
      comment: req.body?.comment
    });
    if (!result.ok) return res.status(403).json({ success: false, error: result.reason });
    return res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'feedback_failed' });
  }
}

export async function postSearchAssist(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const result = await assistSearchQuery({
      userId,
      query: String(req.body?.query || req.body?.q || ''),
      domain: req.body?.domain,
      locale: req.body?.locale
    });
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'search_assist_failed' });
  }
}

export async function getMemory(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const memory = await getAIMemory(userId);
    return res.json({ success: true, data: memory });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'memory_failed' });
  }
}

export async function patchMemory(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const body = req.body || {};
    const memory = await updateAIMemory(userId, {
      preferredTopics: body.preferredTopics,
      preferredIndustries: body.preferredIndustries,
      mutedTopics: body.mutedTopics,
      preferredLanguages: body.preferredLanguages,
      favoriteCommunities: body.favoriteCommunities,
      mutedEntityIds: body.mutedEntityIds
    });
    return res.json({ success: true, data: memory });
  } catch (err: any) {
    const status = err?.code === 'CONSENT' ? 403 : 500;
    return res.status(status).json({ success: false, error: err?.message || 'memory_update_failed' });
  }
}

export async function deleteMemory(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const result = await deleteAIMemory(userId);
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'memory_delete_failed' });
  }
}

export async function exportMemory(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await exportAIMemory(userId);
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'export_failed' });
  }
}

export async function postLearningSignal(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const result = await recordLearningSignal({
      userId,
      type: req.body?.type || 'click',
      topic: req.body?.topic,
      entityId: req.body?.entityId,
      entityType: req.body?.entityType,
      metadata: req.body?.metadata
    });
    if (!result.ok) return res.status(403).json({ success: false, error: result.reason });
    return res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'signal_failed' });
  }
}

/** Notification prioritization suggestions — never overrides security */
export async function postNotificationReco(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    // Security-critical items stay critical
    const secured = items.map((i: any) => {
      const p = String(i.priority || '').toLowerCase();
      const cat = String(i.category || i.type || '').toLowerCase();
      if (p === 'critical' || p === 'emergency' || cat.includes('security')) {
        return { ...i, priority: 'critical', locked: true };
      }
      return i;
    });

    const suggestion = await suggestNotificationPriorities({
      userId,
      items: secured,
      locale: req.body?.locale
    });

    return res.json({
      success: true,
      data: {
        ...suggestion,
        policy: {
          securityCriticalNeverOverridden: true,
          deterministicPriorityAuthoritative: true
        },
        lockedIds: secured.filter((i: any) => i.locked).map((i: any) => i.id)
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'notif_reco_failed' });
  }
}

export async function adminDiscoveryAnalytics(_req: Request, res: Response) {
  try {
    const data = await getDiscoveryAnalytics();
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'analytics_failed' });
  }
}
