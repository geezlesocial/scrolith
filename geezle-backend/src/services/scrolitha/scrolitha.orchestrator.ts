import prisma from '../../utils/prismaClient';
import { listScrolithaAuditLogs, writeScrolithaAuditLog } from './scrolitha.audit';
import {
  canUseTool,
  detectPromptInjectionAttempt,
  enforceActionRateLimits,
  ensureScrolithaConfig,
  redactPayload,
  shouldRequireConfirmation,
  updateScrolithaConfig
} from './scrolitha.policy';
import {
  appendConversationMessage,
  listConversationHistory,
  listSkillsForScope,
  resolveConversation,
  saveConversationFeedback
} from './scrolitha.memory';
import { getScrolithaToolDefinition, listScrolithaTools } from './scrolitha.tools';
import type {
  ScrolithaActor,
  ScrolithaChatInput,
  ScrolithaExecuteInput,
  ScrolithaFeedbackInput,
  ScrolithaPlanSuggestion
} from './scrolitha.types';

const text = (v: unknown) => String(v || '').trim();

const classifyMessage = (message: string, actor: ScrolithaActor, skills: any[]) => {
  const m = message.toLowerCase();
  const has = (...terms: string[]) => terms.some((term) => m.includes(term));

  const suggestions: ScrolithaPlanSuggestion[] = [];
  const add = (actionKey: string, toolKey: string, summary: string) => {
    suggestions.push({ actionKey, toolKey, summary, paramsPreview: {} });
  };

  if (actor.scope === 'admin') {
    if (has('search user', 'find user', 'lookup user')) add('search_users', 'SEARCH_USERS', 'Search users by query.');
    if (has('approve monetization', 'review monetization', 'application')) {
      add('review_monetization_application', 'REVIEW_MONETIZATION_APPLICATION', 'Review a monetization application.');
    }
    if (has('create role', 'new role')) add('create_role', 'CREATE_ROLE', 'Create a new staff role.');
    if (has('update role', 'permission')) add('update_role_permissions', 'UPDATE_ROLE_PERMISSIONS', 'Update role permissions.');
    if (has('moderate post', 'remove post', 'restore post')) add('moderate_post', 'MODERATE_POST', 'Moderate a community post.');
    if (has('review ad', 'approve ad', 'reject ad', 'pause ad')) add('review_ads', 'REVIEW_ADS', 'Review ad status.');
    if (has('audit log', 'scrolitha logs')) add('view_audit_logs', 'VIEW_SCROLITHA_AUDIT_LOGS', 'View Scrolitha audit logs.');
  } else {
    if (has('create gig', 'new gig')) add('create_gig', 'CREATE_GIG', 'Create a gig draft.');
    if (has('submit gig', 'gig for review')) add('submit_gig_for_review', 'SUBMIT_GIG_FOR_REVIEW', 'Submit a gig draft for review.');
    if (has('post job', 'create job', 'new job')) add('create_job', 'CREATE_JOB', 'Create a job draft.');
    if (has('upload file', 'attach file', 'file library')) add('upload_file_to_library', 'UPLOAD_FILE_TO_LIBRARY', 'Bind a file from Uploaded Files.');
    if (has('find orders', 'my orders', 'orders')) add('get_my_orders', 'GET_MY_ORDERS', 'Load your latest orders.');
    if (has('notification', 'alerts')) add('fetch_notifications', 'FETCH_NOTIFICATIONS', 'Fetch recent notifications.');
    if (has('mark read', 'read notification')) add('mark_notification_read', 'MARK_NOTIFICATION_READ', 'Mark notifications as read.');
    if (has('block user', 'report user', 'restrict follower')) add('block_user', 'BLOCK_USER', 'Block a user account.');
    if (has('follow user', 'follow account')) add('follow_user', 'FOLLOW_USER', 'Follow an account.');
    if (has('project brief', 'generate brief')) add('generate_project_brief', 'GENERATE_PROJECT_BRIEF', 'Generate a project brief draft.');
    if (has('profile', 'settings')) add('get_me_profile', 'GET_ME_PROFILE', 'Load your profile and settings context.');
  }

  if (!suggestions.length && Array.isArray(skills) && skills.length) {
    const match = skills.find((skill: any) => {
      const hay = `${String(skill?.name || '')} ${String(skill?.description || '')}`.toLowerCase();
      return message
        .toLowerCase()
        .split(/\s+/)
        .some((token) => token && hay.includes(token));
    });

    if (match) {
      const step = Array.isArray(match.stepsSchema)
        ? match.stepsSchema.find((entry: any) => String(entry?.tool || '').trim())
        : null;
      if (step?.tool) {
        suggestions.push({
          actionKey: String(match.key || 'skill_task'),
          toolKey: String(step.tool),
          summary: String(match.description || `Run skill ${match.name || match.key}`),
          paramsPreview: {}
        });
      }
    }
  }

  let reply = 'I can help with task planning and execution using approved tools. Tell me the exact action and required IDs.';
  if (suggestions.length === 1) {
    reply = `I prepared one action: ${suggestions[0].summary}`;
  } else if (suggestions.length > 1) {
    reply = `I prepared ${suggestions.length} actions. Confirm the one you want to execute.`;
  }

  return { reply, suggestions };
};

const emitScrolithaEvents = (app: any, eventName: string, payload: any) => {
  try {
    const io = app?.get?.('io');
    const communityNs = app?.get?.('communityNs');
    io?.emit?.(eventName, payload);
    communityNs?.emit?.(eventName, payload);
    if (payload?.actorId) {
      io?.to?.(payload.actorId)?.emit?.(eventName, payload);
      communityNs?.to?.(`community:user:${payload.actorId}`)?.emit?.(eventName, payload);
    }
  } catch (error) {
    console.warn('[scrolitha] socket emit failed', eventName, error);
  }
};

const createActionPlans = async (input: {
  actor: ScrolithaActor;
  conversationId: string;
  suggestions: ScrolithaPlanSuggestion[];
  config: any;
}) => {
  const plans: any[] = [];

  for (const suggestion of input.suggestions) {
    const tool = getScrolithaToolDefinition(suggestion.toolKey);
    if (!tool) continue;
    const allowed = canUseTool(input.actor, tool, input.config);
    if (!allowed.allowed) continue;

    const requiresConfirmation = shouldRequireConfirmation(tool, input.config);
    const paramsPreview = suggestion.paramsPreview || {};
    const redacted = redactPayload(paramsPreview, tool.redactedFields);

    const row = await prisma.scrolithaActionPlan.create({
      data: {
        conversationId: input.conversationId,
        userId: input.actor.id,
        userRole: input.actor.role,
        scope: input.actor.scope,
        actionKey: suggestion.actionKey,
        toolKey: tool.key,
        summary: suggestion.summary,
        requiresConfirmation,
        confirmationStatus: requiresConfirmation ? 'pending' : 'not_required',
        status: 'planned',
        paramsPreview,
        paramsRedacted: redacted
      }
    });

    plans.push({
      actionId: row.id,
      actionKey: row.actionKey,
      toolKey: row.toolKey,
      summary: row.summary,
      requiresConfirmation,
      paramsPreview,
      tool: {
        endpoint: tool.endpoint,
        method: tool.method
      }
    });
  }

  return plans;
};

export const scrolithaChat = async (input: ScrolithaChatInput, actor: ScrolithaActor) => {
  const message = text(input.message);
  if (!message) throw new Error('message is required.');

  const config = await ensureScrolithaConfig(actor.scope);
  const limitCheck = enforceActionRateLimits({ actor, config, channel: 'chat' });
  if (!limitCheck.allowed) throw new Error(limitCheck.reason || 'Rate limit exceeded.');

  const blocked = detectPromptInjectionAttempt(message, config.promptBlocklist || []);
  if (blocked.blocked) {
    await writeScrolithaAuditLog({
      actor,
      eventType: 'chat_blocked',
      intent: 'blocked_prompt',
      requestPayload: { message },
      redactedPayload: { message: '[REDACTED]' },
      resultStatus: 'blocked',
      resultSummary: `Prompt blocked by pattern: ${blocked.pattern || 'unknown'}`
    });
    return {
      reply: 'Request blocked by security policy. Rephrase without hidden/system-instruction directives.',
      suggestedActions: [],
      needsConfirmation: false,
      draftChanges: null,
      conversationId: null
    };
  }

  const conversation = await resolveConversation({
    actor,
    conversationId: input.conversationId,
    context: input.context
  });

  await appendConversationMessage({
    conversationId: conversation.id,
    sender: 'user',
    content: message,
    metadata: { page: input.context?.page || null, entityId: input.context?.entityId || null }
  });

  const skills = await listSkillsForScope(actor.scope, actor.role, false);
  const classified = classifyMessage(message, actor, skills);
  const actionPlans = await createActionPlans({
    actor,
    conversationId: conversation.id,
    suggestions: classified.suggestions,
    config
  });

  await appendConversationMessage({
    conversationId: conversation.id,
    sender: 'assistant',
    content: classified.reply,
    metadata: {
      suggestedActionIds: actionPlans.map((entry) => entry.actionId),
      suggestedToolKeys: actionPlans.map((entry) => entry.toolKey)
    }
  });

  await writeScrolithaAuditLog({
    actor,
    conversationId: conversation.id,
    eventType: 'chat_planned',
    intent: actionPlans[0]?.actionKey || 'chat',
    requestPayload: { message },
    redactedPayload: { message: '[REDACTED]' },
    resultStatus: 'ok',
    resultSummary: `Planned ${actionPlans.length} action(s).`
  });

  return {
    conversationId: conversation.id,
    reply: classified.reply,
    suggestedActions: actionPlans,
    needsConfirmation: actionPlans.some((entry) => entry.requiresConfirmation),
    draftChanges: actionPlans[0]?.paramsPreview || null
  };
};

export const scrolithaExecute = async (input: ScrolithaExecuteInput, actor: ScrolithaActor, app?: any) => {
  const actionId = text(input.actionId);
  if (!actionId) throw new Error('actionId is required.');

  const actionPlan = await prisma.scrolithaActionPlan.findUnique({ where: { id: actionId } });
  if (!actionPlan) throw new Error('Action plan not found.');
  if (actionPlan.userId !== actor.id || actionPlan.scope !== actor.scope) {
    throw new Error('Not allowed to execute this action.');
  }

  const tool = getScrolithaToolDefinition(actionPlan.toolKey);
  if (!tool) throw new Error('Tool no longer exists.');

  const config = await ensureScrolithaConfig(actor.scope);
  const allowed = canUseTool(actor, tool, config);
  if (!allowed.allowed) throw new Error(allowed.reason || 'Tool is blocked by policy.');

  const limitCheck = enforceActionRateLimits({
    actor,
    config,
    channel: 'execute',
    destructive: Boolean(tool.destructive)
  });
  if (!limitCheck.allowed) throw new Error(limitCheck.reason || 'Rate limit exceeded.');

  const requiresConfirmation = Boolean(actionPlan.requiresConfirmation);
  const confirmed = Boolean(input.confirmed);
  if (requiresConfirmation && !confirmed) {
    await prisma.scrolithaActionPlan.update({
      where: { id: actionPlan.id },
      data: {
        status: 'awaiting_confirmation',
        confirmationStatus: 'pending'
      }
    });

    await writeScrolithaAuditLog({
      actor,
      conversationId: actionPlan.conversationId,
      actionPlanId: actionPlan.id,
      eventType: 'action_confirmation_required',
      intent: actionPlan.actionKey,
      toolKey: actionPlan.toolKey,
      requestPayload: input.params || {},
      redactedPayload: redactPayload(input.params || {}, tool.redactedFields),
      resultStatus: 'blocked',
      resultSummary: 'Confirmation required.',
      confirmationStatus: 'pending'
    });

    return {
      success: false,
      needsConfirmation: true,
      message: 'Confirmation is required for this action.'
    };
  }

  const mergedParams = {
    ...((actionPlan.paramsPreview as any) || {}),
    ...((input.params as any) || {})
  };
  const redactedParams = redactPayload(mergedParams, tool.redactedFields);

  try {
    await prisma.scrolithaActionPlan.update({
      where: { id: actionPlan.id },
      data: {
        status: 'executing',
        confirmationStatus: requiresConfirmation ? 'confirmed' : 'not_required',
        confirmedAt: requiresConfirmation ? new Date() : null,
        paramsRedacted: redactedParams
      }
    });

    await writeScrolithaAuditLog({
      actor,
      conversationId: actionPlan.conversationId,
      actionPlanId: actionPlan.id,
      eventType: 'action_execute_requested',
      intent: actionPlan.actionKey,
      toolKey: actionPlan.toolKey,
      requestPayload: mergedParams,
      redactedPayload: redactedParams,
      resultStatus: 'pending',
      resultSummary: 'Execution started.',
      confirmationStatus: requiresConfirmation ? 'confirmed' : 'not_required'
    });

    const executed = await tool.execute(mergedParams, {
      actor,
      app,
      conversationId: actionPlan.conversationId,
      actionPlanId: actionPlan.id
    });

    await prisma.scrolithaActionPlan.update({
      where: { id: actionPlan.id },
      data: {
        status: 'executed',
        confirmationStatus: requiresConfirmation ? 'confirmed' : 'not_required',
        executedAt: new Date(),
        resultPayload: executed?.result || null,
        errorCode: null,
        errorMessage: null
      }
    });

    await appendConversationMessage({
      conversationId: actionPlan.conversationId,
      sender: 'assistant',
      content: executed?.resultSummary || `${tool.key} completed.`,
      metadata: {
        actionPlanId: actionPlan.id,
        toolKey: tool.key,
        deepLink: executed?.deepLink || null
      }
    });

    const emittedEvents = Array.from(new Set(['scrolitha:action_completed', ...(executed?.emittedEvents || [])]));
    const eventPayload = {
      actionId: actionPlan.id,
      toolKey: tool.key,
      actionKey: actionPlan.actionKey,
      actorId: actor.id,
      status: 'completed',
      resultSummary: executed?.resultSummary || null,
      emittedEvents,
      timestamp: new Date().toISOString()
    };

    for (const eventName of emittedEvents) {
      emitScrolithaEvents(app, eventName, eventPayload);
    }

    await writeScrolithaAuditLog({
      actor,
      conversationId: actionPlan.conversationId,
      actionPlanId: actionPlan.id,
      eventType: 'action_executed',
      intent: actionPlan.actionKey,
      toolKey: actionPlan.toolKey,
      requestPayload: mergedParams,
      redactedPayload: redactedParams,
      resultStatus: 'ok',
      resultSummary: executed?.resultSummary || `${tool.key} completed.`,
      confirmationStatus: requiresConfirmation ? 'confirmed' : 'not_required'
    });

    return {
      success: true,
      result: executed?.result || null,
      emittedEvents,
      actionId: actionPlan.id,
      deepLink: executed?.deepLink || null
    };
  } catch (error: any) {
    const message = String(error?.message || 'Scrolitha action failed.');
    await prisma.scrolithaActionPlan.update({
      where: { id: actionPlan.id },
      data: {
        status: 'failed',
        executedAt: new Date(),
        errorCode: 'SCROLITHA_ACTION_FAILED',
        errorMessage: message
      }
    });

    await writeScrolithaAuditLog({
      actor,
      conversationId: actionPlan.conversationId,
      actionPlanId: actionPlan.id,
      eventType: 'action_failed',
      intent: actionPlan.actionKey,
      toolKey: actionPlan.toolKey,
      requestPayload: mergedParams,
      redactedPayload: redactedParams,
      resultStatus: 'error',
      resultSummary: message,
      confirmationStatus: requiresConfirmation ? 'confirmed' : 'not_required'
    });

    throw new Error(message);
  }
};

export const scrolithaHistory = async (actor: ScrolithaActor, limit?: unknown) => {
  return listConversationHistory({ actor, limit });
};

export const scrolithaFeedback = async (input: ScrolithaFeedbackInput, actor: ScrolithaActor) => {
  const conversationId = text(input.conversationId);
  const rating = Math.max(1, Math.min(5, Math.floor(Number(input.rating || 0))));
  if (!conversationId) throw new Error('conversationId is required.');
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new Error('rating must be between 1 and 5.');
  }

  const conversation = await prisma.scrolithaConversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new Error('Conversation not found.');
  if (conversation.userId !== actor.id || conversation.scope !== actor.scope) {
    throw new Error('Not allowed to rate this conversation.');
  }

  const saved = await saveConversationFeedback({
    conversationId,
    userId: actor.id,
    rating,
    note: text(input.note)
  });

  await writeScrolithaAuditLog({
    actor,
    conversationId,
    eventType: 'feedback_submitted',
    intent: 'feedback',
    requestPayload: { rating, note: text(input.note) },
    redactedPayload: { rating, note: text(input.note) ? '[REDACTED]' : null },
    resultStatus: 'ok',
    resultSummary: 'Feedback recorded.'
  });

  return saved;
};

export const getScrolithaConfigForAdmin = async (scope?: unknown) => {
  const requested = text(scope).toLowerCase();
  if (requested === 'user' || requested === 'admin') {
    return ensureScrolithaConfig(requested);
  }

  const [user, admin] = await Promise.all([ensureScrolithaConfig('user'), ensureScrolithaConfig('admin')]);
  return { user, admin };
};

export const saveScrolithaConfigForAdmin = async (payload: Record<string, any>, actor: ScrolithaActor) => {
  const scope = text(payload.scope).toLowerCase() || 'admin';
  if (scope !== 'user' && scope !== 'admin') throw new Error('scope must be user or admin.');
  return updateScrolithaConfig({
    scope,
    enabled: payload.enabled,
    safeMode: payload.safeMode,
    requireConfirmationByDefault: payload.requireConfirmationByDefault,
    lowRiskAutoExecute: payload.lowRiskAutoExecute,
    denyListedTools: payload.denyListedTools,
    promptBlocklist: payload.promptBlocklist,
    userRateLimitPerMinute: payload.userRateLimitPerMinute,
    adminActionCapPerMinute: payload.adminActionCapPerMinute,
    metadata: payload.metadata,
    updatedBy: actor.id
  });
};

export const listScrolithaSkillsForAdmin = async (includeInactive?: unknown) => {
  const include = String(includeInactive || '').toLowerCase() === 'true';
  const skills = await listSkillsForScope('admin', 'admin', include);
  return skills;
};

export const createScrolithaSkill = async (payload: Record<string, any>, actor: ScrolithaActor) => {
  const key = text(payload.key).toLowerCase();
  const name = text(payload.name);
  if (!key) throw new Error('key is required.');
  if (!name) throw new Error('name is required.');

  return prisma.scrolithaSkill.create({
    data: {
      key,
      name,
      roleScope: Array.isArray(payload.roleScope) ? payload.roleScope.map((entry: unknown) => text(entry).toLowerCase()).filter(Boolean) : [],
      description: text(payload.description) || `Skill: ${name}`,
      inputsSchema: payload.inputs || payload.inputsSchema || [],
      stepsSchema: payload.steps || payload.stepsSchema || [],
      successCriteria: payload.successCriteria || [],
      isActive: payload.isActive !== false,
      version: Math.max(1, Math.floor(Number(payload.version || 1))),
      createdBy: actor.id,
      updatedBy: actor.id
    }
  });
};

export const updateScrolithaSkill = async (id: string, payload: Record<string, any>, actor: ScrolithaActor) => {
  const skillId = text(id);
  if (!skillId) throw new Error('Skill id is required.');

  const existing = await prisma.scrolithaSkill.findUnique({ where: { id: skillId } });
  if (!existing) throw new Error('Skill not found.');

  return prisma.scrolithaSkill.update({
    where: { id: skillId },
    data: {
      key: payload.key !== undefined ? text(payload.key).toLowerCase() || existing.key : existing.key,
      name: payload.name !== undefined ? text(payload.name) || existing.name : existing.name,
      roleScope: Array.isArray(payload.roleScope)
        ? payload.roleScope.map((entry: unknown) => text(entry).toLowerCase()).filter(Boolean)
        : existing.roleScope,
      description: payload.description !== undefined ? text(payload.description) || existing.description : existing.description,
      inputsSchema: payload.inputs !== undefined || payload.inputsSchema !== undefined ? payload.inputs || payload.inputsSchema || [] : existing.inputsSchema,
      stepsSchema: payload.steps !== undefined || payload.stepsSchema !== undefined ? payload.steps || payload.stepsSchema || [] : existing.stepsSchema,
      successCriteria: payload.successCriteria !== undefined ? payload.successCriteria || [] : existing.successCriteria,
      isActive: typeof payload.isActive === 'boolean' ? payload.isActive : existing.isActive,
      version: payload.bumpVersion === true ? existing.version + 1 : existing.version,
      updatedBy: actor.id
    }
  });
};

export const deleteScrolithaSkill = async (id: string) => {
  const skillId = text(id);
  if (!skillId) throw new Error('Skill id is required.');

  const existing = await prisma.scrolithaSkill.findUnique({ where: { id: skillId } });
  if (!existing) return null;
  await prisma.scrolithaSkill.delete({ where: { id: skillId } });
  return { id: skillId };
};

export const getScrolithaAuditForAdmin = async (query: { cursor?: unknown; limit?: unknown; actorId?: unknown; scope?: unknown }) => {
  return listScrolithaAuditLogs({
    cursor: text(query.cursor) || undefined,
    limit: Number(query.limit || 50),
    actorId: text(query.actorId) || undefined,
    scope: text(query.scope) || undefined
  });
};

export const getScrolithaAnalyticsForAdmin = async () => {
  const [
    actionPlans,
    feedbackAgg,
    convCount,
    auditCount,
    toolUsage
  ] = await Promise.all([
    prisma.scrolithaActionPlan.findMany({
      select: {
        id: true,
        actionKey: true,
        status: true,
        createdAt: true,
        executedAt: true
      }
    }),
    prisma.scrolithaFeedback.aggregate({
      _avg: { rating: true },
      _count: { _all: true }
    }),
    prisma.scrolithaConversation.count(),
    prisma.scrolithaAuditLog.count(),
    prisma.scrolithaActionPlan.groupBy({
      by: ['toolKey'],
      _count: { _all: true }
    })
  ]);

  const totalActions = actionPlans.length;
  const failedActions = actionPlans.filter((entry) => entry.status === 'failed').length;
  const completedActions = actionPlans.filter((entry) => entry.status === 'executed').length;

  const avgDurationSeconds = completedActions
    ? actionPlans
        .filter((entry) => entry.status === 'executed' && entry.executedAt)
        .reduce((acc, entry) => {
          const duration = (entry.executedAt!.getTime() - entry.createdAt.getTime()) / 1000;
          return acc + Math.max(0, duration);
        }, 0) / completedActions
    : 0;

  return {
    totals: {
      conversations: convCount,
      auditEvents: auditCount,
      actions: totalActions,
      completedActions,
      failedActions,
      failureRate: totalActions ? failedActions / totalActions : 0,
      avgDurationSeconds,
      avgRating: Number(feedbackAgg._avg.rating || 0),
      feedbackCount: feedbackAgg._count._all || 0,
      estimatedMinutesSaved: completedActions * 2
    },
    topTools: toolUsage
      .map((entry) => ({ toolKey: entry.toolKey, count: entry._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    taskBreakdown: actionPlans
      .reduce((acc: Record<string, number>, entry) => {
        acc[entry.actionKey] = (acc[entry.actionKey] || 0) + 1;
        return acc;
      }, {})
  };
};

export const getScrolithaToolRegistry = () => {
  return listScrolithaTools();
};
