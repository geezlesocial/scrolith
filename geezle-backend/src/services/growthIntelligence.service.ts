/**
 * Phase 20.3 — Growth Intelligence pulse.
 * Additive, read-only aggregation over existing preference + profile signals.
 * Does not mutate ranking engines or enable dark discovery masters.
 */
import prisma from '../utils/prismaClient';
import {
  mapInsightsModeToFeedIntent,
  normalizeInsightsFeedMode,
  resolveViewerRoleContext,
  type InsightsFeedMode
} from './intelligence/viewerPreference';
import type { FeedSurfaceMode } from './opportunityGraph.service';

const text = (value: unknown) => String(value ?? '').trim();
const lower = (value: unknown) => text(value).toLowerCase();

export type GrowthAction = {
  id: string;
  title: string;
  caption: string;
  href: string;
  priority: number;
  category: 'engagement' | 'networking' | 'hiring' | 'creator' | 'career' | 'marketplace';
};

export type GrowthPulse = {
  version: string;
  generatedAt: string;
  roleContext: 'employer' | 'freelancer' | 'unknown';
  feedIntent: FeedSurfaceMode;
  insightsMode: InsightsFeedMode;
  personalizationEnabled: boolean;
  focusTopics: string[];
  postingGuidance: {
    bestWindowsLocal: string[];
    tip: string;
  };
  creator: {
    weeklyPostGoal: number;
    suggestedFormats: string[];
    audienceTip: string;
  };
  discovery: {
    headline: string;
    bullets: string[];
  };
  actions: GrowthAction[];
  scrolithaPrompts: Array<{ id: string; label: string; prompt: string; href: string }>;
};

const DEFAULT_PULSE = (role: ReturnType<typeof resolveViewerRoleContext>): GrowthPulse => ({
  version: '20.3.0',
  generatedAt: new Date().toISOString(),
  roleContext: role,
  feedIntent: 'for_you',
  insightsMode: 'growth',
  personalizationEnabled: true,
  focusTopics: [],
  postingGuidance: {
    bestWindowsLocal: ['Tue–Thu 09:00–11:00', 'Weekday evenings 18:00–20:00'],
    tip: 'Publish consistently when your network is active. Reply to comments within the first hour.'
  },
  creator: {
    weeklyPostGoal: 3,
    suggestedFormats: ['Short insight post', 'Carousel / screenshots', 'Scroll video clip'],
    audienceTip: 'Lead with a concrete outcome or lesson your peers can reuse.'
  },
  discovery: {
    headline: 'Grow your presence this week',
    bullets: [
      'Follow people in your field and engage with two posts daily',
      'Complete profile skills so recommendations stay relevant',
      'Ask Scrolitha for a posting plan tailored to your goals'
    ]
  },
  actions: [],
  scrolithaPrompts: []
});

const loadFeedModePreference = async (userId: string) => {
  try {
    const row = await prisma.feedModePreference.findUnique({
      where: { userId },
      select: { mode: true }
    });
    if (row) return row;
  } catch {
    // fail soft if table unavailable
  }
  return null;
};

export const getGrowthPulse = async (userId?: string | null): Promise<GrowthPulse> => {
  if (!userId) {
    return DEFAULT_PULSE('unknown');
  }

  let roleRaw = '';
  let skills: string[] = [];
  let interests: string[] = [];
  let title = '';
  let location = '';

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
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
    });
    if (user) {
      roleRaw = text((user as any).role);
      const profile = (user as any).profile || {};
      title = text(profile.title);
      location = text(profile.location);
      const skillsRaw = profile.skills;
      skills = Array.isArray(skillsRaw)
        ? skillsRaw.map((s: any) => lower(s?.name || s?.label || s)).filter(Boolean).slice(0, 12)
        : [];
      // Profile has no separate interests array; reuse languages/skills lightly for topic seeds.
      const languagesRaw = profile.languages;
      interests = Array.isArray(languagesRaw)
        ? languagesRaw.map((s: any) => lower(s?.name || s?.label || s)).filter(Boolean).slice(0, 12)
        : [];
    }
  } catch {
    // fail soft
  }

  const roleContext = resolveViewerRoleContext(roleRaw);
  const pref = await loadFeedModePreference(userId);
  const insightsMode = normalizeInsightsFeedMode(pref?.mode || 'growth');
  const feedIntent = mapInsightsModeToFeedIntent(insightsMode, roleRaw);
  const personalizationEnabled = true;

  const pulse = DEFAULT_PULSE(roleContext);
  pulse.feedIntent = feedIntent;
  pulse.insightsMode = insightsMode;
  pulse.personalizationEnabled = personalizationEnabled;
  pulse.focusTopics = Array.from(new Set([...skills, ...interests])).slice(0, 8);

  if (roleContext === 'employer') {
    pulse.discovery = {
      headline: 'Hire and collaborate smarter',
      bullets: [
        'Browse freelancers matching your open roles',
        'Post a clear brief with budget and timeline',
        'Use Scrolitha to refine job posts and shortlists'
      ]
    };
    pulse.creator.suggestedFormats = ['Hiring brief', 'Team culture post', 'Role spotlight'];
    pulse.creator.audienceTip = 'Share what great work looks like so the right freelancers apply.';
  } else if (roleContext === 'freelancer') {
    pulse.discovery = {
      headline: 'Win more work this week',
      bullets: [
        'Refresh your profile skills and portfolio highlights',
        'Respond fast to marketplace inquiries',
        'Publish one proof-of-work post with outcomes'
      ]
    };
    pulse.creator.suggestedFormats = ['Case study post', 'Before/after result', 'Service package carousel'];
    pulse.creator.audienceTip = 'Show measurable client outcomes before promoting services.';
  }

  if (title) {
    pulse.postingGuidance.tip = `Share insights related to “${title.slice(0, 80)}” when your audience is online.`;
  }
  if (location) {
    pulse.postingGuidance.bestWindowsLocal = [
      'Local weekday mornings 08:30–10:30',
      'Local lunch 12:00–13:30',
      'Local evenings 18:00–20:00'
    ];
  }

  const actions: GrowthAction[] = [
    {
      id: 'complete-skills',
      title: skills.length >= 3 ? 'Refresh your skills' : 'Add skills to your profile',
      caption: skills.length >= 3 ? 'Keep recommendations accurate' : 'Unlock better matches',
      href: '/profile/edit',
      priority: skills.length >= 3 ? 40 : 90,
      category: 'career'
    },
    {
      id: 'network-follow',
      title: 'Grow your network',
      caption: 'People you may know',
      href: '/m/network',
      priority: 80,
      category: 'networking'
    },
    {
      id: 'post-now',
      title: 'Share a professional update',
      caption: 'Boost reach with a clear takeaway',
      href: '/member-home',
      priority: 85,
      category: 'engagement'
    },
    {
      id: 'scrolitha-growth',
      title: 'Ask Scrolitha for a growth plan',
      caption: 'Personalized weekly actions',
      href: '/scrolitha?intent=growth',
      priority: 75,
      category: 'creator'
    }
  ];

  if (roleContext === 'employer' || feedIntent === 'hire') {
    actions.push({
      id: 'hire-now',
      title: 'Discover freelancers',
      caption: 'Match talent to open roles',
      href: '/hire',
      priority: 88,
      category: 'hiring'
    });
  }
  if (roleContext === 'freelancer' || feedIntent === 'sell') {
    actions.push({
      id: 'marketplace-sell',
      title: 'Improve marketplace presence',
      caption: 'Listings recommended for your skills',
      href: '/marketplace?sort=recommended',
      priority: 86,
      category: 'marketplace'
    });
  }
  if (feedIntent === 'learn' || insightsMode === 'learning') {
    actions.push({
      id: 'learn-path',
      title: 'Close skill gaps',
      caption: 'Blogs, groups, and career coaching',
      href: '/scrolitha?intent=career',
      priority: 82,
      category: 'career'
    });
  }

  pulse.actions = actions.sort((a, b) => b.priority - a.priority).slice(0, 6);

  pulse.scrolithaPrompts = [
    {
      id: 'weekly-growth-plan',
      label: 'Weekly growth plan',
      prompt:
        '@Scrolitha build a 7-day growth plan for me on Scrolith covering posting, networking, and marketplace or hiring actions. Keep it concrete and measurable.',
      href: '/scrolitha?intent=growth&q=' + encodeURIComponent('Build a 7-day Scrolith growth plan for me')
    },
    {
      id: 'profile-optimize',
      label: 'Optimize my profile',
      prompt:
        '@Scrolitha review how to optimize my Scrolith profile headline, skills, and about section for better discovery and hiring matches.',
      href: '/scrolitha?intent=career'
    },
    {
      id: 'content-calendar',
      label: 'Content calendar',
      prompt:
        '@Scrolitha suggest five high-engagement post ideas tailored to my skills and audience, with best posting windows.',
      href: '/scrolitha?intent=growth'
    }
  ];

  if (pulse.focusTopics.length) {
    pulse.discovery.bullets = [
      `Lean into topics: ${pulse.focusTopics.slice(0, 4).join(', ')}`,
      ...pulse.discovery.bullets
    ].slice(0, 4);
  }

  return pulse;
};
