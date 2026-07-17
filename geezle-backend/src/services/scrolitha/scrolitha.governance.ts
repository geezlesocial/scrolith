/**
 * AI Governance metadata — no sensitive prompt content.
 */
import { enterpriseCache, hashCacheKey } from './scrolitha.enterpriseCache';
import { writeScrolithaAuditLog } from './scrolitha.audit';

export type GovernanceRecord = {
  requestId: string;
  actorId: string;
  provider: string;
  confidence?: number | null;
  confidenceBand?: string | null;
  workflowId?: string | null;
  skills?: string[];
  evidenceCategories?: string[];
  latencyMs?: number | null;
  retryCount?: number;
  surface?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  streamingMode?: string | null;
  cacheHit?: boolean;
  createdAt: string;
};

const recent: GovernanceRecord[] = [];
const MAX_RECENT = 200;

export const recordGovernance = async (input: Omit<GovernanceRecord, 'createdAt'> & { createdAt?: string }) => {
  const record: GovernanceRecord = {
    ...input,
    skills: (input.skills || []).slice(0, 20),
    evidenceCategories: (input.evidenceCategories || []).slice(0, 20),
    createdAt: input.createdAt || new Date().toISOString()
  };

  recent.unshift(record);
  if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;

  enterpriseCache.set('governance', `req:${record.requestId}`, record, 15 * 60_000);
  enterpriseCache.set(
    'governance',
    `latest:${hashCacheKey([record.actorId, record.entityId || ''])}`,
    { requestId: record.requestId, createdAt: record.createdAt },
    15 * 60_000
  );

  try {
    await writeScrolithaAuditLog({
      actor: {
        id: record.actorId,
        role: 'user',
        scope: 'user',
        isAdmin: false,
        ipAddress: null,
        userAgent: 'scrolitha-governance'
      },
      eventType: 'SCROLITHA_GOVERNANCE',
      intent: record.surface || 'intelligence',
      requestPayload: {
        requestId: record.requestId,
        provider: record.provider,
        workflowId: record.workflowId || null
      },
      redactedPayload: {
        requestId: record.requestId,
        provider: record.provider,
        confidence: record.confidence ?? null,
        confidenceBand: record.confidenceBand || null,
        workflowId: record.workflowId || null,
        skills: record.skills,
        evidenceCategories: record.evidenceCategories,
        latencyMs: record.latencyMs ?? null,
        retryCount: record.retryCount ?? 0,
        streamingMode: record.streamingMode || null,
        cacheHit: Boolean(record.cacheHit),
        entityType: record.entityType || null
      },
      resultStatus: 'ok',
      resultSummary: `Governance ${record.requestId} provider=${record.provider}`
    });
  } catch {
    // never break AI path
  }

  return record;
};

export const getGovernanceRecord = (requestId: string) =>
  enterpriseCache.get<GovernanceRecord>('governance', `req:${requestId}`) ||
  recent.find((r) => r.requestId === requestId) ||
  null;

export const listRecentGovernance = (limit = 50) => recent.slice(0, Math.max(1, Math.min(100, limit)));

export const getGovernanceSummary = () => {
  const byProvider: Record<string, number> = {};
  const byBand: Record<string, number> = {};
  let totalLatency = 0;
  let latencyN = 0;
  for (const r of recent) {
    byProvider[r.provider] = (byProvider[r.provider] || 0) + 1;
    const band = r.confidenceBand || 'unknown';
    byBand[band] = (byBand[band] || 0) + 1;
    if (typeof r.latencyMs === 'number') {
      totalLatency += r.latencyMs;
      latencyN += 1;
    }
  }
  return {
    sampleSize: recent.length,
    byProvider,
    byConfidenceBand: byBand,
    avgLatencyMs: latencyN ? Math.round(totalLatency / latencyN) : null,
    privacy: 'Governance stores metadata only — never raw prompts or private content.'
  };
};
