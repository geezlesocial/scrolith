import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const HOMEPAGE_SCOPE = 'community_homepage';

const defaultDeviceVisibility = () => ({ mobile: true, tablet: true, desktop: true });

const defaultHomepage = {
  hero: {
    title: 'Scrolith Community',
    subtitle: 'Connect with fellow freelancers, share knowledge, and grow together',
    backgroundImage: '',
    backgroundColor: '#4f46e5',
    visibility: defaultDeviceVisibility()
  },
  banner: {
    enabled: true,
    text: 'Security Notice: Do not share sensitive personal information (Passwords, bank details, government IDs). AI Moderation is active in all chats.',
    visibility: defaultDeviceVisibility()
  },
  modules: {
    sliders: { enabled: true, title: 'Featured', visibility: defaultDeviceVisibility() },
    stories: { enabled: true, title: 'Stories', visibility: defaultDeviceVisibility() },
    customSections: { enabled: true, title: 'Updates', visibility: defaultDeviceVisibility() },
    searchBar: { enabled: true, title: 'Search', visibility: defaultDeviceVisibility() },
    feed: { enabled: true, title: 'Community Feed', visibility: defaultDeviceVisibility() },
    trendingTopics: { enabled: true, title: 'Trending Topics', visibility: defaultDeviceVisibility() },
    upcomingEvents: { enabled: true, title: 'Upcoming Events', visibility: defaultDeviceVisibility() },
    topContributors: { enabled: true, title: 'Top Contributors', visibility: defaultDeviceVisibility() },
    discussions: { enabled: true, title: 'Latest Discussions', visibility: defaultDeviceVisibility() },
    quickActions: { enabled: true, title: 'Quick Actions', visibility: defaultDeviceVisibility() },
    sponsored: { enabled: true, title: 'Sponsored', visibility: defaultDeviceVisibility() },
    stats: { enabled: true, title: 'Community Stats', visibility: defaultDeviceVisibility() }
  },
  sliders: [],
  sections: []
};

const ok = (res: Response, data: any) => res.json({ success: true, data });

const mergeVisibility = (value: any) => {
  const base = defaultDeviceVisibility();
  if (!value || typeof value !== 'object') return base;
  return { ...base, ...value };
};

const mergeModules = (raw: any) => {
  const base = (defaultHomepage as any).modules || {};
  const incoming = raw && typeof raw === 'object' ? raw : {};
  const keys = new Set([...Object.keys(base), ...Object.keys(incoming)]);
  const merged: Record<string, any> = {};
  keys.forEach((key) => {
    const baseModule = base[key] || { enabled: true, visibility: defaultDeviceVisibility() };
    const incomingModule = incoming[key] && typeof incoming[key] === 'object' ? incoming[key] : {};
    merged[key] = {
      ...baseModule,
      ...incomingModule,
      visibility: mergeVisibility(incomingModule.visibility ?? baseModule.visibility)
    };
  });
  return merged;
};

const mergeHomepageConfig = (raw: any) => {
  const payload = raw && typeof raw === 'object' ? raw : {};
  const hero = payload.hero && typeof payload.hero === 'object' ? payload.hero : {};
  const banner = payload.banner && typeof payload.banner === 'object' ? payload.banner : {};
  const sliders = Array.isArray(payload.sliders)
    ? payload.sliders.map((slide: any) => ({
        ...slide,
        visibility: mergeVisibility(slide?.visibility)
      }))
    : (defaultHomepage as any).sliders;
  const sections = Array.isArray(payload.sections)
    ? payload.sections.map((section: any) => ({
        ...section,
        visibility: mergeVisibility(section?.visibility)
      }))
    : (defaultHomepage as any).sections;

  return {
    ...defaultHomepage,
    ...payload,
    hero: {
      ...(defaultHomepage as any).hero,
      ...hero,
      visibility: mergeVisibility(hero.visibility)
    },
    banner: {
      ...(defaultHomepage as any).banner,
      ...banner,
      visibility: mergeVisibility(banner.visibility)
    },
    modules: mergeModules(payload.modules),
    sliders,
    sections
  };
};

export const getCommunityHomepage = async (_req: Request, res: Response) => {
  try {
    const existing = await prisma.appSetting.findUnique({ where: { scope: HOMEPAGE_SCOPE } });
    if (!existing) return ok(res, defaultHomepage);
    return ok(res, mergeHomepageConfig(existing.data || defaultHomepage));
  } catch (error: any) {
    console.error('Failed to load community homepage config:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load homepage config' });
  }
};

export const updateCommunityHomepage = async (req: Request, res: Response) => {
  try {
    const payload = req.body?.data ?? req.body ?? {};
    const merged = mergeHomepageConfig(payload || {});
    const updated = await prisma.appSetting.upsert({
      where: { scope: HOMEPAGE_SCOPE },
      create: { scope: HOMEPAGE_SCOPE, data: merged },
      update: { data: merged }
    });
    const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
    try { io?.emit('community:homepage_updated', { config: updated.data }); } catch (e) {}
    return ok(res, updated.data);
  } catch (error: any) {
    console.error('Failed to update community homepage config:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update homepage config' });
  }
};

