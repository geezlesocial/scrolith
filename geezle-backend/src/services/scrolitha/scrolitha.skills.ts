/**
 * Modular Scrolitha skills registry.
 * Skills are independently registered and orchestrated by workflows.
 */
export type SkillId =
  | 'fact_verification'
  | 'thread_summarization'
  | 'job_intelligence'
  | 'company_intelligence'
  | 'community_intelligence'
  | 'portfolio_intelligence'
  | 'profile_intelligence'
  | 'service_intelligence'
  | 'moderator_assistant'
  | 'recruiter_assistant'
  | 'career_assistant'
  | 'content_assistant'
  | 'translation'
  | 'tone_improvement';

export type SkillContext = {
  question: string;
  userId: string;
  postId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  role?: string | null;
  rankedContext?: string;
  graphNodes?: Array<{ type: string; label: string; summary?: string | null }>;
  sessionPrompt?: string;
};

export type SkillResult = {
  skillId: SkillId;
  title: string;
  findings: string[];
  answerFragment: string;
  sources: string[];
  confidence: number;
  authority: number;
  metadata?: Record<string, unknown>;
};

export type ScrolithaSkill = {
  id: SkillId;
  name: string;
  description: string;
  intents: string[];
  /** 0-1 priority when multiple skills match */
  priority: number;
  run: (ctx: SkillContext) => Promise<SkillResult> | SkillResult;
};

const text = (v: unknown) => String(v || '').trim();
const lower = (v: unknown) => text(v).toLowerCase();

const nodesOf = (ctx: SkillContext, type: string) =>
  (ctx.graphNodes || []).filter((n) => n.type === type);

const registry = new Map<SkillId, ScrolithaSkill>();

export const registerSkill = (skill: ScrolithaSkill) => {
  registry.set(skill.id, skill);
  return skill;
};

export const getSkill = (id: SkillId) => registry.get(id) || null;

export const listSkills = () => Array.from(registry.values()).sort((a, b) => b.priority - a.priority);

export const matchSkillsForIntent = (intent: string, question: string): ScrolithaSkill[] => {
  const q = lower(question);
  const intentKey = lower(intent);
  return listSkills()
    .filter((skill) => {
      if (skill.intents.some((i) => intentKey.includes(i) || i === intentKey)) return true;
      // keyword fallbacks
      if (skill.id === 'fact_verification' && /\b(true|verify|claim|evidence)\b/.test(q)) return true;
      if (skill.id === 'thread_summarization' && /\bsummar|key points|takeaway\b/.test(q)) return true;
      if (skill.id === 'job_intelligence' && /\bjob|hiring|role\b/.test(q)) return true;
      if (skill.id === 'company_intelligence' && /\bcompany|organization|page\b/.test(q)) return true;
      if (skill.id === 'moderator_assistant' && /\bmoderat|misinfo|spam|flag\b/.test(q)) return true;
      if (skill.id === 'content_assistant' && /\bwrite|draft|tone|reply\b/.test(q)) return true;
      if (skill.id === 'service_intelligence' && /\bgig|service|portfolio\b/.test(q)) return true;
      if (skill.id === 'recruiter_assistant' && /\brecruit|candidate|shortlist\b/.test(q)) return true;
      if (skill.id === 'career_assistant' && /\bcareer|skill|resume|cv\b/.test(q)) return true;
      if (skill.id === 'translation' && /\btranslat\b/.test(q)) return true;
      if (skill.id === 'tone_improvement' && /\btone|professional|polite\b/.test(q)) return true;
      return false;
    })
    .sort((a, b) => b.priority - a.priority);
};

const base = (
  skillId: SkillId,
  title: string,
  fragment: string,
  sources: string[],
  confidence: number,
  findings: string[] = []
): SkillResult => ({
  skillId,
  title,
  findings,
  answerFragment: fragment,
  sources,
  confidence,
  authority: confidence
});

// --- Built-in skills (deterministic + context-driven; LLM refine happens at workflow layer) ---

registerSkill({
  id: 'fact_verification',
  name: 'Fact Verification',
  description: 'Verify claims against platform-authoritative records only.',
  intents: ['verify_claim', 'fact_verification'],
  priority: 0.95,
  run: (ctx) => {
    const profiles = nodesOf(ctx, 'user');
    const findings = [
      'User-generated posts are not authoritative proof by themselves.',
      profiles.length
        ? `Found ${profiles.length} related public profile node(s) in context.`
        : 'No strong platform profile match for definitive confirmation.'
    ];
    return base(
      'fact_verification',
      'Fact Verification',
      'I only mark claims confirmed when verified platform records support them. Otherwise treat the claim as unconfirmed. External web search is not available.',
      ['Platform records', 'Public post'],
      profiles.length ? 0.55 : 0.35,
      findings
    );
  }
});

registerSkill({
  id: 'thread_summarization',
  name: 'Thread Summarization',
  description: 'Summarize posts and discussion threads.',
  intents: ['summarize', 'key_points', 'thread_summarization'],
  priority: 0.9,
  run: (ctx) => {
    const post = nodesOf(ctx, 'post')[0];
    const comments = nodesOf(ctx, 'comment');
    const body = post?.summary || 'No visible post content.';
    const commentBits = comments
      .slice(0, 4)
      .map((c) => c.summary)
      .filter(Boolean);
    return base(
      'thread_summarization',
      'Thread Summarization',
      `Summary of visible content:\n${body}${
        commentBits.length ? `\n\nRecent comments:\n${commentBits.map((c) => `• ${c}`).join('\n')}` : ''
      }`,
      ['Public post', 'Public comment thread'],
      post ? 0.7 : 0.4,
      [`Post present: ${Boolean(post)}`, `Comment nodes: ${comments.length}`]
    );
  }
});

registerSkill({
  id: 'job_intelligence',
  name: 'Job Intelligence',
  description: 'Explain public job postings and hiring context.',
  intents: ['explain_job', 'job_intelligence', 'recruiter'],
  priority: 0.85,
  run: (ctx) => {
    const jobs = nodesOf(ctx, 'job');
    if (!jobs.length) {
      return base(
        'job_intelligence',
        'Job Intelligence',
        'No public job listing is linked in the current context. Open a job page or ask about a specific role.',
        [],
        0.3
      );
    }
    const lines = jobs.map((j) => `• ${j.label}${j.summary ? `: ${j.summary}` : ''}`);
    return base(
      'job_intelligence',
      'Job Intelligence',
      `Public job context:\n${lines.join('\n')}\n\nReview full requirements on the job page before applying.`,
      ['Public job information'],
      0.72,
      [`Jobs found: ${jobs.length}`]
    );
  }
});

registerSkill({
  id: 'company_intelligence',
  name: 'Company Intelligence',
  description: 'Summarize public company/page legitimacy signals from platform data only.',
  intents: ['summarize_company', 'company_intelligence', 'legitimate'],
  priority: 0.88,
  run: (ctx) => {
    const companies = nodesOf(ctx, 'company');
    const posts = nodesOf(ctx, 'post');
    if (!companies.length) {
      return base(
        'company_intelligence',
        'Company Intelligence',
        'No public company page is present in context. I cannot confirm legitimacy without platform records. Treat unverified company claims cautiously.',
        ['Public post'],
        0.3,
        ['Company page missing']
      );
    }
    const c = companies[0];
    return base(
      'company_intelligence',
      'Company Intelligence',
      `Public company page “${c.label}”${c.summary ? `: ${c.summary}` : ''}. This is platform-public information only — not a legal, financial, or KYC verification. ${
        posts.length ? 'Related public posts are also in context.' : ''
      }`,
      ['Public company page', posts.length ? 'Public post' : ''].filter(Boolean),
      0.65,
      [`Company nodes: ${companies.length}`, `Related posts: ${posts.length}`]
    );
  }
});

registerSkill({
  id: 'community_intelligence',
  name: 'Community Intelligence',
  description: 'Explain community context and public guidelines.',
  intents: ['community_rules', 'community_intelligence'],
  priority: 0.8,
  run: (ctx) => {
    const communities = nodesOf(ctx, 'community');
    if (!communities.length) {
      return base(
        'community_intelligence',
        'Community Intelligence',
        'No community metadata is attached to this context.',
        [],
        0.3
      );
    }
    const c = communities[0];
    return base(
      'community_intelligence',
      'Community Intelligence',
      `Community “${c.label}”${c.summary ? `: ${c.summary}` : ''}. Follow published community rules and platform policies. Moderators make final decisions.`,
      ['Community metadata'],
      0.68
    );
  }
});

registerSkill({
  id: 'profile_intelligence',
  name: 'Profile Intelligence',
  description: 'Summarize public user profile fields.',
  intents: ['profile_intelligence', 'compare_freelancers'],
  priority: 0.78,
  run: (ctx) => {
    const users = nodesOf(ctx, 'user');
    if (!users.length) {
      return base('profile_intelligence', 'Profile Intelligence', 'No public profile nodes available.', [], 0.25);
    }
    const lines = users.slice(0, 4).map((u) => `• ${u.label}${u.summary ? ` — ${u.summary}` : ''}`);
    return base(
      'profile_intelligence',
      'Profile Intelligence',
      `Public profiles in context:\n${lines.join('\n')}`,
      ['Scrolith public profile'],
      0.66
    );
  }
});

registerSkill({
  id: 'service_intelligence',
  name: 'Service Intelligence',
  description: 'Surface public gigs/services.',
  intents: ['recommend', 'service_intelligence'],
  priority: 0.77,
  run: (ctx) => {
    const gigs = nodesOf(ctx, 'gig');
    if (!gigs.length) {
      return base(
        'service_intelligence',
        'Service Intelligence',
        'No public service listings are linked in this context.',
        [],
        0.3
      );
    }
    return base(
      'service_intelligence',
      'Service Intelligence',
      `Public services:\n${gigs.map((g) => `• ${g.label}${g.summary ? `: ${g.summary}` : ''}`).join('\n')}`,
      ['Public service listing'],
      0.7
    );
  }
});

registerSkill({
  id: 'portfolio_intelligence',
  name: 'Portfolio Intelligence',
  description: 'Highlight portfolio-oriented public signals from profile/services.',
  intents: ['portfolio_intelligence'],
  priority: 0.7,
  run: (ctx) => {
    const gigs = nodesOf(ctx, 'gig');
    const skills = nodesOf(ctx, 'skill');
    return base(
      'portfolio_intelligence',
      'Portfolio Intelligence',
      `Portfolio-oriented public signals:\n• Skills: ${
        skills.map((s) => s.label).join(', ') || 'none listed'
      }\n• Services: ${gigs.map((g) => g.label).join(', ') || 'none listed'}`,
      ['Scrolith public profile', gigs.length ? 'Public service listing' : ''].filter(Boolean),
      skills.length || gigs.length ? 0.6 : 0.3
    );
  }
});

registerSkill({
  id: 'moderator_assistant',
  name: 'Moderator Assistant',
  description: 'Suggest moderation actions without auto-enforcement.',
  intents: ['moderation_assist', 'moderator_assistant'],
  priority: 0.92,
  run: async (ctx) => {
    const { analyzeModerationAssist } = await import('./scrolitha.moderationAssist');
    const post = nodesOf(ctx, 'post')[0];
    const comments = nodesOf(ctx, 'comment').map((c) => c.summary || '');
    const result = analyzeModerationAssist({
      postContent: post?.summary || '',
      commentContent: ctx.question,
      threadSnippets: comments
    });
    return {
      skillId: 'moderator_assistant',
      title: 'Moderator Assistant',
      findings: result.signals.map((s) => `${s.signal}: ${s.rationale}`),
      answerFragment: result.summary,
      sources: ['Public post', 'Public comment thread'],
      confidence: Math.max(...result.signals.map((s) => s.confidence), 0.3),
      authority: 0.5,
      metadata: { autoActionTaken: false, signals: result.signals }
    };
  }
});

registerSkill({
  id: 'recruiter_assistant',
  name: 'Recruiter Assistant',
  description: 'Help recruiters interpret public talent and job signals.',
  intents: ['recruiter_assistant', 'recruiter'],
  priority: 0.74,
  run: (ctx) => {
    const users = nodesOf(ctx, 'user');
    const jobs = nodesOf(ctx, 'job');
    const skills = nodesOf(ctx, 'skill');
    return base(
      'recruiter_assistant',
      'Recruiter Assistant',
      `Recruiter-oriented public context:\n• Talent profiles: ${users.length}\n• Skills: ${
        skills.map((s) => s.label).slice(0, 8).join(', ') || 'n/a'
      }\n• Jobs: ${jobs.map((j) => j.label).join(', ') || 'n/a'}\nUse dashboards for private applicant data — not shown here.`,
      ['Scrolith public profile', jobs.length ? 'Public job information' : ''].filter(Boolean),
      0.58
    );
  }
});

registerSkill({
  id: 'career_assistant',
  name: 'Career Assistant',
  description:
    'Career coaching: resume builder/review, interview prep, skill gaps, marketplace/jobs/groups, cover letters.',
  intents: [
    'career_assistant',
    'career',
    'resume',
    'cv',
    'cover_letter',
    'interview',
    'ats',
    'skill_gap'
  ],
  priority: 0.82,
  run: (ctx) => {
    const skills = nodesOf(ctx, 'skill').map((s) => s.label);
    const jobs = nodesOf(ctx, 'job');
    const q = text(ctx.question).toLowerCase();
    const wantsResume = /\bresume|cv|curriculum\b/.test(q);
    const wantsReview = /\breview|score|ats|analyze\b/.test(q);
    const wantsCover = /\bcover\s*letter\b/.test(q);
    const wantsInterview = /\binterview\b/.test(q);

    const lines = [
      'Scrolitha Career Intelligence (general guidance — review before using):',
      `• Skills in view: ${skills.join(', ') || 'add skills on your profile for better matching'}`,
      `• Related public jobs: ${jobs.map((j) => j.label).join(', ') || 'browse /jobs for live openings'}`,
      '',
      'Recommended next steps on Scrolith:'
    ];

    if (wantsReview) {
      lines.push('1. Open Resume Reviewer → upload or paste your CV for ATS + professional scoring.');
      lines.push('2. Apply keyword and achievement rewrites to target the role description.');
    } else if (wantsResume || wantsCover) {
      lines.push('1. Open Resume Builder → import profile, pick a template, generate a summary.');
      lines.push('2. Use AI rewrite for action verbs, quantified impact, and ATS-safe formatting.');
      if (wantsCover) lines.push('3. Draft a cover letter tailored to the target role and company.');
    } else if (wantsInterview) {
      lines.push('1. Map 5 STAR stories from your recent projects and marketplace deliveries.');
      lines.push('2. Practice role-specific questions; close with questions that show research.');
    } else {
      lines.push('1. Resume Builder — professional summary, skills, achievements.');
      lines.push('2. Resume Reviewer — ATS score, gap analysis, line-level suggestions.');
      lines.push('3. Marketplace + Jobs — opportunities ranked to your skills.');
      lines.push('4. Groups & blogs — community learning and professional writing.');
    }

    lines.push('', 'Deep links: /freelancer/dashboard?tab=resume-builder · /client/dashboard?tab=resume-reviewer · /marketplace · /community/clubs · /blog');
    lines.push('This is product guidance, not licensed career counseling.');

    return base(
      'career_assistant',
      'Career Assistant',
      lines.join('\n'),
      [
        'Scrolith public profile',
        jobs.length ? 'Public job information' : '',
        'Resume Builder',
        'Resume Reviewer',
        'Marketplace & Groups'
      ].filter(Boolean),
      wantsResume || wantsReview || wantsCover || wantsInterview ? 0.78 : 0.62
    );
  }
});

registerSkill({
  id: 'content_assistant',
  name: 'Content Assistant',
  description: 'Help draft posts/comments respectfully.',
  intents: ['writing_help', 'content_assistant', 'suggest_reply'],
  priority: 0.8,
  run: () =>
    base(
      'content_assistant',
      'Content Assistant',
      'Draft you can edit before posting:\n\n“Thanks for sharing. Could you add a source or official record for the main claim so others can verify it?”\n\nReview tone for your audience before sending.',
      [],
      0.7
    )
});

registerSkill({
  id: 'translation',
  name: 'Translation',
  description: 'Translate visible content (best-effort, no guarantee of perfect localization).',
  intents: ['translation', 'translate'],
  priority: 0.6,
  run: (ctx) => {
    const post = nodesOf(ctx, 'post')[0];
    return base(
      'translation',
      'Translation',
      post?.summary
        ? `I can help restate this visible content more simply:\n\n${post.summary}\n\nFor full localization, use the platform translation tools where available.`
        : 'Provide the text you want restated or translated from the visible context.',
      post ? ['Public post'] : [],
      0.45
    );
  }
});

registerSkill({
  id: 'tone_improvement',
  name: 'Tone Improvement',
  description: 'Improve tone of drafts toward professional/respectful language.',
  intents: ['tone_improvement', 'professional'],
  priority: 0.65,
  run: (ctx) =>
    base(
      'tone_improvement',
      'Tone Improvement',
      `Professional restatement of your request intent:\n\n“${text(ctx.question).replace(/^@scrolitha\s*/i, '')}”\n\nI can refine further if you share the full draft you plan to post.`,
      [],
      0.6
    )
});

export const runSkills = async (skillIds: SkillId[], ctx: SkillContext): Promise<SkillResult[]> => {
  const results: SkillResult[] = [];
  for (const id of skillIds) {
    const skill = getSkill(id);
    if (!skill) continue;
    try {
      results.push(await skill.run(ctx));
    } catch (error: any) {
      results.push(
        base(
          id,
          skill.name,
          `Skill ${skill.name} could not complete: ${String(error?.message || 'error').slice(0, 120)}`,
          [],
          0.2,
          ['skill_error']
        )
      );
    }
  }
  return results;
};
