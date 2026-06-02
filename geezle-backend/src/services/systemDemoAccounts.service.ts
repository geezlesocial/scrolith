import bcrypt from 'bcryptjs';
import prisma from '../utils/prismaClient';
import { generateScrolithaText } from './scrolitha/scrolitha.ollama';

type DemoProfileSeed = {
  name: string;
  profession: string;
  skills: string[];
  country: string;
  bio: string;
};

type DemoAutomationConfig = {
  enabled: boolean;
  aiEnabled: boolean;
  cadenceMinutes: number;
  maxPostsPerRun: number;
  maxLikesPerRun: number;
  accountIds: string[];
  disabledAccountIds: string[];
  lastRunAt: string | null;
  lastRunSummary: {
    startedAt: string;
    finishedAt: string;
    postsCreated: number;
    likesCreated: number;
    skippedAccounts: number;
    notes: string[];
  } | null;
};

const GLOBAL_CONFIG_KEY = 'systemDemoAccounts';
const DEFAULT_DEMO_PASSWORD = process.env.SYSTEM_DEMO_ACCOUNT_PASSWORD || 'ScrolithDemo@2026';
const DEFAULT_CONFIG: DemoAutomationConfig = {
  enabled: false,
  aiEnabled: true,
  cadenceMinutes: 15,
  maxPostsPerRun: 8,
  maxLikesPerRun: 24,
  accountIds: [],
  disabledAccountIds: [],
  lastRunAt: null,
  lastRunSummary: null
};

const DEMO_PROFILE_SEEDS: DemoProfileSeed[] = [
  { name: 'Anthony Samuel', profession: 'Product Strategist', skills: ['Product Strategy', 'B2B SaaS', 'Roadmapping'], country: 'United States', bio: 'System demo profile focused on enterprise product planning and execution.' },
  { name: 'Smith Jones', profession: 'Brand Marketing Lead', skills: ['Brand Strategy', 'Campaign Ops', 'Market Research'], country: 'United Kingdom', bio: 'System demo profile for branded growth campaigns and regional expansion.' },
  { name: 'Jonathan Daniel', profession: 'Cloud Solutions Architect', skills: ['Cloud Architecture', 'DevOps', 'Security'], country: 'Canada', bio: 'System demo profile supporting secure enterprise cloud transformation.' },
  { name: 'Laric Eric', profession: 'Data Analytics Consultant', skills: ['Data Analysis', 'BI Dashboards', 'SQL'], country: 'Germany', bio: 'System demo profile for analytics, reporting, and operational insights.' },
  { name: 'Olivia Harper', profession: 'HR Operations Manager', skills: ['Talent Ops', 'Hiring', 'Policy Design'], country: 'Australia', bio: 'System demo profile aligned with global talent operations workflows.' },
  { name: 'Mason Cole', profession: 'Frontend Engineer', skills: ['React', 'TypeScript', 'Performance'], country: 'Netherlands', bio: 'System demo profile covering frontend implementation and UX quality.' },
  { name: 'Sophia Reed', profession: 'Customer Success Director', skills: ['Onboarding', 'Retention', 'NPS'], country: 'Singapore', bio: 'System demo profile for enterprise customer success and adoption.' },
  { name: 'Liam Bennett', profession: 'Cybersecurity Specialist', skills: ['Threat Modeling', 'IAM', 'SOC'], country: 'Ireland', bio: 'System demo profile focused on platform trust and incident readiness.' },
  { name: 'Ava Mitchell', profession: 'Program Manager', skills: ['Program Delivery', 'Stakeholder Mgmt', 'Risk Tracking'], country: 'United Arab Emirates', bio: 'System demo profile for multi-team enterprise program execution.' },
  { name: 'Noah Parker', profession: 'Growth Analyst', skills: ['Growth Metrics', 'A/B Testing', 'Attribution'], country: 'France', bio: 'System demo profile tracking funnel quality and growth outcomes.' },
  { name: 'Emma Clarke', profession: 'Enterprise Sales Executive', skills: ['Enterprise Sales', 'Negotiation', 'Account Planning'], country: 'South Africa', bio: 'System demo profile supporting complex B2B pipeline growth.' },
  { name: 'Lucas Walker', profession: 'Back-End Engineer', skills: ['Node.js', 'PostgreSQL', 'API Design'], country: 'India', bio: 'System demo profile for backend scalability and reliability.' },
  { name: 'Mia Foster', profession: 'UX Researcher', skills: ['User Interviews', 'Journey Mapping', 'Prototyping'], country: 'Sweden', bio: 'System demo profile for usability and conversion-focused experience design.' },
  { name: 'Ethan Hayes', profession: 'Finance Controller', skills: ['Financial Planning', 'Reporting', 'Compliance'], country: 'Switzerland', bio: 'System demo profile centered on finance operations and governance.' },
  { name: 'Charlotte Brooks', profession: 'Content Strategy Manager', skills: ['Content Strategy', 'Editorial Ops', 'SEO'], country: 'Nigeria', bio: 'System demo profile for content systems that support discovery and trust.' },
  { name: 'James Cooper', profession: 'Operations Lead', skills: ['Process Optimization', 'SOPs', 'Quality Control'], country: 'Kenya', bio: 'System demo profile for operational consistency and service quality.' },
  { name: 'Amelia Ward', profession: 'Partnership Manager', skills: ['Partnerships', 'Commercial Strategy', 'Ecosystem Growth'], country: 'Spain', bio: 'System demo profile for strategic alliances and distribution expansion.' },
  { name: 'Benjamin Price', profession: 'Machine Learning Engineer', skills: ['ML Systems', 'Model Deployment', 'Python'], country: 'Japan', bio: 'System demo profile for AI-powered product and recommendation systems.' },
  { name: 'Harper Gray', profession: 'Community Manager', skills: ['Community Growth', 'Moderation', 'Engagement'], country: 'Brazil', bio: 'System demo profile for healthy community engagement loops.' },
  { name: 'Henry Bell', profession: 'Recruitment Consultant', skills: ['Sourcing', 'Screening', 'Interview Ops'], country: 'Ghana', bio: 'System demo profile for end-to-end recruitment workflows.' },
  { name: 'Evelyn Scott', profession: 'Legal Operations Analyst', skills: ['Contract Ops', 'Policy Review', 'Risk Controls'], country: 'New Zealand', bio: 'System demo profile for policy-safe enterprise operations.' },
  { name: 'Alexander Young', profession: 'Platform Reliability Engineer', skills: ['SRE', 'Observability', 'Incident Response'], country: 'Poland', bio: 'System demo profile optimizing uptime and platform resilience.' },
  { name: 'Abigail Hill', profession: 'Business Development Manager', skills: ['Lead Generation', 'CRM', 'Pipeline Strategy'], country: 'Mexico', bio: 'System demo profile for enterprise business development execution.' },
  { name: 'Daniel Green', profession: 'Solutions Consultant', skills: ['Solution Design', 'Client Discovery', 'Implementation'], country: 'Malaysia', bio: 'System demo profile mapping client needs to platform outcomes.' },
  { name: 'Ella Adams', profession: 'Digital Campaign Manager', skills: ['Paid Media', 'Audience Segmentation', 'Creative Testing'], country: 'Philippines', bio: 'System demo profile running measurable digital campaign programs.' },
  { name: 'Matthew Nelson', profession: 'Business Intelligence Engineer', skills: ['ETL', 'Data Modeling', 'KPI Design'], country: 'Portugal', bio: 'System demo profile delivering executive-ready data products.' },
  { name: 'Scarlett Carter', profession: 'Employer Branding Lead', skills: ['Employer Brand', 'Content', 'Hiring Campaigns'], country: 'Turkey', bio: 'System demo profile for talent-brand positioning across regions.' },
  { name: 'David Mitchell', profession: 'Account Manager', skills: ['Account Growth', 'Renewals', 'Relationship Mgmt'], country: 'Italy', bio: 'System demo profile for long-term account growth and retention.' },
  { name: 'Victoria Murphy', profession: 'Learning Experience Designer', skills: ['L&D', 'Curriculum', 'Enablement'], country: 'Egypt', bio: 'System demo profile for onboarding and capability uplift initiatives.' },
  { name: 'Joseph Bailey', profession: 'Procurement Specialist', skills: ['Vendor Mgmt', 'Sourcing', 'Cost Optimization'], country: 'Argentina', bio: 'System demo profile focused on sourcing governance and efficiency.' },
  { name: 'Grace Rivera', profession: 'Service Delivery Manager', skills: ['Service Delivery', 'SLA Mgmt', 'Escalation Handling'], country: 'Indonesia', bio: 'System demo profile for enterprise delivery excellence and SLA control.' },
  { name: 'Samuel Rogers', profession: 'Mobile Product Manager', skills: ['Mobile Strategy', 'Growth Experiments', 'Roadmaps'], country: 'South Korea', bio: 'System demo profile for high-quality mobile feature delivery.' },
  { name: 'Chloe Morgan', profession: 'QA Automation Engineer', skills: ['Test Automation', 'Regression Testing', 'CI/CD'], country: 'Vietnam', bio: 'System demo profile for release confidence and test reliability.' },
  { name: 'Andrew Richardson', profession: 'Freelance Marketplace Coach', skills: ['Service Packaging', 'Client Acquisition', 'Pricing'], country: 'Pakistan', bio: 'System demo profile for gig optimization and conversion improvements.' },
  { name: 'Lily Cox', profession: 'Social Media Strategist', skills: ['Social Strategy', 'Content Planning', 'Engagement'], country: 'Morocco', bio: 'System demo profile for credible social growth and audience relevance.' },
  { name: 'Christopher Ward', profession: 'Data Governance Lead', skills: ['Data Governance', 'Compliance', 'Documentation'], country: 'Norway', bio: 'System demo profile for responsible data operations at scale.' },
  { name: 'Hannah Perry', profession: 'Marketplace Operations Analyst', skills: ['Marketplace Ops', 'Quality Standards', 'Vendor QA'], country: 'Colombia', bio: 'System demo profile for marketplace quality and trust improvement.' },
  { name: 'Ryan Hughes', profession: 'Client Success Manager', skills: ['Client Success', 'Roadmap Alignment', 'Health Scoring'], country: 'Chile', bio: 'System demo profile for measurable customer value realization.' },
  { name: 'Zoey Flores', profession: 'AI Workflow Specialist', skills: ['Prompt Design', 'AI Workflows', 'Automation QA'], country: 'Rwanda', bio: 'System demo profile for practical AI workflow adoption with guardrails.' },
  { name: 'Nathan Simmons', profession: 'Talent Intelligence Analyst', skills: ['Talent Analytics', 'Compensation Insights', 'Benchmarking'], country: 'Denmark', bio: 'System demo profile for hiring intelligence and workforce planning.' },
  { name: 'Natalie Powell', profession: 'Enterprise Support Lead', skills: ['Support Strategy', 'Escalation Mgmt', 'SLA Governance'], country: 'Finland', bio: 'System demo profile for high-standard enterprise support operations.' },
  { name: 'Aaron Long', profession: 'GTM Operations Manager', skills: ['GTM Ops', 'Forecasting', 'Territory Planning'], country: 'Belgium', bio: 'System demo profile for predictable go-to-market execution.' },
  { name: 'Aria Russell', profession: 'Payments Operations Specialist', skills: ['Payments Ops', 'Reconciliation', 'Fraud Controls'], country: 'Romania', bio: 'System demo profile for payments trust and settlement operations.' },
  { name: 'Gabriel Jenkins', profession: 'Technical Recruiter', skills: ['Tech Recruitment', 'Candidate Screening', 'Offer Process'], country: 'Austria', bio: 'System demo profile for technical hiring and candidate experience.' },
  { name: 'Leah Sanders', profession: 'B2B Content Producer', skills: ['Content Production', 'Research', 'Thought Leadership'], country: 'Israel', bio: 'System demo profile producing high-trust B2B narrative content.' },
  { name: 'Dylan Brooks', profession: 'Product Marketing Manager', skills: ['Positioning', 'Messaging', 'Launch Planning'], country: 'Czech Republic', bio: 'System demo profile for clear value communication and launches.' },
  { name: 'Nora Coleman', profession: 'Customer Operations Analyst', skills: ['Customer Ops', 'Process Mapping', 'Reporting'], country: 'Peru', bio: 'System demo profile for customer lifecycle process optimization.' },
  { name: 'Caleb Patterson', profession: 'Business Systems Administrator', skills: ['CRM Admin', 'Automation Rules', 'System Hygiene'], country: 'Qatar', bio: 'System demo profile for CRM and workflow reliability at scale.' },
  { name: 'Stella Barnes', profession: 'Public Relations Consultant', skills: ['PR Strategy', 'Media Relations', 'Narrative Design'], country: 'Jordan', bio: 'System demo profile for brand trust and reputation management.' },
  { name: 'Isaac Ross', profession: 'Revenue Operations Analyst', skills: ['RevOps', 'Pipeline Analytics', 'Data Quality'], country: 'Taiwan', bio: 'System demo profile for revenue visibility and execution discipline.' }
];

const toIso = () => new Date().toISOString();

const toSafeNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
};

const uniq = (rows: string[]) => Array.from(new Set(rows.map((row) => String(row || '').trim()).filter(Boolean)));

const normalizeConfig = (value: any): DemoAutomationConfig => {
  const source = value && typeof value === 'object' ? value : {};
  return {
    enabled: Boolean(source.enabled),
    aiEnabled: source.aiEnabled === undefined ? true : Boolean(source.aiEnabled),
    cadenceMinutes: toSafeNumber(source.cadenceMinutes, DEFAULT_CONFIG.cadenceMinutes, 1, 120),
    maxPostsPerRun: toSafeNumber(source.maxPostsPerRun, DEFAULT_CONFIG.maxPostsPerRun, 0, 50),
    maxLikesPerRun: toSafeNumber(source.maxLikesPerRun, DEFAULT_CONFIG.maxLikesPerRun, 0, 200),
    accountIds: uniq(Array.isArray(source.accountIds) ? source.accountIds : []),
    disabledAccountIds: uniq(Array.isArray(source.disabledAccountIds) ? source.disabledAccountIds : []),
    lastRunAt: source.lastRunAt ? String(source.lastRunAt) : null,
    lastRunSummary: source.lastRunSummary && typeof source.lastRunSummary === 'object'
      ? {
          startedAt: String(source.lastRunSummary.startedAt || ''),
          finishedAt: String(source.lastRunSummary.finishedAt || ''),
          postsCreated: Number(source.lastRunSummary.postsCreated || 0),
          likesCreated: Number(source.lastRunSummary.likesCreated || 0),
          skippedAccounts: Number(source.lastRunSummary.skippedAccounts || 0),
          notes: Array.isArray(source.lastRunSummary.notes)
            ? source.lastRunSummary.notes.map((entry: unknown) => String(entry || '').trim()).filter(Boolean)
            : []
        }
      : null
  };
};

const loadGlobalConfigRecord = async () => {
  return prisma.cMSConfig.findFirst({
    where: { target: 'GLOBAL' as any },
    orderBy: { version: 'desc' }
  });
};

const readGlobalConfigData = async () => {
  const record = await loadGlobalConfigRecord();
  const payload = record?.data && typeof record.data === 'object' && !Array.isArray(record.data) ? (record.data as Record<string, any>) : {};
  return {
    record,
    payload
  };
};

const writeGlobalConfigData = async (payload: Record<string, any>, updatedById?: string | null) => {
  const existing = await loadGlobalConfigRecord();
  await prisma.cMSConfig.create({
    data: {
      target: 'GLOBAL' as any,
      version: Number(existing?.version || 0) + 1,
      data: payload as any,
      updatedById: updatedById || null
    }
  });
};

export const getDemoAutomationConfig = async (): Promise<DemoAutomationConfig> => {
  const { payload } = await readGlobalConfigData();
  return normalizeConfig(payload[GLOBAL_CONFIG_KEY] || DEFAULT_CONFIG);
};

export const updateDemoAutomationConfig = async (
  patch: Partial<DemoAutomationConfig>,
  updatedById?: string | null
) => {
  const { payload } = await readGlobalConfigData();
  const current = normalizeConfig(payload[GLOBAL_CONFIG_KEY] || DEFAULT_CONFIG);
  const next = normalizeConfig({ ...current, ...(patch || {}) });
  const nextPayload: Record<string, any> = {
    ...payload,
    [GLOBAL_CONFIG_KEY]: next
  };
  await writeGlobalConfigData(nextPayload, updatedById);
  return next;
};

const buildDemoUsername = (seed: DemoProfileSeed, index: number) => {
  const base = seed.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  return `demo.${base}.${String(index + 1).padStart(2, '0')}`.slice(0, 40);
};

const buildDemoEmail = (seed: DemoProfileSeed, index: number) => {
  const local = seed.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 18);
  return `demo+${local}${String(index + 1).padStart(2, '0')}@scrolith.demo`;
};

const createDemoPostContent = async (profile: { name: string; profession: string; skills: string[]; country: string }, aiEnabled: boolean) => {
  const fallback = `${profile.profession} update from ${profile.country}: improving delivery quality with ${profile.skills.slice(0, 2).join(' and ')} while keeping client communication clear and proactive.`;
  if (!aiEnabled) return fallback;
  try {
    const prompt = [
      `Write one short professional social post (max 55 words).`,
      `Profile: ${profile.name}, ${profile.profession}, ${profile.country}.`,
      `Skills: ${profile.skills.join(', ')}.`,
      `Tone: human, credible, positive, no hashtags, no emojis, no markdown.`,
      `Output post text only.`
    ].join('\n');

    const result = await generateScrolithaText({
      userPrompt: prompt,
      systemPrompt: 'You are Scrolitha writing concise professional updates for enterprise marketplace users.',
      routeKey: 'system_demo_accounts_post',
      scope: 'admin',
      maxTokens: 220,
      temperature: 0.7
    });
    const text = String(result?.text || '').replace(/\s+/g, ' ').trim();
    if (!text) return fallback;
    return text.slice(0, 480);
  } catch {
    return fallback;
  }
};

const createDemoPost = async (account: any, aiEnabled: boolean) => {
  const content = await createDemoPostContent(
    {
      name: String(account?.name || 'Scrolith Demo User'),
      profession: String(account?.profile?.title || 'Professional'),
      skills: Array.isArray(account?.profile?.skills) ? account.profile.skills : [],
      country: String(account?.profile?.country || account?.country || 'Global')
    },
    aiEnabled
  );
  await prisma.communityPost.create({
    data: {
      authorId: account.id,
      title: null,
      content,
      status: 'active',
      visibility: 'public',
      commentPolicy: 'everyone',
      graphicWarning: false,
      isAIEnhanced: Boolean(aiEnabled),
      tags: []
    }
  });
};

const createDemoLike = async (accountId: string) => {
  const target = await prisma.communityPost.findFirst({
    where: {
      status: 'active',
      authorId: { not: accountId }
    },
    orderBy: [{ createdAt: 'desc' }]
  });
  if (!target) return false;

  const existing = await prisma.communityPostReaction.findUnique({
    where: { postId_userId: { postId: target.id, userId: accountId } }
  });
  if (existing) return false;

  await prisma.$transaction([
    prisma.communityPostReaction.create({
      data: {
        postId: target.id,
        userId: accountId,
        type: 'like'
      }
    }),
    prisma.communityPost.update({
      where: { id: target.id },
      data: { likesCount: { increment: 1 } }
    })
  ]);
  return true;
};

const listManagedAccounts = async (config: DemoAutomationConfig) => {
  if (!config.accountIds.length) return [];
  return prisma.user.findMany({
    where: { id: { in: config.accountIds } },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      avatar: true,
      profilePhotoFileId: true,
      isActive: true,
      country: true,
      createdAt: true,
      profile: {
        select: {
          title: true,
          skills: true,
          bio: true,
          country: true
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  });
};

export const seedDemoAccounts = async (input?: { count?: number; updatedById?: string | null }) => {
  const count = toSafeNumber(input?.count, 50, 1, 200);
  const selectedSeeds = DEMO_PROFILE_SEEDS.slice(0, count);
  const passwordHash = await bcrypt.hash(DEFAULT_DEMO_PASSWORD, 10);
  const config = await getDemoAutomationConfig();
  const createdIds: string[] = [];
  const existingIds: string[] = [];

  for (let index = 0; index < selectedSeeds.length; index += 1) {
    const seed = selectedSeeds[index];
    const email = buildDemoEmail(seed, index);
    const username = buildDemoUsername(seed, index);
    const managedAccountId = config.accountIds[index];

    if (managedAccountId) {
      const managed = await prisma.user.findUnique({ where: { id: managedAccountId }, select: { id: true } });
      if (managed?.id) {
        existingIds.push(managed.id);
        continue;
      }
    }

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing?.id) {
      existingIds.push(existing.id);
      continue;
    }
    const created = await prisma.user.create({
      data: {
        email,
        username,
        name: seed.name,
        role: 'USER' as any,
        country: seed.country,
        isActive: true,
        isVerified: false,
        passwordHash,
        profile: {
          create: {
            title: seed.profession,
            bio: `${seed.bio} [System Demo Account]`,
            country: seed.country,
            skills: seed.skills
          }
        }
      },
      select: { id: true }
    });
    createdIds.push(created.id);
  }

  const accountIds = uniq([...config.accountIds, ...createdIds, ...existingIds]);
  const next = await updateDemoAutomationConfig({ accountIds }, input?.updatedById);
  return {
    createdCount: createdIds.length,
    existingCount: existingIds.length,
    totalManagedAccounts: next.accountIds.length,
    defaultPassword: DEFAULT_DEMO_PASSWORD
  };
};

export const getDemoAccountsOverview = async () => {
  const config = await getDemoAutomationConfig();
  const accounts = await listManagedAccounts(config);
  const disabled = new Set(config.disabledAccountIds);
  const rows = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    email: account.email,
    username: account.username,
    avatar: account.avatar || null,
    profilePhotoFileId: account.profilePhotoFileId || null,
    isActive: Boolean(account.isActive),
    automationEnabled: !disabled.has(account.id),
    country: account.profile?.country || account.country || null,
    profession: account.profile?.title || null,
    skills: Array.isArray(account.profile?.skills) ? account.profile?.skills : [],
    createdAt: account.createdAt
  }));

  return {
    config,
    stats: {
      managedAccounts: rows.length,
      activeAccounts: rows.filter((row) => row.isActive).length,
      automationEnabledAccounts: rows.filter((row) => row.automationEnabled).length
    },
    accounts: rows
  };
};

export const setDemoAccountAutomationState = async (accountId: string, enabled: boolean, updatedById?: string | null) => {
  const config = await getDemoAutomationConfig();
  if (!config.accountIds.includes(accountId)) {
    throw new Error('Account is not managed by demo automation');
  }
  const disabled = new Set(config.disabledAccountIds);
  if (enabled) disabled.delete(accountId);
  else disabled.add(accountId);
  return updateDemoAutomationConfig({ disabledAccountIds: Array.from(disabled) }, updatedById);
};

export const runDemoAutomationCycle = async () => {
  const config = await getDemoAutomationConfig();
  const startedAt = toIso();
  const notes: string[] = [];
  if (!config.enabled) {
    return {
      ok: false,
      message: 'Demo automation is disabled',
      config
    };
  }

  const accounts = await listManagedAccounts(config);
  const disabled = new Set(config.disabledAccountIds);
  const candidates = accounts.filter((account) => account.isActive && !disabled.has(account.id));
  let postsCreated = 0;
  let likesCreated = 0;
  let skippedAccounts = 0;

  for (const account of candidates) {
    if (postsCreated >= config.maxPostsPerRun && likesCreated >= config.maxLikesPerRun) break;

    const [todayPosts, todayLikes] = await Promise.all([
      prisma.communityPost.count({
        where: {
          authorId: account.id,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      }),
      prisma.communityPostReaction.count({
        where: {
          userId: account.id,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      })
    ]);

    const canPost = postsCreated < config.maxPostsPerRun && todayPosts < 3;
    const canLike = likesCreated < config.maxLikesPerRun && todayLikes < 20;

    if (!canPost && !canLike) {
      skippedAccounts += 1;
      continue;
    }

    if (canPost) {
      try {
        await createDemoPost(account, config.aiEnabled);
        postsCreated += 1;
      } catch (error: any) {
        notes.push(`post_failed:${account.id}:${String(error?.message || 'unknown')}`);
      }
    }

    if (canLike) {
      try {
        const liked = await createDemoLike(account.id);
        if (liked) likesCreated += 1;
      } catch (error: any) {
        notes.push(`like_failed:${account.id}:${String(error?.message || 'unknown')}`);
      }
    }
  }

  const finishedAt = toIso();
  const nextSummary = {
    startedAt,
    finishedAt,
    postsCreated,
    likesCreated,
    skippedAccounts,
    notes
  };
  const nextConfig = await updateDemoAutomationConfig(
    {
      lastRunAt: finishedAt,
      lastRunSummary: nextSummary
    },
    null
  );

  return {
    ok: true,
    summary: nextSummary,
    config: nextConfig
  };
};

let schedulerHandle: NodeJS.Timeout | null = null;
let cycleInFlight = false;

export const startDemoAutomationScheduler = () => {
  if (schedulerHandle) return;
  const intervalMs = toSafeNumber(process.env.SYSTEM_DEMO_AUTOMATION_TICK_MS, 60_000, 15_000, 10 * 60_000);
  schedulerHandle = setInterval(async () => {
    if (cycleInFlight) return;
    cycleInFlight = true;
    try {
      const config = await getDemoAutomationConfig();
      if (!config.enabled) return;
      if (config.lastRunAt) {
        const elapsedMs = Date.now() - new Date(config.lastRunAt).getTime();
        const requiredMs = config.cadenceMinutes * 60_000;
        if (elapsedMs < requiredMs) return;
      }
      await runDemoAutomationCycle();
    } catch (error) {
      console.error('[system-demo-accounts] scheduler cycle failed', error);
    } finally {
      cycleInFlight = false;
    }
  }, intervalMs);
  if (typeof (schedulerHandle as any).unref === 'function') {
    (schedulerHandle as any).unref();
  }
};
