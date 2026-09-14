import { Request, Response } from 'express';
import { resolveActorFromRequest } from '../services/scrolitha/scrolitha.audit';
import { sendScrolithaPublicError } from '../services/scrolitha/scrolitha.http';
import {
  getScrolithaCommunicationRecords,
  getScrolithaKnowledgeForActor,
  getScrolithaWidgetConfigPublic,
  scrolithaChat,
  scrolithaExecute,
  scrolithaFeedback,
  scrolithaHistory
} from '../services/scrolitha/scrolitha.orchestrator';
import { buildScrolithaWorkOsPlan } from '../services/phase2.service';
import {
  assertScrolithaAccess,
  isScrolithaUserFacingAccessAllowed
} from '../services/scrolitha/scrolitha.rollout';
import { analyzeMyProfile, applyApprovedProfileImprovements } from '../services/scrolitha/scrolitha.profileAdvisor';
import { getOpsMetricsSnapshot, recordRequestOutcome } from '../services/scrolitha/scrolitha.opsMetrics';
import { streamOrFallback } from '../services/scrolitha/scrolitha.streaming';
import { newIntelligenceRequestId } from '../services/scrolitha/scrolitha.observability';
import { assignPhase4Arm, getPhase4TaskCatalog, runPhase4Evaluation } from '../services/scrolitha/scrolitha.phase4';

const unauthorized = (res: Response) =>
  res.status(401).json({
    success: false,
    message: 'Unauthorized',
    error: 'Authentication required'
  });

export const scrolithaChatController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const actor = resolveActorFromRequest(req);
    const data = await scrolithaChat(
      {
        message: req.body?.message,
        context: req.body?.context,
        conversationId: req.body?.conversationId
      },
      actor,
      req.app
    );

    return res.json({
      success: true,
      data,
      message: 'Scrolitha response ready'
    });
  } catch (error: any) {
    return sendScrolithaPublicError(res, 'Scrolitha chat failed', error, {
      statusMode: 'chat',
      logLabel: 'chat error'
    });
  }
};

export const scrolithaStreamController = async (req: Request, res: Response) => {
  const started = Date.now();
  try {
    if (!req.user?.id) return unauthorized(res);
    const actor = resolveActorFromRequest(req);
    await assertScrolithaAccess(actor, 'Scrolitha streaming');
    const requestId = newIntelligenceRequestId([actor.id, String(req.body?.conversationId || ''), String(Date.now())]);
    res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders?.();
    const send = (event: any) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`); };
    const result = await streamOrFallback(
      { requestId, userPrompt: String(req.body?.message || '').slice(0, 4000), preferTokenStream: true },
      async (event) => send(event),
      async () => {
        const data = await scrolithaChat({ message: req.body?.message, context: req.body?.context, conversationId: req.body?.conversationId }, actor, req.app);
        return { text: String(data?.reply || ''), provider: String((data as any)?.responseMode || 'scrolitha') };
      }
    );
    recordRequestOutcome({ ok: true, latencyMs: Date.now() - started });
    send({ type: 'complete', requestId, conversationId: result.requestId, streamingMode: result.streamingMode });
    return undefined;
  } catch (error: any) {
    recordRequestOutcome({ ok: false, latencyMs: Date.now() - started });
    if (!res.headersSent) return sendScrolithaPublicError(res, 'Scrolitha stream failed', error, { statusMode: 'chat', logLabel: 'stream error' });
    if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type: 'error', error: String(error?.message || 'stream failed').slice(0, 240) })}\n\n`);
    return undefined;
  } finally {
    if (!res.writableEnded) res.end();
  }
};

export const scrolithaProfileAnalyzeController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const started = Date.now();
    const data = await analyzeMyProfile(resolveActorFromRequest(req));
    recordRequestOutcome({ ok: true, latencyMs: Date.now() - started });
    return res.json({ success: true, data, message: 'Profile analysis ready' });
  } catch (error: any) {
    recordRequestOutcome({ ok: false, latencyMs: 0 });
    return sendScrolithaPublicError(res, 'Profile analysis failed', error, { statusMode: 'chat', logLabel: 'profile analysis error' });
  }
};

export const scrolithaProfileApplyController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const data = await applyApprovedProfileImprovements(resolveActorFromRequest(req), { profileVersion: req.body?.profileVersion, changes: req.body?.changes });
    return res.json({ success: true, data, message: 'Approved profile improvements applied' });
  } catch (error: any) {
    return sendScrolithaPublicError(res, 'Profile improvements could not be applied', error, { statusMode: 'execute', logLabel: 'profile apply error' });
  }
};

export const scrolithaOpsMetricsController = async (req: Request, res: Response) => {
  if (!req.user?.id) return unauthorized(res);
  const actor = resolveActorFromRequest(req);
  if (!actor.isAdmin) return res.status(403).json({ success: false, message: 'Administrator access required' });
  return res.json({ success: true, data: getOpsMetricsSnapshot() });
};

export const scrolithaEvaluationController = async (req: Request, res: Response) => {
  if (!req.user?.id) return unauthorized(res);
  const actor = resolveActorFromRequest(req);
  if (!actor.isAdmin) return res.status(403).json({ success: false, message: 'Administrator access required' });
  const subjectId = String(req.query.subjectId || '').trim();
  const experiment = String(req.query.experiment || '').trim() || undefined;
  return res.json({
    success: true,
    data: {
      evaluation: runPhase4Evaluation({
        model: String(req.query.model || '').trim() || undefined,
        forceRefresh: String(req.query.refresh || '').toLowerCase() === 'true'
      }),
      taskCatalog: getPhase4TaskCatalog(),
      assignment: subjectId ? assignPhase4Arm(subjectId, experiment) : null
    }
  });
};

export const scrolithaExecuteController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const actor = resolveActorFromRequest(req);
    const data = await scrolithaExecute(
      {
        actionId: req.body?.actionId,
        confirmed: req.body?.confirmed,
        params: req.body?.params,
        confirmationToken: req.body?.confirmationToken
      },
      actor,
      req.app
    );

    return res.json({
      success: true,
      data,
      message: data?.success ? 'Action executed' : 'Action pending confirmation'
    });
  } catch (error: any) {
    return sendScrolithaPublicError(res, 'Scrolitha execution failed', error, {
      statusMode: 'execute',
      logLabel: 'execute error'
    });
  }
};

export const scrolithaHistoryController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const actor = resolveActorFromRequest(req);
    const data = await scrolithaHistory(actor, req.query.limit);
    return res.json({ success: true, data, message: 'Scrolitha history loaded' });
  } catch (error: any) {
    return sendScrolithaPublicError(res, 'Failed to load Scrolitha history', error, {
      logLabel: 'history error'
    });
  }
};

export const scrolithaRecordsController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const actor = resolveActorFromRequest(req);
    const data = await getScrolithaCommunicationRecords(actor, {
      limit: req.query.limit,
      conversationId: req.query.conversationId
    });
    return res.json({ success: true, data, message: 'Scrolitha communication records loaded' });
  } catch (error: any) {
    return sendScrolithaPublicError(res, 'Failed to load Scrolitha communication records', error, {
      logLabel: 'records error'
    });
  }
};

export const scrolithaKnowledgeController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const actor = resolveActorFromRequest(req);
    const data = await getScrolithaKnowledgeForActor(actor, {
      message: req.query.message
    });
    return res.json({ success: true, data, message: 'Scrolitha knowledge context loaded' });
  } catch (error: any) {
    return sendScrolithaPublicError(res, 'Failed to load Scrolitha knowledge context', error, {
      logLabel: 'knowledge error'
    });
  }
};

export const scrolithaFeedbackController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const actor = resolveActorFromRequest(req);
    const data = await scrolithaFeedback(
      {
        conversationId: req.body?.conversationId,
        rating: req.body?.rating,
        note: req.body?.note
      },
      actor
    );

    return res.json({ success: true, data, message: 'Scrolitha feedback recorded' });
  } catch (error: any) {
    return sendScrolithaPublicError(res, 'Failed to save feedback', error, {
      statusMode: 'feedback',
      logLabel: 'feedback error'
    });
  }
};

export const scrolithaWidgetConfigController = async (req: Request, res: Response) => {
  try {
    const actor = req.user?.id ? resolveActorFromRequest(req) : null;
    const data = await getScrolithaWidgetConfigPublic();
    const allowed = await isScrolithaUserFacingAccessAllowed(actor);
    const payload = {
      ...data,
      enabled: allowed ? data.enabled !== false : false,
      access: {
        allowed,
        mode: allowed ? 'internal_or_public' : 'denied'
      }
    };
    return res.json({ success: true, data: payload, message: 'Scrolitha widget config loaded' });
  } catch (error: any) {
    return sendScrolithaPublicError(res, 'Failed to load Scrolitha widget config', error, {
      logLabel: 'widget config error',
      recordFailure: false
    });
  }
};

export const scrolithaWorkOsPlanController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const actor = resolveActorFromRequest(req);
    await assertScrolithaAccess(actor, 'Scrolitha Work OS');
    const data = await buildScrolithaWorkOsPlan(
      { id: req.user.id, role: req.user.role },
      {
        goal: req.body?.goal,
        context: req.body?.context,
        roomId: req.body?.roomId
      }
    );
    return res.json({ success: true, data, message: 'Scrolitha Work OS plan ready' });
  } catch (error: any) {
    return sendScrolithaPublicError(res, 'Scrolitha Work OS plan failed', error, {
      statusMode: 'workos',
      logLabel: 'work os plan error'
    });
  }
};

/**
 * Phase 20.7.8 — Public official Scrolitha profile / accuracy manifest (auth optional).
 * No secrets, raw flag names, or provider credentials.
 */
export const scrolithaPublicProfileController = async (req: Request, res: Response) => {
  try {
    const { buildScrolithaPublicProfile } = await import('../services/scrolitha/scrolitha.publicProfile');
    const actor = req.user?.id ? resolveActorFromRequest(req) : null;
    const data = await buildScrolithaPublicProfile(actor);
    return res.json({ success: true, data });
  } catch (error: any) {
    return sendScrolithaPublicError(res, 'Failed to load Scrolitha public profile', error, {
      logLabel: 'public profile error'
    });
  }
};

export const scrolithaPublicInfoController = scrolithaPublicProfileController;

export const scrolithaMessageSecurityController = async (_req: Request, res: Response) => {
  try {
    const { getScrolithaMessageSecurityStatus } = await import('../services/scrolitha/scrolitha.publicProfile');
    return res.json({ success: true, data: getScrolithaMessageSecurityStatus() });
  } catch (error: any) {
    return sendScrolithaPublicError(res, 'Failed to load Scrolitha security status', error, {
      logLabel: 'security status error'
    });
  }
};

export const scrolithaPlatformIdentityController = async (req: Request, res: Response) => {
  try {
    const { ensureScrolithaPlatformUser } = await import('../services/scrolitha/scrolitha.platformIdentity');
    const { resolveContextualFeatureFlags } = await import('../services/scrolitha/scrolitha.contextualPost');
    const { buildScrolithaPublicProfile } = await import('../services/scrolitha/scrolitha.publicProfile');
    const identity = await ensureScrolithaPlatformUser();
    const actor = req.user?.id ? resolveActorFromRequest(req) : null;
    const flags = await resolveContextualFeatureFlags(actor);
    const publicProfile = await buildScrolithaPublicProfile(actor);
    return res.json({
      success: true,
      data: {
        ...identity,
        officialProfile: publicProfile,
        capabilities: publicProfile.capabilities.map((c) => c.id),
        capabilityDetails: publicProfile.capabilities,
        limitations: publicProfile.limitations,
        featureFlags: {
          enabled: flags.enabled,
          proactiveSuggestions: flags.proactiveSuggestions
        }
      },
      message: 'Scrolitha platform identity loaded'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load Scrolitha identity',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const scrolithaContextualAskController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const postId = String(req.body?.postId || '').trim();
    const question = String(req.body?.question || '').trim();
    const parentCommentId = req.body?.commentId ? String(req.body.commentId).trim() : null;
    if (!postId || !question) {
      return res.status(400).json({ success: false, message: 'postId and question are required' });
    }
    if (question.length > 4000) {
      return res.status(400).json({ success: false, message: 'Question is too long' });
    }

    const { ensureScrolithaPlatformUser } = await import('../services/scrolitha/scrolitha.platformIdentity');
    const {
      processContextualPostRequest,
      resolveContextualFeatureFlags,
      sanitizeContextualQuestion
    } = await import('../services/scrolitha/scrolitha.contextualPost');
    const { canUserViewPostForNotification } = await import('../services/engagementNotifications.service');
    const actor = resolveActorFromRequest(req);
    const flags = await resolveContextualFeatureFlags(actor);
    if (!flags.enabled) {
      return res.status(403).json({ success: false, message: 'Scrolitha contextual post intelligence is disabled' });
    }

    const platform = await ensureScrolithaPlatformUser();
    const prisma = (await import('../utils/prismaClient')).default;
    const post = await prisma.communityPost.findUnique({
      where: { id: postId },
      select: { id: true, status: true, authorId: true, visibility: true, mentions: true }
    });
    if (!post || post.status === 'deleted' || post.status === 'draft') {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const canView = await canUserViewPostForNotification(
      {
        authorId: post.authorId,
        visibility: post.visibility,
        mentions: post.mentions
      },
      req.user.id
    );
    if (!canView) {
      return res.status(403).json({ success: false, message: 'You cannot access this post' });
    }

    if (parentCommentId) {
      const parent = await prisma.communityPostComment.findUnique({
        where: { id: parentCommentId },
        select: { id: true, postId: true, status: true }
      });
      if (!parent || parent.postId !== postId || parent.status === 'deleted') {
        return res.status(400).json({ success: false, message: 'Invalid parent comment' });
      }
    }

    const safeQuestion = sanitizeContextualQuestion(question, flags.maxQuestionChars);
    const content = /@scrolitha\b/i.test(safeQuestion) ? safeQuestion : `@Scrolitha ${safeQuestion}`;
    const comment = await prisma.communityPostComment.create({
      data: {
        postId,
        authorId: req.user.id,
        parentId: parentCommentId || null,
        content,
        attachments: []
      },
      include: {
        author: { select: { id: true, name: true, avatar: true, username: true, isVerified: true } }
      }
    });

    const io = (req.app as any)?.get?.('io') || null;
    const commentPayload = {
      id: comment.id,
      postId: comment.postId,
      parentId: comment.parentId,
      userId: comment.authorId,
      userName: comment.author?.name || 'Anonymous',
      userUsername: comment.author?.username || null,
      userAvatar: comment.author?.avatar || null,
      content: comment.content,
      attachmentFileIds: [],
      attachments: [],
      status: comment.status,
      deletedAt: null,
      likesCount: 0,
      likedByMe: false,
      canEdit: true,
      canDelete: true,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      scrolithaPending: true
    };
    try {
      io?.emit?.('community:post_comment_created', { comment: commentPayload, postId });
    } catch {
      // ignore
    }

    // Respond immediately; AI processes asynchronously (never blocks the user comment path).
    setImmediate(() => {
      void processContextualPostRequest({
        postId,
        commentId: comment.id,
        invokingUserId: req.user!.id,
        question: content,
        parentId: parentCommentId,
        source: 'post_card',
        io
      });
    });

    return res.json({
      success: true,
      data: {
        commentId: comment.id,
        comment: commentPayload,
        postId,
        status: 'reviewing',
        message: 'Scrolitha is reviewing this post…',
        platformUserId: platform.id
      },
      message: 'Scrolitha request accepted'
    });
  } catch (error: any) {
    console.error('[scrolitha] contextual ask error', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to start Scrolitha request',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const scrolithaContextualStatusController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const postId = String(req.query?.postId || req.params?.postId || '').trim();
    const commentId = String(req.query?.commentId || req.params?.commentId || '').trim();
    if (!postId || !commentId) {
      return res.status(400).json({ success: false, message: 'postId and commentId are required' });
    }
    const { getContextualRequestStatus } = await import('../services/scrolitha/scrolitha.contextualPost');
    const data = await getContextualRequestStatus({
      postId,
      commentId,
      invokingUserId: req.user.id
    });
    return res.json({ success: true, data, message: 'Scrolitha request status' });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load Scrolitha status',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const scrolithaContextualRetryController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const postId = String(req.body?.postId || '').trim();
    const commentId = String(req.body?.commentId || '').trim();
    if (!postId || !commentId) {
      return res.status(400).json({ success: false, message: 'postId and commentId are required' });
    }

    const prisma = (await import('../utils/prismaClient')).default;
    const comment = await prisma.communityPostComment.findUnique({
      where: { id: commentId },
      select: { id: true, postId: true, authorId: true, content: true, parentId: true, status: true }
    });
    if (!comment || comment.postId !== postId || comment.status === 'deleted') {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }
    if (comment.authorId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only the original commenter can retry Scrolitha' });
    }

    const {
      processContextualPostRequest,
      getContextualRequestStatus
    } = await import('../services/scrolitha/scrolitha.contextualPost');
    const { scrolithaCache } = await import('../services/scrolitha/scrolitha.cache');
    const { createHash } = await import('crypto');
    const stableKey = createHash('sha256')
      .update([postId, commentId, req.user.id, 'mention'].join('|'))
      .digest('hex')
      .slice(0, 32);
    // Clear failed state so retry can reclaim; completed replies still de-dupe via DB.
    scrolithaCache.delete(`scrolitha:ctx:req:${stableKey}`);

    const prior = await getContextualRequestStatus({
      postId,
      commentId,
      invokingUserId: req.user.id
    });
    if (prior.status === 'completed' && prior.responseCommentId) {
      return res.json({
        success: true,
        data: {
          postId,
          commentId,
          status: 'completed',
          responseCommentId: prior.responseCommentId
        },
        message: 'Scrolitha already replied'
      });
    }

    const io = (req.app as any)?.get?.('io') || null;
    setImmediate(() => {
      void processContextualPostRequest({
        postId,
        commentId,
        invokingUserId: req.user!.id,
        question: comment.content,
        parentId: comment.parentId,
        source: 'retry',
        io
      });
    });

    return res.json({
      success: true,
      data: { postId, commentId, status: 'reviewing', requestId: stableKey },
      message: 'Scrolitha retry accepted'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retry Scrolitha request',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const scrolithaSkillsListController = async (_req: Request, res: Response) => {
  try {
    const { listSkills } = await import('../services/scrolitha/scrolitha.skills');
    const skills = listSkills().map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      intents: s.intents,
      priority: s.priority
    }));
    return res.json({ success: true, data: { skills }, message: 'Scrolitha skills registry' });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to list skills',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const scrolithaNetworkStatusController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const { enterpriseCache } = await import('../services/scrolitha/scrolitha.enterpriseCache');
    const { getAnalyticsSnapshot } = await import('../services/scrolitha/scrolitha.analytics');
    const { getSessionStoreInfo } = await import('../services/scrolitha/scrolitha.sessionMemory');
    const { getSessionStoreStatus } = await import('../services/scrolitha/scrolitha.sessionStore');
    const { listSkills } = await import('../services/scrolitha/scrolitha.skills');
    const { getSearchProviderStatus } = await import('../services/scrolitha/scrolitha.searchProvider');
    const { getStreamProviderStatus } = await import('../services/scrolitha/scrolitha.streaming');
    const { getProviderHealth } = await import('../services/scrolitha/scrolitha.providerOrchestration');
    const health = await getProviderHealth('user');
    return res.json({
      success: true,
      data: {
        skillsRegistered: listSkills().length,
        sessionStore: { ...getSessionStoreInfo(), ...getSessionStoreStatus() },
        cache: enterpriseCache.stats(),
        search: getSearchProviderStatus(),
        streaming: getStreamProviderStatus(),
        providers: health,
        analytics: getAnalyticsSnapshot(),
        resilience: {
          note: 'In-process rate limits and caches are per instance by default; durable comment de-dupe is DB-backed. Distributed adapters are pluggable via config.',
          recommendedScaleTests: [
            '100 concurrent users',
            '1000 concurrent users',
            'reconnect storms',
            'provider failures',
            'rapid conversation switching',
            'multi-tab duplicate requests'
          ]
        }
      },
      message: 'Scrolitha intelligence network status'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load network status',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const scrolithaDiagnosticsController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const role = String(req.user.role || '').toLowerCase();
    if (!role.includes('admin') && !role.includes('moderator')) {
      return res.status(403).json({ success: false, message: 'Admin or moderator role required' });
    }
    const { assertCapabilityEnabled } = await import('../services/scrolitha/scrolitha.rollout');
    await assertCapabilityEnabled('diagnostics', 'Diagnostics', resolveActorFromRequest(req));
    const { getEnterpriseDiagnostics } = await import('../services/scrolitha/scrolitha.diagnostics');
    const data = await getEnterpriseDiagnostics(
      role.includes('admin') ? 'admin' : 'user'
    );
    return res.json({ success: true, data, message: 'Scrolitha enterprise diagnostics' });
  } catch (error: any) {
    const status = Number(error?.statusCode) || 500;
    return sendScrolithaPublicError(res, 'Failed to load diagnostics', error, {
      status,
      logLabel: 'diagnostics error'
    });
  }
};

export const scrolithaHealthController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const role = String(req.user.role || '').toLowerCase();
    if (!role.includes('admin') && !role.includes('moderator')) {
      return res.status(403).json({ success: false, message: 'Admin or moderator role required' });
    }
    const { getScrolithaHealthModel, FAILURE_MODE_MATRIX } = await import(
      '../services/scrolitha/scrolitha.health'
    );
    const health = await getScrolithaHealthModel();
    return res.json({
      success: true,
      data: {
        health,
        failureModes: FAILURE_MODE_MATRIX
      },
      message: 'Scrolitha operational health'
    });
  } catch (error: any) {
    return sendScrolithaPublicError(res, 'Failed to load health', error, {
      logLabel: 'health error'
    });
  }
};

export const scrolithaRolloutController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const role = String(req.user.role || '').toLowerCase();
    if (!role.includes('admin') && !role.includes('moderator')) {
      return res.status(403).json({ success: false, message: 'Admin or moderator role required' });
    }
    const { getRolloutSummary } = await import('../services/scrolitha/scrolitha.rollout');
    const data = await getRolloutSummary();
    return res.json({ success: true, data, message: 'Scrolitha rollout configuration' });
  } catch (error: any) {
    return sendScrolithaPublicError(res, 'Failed to load rollout', error, {
      logLabel: 'rollout error'
    });
  }
};

export const scrolithaAnalyticsController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const role = String(req.user.role || '').toLowerCase();
    if (!role.includes('admin') && !role.includes('moderator')) {
      return res.status(403).json({ success: false, message: 'Admin or moderator role required' });
    }
    const { getAnalyticsSnapshot } = await import('../services/scrolitha/scrolitha.analytics');
    const { enterpriseCache } = await import('../services/scrolitha/scrolitha.enterpriseCache');
    const { getOpsMetricsSnapshot } = await import('../services/scrolitha/scrolitha.opsMetrics');
    return res.json({
      success: true,
      data: {
        analytics: getAnalyticsSnapshot(),
        opsMetrics: getOpsMetricsSnapshot(),
        cache: enterpriseCache.stats()
      },
      message: 'Scrolitha analytics snapshot'
    });
  } catch (error: any) {
    return sendScrolithaPublicError(res, 'Failed to load analytics', error, {
      logLabel: 'analytics error'
    });
  }
};

export const scrolithaOsBootstrapController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const { assertCapabilityEnabled } = await import('../services/scrolitha/scrolitha.rollout');
    await assertCapabilityEnabled('osSurface', 'Scrolitha OS surface', resolveActorFromRequest(req));
    const { bootstrapIntelligenceOs } = await import('../services/scrolitha/scrolitha.os');
    const { recordOsBootstrap, recordProactiveShown, recordRecommendationServed } = await import(
      '../services/scrolitha/scrolitha.opsMetrics'
    );
    recordOsBootstrap();
    const data = await bootstrapIntelligenceOs({
      userId: req.user.id,
      page: req.body?.page || {
        route: req.body?.route,
        surface: req.body?.surface,
        entityType: req.body?.entityType,
        entityId: req.body?.entityId,
        postId: req.body?.postId,
        title: req.body?.title,
        module: req.body?.module,
        selectedText: req.body?.selectedText
      },
      sessionId: req.body?.sessionId || req.headers['x-scrolitha-session'] || undefined,
      role: req.user.role,
      viewport: req.body?.viewport,
      activity: req.body?.activity,
      questionHint: req.body?.questionHint
    });
    // Rollout: strip proactive/cards/recs if independently disabled
    const { isCapabilityEnabled } = await import('../services/scrolitha/scrolitha.rollout');
    if (!(await isCapabilityEnabled('proactiveSuggestions', resolveActorFromRequest(req)))) {
      data.proactiveSuggestions = [];
    } else {
      recordProactiveShown(data.proactiveSuggestions?.length || 0);
    }
    if (!(await isCapabilityEnabled('actionCards', resolveActorFromRequest(req)))) {
      data.actionCards = [];
    }
    if (!(await isCapabilityEnabled('recommendationEngine', resolveActorFromRequest(req)))) {
      data.recommendations = [];
    } else {
      recordRecommendationServed(data.recommendations?.length || 0);
    }
    return res.json({ success: true, data, message: 'Scrolitha OS ready' });
  } catch (error: any) {
    const msg = String(error?.message || 'OS bootstrap failed');
    const status = Number(error?.statusCode) || (/required|cancelled|disabled/i.test(msg) ? 403 : 500);
    if (status >= 500) console.error('[scrolitha] os bootstrap error', error);
    return res.status(status).json({ success: false, message: 'Scrolitha OS bootstrap failed', error: msg });
  }
};

export const scrolithaOsAskController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const { assertCapabilityEnabled, isCapabilityEnabled } = await import('../services/scrolitha/scrolitha.rollout');
    await assertCapabilityEnabled('osSurface', 'Scrolitha OS surface', resolveActorFromRequest(req));
    const { recordOsAsk, recordActionCardUse, recordRequestOutcome } = await import(
      '../services/scrolitha/scrolitha.opsMetrics'
    );
    recordOsAsk();
    const started = Date.now();
    const { runOsAsk } = await import('../services/scrolitha/scrolitha.os');
    let actionCardId = req.body?.actionCardId || req.body?.cardId;
    if (actionCardId && !(await isCapabilityEnabled('actionCards', resolveActorFromRequest(req)))) {
      actionCardId = undefined;
    } else if (actionCardId) {
      recordActionCardUse();
    }
    const data = await runOsAsk({
      userId: req.user.id,
      question: String(req.body?.question || req.body?.message || ''),
      page: req.body?.page || {
        route: req.body?.route,
        surface: req.body?.surface,
        entityType: req.body?.entityType,
        entityId: req.body?.entityId,
        postId: req.body?.postId,
        title: req.body?.title,
        module: req.body?.module,
        selectedText: req.body?.selectedText
      },
      sessionId: req.body?.sessionId || req.headers['x-scrolitha-session'] || undefined,
      role: req.user.role,
      viewport: req.body?.viewport,
      activity: req.body?.activity,
      actionCardId,
      includeModeration: Boolean(req.body?.includeModeration),
      requestId: req.body?.requestId
    });
    if (!(await isCapabilityEnabled('recommendationEngine', resolveActorFromRequest(req)))) {
      data.recommendations = [];
    }
    if (!(await isCapabilityEnabled('actionCards', resolveActorFromRequest(req)))) {
      data.actionCards = [];
    }
    recordRequestOutcome({
      ok: true,
      latencyMs: Date.now() - started,
      cacheHit: Boolean(data?.diagnostics?.cacheHit)
    });
    return res.json({ success: true, data, message: 'Scrolitha OS response ready' });
  } catch (error: any) {
    const msg = String(error?.message || 'OS ask failed');
    const status = Number(error?.statusCode) || (/required|cancelled|disabled/i.test(msg) ? 403 : 500);
    try {
      const { recordRequestOutcome } = await import('../services/scrolitha/scrolitha.opsMetrics');
      recordRequestOutcome({
        ok: false,
        cancelled: /cancel/i.test(msg),
        timedOut: /timeout/i.test(msg)
      });
    } catch {
      // ignore
    }
    if (status >= 500) console.error('[scrolitha] os ask error', error);
    return res.status(status).json({ success: false, message: 'Scrolitha OS ask failed', error: msg });
  }
};

export const scrolithaOsCancelController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const requestId = String(req.body?.requestId || '').trim();
    if (!requestId) {
      return res.status(400).json({ success: false, message: 'requestId is required' });
    }
    const { cancelOsRequest } = await import('../services/scrolitha/scrolitha.os');
    const ok = cancelOsRequest(requestId);
    return res.json({ success: true, data: { cancelled: ok, requestId }, message: ok ? 'Cancelled' : 'Request not found' });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Cancel failed',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const scrolithaDeepSearchController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const { assertCapabilityEnabled } = await import('../services/scrolitha/scrolitha.rollout');
    await assertCapabilityEnabled('deepSearch', 'Deep search', resolveActorFromRequest(req));
    const query = String(req.body?.query || req.query?.q || '').trim();
    if (!query) {
      return res.status(400).json({ success: false, message: 'query is required' });
    }
    const { platformSearch } = await import('../services/scrolitha/scrolitha.searchProvider');
    const { recordSearchRequest } = await import('../services/scrolitha/scrolitha.opsMetrics');
    recordSearchRequest();
    const data = await platformSearch({
      query,
      viewerUserId: req.user.id,
      limit: Number(req.body?.limit || req.query?.limit || 10),
      intent: req.body?.intent,
      mode: req.body?.mode
    });
    return res.json({ success: true, data, message: 'Deep search results' });
  } catch (error: any) {
    const status = Number(error?.statusCode) || 500;
    return res.status(status).json({
      success: false,
      message: 'Deep search failed',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const scrolithaIntelligenceAskController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const { assertCapabilityEnabled } = await import('../services/scrolitha/scrolitha.rollout');
    await assertCapabilityEnabled('intelligenceAsk', 'Scrolitha intelligence', resolveActorFromRequest(req));
    const question = String(req.body?.question || req.body?.message || '').trim();
    if (!question) {
      return res.status(400).json({ success: false, message: 'question is required' });
    }
    const { runIntelligenceAsk } = await import('../services/scrolitha/scrolitha.intelligence');
    const data = await runIntelligenceAsk({
      userId: req.user.id,
      question,
      surface: req.body?.surface,
      entityType: req.body?.entityType,
      entityId: req.body?.entityId,
      postId: req.body?.postId,
      sessionId: req.body?.sessionId || req.headers['x-scrolitha-session'] || undefined,
      role: req.user.role,
      includeModeration: Boolean(req.body?.includeModeration)
    });
    return res.json({ success: true, data, message: 'Scrolitha intelligence response ready' });
  } catch (error: any) {
    const msg = String(error?.message || 'Intelligence request failed');
    const status =
      /required|disabled|too long/i.test(msg) ? 400 : /unauthorized|forbidden|access/i.test(msg) ? 403 : 500;
    if (status >= 500) console.error('[scrolitha] intelligence ask error', error);
    return res.status(status).json({ success: false, message: 'Scrolitha intelligence failed', error: msg });
  }
};

export const scrolithaIntelligenceSessionController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const sessionKey = String(req.query?.sessionKey || req.body?.sessionKey || '').trim();
    if (!sessionKey) {
      return res.status(400).json({ success: false, message: 'sessionKey is required' });
    }
    const { getIntelligenceSession } = await import('../services/scrolitha/scrolitha.intelligence');
    const data = getIntelligenceSession({ userId: req.user.id, sessionKey });
    if (!data) {
      return res.status(404).json({ success: false, message: 'Session not found or expired' });
    }
    return res.json({ success: true, data, message: 'Session memory status' });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load session',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const scrolithaIntelligenceDismissController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const sessionKey = String(req.body?.sessionKey || '').trim();
    const suggestionKey = String(req.body?.suggestionKey || req.body?.key || '').trim();
    if (!sessionKey || !suggestionKey) {
      return res.status(400).json({ success: false, message: 'sessionKey and suggestionKey are required' });
    }
    const { dismissIntelligenceSuggestion } = await import('../services/scrolitha/scrolitha.intelligence');
    const bag = dismissIntelligenceSuggestion({
      userId: req.user.id,
      sessionKey,
      suggestionKey
    });
    return res.json({
      success: true,
      data: {
        sessionKey: bag.sessionKey,
        dismissedSuggestionKeys: bag.dismissedSuggestionKeys
      },
      message: 'Suggestion dismissed for this session'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to dismiss suggestion',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const scrolithaModerationAssistController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const { assertCapabilityEnabled } = await import('../services/scrolitha/scrolitha.rollout');
    await assertCapabilityEnabled('moderationAssist', 'Moderation assist', resolveActorFromRequest(req));
    // Soft permission: prefer moderators/admins but allow community owners via role string checks.
    const role = String(req.user.role || '').toLowerCase();
    const isStaff = role.includes('admin') || role.includes('moderator') || role.includes('staff');
    if (!isStaff && !req.body?.allowMemberPreview) {
      // Members can still request assist on content they can view — labeled as non-authoritative.
    }

    const postId = String(req.body?.postId || '').trim();
    const commentId = String(req.body?.commentId || '').trim();
    const prisma = (await import('../utils/prismaClient')).default;
    const { canUserViewPostForNotification } = await import('../services/engagementNotifications.service');
    const { analyzeModerationAssist } = await import('../services/scrolitha/scrolitha.moderationAssist');

    let postContent = String(req.body?.postContent || '');
    let commentContent = String(req.body?.commentContent || '');
    let communityRules: string | null = null;
    const threadSnippets: string[] = Array.isArray(req.body?.threadSnippets)
      ? req.body.threadSnippets.map(String)
      : [];

    if (postId) {
      const post = await prisma.communityPost.findUnique({
        where: { id: postId },
        select: {
          id: true,
          content: true,
          status: true,
          authorId: true,
          visibility: true,
          mentions: true,
          club: { select: { description: true, name: true } }
        }
      });
      if (!post || post.status === 'deleted') {
        return res.status(404).json({ success: false, message: 'Post not found' });
      }
      const canView = await canUserViewPostForNotification(
        { authorId: post.authorId, visibility: post.visibility, mentions: post.mentions },
        req.user.id
      );
      if (!canView) {
        return res.status(403).json({ success: false, message: 'You cannot access this post' });
      }
      postContent = post.content || postContent;
      communityRules = post.club?.description || null;
      if (!threadSnippets.length) {
        const comments = await prisma.communityPostComment.findMany({
          where: { postId, status: 'active' },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { content: true }
        });
        threadSnippets.push(...comments.map((c) => c.content));
      }
    }

    if (commentId && !commentContent) {
      const comment = await prisma.communityPostComment.findUnique({
        where: { id: commentId },
        select: { content: true, status: true, postId: true }
      });
      if (comment && comment.status !== 'deleted') {
        commentContent = comment.content;
      }
    }

    const data = analyzeModerationAssist({
      postContent,
      commentContent,
      threadSnippets,
      communityRules
    });

    return res.json({
      success: true,
      data: {
        ...data,
        authoritative: isStaff,
        note: isStaff
          ? 'Moderator assist for human decision support only.'
          : 'Non-staff preview: suggestions are informational and not enforcement actions.'
      },
      message: 'Moderation assist ready'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Moderation assist failed',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const scrolithaContextualSuggestionsController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const postId = String(req.query?.postId || req.body?.postId || '').trim();
    if (!postId) {
      return res.status(400).json({ success: false, message: 'postId is required' });
    }
    const {
      buildProactiveSuggestions,
      resolveContextualFeatureFlags
    } = await import('../services/scrolitha/scrolitha.contextualPost');
    const { canUserViewPostForNotification } = await import('../services/engagementNotifications.service');
    const actor = resolveActorFromRequest(req);
    const flags = await resolveContextualFeatureFlags(actor);
    if (!flags.enabled || !flags.proactiveSuggestions) {
      return res.json({ success: true, data: { suggestions: [] }, message: 'Suggestions disabled' });
    }
    const prisma = (await import('../utils/prismaClient')).default;
    const post = await prisma.communityPost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        content: true,
        status: true,
        authorId: true,
        visibility: true,
        mentions: true
      }
    });
    if (!post || post.status === 'deleted') {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
    const canView = await canUserViewPostForNotification(
      { authorId: post.authorId, visibility: post.visibility, mentions: post.mentions },
      req.user.id
    );
    if (!canView) {
      return res.status(403).json({ success: false, message: 'You cannot access this post' });
    }
    const suggestions = buildProactiveSuggestions({ postContent: String(post.content || '') });
    return res.json({ success: true, data: { suggestions }, message: 'Scrolitha suggestions ready' });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load suggestions',
      error: String(error?.message || 'Unknown error')
    });
  }
};

/** Phase 7.7 — user privacy / personalization controls */
export const scrolithaPrivacyGetController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const { getUserPrivacyControls } = await import('../services/scrolitha/scrolitha.privacyControls');
    const data = await getUserPrivacyControls(req.user.id);
    return res.json({ success: true, data, message: 'Scrolitha privacy controls' });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load privacy controls',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const scrolithaPrivacyUpdateController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const { updateUserPrivacyControls } = await import('../services/scrolitha/scrolitha.privacyControls');
    const data = await updateUserPrivacyControls(req.user.id, req.body || {});
    return res.json({ success: true, data, message: 'Privacy controls updated' });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: 'Failed to update privacy controls',
      error: String(error?.message || 'Unknown error')
    });
  }
};

/** Phase 7.7 — layered memory summary (safe; no raw private content dumps) */
export const scrolithaMemorySummaryController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const { assertCapabilityEnabled } = await import('../services/scrolitha/scrolitha.rollout');
    await assertCapabilityEnabled('persistentMemory', 'Persistent memory', resolveActorFromRequest(req));
    const sessionKey = String(req.query?.sessionKey || req.body?.sessionKey || '').trim() || null;
    const { getLayeredMemorySnapshot } = await import('../services/scrolitha/scrolitha.memoryLayers');
    const snap = await getLayeredMemorySnapshot({ userId: req.user.id, sessionKey });
    // Return layer counts + prompt-safe summary only (not full conversation bodies)
    return res.json({
      success: true,
      data: {
        generatedAt: snap.generatedAt,
        privacy: snap.privacy,
        retention: snap.retention,
        layerCounts: Object.fromEntries(
          Object.entries(snap.layers).map(([k, v]) => [k, (v as any[]).length])
        ),
        promptSafeSummary: snap.promptSafeSummary,
        layers: {
          userPreference: snap.layers.userPreference,
          professionalProfile: snap.layers.professionalProfile,
          conversation: snap.layers.conversation.map((e) => ({
            key: e.key,
            value: e.value,
            expiresAt: e.expiresAt
          })),
          project: snap.layers.project,
          community: snap.layers.community,
          organization: snap.layers.organization,
          relationship: snap.layers.relationship,
          session: snap.layers.session.map((e) => ({
            key: e.key,
            value: e.value.slice(0, 200),
            expiresAt: e.expiresAt
          }))
        }
      },
      message: 'Memory summary'
    });
  } catch (error: any) {
    const status = Number(error?.statusCode) || 500;
    return res.status(status).json({
      success: false,
      message: 'Failed to load memory summary',
      error: String(error?.message || 'Unknown error')
    });
  }
};

export const scrolithaMemoryClearController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const layer = String(req.body?.layer || 'all').trim() as any;
    const { clearMemoryLayer } = await import('../services/scrolitha/scrolitha.memoryLayers');
    const data = await clearMemoryLayer(req.user.id, layer || 'all');
    return res.json({ success: true, data, message: 'Memory cleared' });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to clear memory',
      error: String(error?.message || 'Unknown error')
    });
  }
};

/** Phase 7.7 — learning loop signal */
export const scrolithaLearningSignalController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const { assertCapabilityEnabled } = await import('../services/scrolitha/scrolitha.rollout');
    await assertCapabilityEnabled('learningLoop', 'Learning loop', resolveActorFromRequest(req));
    const type = String(req.body?.type || req.body?.signal || '').trim();
    if (!type) {
      return res.status(400).json({ success: false, message: 'type is required' });
    }
    const { recordLearningSignal } = await import('../services/scrolitha/scrolitha.learningLoop');
    const result = await recordLearningSignal({
      userId: req.user.id,
      signal: {
        type: type as any,
        category: req.body?.category,
        key: req.body?.key,
        scoreDelta: req.body?.scoreDelta,
        surface: req.body?.surface
      }
    });
    return res.json({ success: true, data: result, message: result.ok ? 'Signal recorded' : 'Signal not recorded' });
  } catch (error: any) {
    const status = Number(error?.statusCode) || 500;
    return res.status(status).json({
      success: false,
      message: 'Failed to record learning signal',
      error: String(error?.message || 'Unknown error')
    });
  }
};

/** Phase 7.7 — trust verification helper */
export const scrolithaTrustAssessController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const { assertCapabilityEnabled } = await import('../services/scrolitha/scrolitha.rollout');
    await assertCapabilityEnabled('trustVerification', 'Trust verification', resolveActorFromRequest(req));
    const claim = String(req.body?.claim || req.body?.question || '').trim();
    const evidence = Array.isArray(req.body?.evidence) ? req.body.evidence : [];
    const { assessTrust, buildVerificationPackage } = await import('../services/scrolitha/scrolitha.trust');
    const assessment = assessTrust({
      claim,
      evidence: evidence.length
        ? evidence
        : claim
          ? [{ label: 'User-provided claim only', supports: 'context', authority: 0.2 }]
          : [],
      freshnessIso: req.body?.freshnessIso || null,
      priorConfidence: req.body?.priorConfidence
    });
    return res.json({
      success: true,
      data: buildVerificationPackage(assessment),
      message: 'Trust assessment ready'
    });
  } catch (error: any) {
    const status = Number(error?.statusCode) || 500;
    return res.status(status).json({
      success: false,
      message: 'Trust assessment failed',
      error: String(error?.message || 'Unknown error')
    });
  }
};

/** Phase 7.7 — admin learning aggregates (no private content) */
export const scrolithaLearningSnapshotController = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return unauthorized(res);
    const role = String(req.user.role || '').toLowerCase();
    if (!role.includes('admin') && !role.includes('moderator')) {
      return res.status(403).json({ success: false, message: 'Admin or moderator role required' });
    }
    const { getLearningLoopSnapshot } = await import('../services/scrolitha/scrolitha.learningLoop');
    return res.json({
      success: true,
      data: getLearningLoopSnapshot({ admin: true }),
      message: 'Learning loop aggregates'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load learning snapshot',
      error: String(error?.message || 'Unknown error')
    });
  }
};
