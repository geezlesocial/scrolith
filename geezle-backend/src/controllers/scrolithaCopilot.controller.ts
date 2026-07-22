/**
 * Phase 33.3 — Platform Copilot & skills APIs.
 */
import { Request, Response } from 'express';
import { runCopilot, copilotStatus } from '../services/scrolithaAi/copilot';
import { listSkills, runSkills } from '../services/scrolithaAi/skills';
import { invokePlatformTools, planToolsFromIntent } from '../services/scrolithaAi/orchestration';
import { getBetaAllowlist, setBetaAllowlist, isBetaAllowed } from '../services/scrolithaAi/allowlist';
import { detectIntentLocal } from '../services/scrolithaAi/providers/nativeProvider';
import { ScrolithaAI } from '../services/scrolithaAi';
import { loadAIFeatureFlags } from '../services/scrolithaAi/config';
import type { CopilotSurface } from '../services/scrolithaAi/types';

const userIdOf = (req: Request) =>
  String((req as any).user?.id || (req as any).userId || '').trim() || null;

const isAdminOf = (req: Request) => {
  const role = String((req as any).user?.role || '').toLowerCase();
  return role.includes('admin') || Boolean((req as any).user?.isAdmin);
};

export async function getCopilotStatus(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await copilotStatus(userId, isAdminOf(req));
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'status_failed' });
  }
}

export async function postCopilot(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const result = await runCopilot({
      userId,
      message: String(req.body?.message || req.body?.text || ''),
      surface: (req.body?.surface || 'generic') as CopilotSurface,
      pagePath: req.body?.pagePath,
      entityId: req.body?.entityId,
      entityType: req.body?.entityType,
      locale: req.body?.locale,
      isAdmin: isAdminOf(req),
      includeTools: Boolean(req.body?.includeTools),
      correlationId: String(req.headers['x-correlation-id'] || '') || undefined
    });
    const status = result.ok ? 200 : result.blocked ? 403 : 503;
    return res.status(status).json({ success: result.ok, data: result, error: result.reason });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'copilot_failed' });
  }
}

export async function getSkills(_req: Request, res: Response) {
  try {
    return res.json({ success: true, data: listSkills() });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'skills_failed' });
  }
}

export async function postSkillRun(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const flags = await loadAIFeatureFlags();
    if (!flags.skillsFrameworkEnabled) {
      return res.status(403).json({ success: false, error: 'SURFACE_FLAG_DISABLED:skillsFrameworkEnabled' });
    }
    if (flags.betaAllowlistOnly && !(await isBetaAllowed(userId, isAdminOf(req)))) {
      return res.status(403).json({ success: false, error: 'BETA_ALLOWLIST_ONLY' });
    }
    const results = await runSkills(String(req.body?.message || ''), {
      userId,
      surface: (req.body?.surface || 'generic') as CopilotSurface,
      pagePath: req.body?.pagePath,
      locale: req.body?.locale
    });
    return res.json({ success: true, data: results });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'skill_run_failed' });
  }
}

export async function postIntent(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const text = String(req.body?.text || req.body?.message || '');
    const local = detectIntentLocal(text);
    const flags = await loadAIFeatureFlags();
    if (flags.INTENT_DETECTION && flags.nativeIntelligenceEnabled) {
      const exec = await ScrolithaAI.execute({
        capability: 'INTENT_DETECTION',
        userId,
        input: text,
        policy: { privacyLevel: 'PERSONAL', preferInternalProvider: true }
      });
      return res.json({
        success: true,
        data: {
          local,
          gateway: exec.ok ? exec.text : null,
          provider: exec.disclosure?.provider || 'NATIVE'
        }
      });
    }
    return res.json({ success: true, data: { local, gateway: null, provider: 'NATIVE' } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'intent_failed' });
  }
}

export async function postOrchestrate(req: Request, res: Response) {
  try {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const flags = await loadAIFeatureFlags();
    if (!flags.toolOrchestrationEnabled) {
      return res.status(403).json({ success: false, error: 'SURFACE_FLAG_DISABLED:toolOrchestrationEnabled' });
    }
    const message = String(req.body?.message || '');
    const intent = detectIntentLocal(message).intent;
    const planned = planToolsFromIntent(intent).map((tool) => ({
      tool,
      args: req.body?.args || { query: message }
    }));
    const results = await invokePlatformTools({
      userId,
      tools: planned,
      isAdmin: isAdminOf(req)
    });
    return res.json({
      success: true,
      data: {
        intent,
        planned: planned.map((p) => p.tool),
        results,
        autonomous: false
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'orchestrate_failed' });
  }
}

export async function getAllowlist(req: Request, res: Response) {
  try {
    if (!isAdminOf(req)) return res.status(403).json({ success: false, error: 'Admin required' });
    const userIds = await getBetaAllowlist();
    return res.json({ success: true, data: { userIds } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'allowlist_failed' });
  }
}

export async function putAllowlist(req: Request, res: Response) {
  try {
    if (!isAdminOf(req)) return res.status(403).json({ success: false, error: 'Admin required' });
    const ids = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
    const userIds = await setBetaAllowlist(ids, userIdOf(req) || undefined);
    return res.json({ success: true, data: { userIds } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'allowlist_update_failed' });
  }
}
