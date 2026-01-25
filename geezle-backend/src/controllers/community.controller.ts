import { Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// Extend Request to include user from auth middleware
interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
}

// Safe helper to retrieve the `io` instance from `req.app` without broad `as any` casts
const getAppIo = (req: Request) => {
  const getter = (req.app as unknown as { get?: (k: string) => unknown }).get;
  if (typeof getter === 'function') {
    // Prefer community namespace when available
    const community = getter('communityIo') as { emit?: (...args: unknown[]) => void } | undefined;
    if (community) return community;
    return getter('io') as { emit?: (...args: unknown[]) => void } | undefined;
  }
  // Fallback to global namespace if set
  if ((global as any).appCommunityIo) return (global as any).appCommunityIo;
  if ((global as any).appIo) return (global as any).appIo;
  return undefined;
};

// Get all threads
export const getThreads = async (req: AuthRequest, res: Response) => {
  try {
    const { category, limit = 50, offset = 0 } = req.query;

    const where: any = {
      status: { not: 'LOCKED' } // Don't show locked threads by default unless admin
    };

    if (category) {
      const categoryRecord = await prisma.category.findFirst({
        where: { slug: category as string }
      });
      if (categoryRecord) {
        where.categoryId = categoryRecord.id;
      }
    }

    const threads = await prisma.forumThread.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        _count: {
          select: {
            comments: true,
            likes: true
          }
        }
      },
      orderBy: [
        { isPinned: 'desc' },
        { createdAt: 'desc' }
      ],
      take: Number(limit),
      skip: Number(offset)
    });

    // Transform to match frontend types
    const transformed = threads.map(thread => ({
      id: thread.id,
      categoryId: thread.categoryId || '',
      categoryName: thread.category?.name || 'General',
      userId: thread.userId,
      userName: thread.user.name || 'Anonymous',
      userAvatar: thread.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(thread.user.name || 'User')}`,
      title: thread.title,
      content: thread.content,
      status: thread.status.toLowerCase(),
      views: thread.views,
      repliesCount: thread._count.comments,
      upvotes: thread._count.likes,
      isPinned: thread.isPinned,
      isLocked: thread.isLocked,
      createdAt: thread.createdAt.toISOString(),
      tags: thread.tags,
      interactions: {
        likes: thread._count.likes,
        comments: thread._count.comments,
        reposts: 0,
        shares: 0
      },
      userState: {
        liked: false, // Will be set if user is authenticated
        reposted: false
      }
    }));

    return res.json(transformed);
  } catch (error: any) {
    console.error('Get threads error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get thread by ID
export const getThreadById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const thread = await prisma.forumThread.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        _count: {
          select: {
            comments: true,
            likes: true
          }
        }
      }
    });
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Check if user liked this thread
    let isLiked = false;
    if (req.user?.id) {
      const like = await prisma.forumLike.findFirst({
        where: {
          userId: req.user.id,
          threadId: id,
          commentId: null
        }
      });
      isLiked = !!like;
    }

    // Transform to match frontend types
    const transformed = {
      id: thread.id,
      categoryId: thread.categoryId || '',
      categoryName: thread.category?.name || 'General',
      userId: thread.userId,
      userName: thread.user.name || 'Anonymous',
      userAvatar: thread.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(thread.user.name || 'User')}`,
      title: thread.title,
      content: thread.content,
      status: thread.status.toLowerCase(),
      views: thread.views,
      repliesCount: thread._count.comments,
      upvotes: thread._count.likes,
      isPinned: thread.isPinned,
      isLocked: thread.isLocked,
      createdAt: thread.createdAt.toISOString(),
      tags: thread.tags,
      interactions: {
        likes: thread._count.likes,
        comments: thread._count.comments,
        reposts: 0,
        shares: 0
      },
      userState: {
        liked: isLiked,
        reposted: false
      }
    };

    return res.json(transformed);
  } catch (error: any) {
    console.error('Get thread by ID error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Create thread
export const createThread = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { title, content, categoryId, tags } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const thread = await prisma.forumThread.create({
      data: {
        userId,
        title,
        content,
        categoryId: categoryId || null,
        tags: tags || [],
        status: 'OPEN'
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true
          }
        },
        category: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    const io = getAppIo(req);

    const payload = {
      id: thread.id,
      categoryId: thread.categoryId || '',
      categoryName: thread.category?.name || 'General',
      userId: thread.userId,
      userName: thread.user.name || 'Anonymous',
      userAvatar: thread.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(thread.user.name || 'User')}`,
      title: thread.title,
      content: thread.content,
      status: thread.status.toLowerCase(),
      views: 0,
      repliesCount: 0,
      upvotes: 0,
      isPinned: false,
      isLocked: false,
      createdAt: thread.createdAt.toISOString(),
      tags: thread.tags,
      interactions: {
        likes: 0,
        comments: 0,
        reposts: 0,
        shares: 0
      },
      userState: {
        liked: false,
        reposted: false
      }
    };

    try {
      io?.emit('community:thread_created', { thread: payload });
    } catch (e) {
      console.error('Socket emit error (thread_created):', e);
    }

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Create thread error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get comments for a thread
export const getComments = async (req: AuthRequest, res: Response) => {
  try {
    const { threadId } = req.query;

    if (!threadId) {
      return res.status(400).json({ error: 'threadId is required' });
    }

    const comments = await prisma.forumComment.findMany({
      where: { threadId: threadId as string },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true
          }
        },
        _count: {
          select: {
            replies: true,
            commentLikes: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Check which comments user liked
    const userId = req.user?.id;
    const likedCommentIds = userId ? await prisma.forumLike.findMany({
      where: {
        userId,
        commentId: { in: comments.map(c => c.id) }
      },
      select: { commentId: true }
    }).then(likes => new Set(likes.map(l => l.commentId).filter(Boolean))) : new Set();

    // Transform and build reply tree
    const commentMap = new Map();
    const rootComments: any[] = [];

    comments.forEach(comment => {
      const transformed = {
        id: comment.id,
        thread_id: comment.threadId,
        threadId: comment.threadId,
        parent_id: comment.parentId,
        parentId: comment.parentId,
        user_id: comment.userId,
        userId: comment.userId,
        user_name: comment.user.name || 'Anonymous',
        userName: comment.user.name || 'Anonymous',
        user_avatar: comment.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.user.name || 'User')}`,
        userAvatar: comment.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.user.name || 'User')}`,
        user_role: comment.user.role,
        userRole: comment.user.role,
        content: comment.content,
        created_at: comment.createdAt.toISOString(),
        createdAt: comment.createdAt.toISOString(),
        likes: comment._count.commentLikes,
        is_liked: likedCommentIds.has(comment.id),
        isLiked: likedCommentIds.has(comment.id),
        replies: []
      };

      commentMap.set(comment.id, transformed);

      if (!comment.parentId) {
        rootComments.push(transformed);
      } else {
        const parent = commentMap.get(comment.parentId);
        if (parent) {
          parent.replies.push(transformed);
        }
      }
    });

    return res.json(rootComments);
  } catch (error: any) {
    console.error('Get comments error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Post comment
export const postComment = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { threadId, content, parentId } = req.body;

    if (!threadId || !content) {
      return res.status(400).json({ error: 'threadId and content are required' });
    }

    // Verify thread exists
    const thread = await prisma.forumThread.findUnique({
      where: { id: threadId }
    });

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    if (thread.isLocked) {
      return res.status(403).json({ error: 'Thread is locked' });
    }

    const comment = await prisma.forumComment.create({
      data: {
        threadId,
        userId,
        content,
        parentId: parentId || null
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true
          }
        }
      }
    });

    const io = getAppIo(req);

    const payload = {
      id: comment.id,
      thread_id: comment.threadId,
      threadId: comment.threadId,
      parent_id: comment.parentId,
      parentId: comment.parentId,
      user_id: comment.userId,
      userId: comment.userId,
      user_name: comment.user.name || 'Anonymous',
      userName: comment.user.name || 'Anonymous',
      user_avatar: comment.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.user.name || 'User')}`,
      userAvatar: comment.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.user.name || 'User')}`,
      user_role: comment.user.role,
      userRole: comment.user.role,
      content: comment.content,
      created_at: comment.createdAt.toISOString(),
      createdAt: comment.createdAt.toISOString(),
      likes: 0,
      is_liked: false,
      isLiked: false,
      replies: []
    };

    try {
      io?.emit('community:comment_created', { comment: payload });
    } catch (e) {
      console.error('Socket emit error (comment_created):', e);
    }

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Post comment error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Toggle like
export const toggleLike = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id, type } = req.body;

    if (type === 'thread') {
      // Find existing like
      const existing = await prisma.forumLike.findFirst({
        where: {
          userId,
          threadId: id,
          commentId: null
        }
      });

      if (existing) {
        await prisma.forumLike.delete({ where: { id: existing.id } });
        const io = getAppIo(req);
        try { io?.emit('community:like_toggled', { id, type: 'thread', userId, liked: false }); } catch (e) { console.error('Socket emit error (like_toggled):', e); }
        return res.json({ success: true, data: { liked: false } });
      } else {
        await prisma.forumLike.create({ data: { userId, threadId: id } });
        const io = getAppIo(req);
        try { io?.emit('community:like_toggled', { id, type: 'thread', userId, liked: true }); } catch (e) { console.error('Socket emit error (like_toggled):', e); }
        return res.json({ success: true, data: { liked: true } });
      }
    } else if (type === 'comment') {
      // Find existing like
      const existing = await prisma.forumLike.findFirst({
        where: {
          userId,
          commentId: id,
          threadId: null
        }
      });

      if (existing) {
        await prisma.forumLike.delete({ where: { id: existing.id } });
        const io = getAppIo(req);
        try { io?.emit('community:like_toggled', { id, type: 'comment', userId, liked: false }); } catch (e) { console.error('Socket emit error (like_toggled):', e); }
        return res.json({ success: true, data: { liked: false } });
      } else {
        await prisma.forumLike.create({ data: { userId, commentId: id } });
        const io = (req.app as any).get('io');
        try { io?.emit('community:like_toggled', { id, type: 'comment', userId, liked: true }); } catch (e) { console.error('Socket emit error (like_toggled):', e); }
        return res.json({ success: true, data: { liked: true } });
      }
    }

    return res.status(400).json({ error: 'Invalid type' });
  } catch (error: any) {
    console.error('Toggle like error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Toggle thread pin (admin/moderator only)
export const toggleThreadPin = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'MODERATOR') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    const { isPinned } = req.body;

    const thread = await prisma.forumThread.update({
      where: { id },
      data: { isPinned: isPinned !== undefined ? isPinned : true }
    });

    try {
      const io = getAppIo(req);
      io?.emit('community:thread_pinned', { id, isPinned: thread.isPinned });
    } catch (e) {
      console.error('Socket emit error (thread_pinned):', e);
    }

    return res.json({ success: true, data: { isPinned: thread.isPinned } });
  } catch (error: any) {
    console.error('Toggle thread pin error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Toggle thread lock (admin/moderator only)
export const toggleThreadLock = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'MODERATOR') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    const { isLocked } = req.body;

    const thread = await prisma.forumThread.update({
      where: { id },
      data: { 
        isLocked: isLocked !== undefined ? isLocked : true,
        status: isLocked !== undefined && isLocked ? 'LOCKED' : 'OPEN'
      }
    });

    try {
      const io = getAppIo(req);
      io?.emit('community:thread_locked', { id, isLocked: thread.isLocked, status: thread.status });
    } catch (e) {
      console.error('Socket emit error (thread_locked):', e);
    }

    return res.json({ success: true, data: { isLocked: thread.isLocked } });
  } catch (error: any) {
    console.error('Toggle thread lock error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Delete thread (admin/moderator or owner)
export const deleteThread = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    const thread = await prisma.forumThread.findUnique({
      where: { id }
    });

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Check permissions
    if (thread.userId !== userId && req.user?.role !== 'ADMIN' && req.user?.role !== 'MODERATOR') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.forumThread.delete({ where: { id } });

    try {
      const io = getAppIo(req);
      io?.emit('community:thread_deleted', { id });
    } catch (e) {
      console.error('Socket emit error (thread_deleted):', e);
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete thread error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Delete comment (admin/moderator or owner)
export const deleteComment = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    const comment = await prisma.forumComment.findUnique({
      where: { id }
    });

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Check permissions
    if (comment.userId !== userId && req.user?.role !== 'ADMIN' && req.user?.role !== 'MODERATOR') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.forumComment.delete({ where: { id } });

    try {
      const io = getAppIo(req);
      io?.emit('community:comment_deleted', { id });
    } catch (e) {
      console.error('Socket emit error (comment_deleted):', e);
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete comment error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ------- Post metric endpoints & earning engine -------
// Default earning rule fallbacks
const DEFAULT_RULES = {
  viewsUnit: 10000,
  likesUnit: 100,
  repostsUnit: 50,
  sharesUnit: 200,
  coinPerViewsUnit: 1,
  coinPerLikesUnit: 1,
  coinPerRepostsUnit: 1,
  coinPerSharesUnit: 1,
  adminFeePercent: 0.10
};

const dayKey = (d = new Date()) => d.toISOString().slice(0,10);

const buildEventKey = (postId: string, eventType: string, actorId?: string, sessionHash?: string) => {
  const actorPart = actorId || (sessionHash ? `s:${sessionHash}` : 'anon');
  return `${postId}:${eventType}:${actorPart}:${dayKey()}`;
};

const getAdminRevenueUserId = async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  return admin ? admin.id : null;
};

const tryCreateEarningEvent = async (data: { postId:string, actorId?:string, eventType:string, eventKey:string }) => {
  try {
    const ev = await prisma.gcoinEarningEvent.create({ data: {
      postId: data.postId,
      actorId: data.actorId || null,
      eventType: data.eventType,
      eventKey: data.eventKey,
      value: 0,
      credited: false
    }});
    // Actor velocity check (per-minute) to catch bots/spammy activity
    try {
      if (data.actorId) {
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
        const recentCount = await prisma.gcoinEarningEvent.count({ where: { actorId: data.actorId, createdAt: { gt: oneMinuteAgo } } });
        // thresholds (tunable)
        const thresholds: any = { view: 200, like: 30, share: 50, repost: 40 };
        const limit = thresholds[data.eventType] ?? 100;
        if (recentCount > limit) {
          // rate limited actor — increment fraud score on wallet for later admin review
          try {
            await prisma.gcoinWallet.updateMany({ where: { userId: data.actorId }, data: { fraudScore: { increment: 1 } } as any });
          } catch(e) {
            console.error('Wallet fraud increment error:', e);
          }
          // notify actor about temporary rate limit
          try {
            await prisma.notification.create({ data: {
              userId: data.actorId,
              actorId: null,
              type: 'gcoin_rate_limited',
              title: 'Action rate limited',
              body: `Your recent activity was temporarily rate limited for anti-fraud checks.`,
              meta: { postId: data.postId, eventType: data.eventType, recentCount }
            }});
          } catch(e) {
            // don't block
          }
          console.warn('Actor velocity detected', data.actorId, recentCount);
          return { created: false, error: new Error('rate_limited') };
        }
      }
    } catch (err) {
      console.error('Fraud check error:', err);
    }

    return { created: true, event: ev };
  } catch (err: any) {
    // Unique constraint => duplicate event (idempotent)
    return { created: false, error: err };
  }
};

const processThresholds = async (postId: string, io: any) => {
  // Fetch post counts
  const post = await prisma.communityPost.findUnique({ where: { id: postId } });
  if (!post) return;

  // Read admin-configurable rules from GcoinSettings or fallback
  const s = await prisma.gcoinSettings.findFirst();
  const ss: any = s;
  const rules = ss ? {
    viewsUnit: ss.viewsUnit ?? DEFAULT_RULES.viewsUnit,
    likesUnit: ss.likesUnit ?? DEFAULT_RULES.likesUnit,
    repostsUnit: ss.repostsUnit ?? DEFAULT_RULES.repostsUnit,
    sharesUnit: ss.sharesUnit ?? DEFAULT_RULES.sharesUnit,
    coinPerViewsUnit: ss.coinPerViewsUnit ?? DEFAULT_RULES.coinPerViewsUnit,
    coinPerLikesUnit: ss.coinPerLikesUnit ?? DEFAULT_RULES.coinPerLikesUnit,
    coinPerRepostsUnit: ss.coinPerRepostsUnit ?? DEFAULT_RULES.coinPerRepostsUnit,
    coinPerSharesUnit: ss.coinPerSharesUnit ?? DEFAULT_RULES.coinPerSharesUnit,
    adminFeePercent: ss.adminFeePercent ?? DEFAULT_RULES.adminFeePercent
  } : DEFAULT_RULES;

  // For each metric compute awardable coins
  const checks: Array<{type:string, count:number, unit:number, coinPerUnit:number}> = [
    { type: 'view', count: post.viewsCount, unit: rules.viewsUnit, coinPerUnit: rules.coinPerViewsUnit },
    { type: 'like', count: post.likesCount, unit: rules.likesUnit, coinPerUnit: rules.coinPerLikesUnit },
    { type: 'repost', count: post.repostsCount, unit: rules.repostsUnit, coinPerUnit: rules.coinPerRepostsUnit },
    { type: 'share', count: post.sharesCount, unit: rules.sharesUnit, coinPerUnit: rules.coinPerSharesUnit }
  ];

  for (const chk of checks) {
    if (!chk.unit || chk.unit <= 0) continue;
    const alreadyAwarded = await prisma.gcoinEarningEvent.count({ where: { postId, eventType: `${chk.type}_award`, credited: true } });
    const awardableUnits = Math.floor(chk.count / chk.unit) - alreadyAwarded;
    if (awardableUnits > 0) {
      const totalCoins = awardableUnits * chk.coinPerUnit;
      const adminShare = Number((totalCoins * rules.adminFeePercent).toFixed(8));
      const creatorShare = Number((totalCoins - adminShare).toFixed(8));

      // determine post author
      const author = await prisma.user.findUnique({ where: { id: post.authorId } });
      if (!author) continue;

      // determine admin revenue user
      const adminUserId = await getAdminRevenueUserId();

      // FRAUD CHECK: spike detection for the post (events burst)
      let postSuspicious = false;
      try {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const recentPostEvents = await prisma.gcoinEarningEvent.count({ where: { postId, createdAt: { gt: tenMinutesAgo } } });
        // if more than X events in last 10 minutes, mark suspicious
        if (recentPostEvents > 500) postSuspicious = true;
      } catch (err) {
        console.error('Post spike check error:', err);
      }

      if (postSuspicious) {
        // Create pending award events (not credited) and notify admins for manual review
        await prisma.$transaction(async (tx) => {
          await tx.gcoinEarningEvent.create({ data: { postId, actorId: null, eventType: `${chk.type}_award_pending`, eventKey: `${postId}:${chk.type}:pending:${Date.now()}`, value: totalCoins, credited: false } });
          await tx.notification.create({ data: {
            userId: (await tx.user.findFirst({ where: { role: 'ADMIN' } }))?.id || '',
            actorId: null,
            type: 'gcoin_pending_award',
            title: 'Pending Gcoin award for review',
            body: `Post ${postId} has ${awardableUnits} ${chk.type} unit(s) pending award totaling ${totalCoins} Gcoin due to suspicious activity.`,
            meta: { postId, metric: chk.type, awardableUnits, totalCoins }
          }});
        });
        try { io?.emit('community:gcoin_award_pending', { postId, metric: chk.type, awardableUnits, totalCoins }); } catch(e){}
        continue;
      }

      await prisma.$transaction(async (tx) => {
        // credit creator wallet
        const authorWallet = await tx.gcoinWallet.findUnique({ where: { userId: author.id } });
        if (!authorWallet) {
          await tx.gcoinWallet.create({ data: { userId: author.id, recipientId: `GC-${Date.now().toString().slice(-8)}` } });
        }
        if (creatorShare > 0) {
          await tx.gcoinWallet.update({ where: { userId: author.id }, data: { balance: { increment: creatorShare }, lifetimeEarned: { increment: creatorShare } } });
          await tx.gcoinTransaction.create({ data: { userId: author.id, amount: creatorShare, type: 'reward', source: 'earning_engine', reason: `${chk.type}_threshold_award`, status: 'completed' } });
        }

        // credit admin revenue wallet if present
        if (adminUserId && adminShare > 0) {
          const adminWallet = await tx.gcoinWallet.findUnique({ where: { userId: adminUserId } });
          if (!adminWallet) {
            await tx.gcoinWallet.create({ data: { userId: adminUserId, recipientId: `GC-${Date.now().toString().slice(-6)}` } });
          }
          await tx.gcoinWallet.update({ where: { userId: adminUserId }, data: { balance: { increment: adminShare } } });
          await tx.gcoinTransaction.create({ data: { userId: adminUserId, amount: adminShare, type: 'admin_fee', source: 'earning_engine', reason: `${chk.type}_threshold_fee`, status: 'completed' } });
        }

        // create a credited earning event record for this award
        await tx.gcoinEarningEvent.create({ data: { postId, actorId: null, eventType: `${chk.type}_award`, eventKey: `${postId}:${chk.type}:award:${Date.now()}`, value: totalCoins, credited: true } });

        // Mirror the gcoin movements into the generic ledger for accounting and reporting
        await tx.transaction.create({ data: {
          userId: post.authorId,
          amount: creatorShare,
          type: 'DEPOSIT',
          status: 'COMPLETED',
          description: `${chk.type} threshold reward for post ${postId}`,
          metadata: { community: true, subtype: 'GCOIN_EARN', postId, metric: chk.type, units: awardableUnits }
        } });
        if (adminUserId && adminShare > 0) {
          await tx.transaction.create({ data: {
            userId: adminUserId,
            amount: adminShare,
            type: 'FEE',
            status: 'COMPLETED',
            description: `Admin fee for ${chk.type} reward on post ${postId}`,
            metadata: { community: true, subtype: 'GCOIN_FEE', postId, metric: chk.type }
          } });
        }
      });

      try {
        io?.emit('community:gcoin_earned', { postId, authorId: post.authorId, metric: chk.type, totalCoins, creatorShare, adminShare });
      } catch(e) { console.error('Socket emit error (gcoin_earned):', e); }
    }
  }
};

export const postView = async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.id;
    const actorId = req.user?.id;
    const sessionHash = req.body?.sessionHash || req.header('X-Session-Hash') || undefined;
    const eventKey = buildEventKey(postId, 'view', actorId, sessionHash);

    const created = await tryCreateEarningEvent({ postId, actorId, eventType: 'view', eventKey });
    if (!created.created) return res.json({ success: true, duplicate: true });

    // increment view count
    await prisma.communityPost.update({ where: { id: postId }, data: { viewsCount: { increment: 1 } as any } as any });

    const io = (req.app as any).get('io');
    try { io?.emit('community:post_metrics_updated', { postId, metric: 'view' }); } catch(e){}

    // process thresholds asynchronously but don't block response
    processThresholds(postId, io).catch(e => console.error('Threshold processing error:', e));

    return res.json({ success: true });
  } catch (error: any) {
    console.error('postView error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const postShare = async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.id;
    const actorId = req.user?.id;
    const platform = req.body?.platform || 'external';
    const sessionHash = req.body?.sessionHash || req.header('X-Session-Hash') || undefined;
    const eventKey = buildEventKey(postId, 'share', actorId, sessionHash) + `:${platform}`;

    const created = await tryCreateEarningEvent({ postId, actorId, eventType: 'share', eventKey });
    if (!created.created) return res.json({ success: true, duplicate: true });

    await prisma.communityPost.update({ where: { id: postId }, data: { sharesCount: { increment: 1 } as any } as any });

    const io = (req.app as any).get('io');
    try { io?.emit('community:post_metrics_updated', { postId, metric: 'share' }); } catch(e){}

    processThresholds(postId, io).catch(e => console.error('Threshold processing error:', e));

    return res.json({ success: true });
  } catch (error: any) {
    console.error('postShare error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const postRepost = async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.id;
    const actorId = req.user?.id;
    const sessionHash = req.body?.sessionHash || req.header('X-Session-Hash') || undefined;
    const eventKey = buildEventKey(postId, 'repost', actorId, sessionHash);

    const created = await tryCreateEarningEvent({ postId, actorId, eventType: 'repost', eventKey });
    if (!created.created) return res.json({ success: true, duplicate: true });

    await prisma.communityPost.update({ where: { id: postId }, data: { repostsCount: { increment: 1 } as any } as any });

    const io = (req.app as any).get('io');
    try { io?.emit('community:post_metrics_updated', { postId, metric: 'repost' }); } catch(e){}

    processThresholds(postId, io).catch(e => console.error('Threshold processing error:', e));

    return res.json({ success: true });
  } catch (error: any) {
    console.error('postRepost error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const postLike = async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.id;
    const actorId = req.user?.id;
    if (!actorId) return res.status(401).json({ error: 'Unauthorized' });

    const eventKey = buildEventKey(postId, 'like', actorId);
    // Prevent double-like via unique eventKey
    const created = await tryCreateEarningEvent({ postId, actorId, eventType: 'like', eventKey });
    if (!created.created) return res.json({ success: true, duplicate: true });

    await prisma.communityPost.update({ where: { id: postId }, data: { likesCount: { increment: 1 } as any } as any });

    const io = (req.app as any).get('io');
    try { io?.emit('community:post_metrics_updated', { postId, metric: 'like' }); } catch(e){}

    processThresholds(postId, io).catch(e => console.error('Threshold processing error:', e));

    return res.json({ success: true });
  } catch (error: any) {
    console.error('postLike error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const postUnlike = async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.id;
    const actorId = req.user?.id;
    if (!actorId) return res.status(401).json({ error: 'Unauthorized' });

    // Remove the actor-specific like event if exists
    const keyPrefix = `${postId}:like:${actorId}:${dayKey()}`;
    const ev = await prisma.gcoinEarningEvent.findFirst({ where: { eventKey: { startsWith: keyPrefix } } });
    if (ev) {
      await prisma.gcoinEarningEvent.delete({ where: { id: ev.id } });
      await prisma.communityPost.update({ where: { id: postId }, data: { likesCount: { decrement: 1 } as any } as any });
    }

    const io = (req.app as any).get('io');
    try { io?.emit('community:post_metrics_updated', { postId, metric: 'unlike' }); } catch(e){}

    return res.json({ success: true });
  } catch (error: any) {
    console.error('postUnlike error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ========== CommunityPost CRUD Endpoints ==========

// Get all community posts (feed)
export const getPosts = async (req: AuthRequest, res: Response) => {
  try {
    const { limit = 50, offset = 0, status = 'active' } = req.query;
    const userId = req.user?.id;

    const where: any = {
      status: status as string
    };

    const posts = await prisma.communityPost.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true
          }
        },
        _count: {
          select: {
            earningEvents: true
          }
        }
      },
      orderBy: [
        { isPinned: 'desc' },
        { createdAt: 'desc' }
      ],
      take: Number(limit),
      skip: Number(offset)
    });

    // Check which posts user liked (if authenticated)
    let likedPostIds = new Set<string>();
    if (userId) {
      const likes = await prisma.gcoinEarningEvent.findMany({
        where: {
          actorId: userId,
          eventType: 'like',
          postId: { in: posts.map(p => p.id) }
        },
        select: { postId: true }
      });
      likedPostIds = new Set(likes.map(l => l.postId));
    }

    const transformed = posts.map(post => ({
      id: post.id,
      authorId: post.authorId,
      authorName: post.author.name || 'Anonymous',
      authorAvatar: post.author.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.author.name || 'User')}`,
      title: post.title,
      content: post.content,
      attachments: post.attachments,
      viewsCount: post.viewsCount,
      likesCount: post.likesCount,
      sharesCount: post.sharesCount,
      repostsCount: post.repostsCount,
      status: post.status,
      isPinned: post.isPinned,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      interactions: {
        views: post.viewsCount,
        likes: post.likesCount,
        shares: post.sharesCount,
        reposts: post.repostsCount
      },
      userState: {
        liked: likedPostIds.has(post.id),
        reposted: false // TODO: implement repost tracking
      }
    }));

    return res.json({ success: true, data: transformed });
  } catch (error: any) {
    console.error('Get posts error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get single post by ID
export const getPostById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const post = await prisma.communityPost.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
            gcoinWallet: {
              select: {
                recipientId: true
              }
            }
          }
        },
        _count: {
          select: {
            earningEvents: true
          }
        }
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if user liked this post
    let isLiked = false;
    if (userId) {
      const like = await prisma.gcoinEarningEvent.findFirst({
        where: {
          actorId: userId,
          eventType: 'like',
          postId: id
        }
      });
      isLiked = !!like;
    }

    const transformed = {
      id: post.id,
      authorId: post.authorId,
      authorName: post.author.name || 'Anonymous',
      authorAvatar: post.author.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.author.name || 'User')}`,
      authorRecipientId: post.author.gcoinWallet?.recipientId || null,
      title: post.title,
      content: post.content,
      attachments: post.attachments,
      viewsCount: post.viewsCount,
      likesCount: post.likesCount,
      sharesCount: post.sharesCount,
      repostsCount: post.repostsCount,
      status: post.status,
      isPinned: post.isPinned,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      interactions: {
        views: post.viewsCount,
        likes: post.likesCount,
        shares: post.sharesCount,
        reposts: post.repostsCount
      },
      userState: {
        liked: isLiked,
        reposted: false
      }
    };

    return res.json({ success: true, data: transformed });
  } catch (error: any) {
    console.error('Get post by ID error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Create community post
export const createPost = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { title, content, attachments, status = 'active' } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const post = await prisma.communityPost.create({
      data: {
        authorId: userId,
        title: title || null,
        content: content.trim(),
        attachments: attachments || [],
        status: status
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
            gcoinWallet: {
              select: {
                recipientId: true
              }
            }
          }
        }
      }
    });

    const io = getAppIo(req);

    const payload = {
      id: post.id,
      authorId: post.authorId,
      authorName: post.author.name || 'Anonymous',
      authorAvatar: post.author.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.author.name || 'User')}`,
      authorRecipientId: post.author.gcoinWallet?.recipientId || null,
      title: post.title,
      content: post.content,
      attachments: post.attachments,
      viewsCount: 0,
      likesCount: 0,
      sharesCount: 0,
      repostsCount: 0,
      status: post.status,
      isPinned: false,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      interactions: {
        views: 0,
        likes: 0,
        shares: 0,
        reposts: 0
      },
      userState: {
        liked: false,
        reposted: false
      }
    };

    try {
      io?.emit('community:post_created', { post: payload });
    } catch (e) {
      console.error('Socket emit error (post_created):', e);
    }

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Create post error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Update community post
export const updatePost = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { title, content, attachments, status } = req.body;

    const post = await prisma.communityPost.findUnique({
      where: { id }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check permissions: owner or admin/moderator
    if (post.authorId !== userId && req.user?.role !== 'ADMIN' && req.user?.role !== 'MODERATOR') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content.trim();
    if (attachments !== undefined) updateData.attachments = attachments;
    if (status !== undefined && (req.user?.role === 'ADMIN' || req.user?.role === 'MODERATOR')) {
      updateData.status = status;
    }

    const updated = await prisma.communityPost.update({
      where: { id },
      data: updateData,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
            gcoinWallet: {
              select: {
                recipientId: true
              }
            }
          }
        }
      }
    });

    const io = getAppIo(req);

    const payload = {
      id: updated.id,
      authorId: updated.authorId,
      authorName: updated.author.name || 'Anonymous',
      authorAvatar: updated.author.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(updated.author.name || 'User')}`,
      authorRecipientId: updated.author.gcoinWallet?.recipientId || null,
      title: updated.title,
      content: updated.content,
      attachments: updated.attachments,
      viewsCount: updated.viewsCount,
      likesCount: updated.likesCount,
      sharesCount: updated.sharesCount,
      repostsCount: updated.repostsCount,
      status: updated.status,
      isPinned: updated.isPinned,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      interactions: {
        views: updated.viewsCount,
        likes: updated.likesCount,
        shares: updated.sharesCount,
        reposts: updated.repostsCount
      },
      userState: {
        liked: false,
        reposted: false
      }
    };

    try {
      io?.emit('community:post_updated', { post: payload });
    } catch (e) {
      console.error('Socket emit error (post_updated):', e);
    }

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Update post error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Delete community post
export const deletePost = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    const post = await prisma.communityPost.findUnique({
      where: { id }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check permissions: owner or admin/moderator
    if (post.authorId !== userId && req.user?.role !== 'ADMIN' && req.user?.role !== 'MODERATOR') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Soft delete: set status to 'deleted' instead of actually deleting
    await prisma.communityPost.update({
      where: { id },
      data: { status: 'deleted' }
    });

    const io = getAppIo(req);

    try {
      io?.emit('community:post_deleted', { postId: id });
    } catch (e) {
      console.error('Socket emit error (post_deleted):', e);
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete post error:', error);
    return res.status(500).json({ error: error.message });
  }
};
