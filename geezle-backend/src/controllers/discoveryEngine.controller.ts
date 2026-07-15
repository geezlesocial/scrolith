import { Request, Response } from 'express';
import {
  runDiscoveryRecommendationPipeline,
  recordDiscoveryFeedback,
  getDiscoveryRolloutSummary,
  getDiscoveryMetricsSnapshot,
  resolveDiscoveryRolloutFlags,
  getGeneratorCoverageMatrix,
  type DiscoveryEntityType,
  type DiscoverySurface
} from '../services/discoveryEngine/discoveryEngine.service';

const unauthorized = (res: Response) =>
  res.status(401).json({ success: false, message: 'Unauthorized', error: 'Authentication required' });

export const discoveryRecommendController = async (req: Request, res: Response) => {
  try {
    const viewerId = req.user?.id || null;
    const entityTypesRaw = req.body?.entityTypes || req.query?.entityTypes;
    let entityTypes: DiscoveryEntityType[] | undefined;
    if (Array.isArray(entityTypesRaw)) {
      entityTypes = entityTypesRaw.map(String) as DiscoveryEntityType[];
    } else if (typeof entityTypesRaw === 'string' && entityTypesRaw.trim()) {
      entityTypes = entityTypesRaw.split(',').map((s) => s.trim()) as DiscoveryEntityType[];
    }

    const data = await runDiscoveryRecommendationPipeline({
      viewerId,
      surface: (req.body?.surface || req.query?.surface || 'discovery') as DiscoverySurface,
      entityTypes,
      cursor: (req.body?.cursor || req.query?.cursor || null) as string | null,
      limit: Number(req.body?.limit || req.query?.limit || 12),
      context: {
        route: req.body?.context?.route || req.query?.route,
        topic: req.body?.context?.topic || req.query?.topic,
        region: req.body?.context?.region || req.query?.region,
        query: req.body?.context?.query || req.query?.q || req.query?.query,
        seedEntityType: req.body?.context?.seedEntityType,
        seedEntityId: req.body?.context?.seedEntityId
      },
      exclusions: Array.isArray(req.body?.exclusions) ? req.body.exclusions : undefined,
      sessionId: req.body?.sessionId || (req.headers['x-discovery-session'] as string) || null,
      requestId: req.body?.requestId || (req.headers['x-request-id'] as string) || null,
      includeDebug: String(req.query?.debug || req.body?.debug || '').toLowerCase() === 'true'
    });

    return res.json({
      success: true,
      data,
      message: data.items.length ? 'Recommendations ready' : 'No recommendations (feature may be disabled or empty)'
    });
  } catch (error: any) {
    const msg = String(error?.message || 'Unknown error');
    const status = Number(error?.statusCode) || (/cursor/i.test(msg) ? 400 : 500);
    if (status >= 500) console.error('[discovery-engine] recommend error', error);
    return res.status(status).json({
      success: false,
      message: 'Failed to load discovery recommendations',
      error: msg,
      code: error?.code || undefined
    });
  }
};

export const discoveryFeedbackController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const data = await recordDiscoveryFeedback({
      viewerId: req.user.id,
      surface: (req.body?.surface || 'discovery') as DiscoverySurface,
      entityType: req.body?.entityType,
      entityId: req.body?.entityId,
      action: req.body?.action,
      trackingToken: req.body?.trackingToken,
      metadata: req.body?.metadata
    });
    return res.json({ success: true, data, message: 'Feedback recorded' });
  } catch (error: any) {
    const msg = String(error?.message || 'Failed to record feedback');
    const status = /invalid|required/i.test(msg) ? 400 : 500;
    return res.status(status).json({ success: false, message: 'Failed to record feedback', error: msg });
  }
};

export const discoveryRolloutController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const role = String(req.user.role || '').toLowerCase();
    if (!role.includes('admin') && !role.includes('moderator')) {
      return res.status(403).json({ success: false, message: 'Admin or moderator role required' });
    }
    return res.json({
      success: true,
      data: getDiscoveryRolloutSummary(),
      message: 'Discovery engine rollout'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load rollout',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const discoveryMetricsController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const role = String(req.user.role || '').toLowerCase();
    if (!role.includes('admin') && !role.includes('moderator')) {
      return res.status(403).json({ success: false, message: 'Admin or moderator role required' });
    }
    const flags = resolveDiscoveryRolloutFlags();
    if (!flags.diagnostics) {
      return res.status(403).json({ success: false, message: 'Diagnostics disabled' });
    }
    return res.json({
      success: true,
      data: {
        ...getDiscoveryMetricsSnapshot(),
        coverage: getGeneratorCoverageMatrix()
      },
      message: 'Discovery engine metrics'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load metrics',
      error: String(error?.message || 'Unknown error')
    });
  }
};
