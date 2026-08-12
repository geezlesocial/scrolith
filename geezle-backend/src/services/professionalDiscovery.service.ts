/**
 * Phase 20.2.7 — Enterprise professional discovery aggregator.
 * Reuses marketplace listings, community clubs, CMS blogs, resume/career surfaces.
 * No schema changes. Fail-soft when a source is empty.
 */
import prisma from '../utils/prismaClient';
import { COMMUNITY_CLUB_VISIBILITY } from '../utils/communityPrismaEnums';

const getAppSetting = async (scope: string, fallback: any) => {
  try {
    const existing = await prisma.appSetting.findUnique({ where: { scope } });
    if (!existing) return fallback;
    return existing.data ?? fallback;
  } catch {
    return fallback;
  }
};

export type ProfessionalDiscoveryItem = {
  id: string;
  type:
    | 'marketplace_listing'
    | 'group'
    | 'blog'
    | 'job'
    | 'gig'
    | 'career_action'
    | 'resume_template';
  title: string;
  subtitle?: string;
  description?: string;
  imageUrl?: string | null;
  url: string;
  score: number;
  reasons: string[];
  meta?: Record<string, unknown>;
};

export type ProfessionalDiscoveryBundle = {
  generatedAt: string;
  marketplace: ProfessionalDiscoveryItem[];
  groups: ProfessionalDiscoveryItem[];
  blogs: ProfessionalDiscoveryItem[];
  career: ProfessionalDiscoveryItem[];
  resumeTemplates: ProfessionalDiscoveryItem[];
  totals: Record<string, number>;
};

type ViewerSignals = {
  userId?: string | null;
  skills: string[];
  interests: string[];
  location?: string;
  bio?: string;
  role?: string;
  /** Phase 20.3 — feed intent from existing preference mapping (for_you/hire/sell/learn/following). */
  feedIntent?: string;
};

const coerce = (value: unknown) => String(value ?? '').trim();
const lower = (value: unknown) => coerce(value).toLowerCase();

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9+#.]/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

const overlapScore = (haystack: string, needles: string[]) => {
  if (!haystack || !needles.length) return 0;
  const tokens = new Set(tokenize(haystack));
  let hits = 0;
  needles.forEach((n) => {
    if (tokens.has(n) || haystack.includes(n)) hits += 1;
  });
  return hits;
};

const loadViewerSignals = async (userId?: string | null): Promise<ViewerSignals> => {
  if (!userId) {
    return { userId: null, skills: [], interests: [], feedIntent: 'for_you' };
  }
  try {
    const [user, feedPref] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          profile: {
            select: {
              title: true,
              bio: true,
              location: true,
              skills: true,
              languages: true
            }
          }
        }
      }),
      prisma.feedModePreference
        .findUnique({
          where: { userId },
          select: { mode: true }
        })
        .catch(() => null)
    ]);
    if (!user) return { userId, skills: [], interests: [], feedIntent: 'for_you' };
    const profile = (user as any).profile || {};
    const skillsRaw = profile.skills;
    const languagesRaw = profile.languages;
    const skills = Array.isArray(skillsRaw)
      ? skillsRaw.map((s: any) => lower(s?.name || s?.label || s)).filter(Boolean)
      : tokenize(coerce(skillsRaw));
    const interests = Array.isArray(languagesRaw)
      ? languagesRaw.map((s: any) => lower(s?.name || s?.label || s)).filter(Boolean)
      : tokenize(coerce(languagesRaw));
    const bio = coerce(profile.bio || profile.title);
    const role = coerce((user as any).role);
    // Lightweight intent map (mirrors viewerPreference without hard import cycles).
    const mode = lower((feedPref as any)?.mode || 'growth');
    let feedIntent = 'for_you';
    if (mode === 'opportunity') {
      feedIntent = /freelance|creator|seller|talent|worker/.test(lower(role)) ? 'sell' : 'hire';
    } else if (mode === 'network') feedIntent = 'following';
    else if (mode === 'learning') feedIntent = 'learn';
    else feedIntent = 'for_you';
    return {
      userId,
      skills,
      interests,
      location: coerce(profile.location),
      bio,
      role,
      feedIntent
    };
  } catch {
    return { userId, skills: [], interests: [], feedIntent: 'for_you' };
  }
};

const rankItem = (
  base: number,
  text: string,
  signals: ViewerSignals,
  reasons: string[],
  entityType?: ProfessionalDiscoveryItem['type']
): number => {
  let score = base;
  const skillHits = overlapScore(text, signals.skills);
  const interestHits = overlapScore(text, signals.interests);
  if (skillHits > 0) {
    score += skillHits * 8;
    reasons.push('Matches your skills');
  }
  if (interestHits > 0) {
    score += interestHits * 6;
    reasons.push('Aligned with your interests');
  }
  if (signals.location && text.includes(lower(signals.location))) {
    score += 4;
    reasons.push('Near your location');
  }

  // Phase 20.3 — intent-aware boosts (additive; fail-soft when intent unknown).
  const intent = lower(signals.feedIntent || 'for_you');
  if (intent === 'hire' && (entityType === 'job' || entityType === 'marketplace_listing' || entityType === 'gig')) {
    score += 10;
    reasons.push('Aligned with your hiring focus');
  } else if (intent === 'sell' && (entityType === 'marketplace_listing' || entityType === 'gig' || entityType === 'career_action')) {
    score += 10;
    reasons.push('Supports your sell / service goals');
  } else if (intent === 'learn' && (entityType === 'blog' || entityType === 'group' || entityType === 'career_action')) {
    score += 10;
    reasons.push('Matches your learning focus');
  } else if (intent === 'following' && entityType === 'group') {
    score += 6;
    reasons.push('Good for network growth');
  }

  return score;
};

const loadMarketplace = async (signals: ViewerSignals, limit: number): Promise<ProfessionalDiscoveryItem[]> => {
  try {
    const rows = await prisma.marketplaceListing.findMany({
      where: {
        OR: [{ status: 'ACTIVE' as any }, { status: 'active' as any }, { status: 'PUBLISHED' as any }]
      } as any,
      orderBy: [{ updatedAt: 'desc' } as any],
      take: Math.max(limit * 3, 24),
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        currency: true,
        viewCount: true,
        featured: true,
        location: true,
        sellerId: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { id: true, name: true } },
        media: {
          orderBy: { sortOrder: 'asc' as any },
          take: 1,
          select: { url: true, fileId: true }
        }
      } as any
    });

    return (Array.isArray(rows) ? rows : [])
      .map((row: any) => {
        const reasons: string[] = [];
        const categoryName = coerce(row.category?.name || row.category);
        const text = [row.title, row.description, categoryName, row.location]
          .map(coerce)
          .join(' ')
          .toLowerCase();
        let score = 10;
        if (row.featured || row.isFeatured) {
          score += 12;
          reasons.push('Featured listing');
        }
        const views = Number(row.views ?? row.viewCount ?? 0) || 0;
        score += Math.min(15, Math.log10(views + 1) * 5);
        if (views > 20) reasons.push('Popular right now');
        score = rankItem(score, text, signals, reasons, 'marketplace_listing');
        const firstMedia = Array.isArray(row.media) ? row.media[0] : null;
        return {
          id: String(row.id),
          type: 'marketplace_listing' as const,
          title: coerce(row.title) || 'Marketplace listing',
          subtitle: categoryName || 'Marketplace',
          description: coerce(row.description).slice(0, 180),
          imageUrl: firstMedia?.url || null,
          url: `/marketplace/listing/${encodeURIComponent(String(row.id))}`,
          score,
          reasons: reasons.slice(0, 3),
          meta: {
            price: row.price,
            currency: row.currency,
            sellerId: row.sellerId
          }
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (error) {
    console.warn('[professional-discovery] marketplace load failed', (error as any)?.message || error);
    return [];
  }
};

const loadGroups = async (signals: ViewerSignals, limit: number): Promise<ProfessionalDiscoveryItem[]> => {
  try {
    const rows = await prisma.communityClub.findMany({
      where: {
        status: 'active',
        visibility: COMMUNITY_CLUB_VISIBILITY.PUBLIC
      },
      orderBy: [{ updatedAt: 'desc' } as any],
      take: Math.max(limit * 3, 30),
      select: {
        id: true,
        name: true,
        summary: true,
        description: true,
        slug: true,
        avatarImage: true,
        coverImage: true,
        memberCount: true,
        visibility: true,
        category: true,
        status: true
      }
    });

    return (Array.isArray(rows) ? rows : [])
      .map((row: any) => {
        const reasons: string[] = [];
        const title = coerce(row.name) || 'Group';
        const text = [title, row.summary, row.description, row.category]
          .map(coerce)
          .join(' ')
          .toLowerCase();
        let score = 8;
        const members = Number(row.memberCount || 0) || 0;
        score += Math.min(20, members / 5);
        if (members > 10) reasons.push('Active community');
        score = rankItem(score, text, signals, reasons, 'group');
        const slug = coerce(row.slug || row.id);
        return {
          id: String(row.id),
          type: 'group' as const,
          title,
          subtitle: coerce(row.category) || 'Professional group',
          description: coerce(row.summary || row.description).slice(0, 160),
          imageUrl: row.avatarImage || row.coverImage || null,
          url: `/community/clubs?group=${encodeURIComponent(slug)}`,
          score,
          reasons: reasons.slice(0, 3),
          meta: {
            memberCount: members,
            visibility: row.visibility,
            slug
          }
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (error) {
    console.warn('[professional-discovery] groups load failed', (error as any)?.message || error);
    return [];
  }
};

const loadBlogs = async (signals: ViewerSignals, limit: number): Promise<ProfessionalDiscoveryItem[]> => {
  try {
    const data = await getAppSetting('cms_blog_posts', { posts: [] });
    const posts = Array.isArray((data as any)?.posts) ? (data as any).posts : [];
    const publicPosts = posts.filter((post: any) => {
      const status = lower(post?.status || post?.state || 'published');
      return status === 'published' || status === 'public' || status === 'live' || !post?.status;
    });

    return publicPosts
      .map((post: any) => {
        const reasons: string[] = [];
        const title = coerce(post.title) || 'Article';
        const text = [title, post.excerpt, post.summary, post.category, ...(Array.isArray(post.tags) ? post.tags : [])]
          .map(coerce)
          .join(' ')
          .toLowerCase();
        let score = 6;
        if (post.featured || post.isFeatured) {
          score += 10;
          reasons.push('Featured article');
        }
        score = rankItem(score, text, signals, reasons, 'blog');
        if (/\bcareer|resume|job|skill|interview|professional\b/i.test(text)) {
          score += 8;
          reasons.push('Career-relevant content');
        }
        const slug = coerce(post.slug || post.id);
        const authorName = coerce(post.authorName || post.author || post.author_name || 'Scrolith Author');
        if (authorName) reasons.push(`By ${authorName}`);
        return {
          id: String(post.id || slug),
          type: 'blog' as const,
          title,
          subtitle: coerce(post.category) || authorName || 'Blog',
          description: coerce(post.excerpt || post.summary || post.content).slice(0, 180),
          imageUrl: post.coverImage || post.featuredImage || post.image || null,
          url: slug ? `/blog/${encodeURIComponent(slug)}` : '/blog',
          score,
          reasons: reasons.slice(0, 3),
          meta: {
            slug,
            readingTime: post.readingTime || post.readTime,
            author: authorName,
            authorId: post.authorId || post.author_id || null,
            authorAvatar: post.authorAvatar || post.author_avatar || null
          }
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (error) {
    console.warn('[professional-discovery] blogs load failed', (error as any)?.message || error);
    return [];
  }
};

const careerActions = (signals: ViewerSignals): ProfessionalDiscoveryItem[] => {
  const role = lower(signals.role);
  const isClient = role.includes('client') || role.includes('employer');
  const items: ProfessionalDiscoveryItem[] = [
    {
      id: 'career-resume-builder',
      type: 'career_action',
      title: 'Build or improve your resume',
      subtitle: 'Scrolitha Career Assistant',
      description: 'Generate professional summaries, achievements, and ATS-friendly bullets.',
      url: isClient ? '/client/dashboard?tab=resume-reviewer' : '/freelancer/dashboard?tab=resume-builder',
      score: 40,
      reasons: ['Career growth'],
      meta: { action: 'resume_builder' }
    },
    {
      id: 'career-resume-review',
      type: 'career_action',
      title: 'Get an AI resume review',
      subtitle: 'ATS + professional scoring',
      description: 'Score formatting, keywords, role fit, and get line-level suggestions.',
      url: '/client/dashboard?tab=resume-reviewer',
      score: 36,
      reasons: ['Interview readiness'],
      meta: { action: 'resume_review' }
    },
    {
      id: 'career-scrolitha',
      type: 'career_action',
      title: 'Ask Scrolitha for career coaching',
      subtitle: 'Jobs, freelancing, skills',
      description: 'Skill-gap analysis, cover letters, interview prep, and opportunity matching.',
      url: '/scrolitha?intent=career',
      score: 34,
      reasons: ['AI career intelligence'],
      meta: { action: 'scrolitha_career' }
    },
    {
      id: 'career-marketplace',
      type: 'career_action',
      title: 'Explore recommended marketplace work',
      subtitle: 'Services & digital products',
      description: 'Listings ranked by your skills, interests, and activity.',
      url: '/marketplace?sort=recommended',
      score: 28,
      reasons: ['Monetize skills'],
      meta: { action: 'marketplace' }
    },
    {
      id: 'career-groups',
      type: 'career_action',
      title: 'Join professional groups',
      subtitle: 'Communities & cohorts',
      description: 'Find peers, mentors, and industry communities.',
      url: '/community/clubs',
      score: 26,
      reasons: ['Network growth'],
      meta: { action: 'groups' }
    },
    {
      id: 'career-blog',
      type: 'career_action',
      title: 'Read career guides & industry blogs',
      subtitle: 'Knowledge hub',
      description: 'Tutorials, business advice, and professional writing from the community.',
      url: '/blog',
      score: 24,
      reasons: ['Continuous learning'],
      meta: { action: 'blog' }
    }
  ];

  if (signals.skills.length) {
    items[0].score += 6;
    items[0].reasons.push('Uses your profile skills');
  }
  return items.sort((a, b) => b.score - a.score);
};

const resumeTemplates = (): ProfessionalDiscoveryItem[] =>
  [
    {
      id: 'tpl-modern-professional',
      type: 'resume_template' as const,
      title: 'Modern Professional',
      subtitle: 'Clean ATS-friendly layout',
      description: 'Single-column layout optimized for recruiters and ATS parsers.',
      url: '/freelancer/dashboard?tab=resume-builder&template=modern-professional',
      score: 30,
      reasons: ['Most popular'],
      meta: { template: 'modern-professional' }
    },
    {
      id: 'tpl-tech-impact',
      type: 'resume_template' as const,
      title: 'Tech Impact',
      subtitle: 'Engineers & product roles',
      description: 'Highlights projects, stack, and quantified outcomes.',
      url: '/freelancer/dashboard?tab=resume-builder&template=tech-impact',
      score: 28,
      reasons: ['Tech careers'],
      meta: { template: 'tech-impact' }
    },
    {
      id: 'tpl-creative-portfolio',
      type: 'resume_template' as const,
      title: 'Creative Portfolio',
      subtitle: 'Designers & creators',
      description: 'Visual-forward sections for portfolio links and case studies.',
      url: '/freelancer/dashboard?tab=resume-builder&template=creative-portfolio',
      score: 24,
      reasons: ['Creator roles'],
      meta: { template: 'creative-portfolio' }
    },
    {
      id: 'tpl-executive-brief',
      type: 'resume_template' as const,
      title: 'Executive Brief',
      subtitle: 'Leadership & strategy',
      description: 'Concise leadership narrative with impact metrics.',
      url: '/freelancer/dashboard?tab=resume-builder&template=executive-brief',
      score: 22,
      reasons: ['Senior roles'],
      meta: { template: 'executive-brief' }
    }
  ].sort((a, b) => b.score - a.score);

export const getProfessionalDiscoveryBundle = async (options?: {
  userId?: string | null;
  marketplaceLimit?: number;
  groupsLimit?: number;
  blogsLimit?: number;
}): Promise<ProfessionalDiscoveryBundle> => {
  const marketplaceLimit = Math.max(1, Math.min(24, options?.marketplaceLimit ?? 8));
  const groupsLimit = Math.max(1, Math.min(24, options?.groupsLimit ?? 8));
  const blogsLimit = Math.max(1, Math.min(24, options?.blogsLimit ?? 8));
  const signals = await loadViewerSignals(options?.userId);

  const [marketplace, groups, blogs] = await Promise.all([
    loadMarketplace(signals, marketplaceLimit),
    loadGroups(signals, groupsLimit),
    loadBlogs(signals, blogsLimit)
  ]);

  const career = careerActions(signals);
  const templates = resumeTemplates();

  return {
    generatedAt: new Date().toISOString(),
    marketplace,
    groups,
    blogs,
    career,
    resumeTemplates: templates,
    totals: {
      marketplace: marketplace.length,
      groups: groups.length,
      blogs: blogs.length,
      career: career.length,
      resumeTemplates: templates.length
    }
  };
};

export const getMarketplaceRecommendations = async (userId?: string | null, limit = 12) => {
  const signals = await loadViewerSignals(userId);
  return loadMarketplace(signals, limit);
};

export const getGroupRecommendations = async (userId?: string | null, limit = 12) => {
  const signals = await loadViewerSignals(userId);
  return loadGroups(signals, limit);
};

export const getBlogRecommendations = async (userId?: string | null, limit = 12) => {
  const signals = await loadViewerSignals(userId);
  return loadBlogs(signals, limit);
};
