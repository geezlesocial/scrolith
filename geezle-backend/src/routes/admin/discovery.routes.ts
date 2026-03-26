import express from 'express';
import { requirePermission, resolveStaffContext } from '../../middleware/rbac.middleware';
import {
  deactivateSearchRankingRule,
  getDiscoverySummary,
  listFeedRecipes,
  listSearchRankingRules,
  saveFeedRecipe,
  saveSearchRankingRule
} from '../../services/discovery.service';

const router = express.Router();

const asBoolean = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
};

const getStaffId = async (req: express.Request) => {
  const context = await resolveStaffContext(req);
  return context?.staffId || null;
};

const emitDiscoveryEvent = (req: express.Request, event: string, payload: Record<string, any>) => {
  const io = req.app.get('io');
  const communityIo = req.app.get('communityIo');
  io?.emit(event, payload);
  communityIo?.emit(event, payload);
};

const handleDiscoveryError = (res: express.Response, error: unknown, fallbackMessage: string) => {
  if (error instanceof Error) {
    const message = error.message || fallbackMessage;
    if (message.toLowerCase().includes('not found')) {
      return res.status(404).json({ success: false, error: message, code: 'NOT_FOUND' });
    }
    if (message.toLowerCase().includes('required') || message.toLowerCase().includes('invalid')) {
      return res.status(400).json({ success: false, error: message, code: 'VALIDATION_ERROR' });
    }
  }
  const prismaError = error as { code?: string } | null;
  if (prismaError?.code === 'P2002') {
    return res.status(409).json({ success: false, error: 'A record with that key already exists', code: 'CONFLICT' });
  }
  console.error('[discovery] request failed', error);
  return res.status(500).json({ success: false, error: fallbackMessage, code: 'ERR_INTERNAL' });
};

router.get('/summary', requirePermission('discovery.read'), async (_req, res) => {
  try {
    const summary = await getDiscoverySummary();
    return res.json({ success: true, data: summary });
  } catch (error) {
    return handleDiscoveryError(res, error, 'Failed to load discovery summary');
  }
});

router.get('/search-rules', requirePermission('discovery.read'), async (req, res) => {
  try {
    const rows = await listSearchRankingRules({
      scope: String(req.query.scope || ''),
      targetType: String(req.query.targetType || ''),
      query: String(req.query.query || ''),
      activeOnly: asBoolean(req.query.activeOnly)
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleDiscoveryError(res, error, 'Failed to load search ranking rules');
  }
});

router.post('/search-rules', requirePermission('discovery.search_rules.manage'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const row = await saveSearchRankingRule(req.body || {}, staffId);
    emitDiscoveryEvent(req, 'search:rules_updated', {
      action: 'created',
      ruleId: row.id,
      key: row.key,
      targetType: row.targetType,
      scope: row.scope
    });
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    return handleDiscoveryError(res, error, 'Failed to create search ranking rule');
  }
});

router.put('/search-rules/:id', requirePermission('discovery.search_rules.manage'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const row = await saveSearchRankingRule({ ...(req.body || {}), id: req.params.id }, staffId);
    emitDiscoveryEvent(req, 'search:rules_updated', {
      action: 'updated',
      ruleId: row.id,
      key: row.key,
      targetType: row.targetType,
      scope: row.scope
    });
    return res.json({ success: true, data: row });
  } catch (error) {
    return handleDiscoveryError(res, error, 'Failed to update search ranking rule');
  }
});

router.delete('/search-rules/:id', requirePermission('discovery.search_rules.manage'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const row = await deactivateSearchRankingRule(req.params.id, staffId);
    emitDiscoveryEvent(req, 'search:rules_updated', {
      action: 'deactivated',
      ruleId: row.id,
      key: row.key,
      targetType: row.targetType,
      scope: row.scope
    });
    return res.json({ success: true, data: row });
  } catch (error) {
    return handleDiscoveryError(res, error, 'Failed to deactivate search ranking rule');
  }
});

router.get('/feed-recipes', requirePermission('discovery.read'), async (req, res) => {
  try {
    const rows = await listFeedRecipes({
      activeOnly: asBoolean(req.query.activeOnly)
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleDiscoveryError(res, error, 'Failed to load feed recipes');
  }
});

router.post('/feed-recipes', requirePermission('discovery.feed_recipes.manage'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const row = await saveFeedRecipe(req.body || {}, staffId);
    emitDiscoveryEvent(req, 'feed:recipe_updated', {
      action: 'created',
      recipeId: row.id,
      key: row.key,
      mode: row.mode
    });
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    return handleDiscoveryError(res, error, 'Failed to create feed recipe');
  }
});

router.put('/feed-recipes/:id', requirePermission('discovery.feed_recipes.manage'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const row = await saveFeedRecipe({ ...(req.body || {}), id: req.params.id }, staffId);
    emitDiscoveryEvent(req, 'feed:recipe_updated', {
      action: 'updated',
      recipeId: row.id,
      key: row.key,
      mode: row.mode
    });
    return res.json({ success: true, data: row });
  } catch (error) {
    return handleDiscoveryError(res, error, 'Failed to update feed recipe');
  }
});

export default router;
