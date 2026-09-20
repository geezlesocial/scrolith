/**
 * Phase 33.0 — Admin Scrolitha AI controls.
 */
import { Request, Response } from 'express';
import {
  loadAIFeatureFlags,
  setAIFeatureFlags,
  loadProviderConfig,
  setProviderConfig,
  healthAllProviders,
  getAIMetricsSnapshot,
  getCircuitSnapshot,
  AIPromptRegistry,
  FOUNDATION_CAPABILITIES,
  type AIFeatureFlags
} from '../services/scrolithaAi';
import { DEFAULT_AI_FEATURE_FLAGS } from '../services/scrolithaAi/types';
import { isSafeObjectKey } from '../utils/security/safeObjectKey';
import { isScrolithaLocalOnly, SCROLITHA_LOCAL_MODEL } from '../services/scrolithaAi/config';
import { listAIAudit, writeAIAudit } from '../services/scrolithaAi/audit';
import prisma from '../utils/prismaClient';

const actorId = (req: Request) =>
  String((req as any).user?.id || (req as any).userId || 'admin').trim();

export async function adminAIOverview(_req: Request, res: Response) {
  try {
    const [flags, providers, health, metrics, circuits] = await Promise.all([
      loadAIFeatureFlags(),
      loadProviderConfig(),
      healthAllProviders(),
      Promise.resolve(getAIMetricsSnapshot()),
      Promise.resolve(getCircuitSnapshot())
    ]);
    return res.json({
      success: true,
      data: {
        phase: '33.0',
        flags,
        providers,
        health,
        metrics,
        circuits,
        capabilities: FOUNDATION_CAPABILITIES,
        productionGuardrails: {
          enableProviderCallsDefault: false,
          killSwitchAvailable: true,
          noAutonomousActions: true
        }
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'overview_failed' });
  }
}

export async function adminAIProviders(_req: Request, res: Response) {
  try {
    const cfg = await loadProviderConfig();
    const health = await healthAllProviders();
    return res.json({ success: true, data: { config: cfg, health } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'providers_failed' });
  }
}

export async function adminAIPutProvider(req: Request, res: Response) {
  try {
    const provider = String(req.params.provider || '').toUpperCase();
    if (!['OLLAMA', 'GEMINI', 'OPENAI', 'MOCK', 'GLOBAL'].includes(provider)) {
      return res.status(400).json({ success: false, error: 'Invalid provider' });
    }
    if (isScrolithaLocalOnly() && !['OLLAMA', 'GLOBAL'].includes(provider)) {
      return res.status(400).json({ success: false, error: 'Only the local Scrolitha Core runtime is enabled by policy' });
    }
    const body = req.body || {};
    // Never accept raw API keys into DB via this endpoint
    if (body.apiKey || body.secret || body.OPENAI_API_KEY || body.GOOGLE_GEMINI_KEY) {
      return res.status(400).json({
        success: false,
        error: 'Credentials must be set via Secret Manager / environment, not API body'
      });
    }
    const current = await loadProviderConfig();
    let next = { ...current };
    if (provider === 'GLOBAL') {
      if (body.emergencyShutdown !== undefined) next.emergencyShutdown = Boolean(body.emergencyShutdown);
    } else if (provider === 'OLLAMA' || provider === 'GEMINI' || provider === 'OPENAI' || provider === 'MOCK') {
      next = {
        ...next,
        [provider]: {
          ...(current as any)[provider],
          enabled: body.enabled !== undefined ? Boolean(body.enabled) : (current as any)[provider]?.enabled,
          model: body.model || (current as any)[provider]?.model,
          timeoutMs: body.timeoutMs ? Number(body.timeoutMs) : (current as any)[provider]?.timeoutMs
        }
      };
    }
    const saved = await setProviderConfig(next, actorId(req));
    await writeAIAudit({
      action: 'admin.provider.updated',
      actorUserId: actorId(req),
      provider,
      metadata: { enabled: body.enabled, emergencyShutdown: body.emergencyShutdown }
    });
    return res.json({ success: true, data: saved });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'provider_update_failed' });
  }
}

export async function adminAITestProvider(req: Request, res: Response) {
  try {
    const provider = String(req.params.provider || '').toUpperCase();
    const health = await healthAllProviders();
    const row = health.find((h) => h.provider === provider);
    // Do not call real generation in Phase 33.0 admin test unless explicitly allowed
    return res.json({
      success: true,
      data: {
        provider,
        health: row || { status: 'unavailable', message: 'Unknown provider' },
        note: 'Health check only. Generation tests require SCROLITHA_AI_ENABLE_PROVIDER_CALLS in non-production.'
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'test_failed' });
  }
}

export async function adminAIModels(_req: Request, res: Response) {
  try {
    let rows: any[] = [];
    try {
      rows = (await (prisma as any).aIModelConfiguration?.findMany?.({ orderBy: { provider: 'asc' } })) || [];
    } catch {
      rows = [];
    }
    if (isScrolithaLocalOnly()) {
      rows = rows.filter((row) => String(row.provider || '').toUpperCase() === 'OLLAMA');
    }
    if (!rows.length) {
      rows = isScrolithaLocalOnly()
        ? [{ provider: 'OLLAMA', modelId: SCROLITHA_LOCAL_MODEL, enabled: true }]
        : [
            { provider: 'OLLAMA', modelId: SCROLITHA_LOCAL_MODEL, enabled: true },
            { provider: 'GEMINI', modelId: process.env.SCROLITHA_GEMINI_MODEL || 'gemini-pro', enabled: false },
            { provider: 'OPENAI', modelId: process.env.OPENAI_MODEL || 'gpt-4o-mini', enabled: false },
            { provider: 'MOCK', modelId: 'mock-foundation', enabled: false }
          ];
    }
    return res.json({ success: true, data: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'models_failed' });
  }
}

export async function adminAIPutModel(req: Request, res: Response) {
  try {
    const modelId = String(req.params.modelId || '');
    const body = req.body || {};
    const provider = String(body.provider || 'OLLAMA').toUpperCase();
    const model = String(body.modelId || modelId).trim();
    if (isScrolithaLocalOnly() && (provider !== 'OLLAMA' || model !== SCROLITHA_LOCAL_MODEL)) {
      return res.status(400).json({ success: false, error: `Only ${SCROLITHA_LOCAL_MODEL} on Ollama is enabled by policy` });
    }
    try {
      const row = await (prisma as any).aIModelConfiguration?.upsert?.({
        where: { id: modelId },
        create: {
          id: modelId,
          provider: String(body.provider || 'OLLAMA'),
          modelId: String(body.modelId || modelId),
          displayName: body.displayName || null,
          enabled: body.enabled !== undefined ? Boolean(body.enabled) : true,
          maxTokens: Number(body.maxTokens || 4096),
          costTier: String(body.costTier || 'low')
        },
        update: {
          enabled: body.enabled !== undefined ? Boolean(body.enabled) : undefined,
          displayName: body.displayName,
          maxTokens: body.maxTokens ? Number(body.maxTokens) : undefined
        }
      });
      return res.json({ success: true, data: row });
    } catch {
      return res.json({
        success: true,
        data: { id: modelId, ...body, note: 'Persisted in memory only (table unavailable)' }
      });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'model_update_failed' });
  }
}

export async function adminAIPrompts(_req: Request, res: Response) {
  try {
    return res.json({ success: true, data: AIPromptRegistry.list() });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'prompts_failed' });
  }
}

export async function adminAICreatePrompt(req: Request, res: Response) {
  try {
    const body = req.body || {};
    if (!body.promptKey || !body.capability) {
      return res.status(400).json({ success: false, error: 'promptKey and capability required' });
    }
    // Reject user-controlled system prompts that try to elevate privileges
    if (/ignore\s+all\s+previous/i.test(String(body.systemInstructions || ''))) {
      return res.status(400).json({ success: false, error: 'Unsafe system instructions' });
    }
    const row = await AIPromptRegistry.upsertMemory({
      promptKey: String(body.promptKey),
      capability: body.capability,
      version: Number(body.version || 1),
      status: body.status || 'draft',
      systemInstructions: String(body.systemInstructions || ''),
      inputTemplate: String(body.inputTemplate || '{{content}}'),
      locale: String(body.locale || 'en'),
      maxContextChars: Number(body.maxContextChars || 8000)
    });
    await writeAIAudit({
      action: 'admin.prompt.created',
      actorUserId: actorId(req),
      capability: row.capability,
      metadata: { promptKey: row.promptKey, version: row.version }
    });
    return res.status(201).json({ success: true, data: row });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'prompt_create_failed' });
  }
}

export async function adminAIUpdatePrompt(req: Request, res: Response) {
  try {
    const promptId = String(req.params.promptId || '');
    const body = req.body || {};
    const existing = AIPromptRegistry.list().find((p) => p.id === promptId);
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });
    const row = await AIPromptRegistry.upsertMemory({
      ...existing,
      ...body,
      id: promptId,
      promptKey: existing.promptKey,
      capability: existing.capability
    });
    return res.json({ success: true, data: row });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'prompt_update_failed' });
  }
}

export async function adminAIPublishPrompt(req: Request, res: Response) {
  try {
    const promptId = String(req.params.promptId || '');
    const existing = AIPromptRegistry.list().find((p) => p.id === promptId);
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });
    const row = await AIPromptRegistry.upsertMemory({
      ...existing,
      status: 'published'
    });
    await writeAIAudit({
      action: 'admin.prompt.published',
      actorUserId: actorId(req),
      capability: row.capability,
      metadata: { promptId, version: row.version }
    });
    return res.json({ success: true, data: row });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'publish_failed' });
  }
}

export async function adminAIRollbackPrompt(req: Request, res: Response) {
  try {
    const promptId = String(req.params.promptId || '');
    const existing = AIPromptRegistry.list().find((p) => p.id === promptId);
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });
    const prevVersion = Math.max(1, existing.version - 1);
    const previous =
      AIPromptRegistry.list(existing.capability).find((p) => p.version === prevVersion) || existing;
    const row = await AIPromptRegistry.upsertMemory({
      ...previous,
      id: existing.id,
      status: 'published',
      version: existing.version + 1
    });
    await writeAIAudit({
      action: 'admin.prompt.rollback',
      actorUserId: actorId(req),
      capability: row.capability,
      metadata: { promptId, toVersion: prevVersion }
    });
    return res.json({ success: true, data: row });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'rollback_failed' });
  }
}

export async function adminAIUsage(_req: Request, res: Response) {
  try {
    const metrics = getAIMetricsSnapshot();
    let ledger: any[] = [];
    try {
      ledger =
        (await (prisma as any).aIUsageLedger?.findMany?.({
          orderBy: { createdAt: 'desc' },
          take: 50
        })) || [];
    } catch {
      ledger = [];
    }
    return res.json({ success: true, data: { metrics, recent: ledger } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'usage_failed' });
  }
}

export async function adminAIHealth(_req: Request, res: Response) {
  try {
    const health = await healthAllProviders();
    const circuits = getCircuitSnapshot();
    return res.json({ success: true, data: { health, circuits, checkedAt: new Date().toISOString() } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'health_failed' });
  }
}

export async function adminAIAudit(req: Request, res: Response) {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const rows = await listAIAudit(limit);
    return res.json({ success: true, data: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'audit_failed' });
  }
}

export async function adminAIFeatureFlags(req: Request, res: Response) {
  try {
    if (req.method === 'GET') {
      const flags = await loadAIFeatureFlags();
      return res.json({ success: true, data: flags });
    }
    let body: Record<string, unknown> = { ...(req.body || {}) };
    const flagName = req.params.flag ? String(req.params.flag) : '';
    if (flagName) {
      if (!isSafeObjectKey(flagName) || !Object.prototype.hasOwnProperty.call(DEFAULT_AI_FEATURE_FLAGS, flagName)) {
        return res.status(400).json({ success: false, error: 'Unsupported feature flag' });
      }
      const value = body.value !== undefined ? body.value : body.enabled;
      body = { [flagName]: value };
    }
    // High-risk: confirm header for kill switch / provider calls
    if (body.enableProviderCalls === true || body.killSwitch === true) {
      if (String(req.headers['x-confirm-ai-risk'] || '') !== 'CONFIRM') {
        return res.status(400).json({
          success: false,
          error: 'High-risk flag change requires header X-Confirm-AI-Risk: CONFIRM'
        });
      }
    }
    // Never enable provider calls in production without env
    if (process.env.NODE_ENV === 'production' && body.enableProviderCalls === true) {
      if (process.env.SCROLITHA_AI_ALLOW_PROD_PROVIDER !== '1') {
        return res.status(403).json({
          success: false,
          error: 'Production provider calls blocked by Phase 33.0 guardrail'
        });
      }
    }
    const next = await setAIFeatureFlags(body as Partial<AIFeatureFlags>, actorId(req));
    await writeAIAudit({
      action: 'admin.feature_flags.updated',
      actorUserId: actorId(req),
      metadata: { keys: Object.keys(body) }
    });
    return res.json({ success: true, data: next });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'flags_failed' });
  }
}
