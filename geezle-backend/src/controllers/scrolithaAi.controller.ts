/**
 * Phase 33.0 — User-facing Scrolitha AI API controllers.
 */
import { Request, Response } from 'express';
import {
  ScrolithaAI,
  getAIConsent,
  updateAIConsent,
  resetAIConsent,
  loadAIFeatureFlags,
  getUsageSummary,
  listUserHistory,
  deleteUserHistory,
  FOUNDATION_CAPABILITIES,
  DEFAULT_AI_CONSENT,
  type AICapabilityId
} from '../services/scrolithaAi';
import { writeAIAudit } from '../services/scrolithaAi/audit';

const userIdOf = (req: Request) =>
  String((req as any).user?.id || (req as any).userId || '').trim() || null;

export async function aiStatus(req: Request, res: Response) {
  try {
    const flags = await loadAIFeatureFlags();
    const userId = userIdOf(req);
    const consent = await getAIConsent(userId);
    return res.json({
      success: true,
      data: {
        platform: 'Scrolitha AI',
        phase: '33.0',
        masterEnabled: flags.masterEnabled && !flags.killSwitch,
        killSwitch: flags.killSwitch,
        enableProviderCalls: flags.enableProviderCalls,
        capabilities: FOUNDATION_CAPABILITIES.map((c) => ({
          id: c,
          enabled: Boolean(flags[c]),
          availableToUser: Boolean(flags.masterEnabled && flags[c] && consent.aiFeaturesEnabled)
        })),
        consent: {
          aiFeaturesEnabled: consent.aiFeaturesEnabled,
          consentVersion: consent.consentVersion
        },
        disclosure:
          'AI suggestions may be incorrect. Review outputs before acting. Security and emergency policies always take precedence.',
        productionSafeDefaults: true
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'status_failed' });
  }
}

export async function aiGetPreferences(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const consent = await getAIConsent(userId);
    return res.json({ success: true, data: consent });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'preferences_failed' });
  }
}

export async function aiPatchPreferences(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const body = req.body || {};
    const allowed = [
      'aiFeaturesEnabled',
      'privateMessageAnalysisAllowed',
      'personalizationAllowed',
      'externalProviderProcessingAllowed',
      'aiSuggestionsAllowed',
      'aiActivityHistoryEnabled',
      'productImprovementDataAllowed'
    ] as const;
    const partial: Record<string, boolean> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) partial[k] = Boolean(body[k]);
    }
    const next = await updateAIConsent(userId, partial as any);
    return res.json({ success: true, data: next });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'preferences_update_failed' });
  }
}

export async function aiResetPreferences(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const next = await resetAIConsent(userId);
    return res.json({ success: true, data: next || DEFAULT_AI_CONSENT });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'reset_failed' });
  }
}

export async function aiUsage(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const summary = await getUsageSummary(userId);
    return res.json({ success: true, data: summary });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'usage_failed' });
  }
}

export async function aiHistory(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const consent = await getAIConsent(userId);
    if (!consent.aiActivityHistoryEnabled) {
      return res.json({ success: true, data: [], message: 'History disabled by preference' });
    }
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const rows = await listUserHistory(userId, limit);
    return res.json({ success: true, data: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'history_failed' });
  }
}

export async function aiDeleteHistory(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const result = await deleteUserHistory(userId);
    await writeAIAudit({
      action: 'history.deleted',
      actorUserId: userId,
      targetUserId: userId,
      metadata: result
    });
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'delete_history_failed' });
  }
}

async function runCapability(
  req: Request,
  res: Response,
  capability: AICapabilityId
) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const text = String(req.body?.text || req.body?.input || '').trim();
    if (!text || text.length > 20_000) {
      return res.status(400).json({ success: false, error: 'Invalid input (1–20000 chars required)' });
    }
    const locale = String(req.body?.locale || 'en').slice(0, 16);
    const result = await ScrolithaAI.execute({
      capability,
      userId,
      input: text,
      locale,
      policy: {
        privacyLevel: req.body?.privacyLevel || undefined,
        maxTokens: req.body?.maxTokens ? Number(req.body.maxTokens) : undefined
      },
      correlationId: String(req.headers['x-correlation-id'] || '') || undefined,
      metadata: { via: 'user_api' }
    });
    if (!result.ok) {
      const status = result.blocked ? 403 : 503;
      return res.status(status).json({
        success: false,
        error: result.reason || 'AI_UNAVAILABLE',
        data: {
          blocked: result.blocked,
          lifecycle: result.lifecycle,
          correlationId: result.correlationId
        }
      });
    }
    return res.json({
      success: true,
      data: {
        text: result.text,
        disclosure: result.disclosure,
        privacyLevel: result.privacyLevel,
        usage: result.usage,
        latencyMs: result.latencyMs,
        correlationId: result.correlationId
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'execute_failed' });
  }
}

export const aiSummarize = (req: Request, res: Response) => runCapability(req, res, 'TEXT_SUMMARIZATION');
export const aiRewrite = (req: Request, res: Response) => runCapability(req, res, 'TEXT_REWRITING');
