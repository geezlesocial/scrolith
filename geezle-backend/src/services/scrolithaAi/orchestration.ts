/**
 * Phase 33.3 — Internal platform tool orchestration.
 * Only internal Scrolitha services. Permission + policy checked.
 * Never autonomous post/message/moderate/hire/pay.
 */
import { loadAIFeatureFlags } from './config';
import { getAIConsent } from './consent';
import { getAIMemory } from './memory';
import { assistSearchQuery } from './semanticSearch';
import { getRecommendations } from './recommendations';
import { scoreFeedCandidates } from './feedScoring';
import { suggestNotificationPriorities } from './notificationHooks';
import { getDiscoveryAnalytics } from './discoveryAnalytics';
import { inc, logAIEvent } from './observability';
import type { PlatformToolId } from './types';

export type ToolInvocation = {
  tool: PlatformToolId;
  args?: Record<string, unknown>;
};

export type ToolResult = {
  tool: PlatformToolId;
  ok: boolean;
  data?: unknown;
  reason?: string;
  executed: boolean;
};

const FORBIDDEN_TOOLS = new Set([
  'send_message',
  'publish_post',
  'apply_job',
  'transfer_funds',
  'ban_user',
  'delete_content'
]);

export function planToolsFromIntent(intent: string): PlatformToolId[] {
  switch (intent) {
    case 'search':
    case 'jobs':
      return ['search_suggest', 'recommend'];
    case 'recommend':
      return ['recommend', 'memory_read'];
    case 'notifications':
      return ['notification_priority_suggest'];
    case 'feed':
      return ['feed_score_suggest', 'memory_read'];
    case 'analytics':
      return ['analytics_snapshot'];
    default:
      return ['memory_read'];
  }
}

export async function invokePlatformTools(input: {
  userId: string;
  tools: ToolInvocation[];
  isAdmin?: boolean;
}): Promise<ToolResult[]> {
  const flags = await loadAIFeatureFlags();
  if (!flags.toolOrchestrationEnabled) {
    return input.tools.map((t) => ({
      tool: t.tool,
      ok: false,
      reason: 'SURFACE_FLAG_DISABLED:toolOrchestrationEnabled',
      executed: false
    }));
  }
  const consent = await getAIConsent(input.userId);
  if (!consent.aiFeaturesEnabled) {
    return input.tools.map((t) => ({
      tool: t.tool,
      ok: false,
      reason: 'CONSENT_AI_FEATURES_DISABLED',
      executed: false
    }));
  }

  const results: ToolResult[] = [];
  for (const inv of input.tools.slice(0, 5)) {
    if (FORBIDDEN_TOOLS.has(inv.tool as string)) {
      results.push({
        tool: inv.tool,
        ok: false,
        reason: 'FORBIDDEN_AUTONOMOUS_TOOL',
        executed: false
      });
      continue;
    }

    try {
      switch (inv.tool) {
        case 'memory_read': {
          const mem = await getAIMemory(input.userId);
          results.push({
            tool: inv.tool,
            ok: true,
            executed: true,
            data: {
              preferredTopics: mem.preferredTopics,
              mutedTopics: mem.mutedTopics,
              version: mem.version
            }
          });
          break;
        }
        case 'search_suggest': {
          const q = String(inv.args?.query || '');
          const data = await assistSearchQuery({
            userId: input.userId,
            query: q,
            domain: inv.args?.domain as string | undefined
          });
          results.push({ tool: inv.tool, ok: data.enabled, executed: true, data, reason: data.reason });
          break;
        }
        case 'recommend': {
          const data = await getRecommendations({
            userId: input.userId,
            limit: Number(inv.args?.limit || 6)
          });
          results.push({
            tool: inv.tool,
            ok: data.enabled,
            executed: true,
            data: { items: data.items, policy: data.policy },
            reason: data.reason
          });
          break;
        }
        case 'feed_score_suggest': {
          const candidates = Array.isArray(inv.args?.candidates) ? inv.args!.candidates : [];
          const data = await scoreFeedCandidates({
            userId: input.userId,
            candidates: candidates as any
          });
          results.push({
            tool: inv.tool,
            ok: data.enabled,
            executed: true,
            data,
            reason: data.reason
          });
          break;
        }
        case 'notification_priority_suggest': {
          const items = Array.isArray(inv.args?.items) ? inv.args!.items : [];
          const data = await suggestNotificationPriorities({
            userId: input.userId,
            items: items as any
          });
          results.push({
            tool: inv.tool,
            ok: data.usedAI,
            executed: true,
            data,
            reason: data.reason
          });
          break;
        }
        case 'analytics_snapshot': {
          if (!input.isAdmin) {
            results.push({
              tool: inv.tool,
              ok: false,
              reason: 'ADMIN_REQUIRED',
              executed: false
            });
            break;
          }
          const data = await getDiscoveryAnalytics();
          results.push({ tool: inv.tool, ok: true, executed: true, data });
          break;
        }
        default:
          results.push({
            tool: inv.tool,
            ok: false,
            reason: 'UNKNOWN_TOOL',
            executed: false
          });
      }
      if (results[results.length - 1]?.executed) {
        inc('successes');
      }
    } catch (err: any) {
      logAIEvent('warn', 'tool_invoke_failed', { tool: inv.tool, error: String(err?.message || err) });
      results.push({
        tool: inv.tool,
        ok: false,
        reason: String(err?.message || 'TOOL_ERROR'),
        executed: false
      });
    }
  }

  return results;
}

export default { planToolsFromIntent, invokePlatformTools };
