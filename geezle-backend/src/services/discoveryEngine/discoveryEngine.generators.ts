/**
 * Modular candidate generators — full entity coverage matrix.
 * Unsupported domains return formal empty generators (no fake data).
 */
import prisma from '../../utils/prismaClient';
import type {
  DiscoveryEntityType,
  DiscoverySource,
  RecommendationCandidate
} from './discoveryEngine.types';
import type { ViewerInterestProfile } from './discoveryEngine.types';

const truncate = (s: string, max: number) =>
  s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;

export type GeneratorContext = {
  viewerId: string | null;
  profile: ViewerInterestProfile;
  blockedUserIds: Set<string>;
  entityTypes: Set<DiscoveryEntityType>;
  limitPerGenerator: number;
  query?: string;
  region?: string;
};

export type GeneratorResult = {
  name: string;
  source: DiscoverySource;
  candidates: RecommendationCandidate[];
  error?: string;
  latencyMs: number;
  supported: boolean;
  reason?: string;
};

const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`generator_timeout:${label}`)), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const runGenerator = async (
  name: string,
  source: DiscoverySource,
  fn: () => Promise<RecommendationCandidate[]>,
  timeoutMs = 2_500,
  supported = true
): Promise<GeneratorResult> => {
  const started = Date.now();
  if (!supported) {
    return {
      name,
      source,
      candidates: [],
      latencyMs: 0,
      supported: false,
      reason: 'domain_not_implemented'
    };
  }
  try {
    const candidates = await withTimeout(fn(), timeoutMs, name);
    return {
      name,
      source,
      candidates: candidates || [],
      latencyMs: Date.now() - started,
      supported: true
    };
  } catch (error: any) {
    return {
      name,
      source,
      candidates: [],
      error: String(error?.message || error || 'failed').slice(0, 160),
      latencyMs: Date.now() - started,
      supported: true
    };
  }
};

const wants = (ctx: GeneratorContext, ...types: DiscoveryEntityType[]) =>
  types.some((t) => ctx.entityTypes.has(t));

const unsupported = (name: string, source: DiscoverySource, reason: string): GeneratorResult => ({
  name,
  source,
  candidates: [],
  latencyMs: 0,
  supported: false,
  reason
});

export const generateRecentPosts = async (ctx: GeneratorContext): Promise<GeneratorResult> =>
  runGenerator('posts', 'recent', async () => {
    if (!wants(ctx, 'post', 'discussion')) return [];
    const posts = await prisma.communityPost.findMany({
      where: {
        status: 'active',
        visibility: { in: ['public', 'PUBLIC', 'Public'] as any }
      },
      orderBy: { createdAt: 'desc' },
      take: ctx.limitPerGenerator,
      select: {
        id: true,
        title: true,
        content: true,
        tags: true,
        topic: true,
        authorId: true,
        clubId: true,
        createdAt: true,
        updatedAt: true,
        viewCount: true,
        status: true,
        author: { select: { id: true, isVerified: true } }
      }
    });
    return posts
      .filter((p) => !ctx.blockedUserIds.has(p.authorId))
      .map((p) => ({
        entityType: 'post' as const,
        entityId: p.id,
        source: 'recent' as const,
        authorOrOwnerId: p.authorId,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        label: p.title || truncate(p.content, 80),
        summary: truncate(p.content, 180),
        tags: [...(p.tags || []), p.topic].filter(Boolean).map(String),
        category: p.topic || null,
        visibility: 'public',
        baseFeatures: {
          status: p.status,
          engagement: Math.min(1, Number(p.viewCount || 0) / 200),
          isVerified: Boolean(p.author?.isVerified),
          velocity: Math.min(1, Number(p.viewCount || 0) / 100),
          clubId: p.clubId || null,
          active: true
        }
      }));
  });

export const generateDiscussions = async (ctx: GeneratorContext): Promise<GeneratorResult> =>
  runGenerator('discussions', 'recent', async () => {
    if (!wants(ctx, 'discussion')) return [];
    // Discussions: forum threads when present, else empty
    try {
      const threads = await (prisma as any).forumThread?.findMany?.({
        where: { status: { in: ['open', 'active', 'published'] } },
        orderBy: { updatedAt: 'desc' },
        take: ctx.limitPerGenerator,
        select: {
          id: true,
          title: true,
          content: true,
          authorId: true,
          createdAt: true,
          updatedAt: true
        }
      });
      if (!threads?.length) {
        // Fallback: posts tagged as discussion-like
        return [];
      }
      return threads
        .filter((t: any) => !ctx.blockedUserIds.has(String(t.authorId || '')))
        .map((t: any) => ({
          entityType: 'discussion' as const,
          entityId: t.id,
          source: 'recent' as const,
          authorOrOwnerId: t.authorId,
          createdAt: t.createdAt?.toISOString?.() || null,
          updatedAt: t.updatedAt?.toISOString?.() || null,
          label: t.title || 'Discussion',
          summary: truncate(String(t.content || ''), 160),
          visibility: 'public',
          baseFeatures: { status: 'active', active: true }
        }));
    } catch {
      return [];
    }
  });

export const generateJobs = async (ctx: GeneratorContext): Promise<GeneratorResult> =>
  runGenerator('jobs', 'related_job', async () => {
    if (!wants(ctx, 'job')) return [];
    const jobs = await prisma.job.findMany({
      where: { isActive: true, isVisible: true } as any,
      orderBy: { updatedAt: 'desc' },
      take: ctx.limitPerGenerator,
      select: {
        id: true,
        title: true,
        description: true,
        tags: true,
        clientId: true,
        createdAt: true,
        updatedAt: true,
        experienceLevel: true,
        isActive: true,
        isVisible: true
      }
    });
    return jobs
      .filter((j) => !ctx.blockedUserIds.has(String(j.clientId || '')))
      .map((j) => ({
        entityType: 'job' as const,
        entityId: j.id,
        source: 'related_job' as const,
        authorOrOwnerId: j.clientId,
        createdAt: j.createdAt?.toISOString?.() || null,
        updatedAt: j.updatedAt?.toISOString?.() || null,
        label: j.title,
        summary: truncate(String(j.description || ''), 180),
        tags: (j.tags || []).map(String),
        category: j.experienceLevel || null,
        hrefHint: `/jobs/${j.id}`,
        visibility: 'public',
        baseFeatures: {
          completeness: j.description && j.title ? 0.8 : 0.4,
          engagement: 0.3,
          isActive: j.isActive !== false,
          isVisible: j.isVisible !== false,
          active: j.isActive !== false
        }
      }));
  });

export const generateServices = async (ctx: GeneratorContext): Promise<GeneratorResult> =>
  runGenerator('services', 'related_service', async () => {
    if (!wants(ctx, 'service')) return [];
    const gigs = await prisma.gig.findMany({
      where: { isActive: true } as any,
      orderBy: { updatedAt: 'desc' },
      take: ctx.limitPerGenerator,
      select: {
        id: true,
        title: true,
        description: true,
        tags: true,
        userId: true,
        rating: true,
        createdAt: true,
        updatedAt: true,
        isActive: true
      }
    });
    return gigs
      .filter((g) => !ctx.blockedUserIds.has(String(g.userId || '')))
      .map((g) => ({
        entityType: 'service' as const,
        entityId: g.id,
        source: 'related_service' as const,
        authorOrOwnerId: g.userId,
        createdAt: g.createdAt?.toISOString?.() || null,
        updatedAt: g.updatedAt?.toISOString?.() || null,
        label: g.title,
        summary: truncate(String(g.description || ''), 180),
        tags: (g.tags || []).map(String),
        hrefHint: `/gigs/${g.id}`,
        visibility: 'public',
        baseFeatures: {
          rating: Number(g.rating || 0),
          completeness: 0.7,
          engagement: Math.min(1, Number(g.rating || 0) / 5),
          active: g.isActive !== false
        }
      }));
  });

export const generatePeople = async (ctx: GeneratorContext): Promise<GeneratorResult> =>
  runGenerator('people', 'quality_creator', async () => {
    if (!wants(ctx, 'person')) return [];
    const users = await prisma.user.findMany({
      where: {
        id: ctx.viewerId ? { not: ctx.viewerId } : undefined
      } as any,
      orderBy: { updatedAt: 'desc' },
      take: Math.min(40, ctx.limitPerGenerator * 2),
      select: {
        id: true,
        name: true,
        username: true,
        isVerified: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
        role: true,
        profile: { select: { title: true, skills: true, bio: true, location: true } }
      }
    });
    return users
      .filter((u) => !ctx.blockedUserIds.has(u.id))
      .slice(0, ctx.limitPerGenerator)
      .map((u) => {
        const skills = u.profile?.skills || [];
        const completeness =
          (u.profile?.title ? 0.25 : 0) +
          (skills.length ? 0.35 : 0) +
          (u.profile?.bio ? 0.2 : 0) +
          (u.avatar ? 0.1 : 0) +
          (u.isVerified ? 0.1 : 0);
        return {
          entityType: 'person' as const,
          entityId: u.id,
          source: 'quality_creator' as const,
          authorOrOwnerId: u.id,
          createdAt: u.createdAt?.toISOString?.() || null,
          updatedAt: u.updatedAt?.toISOString?.() || null,
          label: u.name || u.username || 'Member',
          summary: u.profile?.title || truncate(String(u.profile?.bio || ''), 120),
          tags: skills.map(String),
          category: u.profile?.title || null,
          hrefHint: u.username ? `/u/${u.username}` : undefined,
          visibility: 'public',
          baseFeatures: {
            isVerified: Boolean(u.isVerified),
            completeness,
            engagement: 0.25,
            active: true,
            discoverable: true
          }
        };
      });
  });

export const generateFreelancers = async (ctx: GeneratorContext): Promise<GeneratorResult> =>
  runGenerator('freelancers', 'related_freelancer', async () => {
    if (!wants(ctx, 'freelancer')) return [];
    const users = await prisma.user.findMany({
      where: {
        id: ctx.viewerId ? { not: ctx.viewerId } : undefined,
        OR: [
          { role: { contains: 'freelancer', mode: 'insensitive' } as any },
          { role: { contains: 'FREELANCER' } as any }
        ]
      } as any,
      orderBy: { updatedAt: 'desc' },
      take: ctx.limitPerGenerator,
      select: {
        id: true,
        name: true,
        username: true,
        isVerified: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
        profile: { select: { title: true, skills: true, bio: true } }
      }
    });
    // If role filter too strict, fall back to people with skills
    const list =
      users.length > 0
        ? users
        : await prisma.user.findMany({
            where: { id: ctx.viewerId ? { not: ctx.viewerId } : undefined } as any,
            orderBy: { updatedAt: 'desc' },
            take: ctx.limitPerGenerator,
            select: {
              id: true,
              name: true,
              username: true,
              isVerified: true,
              avatar: true,
              createdAt: true,
              updatedAt: true,
              profile: { select: { title: true, skills: true, bio: true } }
            }
          });
    return list
      .filter((u) => !ctx.blockedUserIds.has(u.id) && (u.profile?.skills?.length || 0) > 0)
      .map((u) => ({
        entityType: 'freelancer' as const,
        entityId: u.id,
        source: 'related_freelancer' as const,
        authorOrOwnerId: u.id,
        createdAt: u.createdAt?.toISOString?.() || null,
        updatedAt: u.updatedAt?.toISOString?.() || null,
        label: u.name || u.username || 'Freelancer',
        summary: u.profile?.title || truncate(String(u.profile?.bio || ''), 120),
        tags: (u.profile?.skills || []).map(String),
        hrefHint: u.username ? `/u/${u.username}` : undefined,
        visibility: 'public',
        baseFeatures: {
          isVerified: Boolean(u.isVerified),
          completeness: 0.65,
          active: true,
          discoverable: true
        }
      }));
  });

export const generateCommunities = async (ctx: GeneratorContext): Promise<GeneratorResult> =>
  runGenerator('communities', 'related_community', async () => {
    if (!wants(ctx, 'community', 'group')) return [];
    const clubs = await prisma.communityClub.findMany({
      where: { status: 'active', visibility: 'PUBLIC' as any },
      orderBy: { updatedAt: 'desc' },
      take: ctx.limitPerGenerator,
      select: {
        id: true,
        name: true,
        slug: true,
        summary: true,
        description: true,
        category: true,
        visibility: true,
        status: true,
        memberCount: true,
        createdAt: true,
        updatedAt: true
      }
    });
    return clubs.map((c) => ({
      entityType: 'community' as const,
      entityId: c.id,
      source: 'related_community' as const,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      label: c.name,
      summary: c.summary || truncate(c.description || '', 160),
      tags: [c.slug, c.category].filter(Boolean).map(String),
      category: c.category || null,
      hrefHint: c.slug ? `/communities/${c.slug}` : undefined,
      visibility: String(c.visibility || 'public').toLowerCase(),
      baseFeatures: {
        status: c.status,
        active: c.status === 'active',
        engagement: Math.min(1, Number(c.memberCount || 0) / 100),
        completeness: c.description ? 0.7 : 0.4
      }
    }));
  });

export const generateGroups = async (ctx: GeneratorContext): Promise<GeneratorResult> =>
  runGenerator('groups', 'related_community', async () => {
    if (!wants(ctx, 'group')) return [];
    // Groups share CommunityClub model in this codebase
    const clubs = await prisma.communityClub.findMany({
      where: { status: 'active' },
      orderBy: { memberCount: 'desc' },
      take: ctx.limitPerGenerator,
      select: {
        id: true,
        name: true,
        slug: true,
        summary: true,
        description: true,
        visibility: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });
    return clubs
      .filter((c) => String(c.visibility) === 'PUBLIC' || String(c.visibility) === 'public')
      .map((c) => ({
        entityType: 'group' as const,
        entityId: c.id,
        source: 'related_community' as const,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        label: c.name,
        summary: c.summary || truncate(c.description || '', 160),
        tags: c.slug ? [c.slug] : [],
        hrefHint: c.slug ? `/groups/${c.slug}` : undefined,
        visibility: 'public',
        baseFeatures: { status: c.status, active: true }
      }));
  });

export const generateCompanies = async (ctx: GeneratorContext): Promise<GeneratorResult> =>
  runGenerator('companies', 'related_company', async () => {
    if (!wants(ctx, 'company', 'page')) return [];
    try {
      const pages = await (prisma as any).businessPage.findMany({
        where: { status: 'active' },
        orderBy: { updatedAt: 'desc' },
        take: ctx.limitPerGenerator,
        select: {
          id: true,
          name: true,
          handle: true,
          tagline: true,
          description: true,
          industry: true,
          status: true,
          createdAt: true,
          updatedAt: true
        }
      });
      return (pages || []).map((p: any) => ({
        entityType: (wants(ctx, 'company') ? 'company' : 'page') as 'company' | 'page',
        entityId: p.id,
        source: 'related_company' as const,
        createdAt: p.createdAt?.toISOString?.() || null,
        updatedAt: p.updatedAt?.toISOString?.() || null,
        label: p.name,
        summary: p.tagline || truncate(String(p.description || ''), 160),
        tags: p.industry ? [String(p.industry)] : [],
        category: p.industry || null,
        hrefHint: p.handle ? `/pages/${p.handle}` : undefined,
        visibility: 'public',
        baseFeatures: { status: p.status || 'active', active: true, completeness: 0.65 }
      }));
    } catch {
      return [];
    }
  });

export const generateMarketplace = async (ctx: GeneratorContext): Promise<GeneratorResult> =>
  runGenerator('marketplace', 'marketplace_relevance', async () => {
    if (!wants(ctx, 'marketplace_listing', 'product')) return [];
    const listings = await prisma.marketplaceListing.findMany({
      where: {
        status: 'active',
        reviewStatus: 'approved',
        removedAt: null,
        soldAt: null
      },
      orderBy: { updatedAt: 'desc' },
      take: ctx.limitPerGenerator,
      select: {
        id: true,
        title: true,
        description: true,
        tags: true,
        price: true,
        sellerId: true,
        quantity: true,
        status: true,
        reviewStatus: true,
        slug: true,
        viewCount: true,
        createdAt: true,
        updatedAt: true
      }
    });
    return listings
      .filter((l) => !ctx.blockedUserIds.has(l.sellerId) && l.quantity > 0)
      .map((l) => ({
        entityType: (wants(ctx, 'product') && !wants(ctx, 'marketplace_listing')
          ? 'product'
          : 'marketplace_listing') as 'product' | 'marketplace_listing',
        entityId: l.id,
        source: 'marketplace_relevance' as const,
        authorOrOwnerId: l.sellerId,
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
        label: l.title,
        summary: truncate(l.description, 160),
        tags: (l.tags || []).map(String),
        hrefHint: l.slug ? `/marketplace/${l.slug}` : undefined,
        visibility: 'public',
        baseFeatures: {
          status: l.status,
          reviewStatus: l.reviewStatus,
          quantity: l.quantity,
          engagement: Math.min(1, Number(l.viewCount || 0) / 100),
          active: true,
          available: l.quantity > 0,
          sold: false
        }
      }));
  });

export const generateInterestMatched = async (ctx: GeneratorContext): Promise<GeneratorResult> =>
  runGenerator('similar_interest', 'similar_interest', async () => {
    if (!ctx.profile.skills.length && !ctx.profile.topics.length) return [];
    if (!wants(ctx, 'post', 'job', 'service')) return [];
    const tokens = [...ctx.profile.skills, ...ctx.profile.topics].slice(0, 8);
    const posts = await prisma.communityPost.findMany({
      where: { status: 'active', visibility: { in: ['public', 'PUBLIC', 'Public'] as any } },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: {
        id: true,
        title: true,
        content: true,
        tags: true,
        topic: true,
        authorId: true,
        createdAt: true,
        updatedAt: true,
        status: true
      }
    });
    const lowerTokens = tokens.map((t) => t.toLowerCase());
    return posts
      .filter((p) => !ctx.blockedUserIds.has(p.authorId))
      .map((p) => {
        const blob = `${p.title || ''} ${p.content || ''} ${(p.tags || []).join(' ')} ${p.topic || ''}`.toLowerCase();
        const hits = lowerTokens.filter((t) => blob.includes(t)).length;
        return { p, hits };
      })
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, ctx.limitPerGenerator)
      .map(({ p, hits }) => ({
        entityType: 'post' as const,
        entityId: p.id,
        source: 'similar_interest' as const,
        authorOrOwnerId: p.authorId,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        label: p.title || truncate(p.content, 80),
        summary: truncate(p.content, 180),
        tags: [...(p.tags || []), p.topic].filter(Boolean).map(String),
        visibility: 'public',
        baseFeatures: {
          engagement: Math.min(1, hits / 4),
          completeness: 0.6,
          status: p.status,
          active: true
        }
      }));
  });

export const generateLegacyPeopleReco = async (ctx: GeneratorContext): Promise<GeneratorResult> =>
  runGenerator('legacy_reco', 'legacy_reco', async () => {
    if (!ctx.viewerId || !wants(ctx, 'person', 'freelancer', 'page')) return [];
    try {
      const { getRecoAccounts } = await import('../reco/reco.service');
      const data = await getRecoAccounts({
        viewerId: ctx.viewerId,
        surface: 'member_home',
        entityType: 'freelancer',
        limit: ctx.limitPerGenerator
      });
      const items = Array.isArray((data as any)?.items)
        ? (data as any).items
        : Array.isArray(data)
          ? data
          : [];
      return items
        .slice(0, ctx.limitPerGenerator)
        .map((item: any) => ({
          entityType: 'person' as const,
          entityId: String(item.entityId || item.id || item.account?.id || ''),
          source: 'legacy_reco' as const,
          authorOrOwnerId: String(item.entityId || item.id || item.account?.id || ''),
          label: String(item.displayName || item.account?.displayName || item.name || 'Member'),
          summary: item.headline || item.account?.headline || null,
          tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
          visibility: 'public',
          baseFeatures: {
            completeness: Number(item.profileCompleteness || 0.5),
            isVerified: Boolean(item.isVerified || item.account?.isVerified),
            engagement: Number(item.score || 0.4),
            active: true,
            discoverable: true
          }
        }))
        .filter((c: RecommendationCandidate) => c.entityId);
    } catch {
      return [];
    }
  });

/** Formal unsupported domains — zero candidates, no fabrication */
export const generateEventsUnsupported = async (ctx: GeneratorContext): Promise<GeneratorResult> => {
  if (!wants(ctx, 'event')) return unsupported('events', 'recent', 'skipped');
  return unsupported(
    'events',
    'recent',
    'No public discovery Event model in current schema (EventOfficeHour is not a public event catalog).'
  );
};

export const generateCoursesUnsupported = async (ctx: GeneratorContext): Promise<GeneratorResult> => {
  if (!wants(ctx, 'course')) return unsupported('courses', 'recent', 'skipped');
  return unsupported('courses', 'recent', 'No Course catalog model in current platform schema.');
};

export const generateProjectsUnsupported = async (ctx: GeneratorContext): Promise<GeneratorResult> => {
  if (!wants(ctx, 'project')) return unsupported('projects', 'recent', 'skipped');
  return unsupported(
    'projects',
    'recent',
    'ProjectPod is internal collaboration, not a public discovery project catalog.'
  );
};

export const runAllGenerators = async (ctx: GeneratorContext): Promise<GeneratorResult[]> =>
  Promise.all([
    generateRecentPosts(ctx),
    generateDiscussions(ctx),
    generateJobs(ctx),
    generateServices(ctx),
    generatePeople(ctx),
    generateFreelancers(ctx),
    generateCommunities(ctx),
    generateGroups(ctx),
    generateCompanies(ctx),
    generateMarketplace(ctx),
    generateInterestMatched(ctx),
    generateLegacyPeopleReco(ctx),
    generateEventsUnsupported(ctx),
    generateCoursesUnsupported(ctx),
    generateProjectsUnsupported(ctx)
  ]);

export const getGeneratorCoverageMatrix = () => [
  { entityType: 'post', generator: 'posts', supported: true },
  { entityType: 'discussion', generator: 'discussions', supported: true },
  { entityType: 'person', generator: 'people', supported: true },
  { entityType: 'freelancer', generator: 'freelancers', supported: true },
  { entityType: 'job', generator: 'jobs', supported: true },
  { entityType: 'service', generator: 'services', supported: true },
  { entityType: 'community', generator: 'communities', supported: true },
  { entityType: 'group', generator: 'groups', supported: true },
  { entityType: 'company', generator: 'companies', supported: true },
  { entityType: 'page', generator: 'companies', supported: true },
  { entityType: 'marketplace_listing', generator: 'marketplace', supported: true },
  { entityType: 'product', generator: 'marketplace', supported: true },
  { entityType: 'event', generator: 'events', supported: false },
  { entityType: 'course', generator: 'courses', supported: false },
  { entityType: 'project', generator: 'projects', supported: false }
];
