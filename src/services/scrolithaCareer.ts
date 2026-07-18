/**
 * Scrolitha Career Intelligence helpers — deep links & starter prompts.
 * Extends existing Scrolitha chat without redesigning the widget shell.
 */

export type CareerPrompt = {
  id: string;
  label: string;
  prompt: string;
  href?: string;
};

export const SCROLITHA_CAREER_PROMPTS: CareerPrompt[] = [
  {
    id: 'weekly-growth',
    label: 'Weekly growth plan',
    prompt:
      '@Scrolitha build a 7-day Scrolith growth plan covering posting, networking, marketplace or hiring actions, and measurable goals.',
    href: '/scrolitha?intent=growth'
  },
  {
    id: 'profile-optimize',
    label: 'Optimize profile for discovery',
    prompt:
      '@Scrolitha optimize my headline, about section, and skills so I rank better in professional discovery and hiring matches on Scrolith.',
    href: '/scrolitha?intent=career'
  },
  {
    id: 'resume-summary',
    label: 'Write professional summary',
    prompt:
      '@Scrolitha write a professional resume summary for my target role. Use strong action verbs and quantify impact where possible.',
    href: '/freelancer/dashboard?tab=resume-builder'
  },
  {
    id: 'resume-review',
    label: 'Review my resume',
    prompt:
      '@Scrolitha review my resume for ATS compatibility, keyword coverage, structure, and professional tone. Give scores and rewrites.',
    href: '/client/dashboard?tab=resume-reviewer'
  },
  {
    id: 'cover-letter',
    label: 'Generate cover letter',
    prompt:
      '@Scrolitha draft a concise cover letter tailored to a target job. Keep it professional and achievement-focused.',
    href: '/freelancer/dashboard?tab=resume-builder'
  },
  {
    id: 'skill-gap',
    label: 'Skill gap analysis',
    prompt:
      '@Scrolitha analyze skill gaps for my target role and recommend learning paths, certifications, and Scrolith marketplace opportunities.',
    href: '/scrolitha?intent=career'
  },
  {
    id: 'interview-prep',
    label: 'Interview prep',
    prompt:
      '@Scrolitha prepare interview questions and STAR story outlines based on my experience and a target role.',
    href: '/scrolitha?intent=career'
  },
  {
    id: 'marketplace-match',
    label: 'Marketplace matches',
    prompt:
      '@Scrolitha recommend marketplace listings and freelancing opportunities that fit my skills and recent activity.',
    href: '/marketplace?sort=recommended'
  },
  {
    id: 'groups-blogs',
    label: 'Groups & career blogs',
    prompt:
      '@Scrolitha suggest professional groups to join and career articles to read for my industry.',
    href: '/community/clubs'
  }
];

export const buildScrolithaCareerPath = (promptId?: string) => {
  const prompt = SCROLITHA_CAREER_PROMPTS.find((p) => p.id === promptId) || SCROLITHA_CAREER_PROMPTS[0];
  const params = new URLSearchParams();
  params.set('intent', 'career');
  if (prompt?.prompt) params.set('q', prompt.prompt);
  return `/scrolitha?${params.toString()}`;
};

export const careerQuickActions = () => [
  {
    id: 'resume-builder',
    title: 'Resume Builder',
    caption: 'Templates + AI writer',
    path: '/freelancer/dashboard?tab=resume-builder'
  },
  {
    id: 'resume-reviewer',
    title: 'Resume Reviewer',
    caption: 'ATS & role fit scores',
    path: '/client/dashboard?tab=resume-reviewer'
  },
  {
    id: 'scrolitha-career',
    title: 'Scrolitha Career',
    caption: 'Coach, cover letters, interviews',
    path: buildScrolithaCareerPath('skill-gap')
  },
  {
    id: 'marketplace',
    title: 'Marketplace',
    caption: 'Recommended services',
    path: '/marketplace?sort=recommended'
  },
  {
    id: 'groups',
    title: 'Groups',
    caption: 'Professional communities',
    path: '/community/clubs'
  },
  {
    id: 'blog',
    title: 'Blog & Guides',
    caption: 'Career knowledge',
    path: '/blog'
  }
];
