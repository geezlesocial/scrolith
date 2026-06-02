import type { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { applyAccountModerationAction } from '../services/accountModeration.service';

type AuthRequest = Request & {
  user?: {
    id?: string;
    role?: string;
    email?: string;
    name?: string;
  };
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const normalizeId = (value: unknown): string => String(value || '').trim();
const normalizeText = (value: unknown): string => String(value || '').trim();

const toPositiveInt = (value: unknown, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

const clipText = (value: string | null | undefined, max = 220): string => {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
};

const toApiStatus = (status: string | null | undefined): string => {
  const normalized = normalizeText(status).toLowerCase();
  if (!normalized) return 'pending';
  if (normalized === 'open') return 'pending';
  if (normalized === 'reviewed') return 'under_review';
  if (normalized === 'resolved') return 'action_taken';
  return normalized;
};

const filterToDbStatuses = (statusFilter: string | null | undefined): string[] | null => {
  const normalized = normalizeText(statusFilter).toLowerCase();
  if (!normalized || normalized === 'all') return null;
  if (normalized === 'pending') return ['pending', 'open'];
  if (normalized === 'under_review') return ['under_review', 'reviewed'];
  if (normalized === 'action_taken') return ['action_taken', 'resolved'];
  if (normalized === 'no_violation') return ['no_violation'];
  return [normalized];
};

const toUserSummary = (user: any) => {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name ?? null,
    username: user.username ?? null,
    email: user.email ?? null,
    avatar: user.avatar ?? null,
    role: user.role ?? null
  };
};

const toReportDto = (report: any) => {
  const apiStatus = toApiStatus(report?.status);
  const snippet = clipText(report?.post?.content || report?.details || report?.reason || '');
  const adminDecision =
    apiStatus === 'no_violation' ? 'no_violation' : apiStatus === 'action_taken' ? 'violation' : null;

  return {
    id: report.id,
    postId: report.postId,
    reporterId: report.reporterId,
    postOwnerId: report.post?.authorId || '',
    reason: report.reason || undefined,
    details: report.details || undefined,
    status: apiStatus,
    severity: 'medium',
    reporterReply: null,
    adminDecision,
    actionType: apiStatus === 'action_taken' ? 'moderation_action' : null,
    actionSummary: null,
    actionMetadata: null,
    reviewedById: null,
    reviewedAt: apiStatus === 'pending' ? null : report.updatedAt,
    resolvedAt: apiStatus === 'action_taken' || apiStatus === 'no_violation' ? report.updatedAt : null,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    snippet,
    reporter: toUserSummary(report.reporter),
    postOwner: toUserSummary(report.post?.author),
    reviewer: null,
    post: report.post
      ? {
          id: report.post.id,
          title: report.post.title || undefined,
          contentSnippet: clipText(report.post.content || ''),
          status: report.post.status || undefined,
          authorId: report.post.authorId || undefined,
          createdAt: report.post.createdAt || null
        }
      : null
  };
};

const emitReportEvent = (event: string, payload: Record<string, unknown>) => {
  try {
    realtime.emitToRoom('community:admin', event, payload);
  } catch {}
  try {
    realtime.emitToRoom('community:global', event, payload);
  } catch {}
};

export const getPostReportsAdmin = async (req: Request, res: Response) => {
  try {
    const statusFilter = normalizeText(req.query?.status || 'pending');
    const search = normalizeText(req.query?.search || '');
    const postId = normalizeId(req.query?.postId);
    const ownerId = normalizeId(req.query?.ownerId);
    const reporterId = normalizeId(req.query?.reporterId);
    const page = toPositiveInt(req.query?.page, DEFAULT_PAGE, 1);
    const limit = toPositiveInt(req.query?.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
    const skip = (page - 1) * limit;

    const andClauses: any[] = [];
    const statusIn = filterToDbStatuses(statusFilter);
    if (statusIn && statusIn.length) andClauses.push({ status: { in: statusIn } });
    if (postId) andClauses.push({ postId });
    if (reporterId) andClauses.push({ reporterId });
    if (ownerId) andClauses.push({ post: { authorId: ownerId } });
    if (search) {
      andClauses.push({
        OR: [
          { reason: { contains: search, mode: 'insensitive' } },
          { details: { contains: search, mode: 'insensitive' } },
          { reporter: { name: { contains: search, mode: 'insensitive' } } },
          { reporter: { username: { contains: search, mode: 'insensitive' } } },
          { reporter: { email: { contains: search, mode: 'insensitive' } } },
          { post: { title: { contains: search, mode: 'insensitive' } } },
          { post: { content: { contains: search, mode: 'insensitive' } } }
        ]
      });
    }

    const where = andClauses.length ? { AND: andClauses } : {};
    const include = {
      reporter: {
        select: { id: true, name: true, username: true, email: true, avatar: true, role: true }
      },
      post: {
        select: {
          id: true,
          title: true,
          content: true,
          status: true,
          authorId: true,
          createdAt: true,
          author: {
            select: { id: true, name: true, username: true, email: true, avatar: true, role: true }
          }
        }
      }
    } as const;

    const [rows, total, pendingCount] = await Promise.all([
      prisma.communityPostReport.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.communityPostReport.count({ where }),
      prisma.communityPostReport.count({ where: { status: { in: ['pending', 'open'] } } })
    ]);

    return res.json({
      success: true,
      data: {
        items: rows.map(toReportDto),
        total,
        page,
        limit,
        pendingCount
      }
    });
  } catch (error: any) {
    console.error('[community.reports.getPostReportsAdmin] error:', error);
    return res.status(500).json({ success: false, error: 'Failed to load post reports' });
  }
};

export const getPostReportByIdAdmin = async (req: Request, res: Response) => {
  try {
    const reportId = normalizeId(req.params?.reportId);
    if (!reportId) {
      return res.status(400).json({ success: false, error: 'Report id is required' });
    }

    const report = await prisma.communityPostReport.findUnique({
      where: { id: reportId },
      include: {
        reporter: {
          select: { id: true, name: true, username: true, email: true, avatar: true, role: true }
        },
        post: {
          select: {
            id: true,
            title: true,
            content: true,
            status: true,
            authorId: true,
            createdAt: true,
            author: {
              select: { id: true, name: true, username: true, email: true, avatar: true, role: true }
            }
          }
        }
      }
    });

    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

    return res.json({ success: true, data: toReportDto(report) });
  } catch (error: any) {
    console.error('[community.reports.getPostReportByIdAdmin] error:', error);
    return res.status(500).json({ success: false, error: 'Failed to load report detail' });
  }
};

export const replyToPostReportAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const reportId = normalizeId(req.params?.reportId);
    const message = normalizeText(req.body?.message);
    if (!reportId) return res.status(400).json({ success: false, error: 'Report id is required' });
    if (!message) return res.status(400).json({ success: false, error: 'Message is required' });

    const report = await prisma.communityPostReport.findUnique({
      where: { id: reportId },
      include: {
        reporter: { select: { id: true } },
        post: { select: { id: true, authorId: true } }
      }
    });
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

    const current = toApiStatus(report.status);
    const nextStatus = current === 'pending' ? 'under_review' : current;

    const updated = await prisma.communityPostReport.update({
      where: { id: reportId },
      data: { status: nextStatus },
      include: {
        reporter: {
          select: { id: true, name: true, username: true, email: true, avatar: true, role: true }
        },
        post: {
          select: {
            id: true,
            title: true,
            content: true,
            status: true,
            authorId: true,
            createdAt: true,
            author: {
              select: { id: true, name: true, username: true, email: true, avatar: true, role: true }
            }
          }
        }
      }
    });

    await prisma.notification
      .create({
        data: {
          userId: report.reporterId,
          actorId: req.user?.id || null,
          type: 'community_report_reply',
          title: 'Update on your post report',
          body: message,
          meta: {
            reportId: report.id,
            postId: report.postId
          }
        }
      })
      .catch(() => null);

    const payload = { reportId: report.id, status: nextStatus, postId: report.postId };
    emitReportEvent('community:post_report_updated', payload);
    try {
      realtime.emitToUser(report.reporterId, 'community:post_report_updated', payload);
    } catch {}

    const dto = toReportDto(updated);
    dto.reporterReply = message;
    return res.json({ success: true, data: dto });
  } catch (error: any) {
    console.error('[community.reports.replyToPostReportAdmin] error:', error);
    return res.status(500).json({ success: false, error: 'Failed to send report reply' });
  }
};

export const actionPostReportAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const reportId = normalizeId(req.params?.reportId);
    const decision = normalizeText(req.body?.decision).toLowerCase();
    if (!reportId) return res.status(400).json({ success: false, error: 'Report id is required' });
    if (decision !== 'violation' && decision !== 'no_violation') {
      return res.status(400).json({ success: false, error: 'Invalid decision' });
    }

    const report = await prisma.communityPostReport.findUnique({
      where: { id: reportId },
      include: {
        post: {
          select: {
            id: true,
            status: true,
            authorId: true
          }
        }
      }
    });
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

    const actions = (req.body?.actions || {}) as {
      flagPost?: boolean;
      removePost?: boolean;
      warnAccount?: boolean;
      sanctionAccount?: boolean;
      strikeAccount?: boolean;
      banAccount?: boolean;
      restrictPostingHours?: number;
      restrictedFeatures?: string[];
      restrictFeaturesHours?: number;
    };

    let nextPostStatus: string | null = null;
    if (decision === 'violation') {
      if (actions.removePost) nextPostStatus = 'deleted';
      else if (actions.flagPost) nextPostStatus = 'draft';
    }

    await prisma.$transaction(async (tx) => {
      if (nextPostStatus && report.post?.id) {
        await tx.communityPost.update({
          where: { id: report.post.id },
          data: { status: nextPostStatus }
        });
      }

      await tx.communityPostReport.update({
        where: { id: report.id },
        data: {
          status: decision === 'violation' ? 'action_taken' : 'no_violation'
        }
      });
    });

    const complainantMessage = normalizeText(req.body?.complainantMessage);
    const ownerMessage = normalizeText(req.body?.ownerMessage);
    if (complainantMessage) {
      await prisma.notification
        .create({
          data: {
            userId: report.reporterId,
            actorId: req.user?.id || null,
            type: 'community_report_resolution',
            title: 'Your report has been reviewed',
            body: complainantMessage,
            meta: { reportId: report.id, postId: report.postId, decision }
          }
        })
        .catch(() => null);
    }

    if (decision === 'violation' && ownerMessage && report.post?.authorId) {
      await prisma.notification
        .create({
          data: {
            userId: report.post.authorId,
            actorId: req.user?.id || null,
            type: 'community_moderation_action',
            title: 'Community moderation action',
            body: ownerMessage,
            meta: { reportId: report.id, postId: report.postId, decision, actions }
          }
        })
        .catch(() => null);
    }

    const refreshed = await prisma.communityPostReport.findUnique({
      where: { id: report.id },
      include: {
        reporter: {
          select: { id: true, name: true, username: true, email: true, avatar: true, role: true }
        },
        post: {
          select: {
            id: true,
            title: true,
            content: true,
            status: true,
            authorId: true,
            createdAt: true,
            author: {
              select: { id: true, name: true, username: true, email: true, avatar: true, role: true }
            }
          }
        }
      }
    });

    if (decision === 'violation' && report.post?.authorId) {
      const restrictedFeatures = Array.isArray(actions.restrictedFeatures)
        ? actions.restrictedFeatures
            .map((entry) => normalizeText(entry).toLowerCase())
            .filter(Boolean)
        : [];
      const normalizedFeatureSet = new Set<string>();
      restrictedFeatures.flatMap((entry) => {
        if (entry === 'post' || entry === 'posting' || entry === 'content') return ['post'];
        if (entry === 'comment' || entry === 'commenting' || entry === 'reply' || entry === 'replies') return ['comment'];
        if (entry === 'react' || entry === 'reaction' || entry === 'reactions' || entry === 'like' || entry === 'likes' || entry === 'repost' || entry === 'reposts' || entry === 'share' || entry === 'shares') {
          return ['react'];
        }
        return [entry];
      }).forEach((entry) => normalizedFeatureSet.add(entry));
      if (Number(actions.restrictPostingHours || 0) > 0) {
        normalizedFeatureSet.add('post');
      }
      if (Number(actions.restrictFeaturesHours || 0) > 0 && normalizedFeatureSet.size === 0) {
        ['post', 'comment', 'react'].forEach((entry) => normalizedFeatureSet.add(entry));
      }
      const actionType = actions.banAccount
        ? 'ban'
        : (actions.restrictPostingHours || actions.restrictFeaturesHours || normalizedFeatureSet.size > 0)
          ? 'restriction'
          : actions.strikeAccount || actions.sanctionAccount
            ? 'strike'
            : actions.warnAccount
              ? 'warning'
              : 'warning';
      await applyAccountModerationAction({
        userId: report.post.authorId,
        actorId: req.user?.id || null,
        actorEmail: req.user?.email || null,
        actorRole: req.user?.role || null,
        action: actionType,
        severity: normalizeText(req.body?.severity || 'medium').toLowerCase() || 'medium',
        reason: normalizeText(req.body?.reason || report.reason || 'Community report moderation action'),
        userMessage: normalizeText(req.body?.ownerMessage || ''),
        restrictedFeatures: Array.from(normalizedFeatureSet),
        restrictionHours: Math.max(
          0,
          Number(actions.restrictFeaturesHours || 0),
          Number(actions.restrictPostingHours || 0)
        ),
        source: 'community_report',
        sourceId: report.id,
        sourceLabel: report.reason || 'Community report',
        meta: {
          reportId: report.id,
          postId: report.postId,
          decision,
          actions
        }
      });
    }

    if (!refreshed) return res.status(404).json({ success: false, error: 'Report not found after update' });

    const payload = {
      reportId: report.id,
      status: decision === 'violation' ? 'action_taken' : 'no_violation',
      postId: report.postId
    };
    emitReportEvent('community:post_report_updated', payload);
    try {
      realtime.emitToUser(report.reporterId, 'community:post_report_updated', payload);
    } catch {}
    if (report.post?.authorId) {
      try {
        realtime.emitToUser(report.post.authorId, 'community:post_report_updated', payload);
      } catch {}
    }
    if (nextPostStatus && report.post?.id) {
      const postPayload = { postId: report.post.id, status: nextPostStatus };
      if (nextPostStatus === 'deleted') {
        try {
          realtime.emitToRoom('community:global', 'community:post_deleted', { postId: report.post.id });
        } catch {}
      } else {
        try {
          realtime.emitToRoom('community:global', 'community:post_updated', postPayload);
        } catch {}
      }
    }

    return res.json({ success: true, data: toReportDto(refreshed) });
  } catch (error: any) {
    console.error('[community.reports.actionPostReportAdmin] error:', error);
    return res.status(500).json({ success: false, error: 'Failed to apply moderation action' });
  }
};
