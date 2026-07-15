/**
 * Deep platform search driven by semantic intent (not raw keyword-only UX).
 * Permission-aware public entities only. No private messages or hidden content.
 */
import prisma from '../../utils/prismaClient';
import { enterpriseCache, hashCacheKey } from './scrolitha.enterpriseCache';
import type { GraphNode } from './scrolitha.platformGraph';

export type SearchIntent =
  | 'people'
  | 'companies'
  | 'jobs'
  | 'services'
  | 'communities'
  | 'posts'
  | 'mixed'
  | 'events';

export type DeepSearchHit = {
  type: string;
  id: string;
  label: string;
  summary?: string | null;
  score: number;
  hrefHint?: string;
  sourceLabel: string;
};

export type DeepSearchResult = {
  intent: SearchIntent;
  query: string;
  hits: DeepSearchHit[];
  cacheHit: boolean;
};

const text = (v: unknown) => String(v || '').trim();
const lower = (v: unknown) => text(v).toLowerCase();

export const detectSearchIntent = (query: string): SearchIntent => {
  const q = lower(query);
  if (/\b(jobs?|hiring|roles?|vacanc(?:y|ies)|career)\b/.test(q)) return 'jobs';
  if (/\b(gigs?|services?|freelance|package)\b/.test(q)) return 'services';
  if (/\b(compan(?:y|ies)|organization|business|brand)\b/.test(q)) return 'companies';
  if (/\b(communit(?:y|ies)|groups?|clubs?|forum)\b/.test(q)) return 'communities';
  if (/\b(people|person|profiles?|freelancers?|talent|who is)\b/.test(q)) return 'people';
  if (/\b(events?|meetup|webinar)\b/.test(q)) return 'events';
  if (/\b(posts?|discussions?|threads?|comments?)\b/.test(q)) return 'posts';
  return 'mixed';
};

const scoreText = (query: string, body: string) => {
  const tokens = lower(query)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (!tokens.length) return 0.3;
  const hay = lower(body);
  let hits = 0;
  for (const t of tokens) if (hay.includes(t)) hits += 1;
  return Math.max(0.15, Math.min(1, hits / Math.max(2, tokens.length)));
};

const extractQuerySeed = (query: string) => {
  // Drop intent words to leave entity-ish seed
  return text(query)
    .replace(/\b(find|search|show|list|related|similar|recommend|me|the|a|an|for|about|jobs?|gigs?|services?|companies|company|people|profiles?|communities|community|posts?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const deepPlatformSearch = async (input: {
  query: string;
  viewerUserId: string;
  limit?: number;
  intent?: SearchIntent;
}): Promise<DeepSearchResult> => {
  const query = text(input.query);
  const limit = Math.max(3, Math.min(20, Number(input.limit) || 10));
  const intent = input.intent || detectSearchIntent(query);
  const seed = extractQuerySeed(query) || query;
  const cacheKey = hashCacheKey(['deep', input.viewerUserId, intent, seed, limit]);
  // Prefer dedicated search namespace; fall back to entity for older entries
  const cached =
    enterpriseCache.get<DeepSearchResult>('search', cacheKey) ||
    enterpriseCache.get<DeepSearchResult>('entity', cacheKey);
  if (cached) return { ...cached, cacheHit: true };

  const hits: DeepSearchHit[] = [];
  const want = (t: SearchIntent) => intent === 'mixed' || intent === t;

  if (want('people') || intent === 'mixed') {
    try {
      const users = await prisma.user.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: seed, mode: 'insensitive' } },
            { username: { contains: seed, mode: 'insensitive' } }
          ]
        },
        take: Math.ceil(limit / 2),
        select: {
          id: true,
          name: true,
          username: true,
          isVerified: true,
          profile: { select: { title: true, skills: true } }
        }
      });
      for (const u of users) {
        const label = u.name || u.username || 'User';
        const summary = u.profile?.title || (u.profile?.skills || []).slice(0, 5).join(', ') || null;
        hits.push({
          type: 'user',
          id: u.id,
          label,
          summary,
          score: scoreText(seed, `${label} ${summary || ''}`) + (u.isVerified ? 0.1 : 0),
          hrefHint: u.username ? `/u/${u.username}` : `/profile/${u.id}`,
          sourceLabel: u.isVerified ? 'Verified Scrolith profile' : 'Scrolith public profile'
        });
      }
    } catch {
      // ignore
    }
  }

  if (want('companies') || intent === 'mixed') {
    try {
      const pages = await prisma.communityBusinessPage.findMany({
        where: {
          status: 'active',
          OR: [
            { name: { contains: seed, mode: 'insensitive' } },
            { handle: { contains: seed, mode: 'insensitive' } },
            { industry: { contains: seed, mode: 'insensitive' } }
          ]
        },
        take: Math.ceil(limit / 2),
        select: { id: true, name: true, handle: true, tagline: true, industry: true, slug: true }
      });
      for (const p of pages) {
        hits.push({
          type: 'company',
          id: p.id,
          label: p.name,
          summary: p.tagline || p.industry || null,
          score: scoreText(seed, `${p.name} ${p.tagline || ''} ${p.industry || ''}`),
          hrefHint: `/page/${p.handle || p.slug}`,
          sourceLabel: 'Public company page'
        });
      }
    } catch {
      // ignore
    }
  }

  if (want('jobs') || intent === 'mixed') {
    try {
      const jobs = await prisma.job.findMany({
        where: {
          isActive: true,
          isVisible: true,
          OR: [
            { title: { contains: seed, mode: 'insensitive' } },
            { description: { contains: seed, mode: 'insensitive' } }
          ]
        },
        take: Math.ceil(limit / 2),
        orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true, description: true, budget: true, tags: true }
      });
      for (const j of jobs) {
        hits.push({
          type: 'job',
          id: j.id,
          label: j.title,
          summary: String(j.description || '').slice(0, 160),
          score: scoreText(seed, `${j.title} ${j.description} ${(j.tags || []).join(' ')}`),
          hrefHint: `/jobs/${j.id}`,
          sourceLabel: 'Public job information'
        });
      }
    } catch {
      // ignore
    }
  }

  if (want('services') || intent === 'mixed') {
    try {
      const gigs = await prisma.gig.findMany({
        where: {
          isActive: true,
          OR: [
            { title: { contains: seed, mode: 'insensitive' } },
            { description: { contains: seed, mode: 'insensitive' } }
          ]
        },
        take: Math.ceil(limit / 2),
        orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true, description: true, price: true, slug: true, tags: true }
      });
      for (const g of gigs) {
        hits.push({
          type: 'gig',
          id: g.id,
          label: g.title,
          summary: String(g.description || '').slice(0, 160),
          score: scoreText(seed, `${g.title} ${g.description} ${(g.tags || []).join(' ')}`),
          hrefHint: g.slug ? `/gigs/${g.slug}` : `/gigs/${g.id}`,
          sourceLabel: 'Public service listing'
        });
      }
    } catch {
      // ignore
    }
  }

  if (want('communities') || intent === 'mixed') {
    try {
      const clubs = await prisma.communityClub.findMany({
        where: {
          OR: [
            { name: { contains: seed, mode: 'insensitive' } },
            { description: { contains: seed, mode: 'insensitive' } }
          ]
        },
        take: Math.ceil(limit / 3),
        select: { id: true, name: true, slug: true, description: true, status: true }
      });
      for (const c of clubs) {
        if (String(c.status || '').toLowerCase() === 'deleted') continue;
        hits.push({
          type: 'community',
          id: c.id,
          label: c.name,
          summary: c.description ? String(c.description).slice(0, 160) : null,
          score: scoreText(seed, `${c.name} ${c.description || ''}`),
          hrefHint: c.slug ? `/communities/${c.slug}` : `/communities/${c.id}`,
          sourceLabel: 'Community metadata'
        });
      }
    } catch {
      // ignore
    }
  }

  if (want('posts') || intent === 'mixed') {
    try {
      const posts = await prisma.communityPost.findMany({
        where: {
          status: 'active',
          visibility: 'public',
          OR: [
            { content: { contains: seed, mode: 'insensitive' } },
            { title: { contains: seed, mode: 'insensitive' } }
          ]
        },
        take: Math.ceil(limit / 3),
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, content: true }
      });
      for (const p of posts) {
        hits.push({
          type: 'post',
          id: p.id,
          label: p.title || String(p.content || '').slice(0, 60) || 'Post',
          summary: String(p.content || '').slice(0, 160),
          score: scoreText(seed, `${p.title || ''} ${p.content || ''}`) * 0.9,
          hrefHint: `/post/${p.id}`,
          sourceLabel: 'Public post'
        });
      }
    } catch {
      // ignore
    }
  }

  hits.sort((a, b) => b.score - a.score);
  const result: DeepSearchResult = {
    intent,
    query,
    hits: hits.slice(0, limit),
    cacheHit: false
  };
  enterpriseCache.set('search', cacheKey, result, 45_000);
  enterpriseCache.set('entity', cacheKey, result, 45_000);
  return result;
};

export const deepSearchHitsToGraphNodes = (hits: DeepSearchHit[]): GraphNode[] =>
  hits.map((h) => ({
    type: h.type as any,
    id: h.id,
    label: h.label,
    summary: h.summary,
    publicFields: { score: h.score, href: h.hrefHint || null },
    relation: 'search_hit'
  }));
