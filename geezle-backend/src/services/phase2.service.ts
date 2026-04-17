import prisma from '../utils/prismaClient';

type DiscoveryMode = 'for_you' | 'following' | 'hire' | 'sell' | 'learn' | 'local';

type DiscoveryInput = {
  query?: unknown;
  mode?: unknown;
  viewerId?: string | null;
  limit?: unknown;
};

type WorkOsPlanInput = {
  goal?: string;
  context?: Record<string, any> | null;
  roomId?: string | null;
};

type CollaborationRoomInput = {
  title?: string;
  topic?: string;
  participantIds?: unknown;
  sourceType?: string;
  sourceId?: string;
  metadata?: Record<string, any> | null;
};

const clean = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();
const lower = (value: unknown) => clean(value).toLowerCase();
const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
};

const normalizeMode = (value: unknown): DiscoveryMode => {
  const next = lower(value);
  if (['for_you', 'following', 'hire', 'sell', 'learn', 'local'].includes(next)) return next as DiscoveryMode;
  return 'for_you';
};

const containsFilter = (query: string) => ({ contains: query, mode: 'insensitive' as const });

const scoreTextMatch = (query: string, ...values: unknown[]) => {
  if (!query) return 0;
  const q = query.toLowerCase();
  let score = 0;
  values.forEach((value, index) => {
    const text = lower(value);
    if (!text) return;
    if (text === q) score += 70 - index * 5;
    else if (text.startsWith(q)) score += 44 - index * 4;
    else if (text.includes(q)) score += 26 - index * 3;
  });
  return score;
};

const scoreFreshness = (createdAt?: Date | string | null) => {
  if (!createdAt) return 0;
  const ageHours = Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 36e5);
  if (ageHours <= 24) return 18;
  if (ageHours <= 72) return 12;
  if (ageHours <= 168) return 7;
  return 2;
};

const uniq = <T>(items: T[]) => Array.from(new Set(items.filter(Boolean)));

const normalizeTags = (items: unknown) =>
  Array.isArray(items)
    ? items.map((entry) => clean(entry)).filter(Boolean).slice(0, 8)
    : [];

const resolveViewerSignals = async (viewerId?: string | null) => {
  const id = clean(viewerId);
  if (!id) {
    return {
      followedUserIds: [] as string[],
      followedPageIds: [] as string[],
      interestedPostIds: [] as string[]
    };
  }

  const [follows, pageFollows, feedback] = await Promise.all([
    prisma.userFollow.findMany({
      where: { followerId: id },
      select: { followeeId: true },
      take: 500
    }),
    prisma.communityBusinessPageFollower.findMany({
      where: { userId: id },
      select: { pageId: true },
      take: 500
    }),
    prisma.communityPostFeedback.findMany({
      where: { userId: id, signal: 'INTERESTED' },
      select: { postId: true },
      take: 200
    }).catch(() => [])
  ]);

  return {
    followedUserIds: uniq(follows.map((row) => row.followeeId)),
    followedPageIds: uniq(pageFollows.map((row) => row.pageId)),
    interestedPostIds: uniq(feedback.map((row: any) => row.postId))
  };
};

const buildWhy = (signals: Array<string | false | null | undefined>) =>
  signals.filter(Boolean).slice(0, 4) as string[];

export const getDiscoveryV2 = async (input: DiscoveryInput) => {
  const mode = normalizeMode(input.mode);
  const query = clean(input.query);
  const limit = clampInt(input.limit, 24, 4, 60);
  const signals = await resolveViewerSignals(input.viewerId);
  const hasQuery = query.length >= 2;
  const queryFilter = hasQuery ? containsFilter(query) : null;

  const postWhere: any = {
    status: 'active',
    visibility: 'public'
  };
  if (queryFilter) {
    postWhere.OR = [
      { title: queryFilter },
      { content: queryFilter },
      { topic: queryFilter },
      { location: queryFilter }
    ];
  }
  if (mode === 'following') {
    const followingFilters = [
      ...(postWhere.OR || []),
      ...(signals.followedUserIds.length ? [{ authorId: { in: signals.followedUserIds } }] : []),
      ...(signals.followedPageIds.length ? [{ businessPageId: { in: signals.followedPageIds } }] : [])
    ];
    if (followingFilters.length) postWhere.OR = followingFilters;
  }

  const [posts, jobs, gigs, pages, people] = await Promise.all([
    prisma.communityPost.findMany({
      where: postWhere,
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: Math.max(limit, 40),
      select: {
        id: true,
        title: true,
        content: true,
        tags: true,
        topic: true,
        location: true,
        authorId: true,
        businessPageId: true,
        viewsCount: true,
        likesCount: true,
        sharesCount: true,
        repostsCount: true,
        isPinned: true,
        isHighlighted: true,
        createdAt: true,
        author: { select: { id: true, name: true, username: true, avatar: true, role: true } },
        businessPage: { select: { id: true, name: true, slug: true, handle: true, tagline: true } }
      }
    }),
    prisma.job.findMany({
      where: {
        isActive: true,
        isVisible: true,
        ...(queryFilter ? { OR: [{ title: queryFilter }, { description: queryFilter }, { budget: queryFilter }] } : {})
      },
      orderBy: [{ isRecommended: 'desc' }, { createdAt: 'desc' }],
      take: mode === 'sell' ? 4 : Math.max(8, Math.ceil(limit / 3)),
      select: {
        id: true,
        title: true,
        description: true,
        budget: true,
        tags: true,
        categoryId: true,
        clientId: true,
        isFeatured: true,
        isRecommended: true,
        proposalsCount: true,
        createdAt: true,
        client: { select: { id: true, name: true, username: true, avatar: true } }
      }
    }),
    prisma.gig.findMany({
      where: {
        isActive: true,
        ...(queryFilter ? { OR: [{ title: queryFilter }, { description: queryFilter }, { subcategory: queryFilter }] } : {})
      },
      orderBy: [{ isRecommended: 'desc' }, { isFeatured: 'desc' }, { createdAt: 'desc' }],
      take: mode === 'hire' ? 4 : Math.max(8, Math.ceil(limit / 3)),
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        price: true,
        tags: true,
        categoryId: true,
        subcategory: true,
        userId: true,
        rating: true,
        reviewCount: true,
        isFeatured: true,
        isRecommended: true,
        createdAt: true,
        user: { select: { id: true, name: true, username: true, avatar: true } }
      }
    }),
    prisma.communityBusinessPage.findMany({
      where: {
        status: 'active',
        ...(queryFilter ? { OR: [{ name: queryFilter }, { handle: queryFilter }, { slug: queryFilter }, { tagline: queryFilter }] } : {})
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: Math.max(5, Math.ceil(limit / 4)),
      select: {
        id: true,
        name: true,
        handle: true,
        slug: true,
        tagline: true,
        category: true,
        industry: true,
        ownerId: true,
        city: true,
        country: true,
        updatedAt: true
      }
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        ...(queryFilter ? { OR: [{ name: queryFilter }, { username: queryFilter }] } : {})
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: Math.max(5, Math.ceil(limit / 4)),
      select: {
        id: true,
        name: true,
        username: true,
        avatar: true,
        role: true,
        isVerified: true,
        updatedAt: true
      }
    })
  ]);

  const items = [
    ...posts.map((post) => {
      const followed = signals.followedUserIds.includes(post.authorId) || Boolean(post.businessPageId && signals.followedPageIds.includes(post.businessPageId));
      const score =
        55 +
        scoreTextMatch(query, post.title, post.content, post.topic, post.location) +
        scoreFreshness(post.createdAt) +
        (post.isPinned ? 32 : 0) +
        (post.isHighlighted ? 18 : 0) +
        (followed ? 30 : 0) +
        (signals.interestedPostIds.includes(post.id) ? 20 : 0) +
        Math.min(22, Number(post.likesCount || 0) * 0.7 + Number(post.sharesCount || 0) * 1.4 + Number(post.repostsCount || 0) * 1.2 + Number(post.viewsCount || 0) * 0.03);
      return {
        id: post.id,
        type: 'post',
        title: clean(post.title) || clean(post.content).slice(0, 80) || 'Community post',
        description: clean(post.content).slice(0, 220),
        url: `/post/${post.id}`,
        score,
        why: buildWhy([
          followed && 'From your trust network',
          post.isHighlighted && 'Highlighted by Scrolith',
          post.topic && `Topic: ${post.topic}`,
          scoreFreshness(post.createdAt) >= 12 && 'Fresh post'
        ]),
        author: post.author,
        page: post.businessPage,
        tags: normalizeTags(post.tags),
        metrics: {
          likes: post.likesCount,
          shares: post.sharesCount,
          reposts: post.repostsCount,
          views: post.viewsCount
        },
        createdAt: post.createdAt
      };
    }),
    ...jobs.map((job) => ({
      id: job.id,
      type: 'job',
      title: job.title,
      description: clean(job.description).slice(0, 220),
      url: `/jobs/${job.id}`,
      score:
        42 +
        scoreTextMatch(query, job.title, job.description, job.budget) +
        scoreFreshness(job.createdAt) +
        (mode === 'hire' ? 30 : 0) +
        (job.isRecommended ? 18 : 0) +
        (job.isFeatured ? 14 : 0) +
        Math.min(15, Number(job.proposalsCount || 0)),
      why: buildWhy([
        mode === 'hire' && 'Hiring intent match',
        job.isRecommended && 'Recommended opportunity',
        job.budget && `Budget: ${job.budget}`
      ]),
      author: job.client,
      tags: normalizeTags(job.tags),
      createdAt: job.createdAt
    })),
    ...gigs.map((gig) => ({
      id: gig.id,
      type: 'gig',
      title: gig.title,
      description: clean(gig.description).slice(0, 220),
      url: `/gigs/${encodeURIComponent(gig.slug || gig.id)}`,
      score:
        42 +
        scoreTextMatch(query, gig.title, gig.description, gig.subcategory) +
        scoreFreshness(gig.createdAt) +
        (mode === 'sell' ? 30 : 0) +
        (gig.isRecommended ? 18 : 0) +
        (gig.isFeatured ? 14 : 0) +
        Math.min(20, Number(gig.rating || 0) * 3 + Number(gig.reviewCount || 0) * 0.4),
      why: buildWhy([
        mode === 'sell' && 'Seller discovery match',
        gig.isRecommended && 'Recommended service',
        Number.isFinite(Number(gig.price)) && `From $${Number(gig.price).toFixed(0)}`
      ]),
      author: gig.user,
      tags: normalizeTags(gig.tags),
      price: gig.price,
      createdAt: gig.createdAt
    })),
    ...pages.map((page) => ({
      id: page.id,
      type: 'page',
      title: page.name,
      description: page.tagline || page.industry || page.category || 'Business page',
      url: `/company/${encodeURIComponent(page.slug || page.handle || page.id)}`,
      score:
        34 +
        scoreTextMatch(query, page.name, page.handle, page.tagline, page.category, page.industry) +
        (signals.followedPageIds.includes(page.id) ? 28 : 0) +
        (mode === 'local' && (page.city || page.country) ? 20 : 0),
      why: buildWhy([
        signals.followedPageIds.includes(page.id) && 'Page you follow',
        mode === 'local' && (page.city || page.country) && `Local: ${[page.city, page.country].filter(Boolean).join(', ')}`,
        page.industry && `Industry: ${page.industry}`
      ]),
      meta: { handle: page.handle, category: page.category, industry: page.industry, location: [page.city, page.country].filter(Boolean).join(', ') || null },
      updatedAt: page.updatedAt
    })),
    ...people.map((user) => ({
      id: user.id,
      type: 'person',
      title: user.name || user.username || 'Scrolith member',
      description: user.username ? `@${user.username}` : user.role || 'Member',
      url: user.username ? `/u/${encodeURIComponent(user.username)}` : `/profile/${user.id}`,
      score:
        30 +
        scoreTextMatch(query, user.name, user.username, user.role) +
        (signals.followedUserIds.includes(user.id) ? 28 : 0) +
        (user.isVerified ? 12 : 0),
      why: buildWhy([
        signals.followedUserIds.includes(user.id) && 'Account you follow',
        user.isVerified && 'Verified identity',
        user.role && `Role: ${user.role}`
      ]),
      author: user,
      updatedAt: user.updatedAt
    }))
  ];

  const ranked = items
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return String(right.createdAt || right.updatedAt || '').localeCompare(String(left.createdAt || left.updatedAt || ''));
    })
    .slice(0, limit);

  const counts = ranked.reduce<Record<string, number>>((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {});

  return {
    mode,
    query,
    generatedAt: new Date().toISOString(),
    counts,
    personalization: {
      viewerId: input.viewerId || null,
      followingUsers: signals.followedUserIds.length,
      followingPages: signals.followedPageIds.length,
      interestedSignals: signals.interestedPostIds.length
    },
    items: ranked
  };
};

export const getTrustGraph = async (viewerId: string, targetUserId: string, options?: { includePrivate?: boolean }) => {
  const targetId = clean(targetUserId || viewerId);
  if (!targetId) throw new Error('User id is required');

  const [user, profile, following, followers, pageFollows, pageAdmins, conversations] = await Promise.all([
    prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, name: true, username: true, role: true, avatar: true, isVerified: true, kycStatus: true, isActive: true }
    }),
    prisma.trustProfile.findUnique({ where: { userId: targetId } }).catch(() => null),
    prisma.userFollow.findMany({
      where: { followerId: targetId },
      select: {
        followeeId: true,
        followee: { select: { id: true, name: true, username: true, role: true, avatar: true, isVerified: true } }
      },
      take: 80
    }),
    prisma.userFollow.findMany({
      where: { followeeId: targetId },
      select: {
        followerId: true,
        follower: { select: { id: true, name: true, username: true, role: true, avatar: true, isVerified: true } }
      },
      take: 80
    }),
    prisma.communityBusinessPageFollower.findMany({
      where: { userId: targetId },
      select: { page: { select: { id: true, name: true, slug: true, handle: true, category: true, industry: true } } },
      take: 80
    }),
    prisma.communityBusinessPageAdmin.findMany({
      where: { userId: targetId },
      select: { role: true, page: { select: { id: true, name: true, slug: true, handle: true, category: true, industry: true } } },
      take: 80
    }),
    prisma.conversation.findMany({
      where: {
        participants: { some: { userId: targetId, deletedAt: null } },
        type: 'GROUP'
      },
      include: {
        participants: {
          where: { deletedAt: null },
          select: { userId: true, user: { select: { id: true, name: true, username: true, role: true, avatar: true, isVerified: true } } }
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: 30
    })
  ]);

  if (!user?.id) throw new Error('User not found');

  const followingIds = new Set(following.map((entry) => entry.followeeId));
  const followerIds = new Set(followers.map((entry) => entry.followerId));
  const mutuals = following.filter((entry) => followerIds.has(entry.followeeId)).map((entry) => entry.followee);
  const collaborators = new Map<string, any>();
  conversations.forEach((conversation) => {
    conversation.participants.forEach((participant) => {
      if (participant.userId !== targetId) collaborators.set(participant.userId, participant.user);
    });
  });

  const trustTier =
    Number(profile?.score || 0) >= 85 ? 'excellent' :
    Number(profile?.score || 0) >= 70 ? 'strong' :
    Number(profile?.score || 0) >= 50 ? 'watch' :
    profile ? 'high_risk' : 'unrated';

  return {
    user,
    graph: {
      followers: followers.length,
      following: following.length,
      mutuals: mutuals.length,
      pagesFollowed: pageFollows.length,
      pagesManaged: pageAdmins.length,
      collaborationRooms: conversations.length,
      collaborators: collaborators.size
    },
    trust: {
      tier: trustTier,
      score: options?.includePrivate ? profile?.score ?? null : profile?.score ? Math.round(Number(profile.score) / 10) * 10 : null,
      riskLevel: options?.includePrivate ? profile?.riskLevel || null : undefined,
      isVerified: Boolean(user.isVerified),
      kycStatus: options?.includePrivate ? user.kycStatus || null : undefined,
      lastComputedAt: profile?.lastComputedAt || null
    },
    nodes: {
      mutuals: mutuals.slice(0, 12),
      following: following.map((entry) => entry.followee).slice(0, 12),
      followers: followers.map((entry) => entry.follower).slice(0, 12),
      pages: pageFollows.map((entry) => entry.page).slice(0, 12),
      managedPages: pageAdmins.map((entry) => ({ ...entry.page, adminRole: entry.role })).slice(0, 12),
      collaborators: Array.from(collaborators.values()).slice(0, 12)
    },
    edges: [
      ...following.slice(0, 40).map((entry) => ({ type: 'follows', from: targetId, to: entry.followeeId })),
      ...followers.slice(0, 40).map((entry) => ({ type: 'followed_by', from: entry.followerId, to: targetId })),
      ...pageFollows.slice(0, 40).map((entry) => ({ type: 'follows_page', from: targetId, to: entry.page.id })),
      ...Array.from(collaborators.keys()).slice(0, 40).map((id) => ({ type: 'collaborates_with', from: targetId, to: id }))
    ],
    generatedAt: new Date().toISOString()
  };
};

export const buildScrolithaWorkOsPlan = async (actor: { id: string; role?: string | null }, input: WorkOsPlanInput) => {
  const goal = clean(input.goal);
  if (goal.length < 4) throw new Error('A clear work goal is required');
  const role = lower(actor.role);
  const q = goal.slice(0, 120);
  const discovery = await getDiscoveryV2({
    query: q,
    viewerId: actor.id,
    mode: role.includes('client') || role.includes('employer') ? 'hire' : 'sell',
    limit: 8
  }).catch(() => null);

  const roomId = clean(input.roomId) || null;
  const milestones = [
    {
      key: 'scope',
      title: 'Scope and success definition',
      objective: 'Convert the goal into deliverables, owners, timeline, and acceptance criteria.',
      tasks: ['Capture requirements', 'Define success metrics', 'List risks and dependencies']
    },
    {
      key: 'assemble',
      title: 'Assemble trusted execution network',
      objective: 'Use Scrolith discovery and trust graph signals to select people, pages, services, and opportunities.',
      tasks: ['Review recommended talent/opportunities', 'Check trust graph signals', 'Open a collaboration room']
    },
    {
      key: 'execute',
      title: 'Execute with realtime operating rhythm',
      objective: 'Run work in a room with decisions, status updates, messages, files, and approvals in one place.',
      tasks: ['Create status cadence', 'Post first action update', 'Track blockers and next decisions']
    },
    {
      key: 'closeout',
      title: 'Closeout and compound reputation',
      objective: 'Lock final records, capture proof, request reviews, and publish learnings where appropriate.',
      tasks: ['Confirm completion criteria', 'Collect proof/review', 'Turn learnings into reusable knowledge']
    }
  ];

  return {
    goal,
    role: actor.role || 'user',
    roomId,
    generatedAt: new Date().toISOString(),
    operatingSystem: {
      mode: 'Scrolitha Work OS',
      cadence: 'daily async updates + milestone reviews',
      decisionLog: roomId ? `/api/collaboration/rooms/${roomId}` : null,
      guardrails: ['No off-platform payment routing', 'Use trust graph checks before high-risk collaboration', 'Keep approvals in auditable rooms']
    },
    milestones,
    discovery: discovery
      ? {
          query: discovery.query,
          mode: discovery.mode,
          items: discovery.items.slice(0, 6).map((item) => ({
            id: item.id,
            type: item.type,
            title: item.title,
            url: item.url,
            why: item.why
          }))
        }
      : null,
    recommendedActions: [
      { key: 'create_room', label: roomId ? 'Use current collaboration room' : 'Create a collaboration room', priority: 1 },
      { key: 'run_discovery', label: 'Run Search/Discovery 2.0 for talent, jobs, gigs, pages, and posts', priority: 2 },
      { key: 'review_trust_graph', label: 'Review trust graph before inviting collaborators', priority: 3 },
      { key: 'capture_first_update', label: 'Post a first status update with next owner and deadline', priority: 4 }
    ],
    context: input.context && typeof input.context === 'object' ? input.context : null
  };
};

const normalizeParticipantIds = (actorId: string, value: unknown) => {
  const source = Array.isArray(value) ? value : [];
  return uniq([actorId, ...source.map((entry) => clean(entry))]).slice(0, 32);
};

const extractRoomMeta = (messages: any[]) => {
  const system = messages.find((message) => message?.isSystem && message?.metadata?.scrolithCollaborationRoom);
  return system?.metadata?.scrolithCollaborationRoom || null;
};

const mapRoom = (conversation: any, viewerId?: string | null) => {
  const meta = extractRoomMeta(Array.isArray(conversation.messages) ? conversation.messages : []);
  const participants = (conversation.participants || []).map((entry: any) => ({
    userId: entry.userId,
    joinedAt: entry.joinedAt,
    label: entry.label,
    isMuted: Boolean(entry.isMuted),
    user: entry.user
      ? {
          id: entry.user.id,
          name: entry.user.name || entry.user.username || entry.user.email || 'Member',
          username: entry.user.username || '',
          avatar: entry.user.avatar || '',
          role: entry.user.role || ''
        }
      : null
  }));
  const lastMessage = Array.isArray(conversation.messages)
    ? [...conversation.messages].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;
  return {
    id: conversation.id,
    type: 'collaboration_room',
    title: meta?.title || conversation.lastMessageText || 'Collaboration room',
    topic: meta?.topic || '',
    sourceType: meta?.sourceType || null,
    sourceId: meta?.sourceId || null,
    participantCount: participants.length,
    participants,
    viewer: viewerId ? participants.find((entry: any) => entry.userId === viewerId) || null : null,
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          text: lastMessage.text,
          senderId: lastMessage.senderId,
          isSystem: Boolean(lastMessage.isSystem),
          createdAt: lastMessage.createdAt
        }
      : null,
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    metadata: meta || null
  };
};

export const listCollaborationRooms = async (userId: string, options?: { limit?: unknown }) => {
  const viewerId = clean(userId);
  if (!viewerId) throw new Error('Authentication required');
  const limit = clampInt(options?.limit, 30, 1, 80);
  const rows = await prisma.conversation.findMany({
    where: {
      type: 'GROUP',
      participants: { some: { userId: viewerId, deletedAt: null } }
    },
    include: {
      participants: {
        where: { deletedAt: null },
        include: { user: { select: { id: true, name: true, username: true, email: true, avatar: true, role: true } } }
      },
      messages: {
        orderBy: [{ createdAt: 'asc' }],
        take: 8,
        select: { id: true, text: true, senderId: true, isSystem: true, metadata: true, createdAt: true }
      }
    },
    orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
    take: limit
  });
  return rows.map((row) => mapRoom(row, viewerId));
};

export const getCollaborationRoom = async (userId: string, roomId: string) => {
  const viewerId = clean(userId);
  const id = clean(roomId);
  if (!viewerId || !id) throw new Error('Room id is required');
  const room = await prisma.conversation.findFirst({
    where: {
      id,
      type: 'GROUP',
      participants: { some: { userId: viewerId, deletedAt: null } }
    },
    include: {
      participants: {
        where: { deletedAt: null },
        include: { user: { select: { id: true, name: true, username: true, email: true, avatar: true, role: true } } }
      },
      messages: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 120,
        select: { id: true, text: true, senderId: true, isSystem: true, metadata: true, attachments: true, messageType: true, createdAt: true, editedAt: true, deletedAt: true }
      }
    }
  });
  if (!room?.id) throw new Error('Collaboration room not found');
  return mapRoom(room, viewerId);
};

export const createCollaborationRoom = async (actorId: string, input: CollaborationRoomInput) => {
  const ownerId = clean(actorId);
  if (!ownerId) throw new Error('Authentication required');
  const title = clean(input.title) || 'Scrolith collaboration room';
  const participantIds = normalizeParticipantIds(ownerId, input.participantIds);
  const users = await prisma.user.findMany({
    where: { id: { in: participantIds }, isActive: true },
    select: { id: true }
  });
  const validParticipantIds = normalizeParticipantIds(ownerId, users.map((user) => user.id));
  if (validParticipantIds.length < 1) throw new Error('At least one active participant is required');

  const now = new Date();
  const metadata = {
    title,
    topic: clean(input.topic),
    sourceType: clean(input.sourceType) || null,
    sourceId: clean(input.sourceId) || null,
    createdByUserId: ownerId,
    version: 1,
    ...(input.metadata && typeof input.metadata === 'object' ? input.metadata : {})
  };

  const room = await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.create({
      data: {
        type: 'GROUP',
        lastMessageText: `Collaboration room opened: ${title}`,
        lastMessageSenderId: ownerId,
        lastMessageAt: now,
        participants: {
          create: validParticipantIds.map((userId) => ({
            userId,
            label: userId === ownerId ? 'owner' : 'collaborator'
          }))
        }
      }
    });
    await tx.directMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: ownerId,
        text: `Collaboration room opened: ${title}`,
        isSystem: true,
        metadata: { scrolithCollaborationRoom: metadata }
      }
    });
    return conversation;
  });

  return getCollaborationRoom(ownerId, room.id);
};

export const recordCollaborationActivity = async (
  actorId: string,
  roomId: string,
  input: { text?: string; eventType?: string; metadata?: Record<string, any> | null }
) => {
  const viewerId = clean(actorId);
  const id = clean(roomId);
  const text = clean(input.text);
  if (!viewerId || !id) throw new Error('Room id is required');
  if (!text) throw new Error('Activity text is required');

  const membership = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: viewerId } },
    select: { id: true, deletedAt: true }
  });
  if (!membership?.id || membership.deletedAt) throw new Error('Collaboration room not found');

  const message = await prisma.directMessage.create({
    data: {
      conversationId: id,
      senderId: viewerId,
      text,
      isSystem: true,
      metadata: {
        collaborationEvent: {
          eventType: clean(input.eventType) || 'activity',
          ...(input.metadata && typeof input.metadata === 'object' ? input.metadata : {})
        }
      }
    }
  });

  await prisma.conversation.update({
    where: { id },
    data: {
      lastMessageText: text.slice(0, 160),
      lastMessageAt: message.createdAt,
      lastMessageSenderId: viewerId
    }
  });

  return { id: message.id, roomId: id, text: message.text, eventType: clean(input.eventType) || 'activity', createdAt: message.createdAt };
};
