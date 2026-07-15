/**
 * Platform knowledge graph layer (read-only, no schema migration).
 * Assembles permission-safe public relationship nodes for Scrolitha reasoning.
 */
import prisma from '../../utils/prismaClient';
import { canUserViewPostForNotification } from '../engagementNotifications.service';
import { scrolithaCache } from './scrolitha.cache';

export type GraphNodeType =
  | 'post'
  | 'comment'
  | 'user'
  | 'community'
  | 'company'
  | 'job'
  | 'gig'
  | 'skill'
  | 'event'
  | 'page'
  | 'organization';

export type GraphNode = {
  type: GraphNodeType;
  id: string;
  label: string;
  summary?: string | null;
  publicFields?: Record<string, string | number | boolean | null>;
  relation?: string;
};

export type PlatformGraphSnapshot = {
  anchor: { type: GraphNodeType; id: string };
  nodes: GraphNode[];
  edges: Array<{ from: string; to: string; relation: string }>;
  sourceLabels: string[];
  cacheHit: boolean;
  builtAt: string;
};

const text = (v: unknown) => String(v || '').trim();
const truncate = (value: string, max: number) => {
  const s = String(value || '');
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
};

const nodeKey = (type: string, id: string) => `${type}:${id}`;

const GRAPH_TTL_MS = 45_000;

/**
 * Build a bounded public graph around a post (primary intelligence anchor).
 */
export const buildPostPlatformGraph = async (input: {
  postId: string;
  viewerUserId: string;
  maxNodes?: number;
}): Promise<PlatformGraphSnapshot | null> => {
  const postId = text(input.postId);
  const viewerUserId = text(input.viewerUserId);
  const maxNodes = Math.max(6, Math.min(40, Number(input.maxNodes) || 18));
  if (!postId || !viewerUserId) return null;

  const cacheKey = `scrolitha:graph:post:${postId}:${viewerUserId}`;
  const cached = scrolithaCache.get<PlatformGraphSnapshot>(cacheKey);
  if (cached) return { ...cached, cacheHit: true };

  const post = await prisma.communityPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      title: true,
      content: true,
      visibility: true,
      status: true,
      tags: true,
      topic: true,
      authorId: true,
      mentions: true,
      businessPageId: true,
      clubId: true,
      createdAt: true,
      updatedAt: true,
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          isVerified: true,
          profile: { select: { title: true, bio: true, skills: true, location: true } }
        }
      },
      businessPage: {
        select: {
          id: true,
          name: true,
          handle: true,
          tagline: true,
          description: true,
          industry: true,
          status: true,
          location: true
        }
      },
      club: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          status: true
        }
      }
    }
  });

  if (!post || post.status === 'deleted' || post.status === 'draft') return null;

  const canView = await canUserViewPostForNotification(
    { authorId: post.authorId, visibility: post.visibility, mentions: post.mentions },
    viewerUserId
  );
  if (!canView) return null;

  // Block checks
  try {
    const blockDelegate = (prisma as any)?.userBlock;
    if (blockDelegate?.findFirst) {
      const blocked = await blockDelegate.findFirst({
        where: {
          OR: [
            { blockerId: post.authorId, blockedId: viewerUserId },
            { blockerId: viewerUserId, blockedId: post.authorId }
          ]
        },
        select: { id: true }
      });
      if (blocked) return null;
    }
  } catch {
    // optional
  }

  const nodes: GraphNode[] = [];
  const edges: PlatformGraphSnapshot['edges'] = [];
  const sourceLabels: string[] = [];

  const pushNode = (node: GraphNode, edgeFrom?: string, relation?: string) => {
    if (nodes.length >= maxNodes) return;
    if (nodes.some((n) => n.type === node.type && n.id === node.id)) return;
    nodes.push(node);
    if (edgeFrom && relation) {
      edges.push({ from: edgeFrom, to: nodeKey(node.type, node.id), relation });
    }
  };

  const postNodeKey = nodeKey('post', post.id);
  pushNode({
    type: 'post',
    id: post.id,
    label: post.title || truncate(post.content, 80) || 'Post',
    summary: truncate(post.content, 500),
    publicFields: {
      visibility: post.visibility,
      topic: post.topic || null,
      tags: (post.tags || []).slice(0, 8).join(', ') || null,
      createdAt: post.createdAt.toISOString()
    }
  });
  sourceLabels.push('Public post');

  if (post.author) {
    pushNode(
      {
        type: 'user',
        id: post.author.id,
        label: post.author.name || post.author.username || 'Author',
        summary: post.author.profile?.bio ? truncate(post.author.profile.bio, 240) : null,
        publicFields: {
          username: post.author.username,
          isVerified: Boolean(post.author.isVerified),
          title: post.author.profile?.title || null,
          location: post.author.profile?.location || null,
          skills: (post.author.profile?.skills || []).slice(0, 10).join(', ') || null
        },
        relation: 'author'
      },
      postNodeKey,
      'authored_by'
    );
    sourceLabels.push(
      post.author.isVerified ? 'Verified Scrolith profile' : 'Scrolith public profile'
    );

    for (const skill of (post.author.profile?.skills || []).slice(0, 5)) {
      const skillId = skill.toLowerCase().replace(/\s+/g, '-').slice(0, 40);
      pushNode(
        {
          type: 'skill',
          id: skillId,
          label: skill,
          summary: null,
          relation: 'skill'
        },
        nodeKey('user', post.author.id),
        'has_skill'
      );
    }

    // Public gigs by author
    try {
      const gigs = await prisma.gig.findMany({
        where: {
          userId: post.author.id,
          isActive: true,
          status: 'APPROVED' as any,
          adminStatus: 'APPROVED' as any
        },
        take: 3,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          tags: true,
          rating: true
        }
      });
      for (const gig of gigs) {
        pushNode(
          {
            type: 'gig',
            id: gig.id,
            label: gig.title,
            summary: truncate(gig.description, 220),
            publicFields: {
              price: gig.price,
              tags: (gig.tags || []).slice(0, 6).join(', ') || null,
              rating: gig.rating ?? null
            },
            relation: 'service'
          },
          nodeKey('user', post.author.id),
          'offers_service'
        );
        sourceLabels.push('Public service listing');
      }
    } catch {
      // gig status enums may differ — soft fail
      try {
        const gigs = await prisma.gig.findMany({
          where: { userId: post.author.id, isActive: true },
          take: 2,
          orderBy: { updatedAt: 'desc' },
          select: { id: true, title: true, description: true, price: true, tags: true }
        });
        for (const gig of gigs) {
          pushNode(
            {
              type: 'gig',
              id: gig.id,
              label: gig.title,
              summary: truncate(gig.description, 220),
              publicFields: { price: gig.price },
              relation: 'service'
            },
            nodeKey('user', post.author.id),
            'offers_service'
          );
        }
      } catch {
        // ignore
      }
    }

    // Public jobs by author (as client)
    try {
      const jobs = await prisma.job.findMany({
        where: {
          clientId: post.author.id,
          isActive: true,
          isVisible: true,
          visibility: 'PUBLIC' as any
        },
        take: 3,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          budget: true,
          tags: true,
          experienceLevel: true,
          type: true
        }
      });
      for (const job of jobs) {
        pushNode(
          {
            type: 'job',
            id: job.id,
            label: job.title,
            summary: truncate(job.description, 220),
            publicFields: {
              budget: job.budget || null,
              tags: (job.tags || []).slice(0, 6).join(', ') || null,
              experienceLevel: job.experienceLevel || null,
              type: String(job.type || '')
            },
            relation: 'job'
          },
          nodeKey('user', post.author.id),
          'posted_job'
        );
        sourceLabels.push('Public job information');
      }
    } catch {
      // ignore
    }
  }

  if (post.businessPage && post.businessPage.status === 'active') {
    pushNode(
      {
        type: 'company',
        id: post.businessPage.id,
        label: post.businessPage.name,
        summary: truncate(
          post.businessPage.tagline || post.businessPage.description || '',
          240
        ),
        publicFields: {
          handle: post.businessPage.handle,
          industry: post.businessPage.industry || null,
          location: post.businessPage.location || null
        },
        relation: 'page'
      },
      postNodeKey,
      'posted_on_page'
    );
    sourceLabels.push('Public company page');
  }

  if (post.club && String(post.club.status || '').toLowerCase() !== 'deleted') {
    pushNode(
      {
        type: 'community',
        id: post.club.id,
        label: post.club.name,
        summary: post.club.description ? truncate(post.club.description, 220) : null,
        publicFields: { slug: post.club.slug || null },
        relation: 'community'
      },
      postNodeKey,
      'in_community'
    );
    sourceLabels.push('Community metadata');
  }

  // Recent public comments (active only)
  try {
    const comments = await prisma.communityPostComment.findMany({
      where: { postId: post.id, status: 'active' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        content: true,
        parentId: true,
        author: { select: { id: true, name: true, username: true } }
      }
    });
    for (const c of comments.reverse()) {
      pushNode(
        {
          type: 'comment',
          id: c.id,
          label: c.author?.name || c.author?.username || 'Commenter',
          summary: truncate(c.content, 180),
          publicFields: {
            parentId: c.parentId,
            authorUsername: c.author?.username || null
          },
          relation: 'comment'
        },
        postNodeKey,
        c.parentId ? 'reply_in_thread' : 'comment_on_post'
      );
    }
    if (comments.length) sourceLabels.push('Public comment thread');
  } catch {
    // ignore
  }

  const snapshot: PlatformGraphSnapshot = {
    anchor: { type: 'post', id: post.id },
    nodes,
    edges,
    sourceLabels: Array.from(new Set(sourceLabels)),
    cacheHit: false,
    builtAt: new Date().toISOString()
  };

  scrolithaCache.set(cacheKey, snapshot, GRAPH_TTL_MS);
  return snapshot;
};

/**
 * Build a bounded public graph around a user (professional + services + jobs + communities).
 * Permission-safe: only public fields; no private messages or hidden data.
 */
export const buildUserPlatformGraph = async (input: {
  userId: string;
  viewerUserId: string;
  maxNodes?: number;
}): Promise<PlatformGraphSnapshot | null> => {
  const userId = text(input.userId);
  const viewerUserId = text(input.viewerUserId);
  const maxNodes = Math.max(6, Math.min(40, Number(input.maxNodes) || 20));
  if (!userId || !viewerUserId) return null;

  const cacheKey = `scrolitha:graph:user:${userId}:${viewerUserId}`;
  const cached = scrolithaCache.get<PlatformGraphSnapshot>(cacheKey);
  if (cached) return { ...cached, cacheHit: true };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      isVerified: true,
      profile: { select: { title: true, bio: true, skills: true, location: true } }
    }
  });
  if (!user) return null;

  const nodes: GraphNode[] = [];
  const edges: PlatformGraphSnapshot['edges'] = [];
  const sourceLabels: string[] = [];
  const anchorKey = nodeKey('user', user.id);

  const pushNode = (node: GraphNode, edgeFrom?: string, relation?: string) => {
    if (nodes.length >= maxNodes) return;
    if (nodes.some((n) => n.type === node.type && n.id === node.id)) return;
    nodes.push(node);
    if (edgeFrom && relation) {
      edges.push({ from: edgeFrom, to: nodeKey(node.type, node.id), relation });
    }
  };

  pushNode({
    type: 'user',
    id: user.id,
    label: user.name || user.username || 'User',
    summary: user.profile?.bio ? truncate(user.profile.bio, 240) : null,
    publicFields: {
      username: user.username,
      isVerified: Boolean(user.isVerified),
      title: user.profile?.title || null,
      location: user.profile?.location || null,
      skills: (user.profile?.skills || []).slice(0, 12).join(', ') || null
    }
  });
  sourceLabels.push(user.isVerified ? 'Verified Scrolith profile' : 'Scrolith public profile');

  for (const skill of (user.profile?.skills || []).slice(0, 8)) {
    const skillId = skill.toLowerCase().replace(/\s+/g, '-').slice(0, 40);
    pushNode(
      {
        type: 'skill',
        id: skillId,
        label: skill,
        relation: 'skill'
      },
      anchorKey,
      'has_skill'
    );
  }

  // Public services
  try {
    const gigs = await prisma.gig.findMany({
      where: { userId: user.id, isActive: true },
      take: 4,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, description: true, price: true, tags: true, updatedAt: true }
    });
    for (const gig of gigs) {
      pushNode(
        {
          type: 'gig',
          id: gig.id,
          label: gig.title,
          summary: truncate(gig.description, 200),
          publicFields: {
            price: gig.price,
            tags: (gig.tags || []).slice(0, 6).join(', ') || null,
            updatedAt: gig.updatedAt?.toISOString?.() || null
          },
          relation: 'service'
        },
        anchorKey,
        'offers_service'
      );
      sourceLabels.push('Public service listing');
    }
  } catch {
    // ignore
  }

  // Public jobs posted
  try {
    const jobs = await prisma.job.findMany({
      where: {
        clientId: user.id,
        isActive: true,
        isVisible: true
      },
      take: 4,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        budget: true,
        tags: true,
        updatedAt: true
      }
    });
    for (const job of jobs) {
      pushNode(
        {
          type: 'job',
          id: job.id,
          label: job.title,
          summary: truncate(job.description, 200),
          publicFields: {
            budget: job.budget || null,
            tags: (job.tags || []).slice(0, 6).join(', ') || null,
            updatedAt: job.updatedAt?.toISOString?.() || null
          },
          relation: 'job'
        },
        anchorKey,
        'posted_job'
      );
      sourceLabels.push('Public job information');
    }
  } catch {
    // ignore
  }

  // Communities (clubs) the user is linked to via recent posts
  try {
    const posts = await prisma.communityPost.findMany({
      where: {
        authorId: user.id,
        status: 'active',
        visibility: { in: ['public', 'PUBLIC', 'Public'] as any }
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        content: true,
        clubId: true,
        businessPageId: true,
        club: { select: { id: true, name: true, slug: true, description: true, status: true } },
        businessPage: {
          select: { id: true, name: true, handle: true, industry: true, status: true }
        }
      }
    });
    for (const p of posts) {
      pushNode(
        {
          type: 'post',
          id: p.id,
          label: p.title || truncate(p.content, 60),
          summary: truncate(p.content, 160),
          relation: 'post'
        },
        anchorKey,
        'authored_post'
      );
      if (p.club && String(p.club.status || '').toLowerCase() !== 'deleted') {
        pushNode(
          {
            type: 'community',
            id: p.club.id,
            label: p.club.name,
            summary: p.club.description ? truncate(p.club.description, 180) : null,
            publicFields: { slug: p.club.slug || null },
            relation: 'community'
          },
          nodeKey('post', p.id),
          'in_community'
        );
        edges.push({
          from: anchorKey,
          to: nodeKey('community', p.club.id),
          relation: 'participates_in'
        });
        sourceLabels.push('Community metadata');
      }
      if (p.businessPage && p.businessPage.status === 'active') {
        pushNode(
          {
            type: 'company',
            id: p.businessPage.id,
            label: p.businessPage.name,
            publicFields: {
              handle: p.businessPage.handle,
              industry: p.businessPage.industry || null
            },
            relation: 'organization'
          },
          nodeKey('post', p.id),
          'posted_on_page'
        );
        edges.push({
          from: anchorKey,
          to: nodeKey('company', p.businessPage.id),
          relation: 'associated_with'
        });
        sourceLabels.push('Public company page');
      }
    }
  } catch {
    // ignore
  }

  // Relationship edges: co-skill users (lightweight public discovery)
  try {
    const skills = (user.profile?.skills || []).slice(0, 3);
    if (skills.length) {
      // Soft: no heavy query if skills empty; skip cross-user for privacy scale
      for (const skill of skills) {
        edges.push({
          from: anchorKey,
          to: nodeKey('skill', skill.toLowerCase().replace(/\s+/g, '-').slice(0, 40)),
          relation: 'related_skill'
        });
      }
    }
  } catch {
    // ignore
  }

  const snapshot: PlatformGraphSnapshot = {
    anchor: { type: 'user', id: user.id },
    nodes,
    edges: edges.slice(0, 60),
    sourceLabels: Array.from(new Set(sourceLabels)),
    cacheHit: false,
    builtAt: new Date().toISOString()
  };

  scrolithaCache.set(cacheKey, snapshot, GRAPH_TTL_MS);
  return snapshot;
};

/**
 * Compact prompt serialization for LLM (bounded).
 */
export const serializeGraphForPrompt = (graph: PlatformGraphSnapshot | null, maxChars = 2800): string => {
  if (!graph?.nodes?.length) return '';
  const lines = graph.nodes.slice(0, 18).map((n) => {
    const fields = n.publicFields
      ? Object.entries(n.publicFields)
          .filter(([, v]) => v !== null && v !== undefined && v !== '')
          .map(([k, v]) => `${k}=${v}`)
          .join('; ')
      : '';
    return `- [${n.type}] ${n.label}${n.summary ? `: ${n.summary}` : ''}${fields ? ` {${fields}}` : ''}`;
  });
  const body = [
    `Anchor: ${graph.anchor.type}:${graph.anchor.id}`,
    `Sources: ${graph.sourceLabels.join(', ')}`,
    'Nodes:',
    ...lines
  ].join('\n');
  if (body.length <= maxChars) return body;
  return `${body.slice(0, maxChars - 1)}…`;
};

export const searchPublicEntitiesByQuery = async (input: {
  query: string;
  viewerUserId: string;
  limit?: number;
}): Promise<GraphNode[]> => {
  const q = text(input.query);
  if (q.length < 2) return [];
  const limit = Math.max(1, Math.min(8, Number(input.limit) || 5));
  const nodes: GraphNode[] = [];

  try {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { username: { contains: q, mode: 'insensitive' } }
        ]
      },
      take: limit,
      select: {
        id: true,
        name: true,
        username: true,
        isVerified: true,
        profile: { select: { title: true, skills: true } }
      }
    });
    for (const u of users) {
      nodes.push({
        type: 'user',
        id: u.id,
        label: u.name || u.username || 'User',
        summary: u.profile?.title || null,
        publicFields: {
          username: u.username,
          isVerified: Boolean(u.isVerified),
          skills: (u.profile?.skills || []).slice(0, 6).join(', ') || null
        }
      });
    }
  } catch {
    // ignore
  }

  try {
    const pages = await prisma.communityBusinessPage.findMany({
      where: {
        status: 'active',
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { handle: { contains: q, mode: 'insensitive' } }
        ]
      },
      take: limit,
      select: { id: true, name: true, handle: true, tagline: true, industry: true }
    });
    for (const p of pages) {
      nodes.push({
        type: 'company',
        id: p.id,
        label: p.name,
        summary: p.tagline || null,
        publicFields: { handle: p.handle, industry: p.industry || null }
      });
    }
  } catch {
    // ignore
  }

  try {
    const jobs = await prisma.job.findMany({
      where: {
        isActive: true,
        isVisible: true,
        title: { contains: q, mode: 'insensitive' }
      },
      take: limit,
      select: { id: true, title: true, description: true, budget: true }
    });
    for (const j of jobs) {
      nodes.push({
        type: 'job',
        id: j.id,
        label: j.title,
        summary: truncate(j.description, 160),
        publicFields: { budget: j.budget || null }
      });
    }
  } catch {
    // ignore
  }

  return nodes.slice(0, limit * 2);
};
