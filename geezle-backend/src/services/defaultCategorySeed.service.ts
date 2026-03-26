import prisma from '../utils/prismaClient';
import { STANDARD_LISTING_CATEGORIES } from '../config/listingCategories';

const CMS_PAGE_CATEGORIES_SCOPE = 'cms_page_categories';
const CMS_BLOG_POSTS_SCOPE = 'cms_blog_posts';
const CMS_BLOG_CATEGORIES_SCOPE = 'cms_blog_categories';

type CmsCategoryRecord = Record<string, any>;

type BlogCategoryGroupSeed = {
  name: string;
  description: string;
  seoPrimaryCategory: string;
  subcategories: string[];
};

type SupportCategoryGroupSeed = {
  group: string;
  items: string[];
};

const slugify = (value: string) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const makeStableId = (prefix: string, slug: string) => `${prefix}-${slug || 'item'}`;

const nowIso = () => new Date().toISOString();

const getAppSettingData = async (scope: string, fallback: any) => {
  const existing = await prisma.appSetting.findUnique({ where: { scope } });
  if (!existing) return fallback;
  return existing.data ?? fallback;
};

const saveAppSettingData = async (scope: string, data: any) => {
  const saved = await prisma.appSetting.upsert({
    where: { scope },
    create: { scope, data },
    update: { data }
  });
  return saved.data;
};

const getCategoryIdentity = (category: CmsCategoryRecord) => {
  const slug = slugify(category.slug || category.name || '');
  const name = String(category.name || '').trim().toLowerCase();
  return slug || name;
};

const mergeDefaultCmsCategories = (existing: CmsCategoryRecord[], defaults: CmsCategoryRecord[]) => {
  const merged = [...existing];
  let changed = false;

  for (const defaultCategory of defaults) {
    const identity = getCategoryIdentity(defaultCategory);
    if (!identity) continue;

    const index = merged.findIndex((item) => getCategoryIdentity(item) === identity);
    if (index >= 0) {
      const current = merged[index];
      const currentSortOrder = current.sortOrder ?? current.sort_order;
      const defaultSortOrder = defaultCategory.sortOrder ?? defaultCategory.sort_order ?? 0;
      const next = {
        ...defaultCategory,
        ...current,
        slug: current.slug || defaultCategory.slug,
        description: current.description ?? defaultCategory.description ?? '',
        status: current.status || defaultCategory.status || 'active',
        image: current.image ?? defaultCategory.image ?? null,
        count: Number(current.count ?? defaultCategory.count ?? 0),
        sortOrder: currentSortOrder ?? defaultSortOrder,
        sort_order: current.sort_order ?? current.sortOrder ?? defaultSortOrder,
        isDefault: current.isDefault ?? defaultCategory.isDefault ?? true,
        defaultKey: current.defaultKey ?? defaultCategory.defaultKey ?? identity,
        group: current.group ?? defaultCategory.group ?? null,
        parent_id: current.parent_id ?? defaultCategory.parent_id ?? null,
        parent_slug: current.parent_slug ?? defaultCategory.parent_slug ?? null,
        kind: current.kind ?? defaultCategory.kind ?? 'category',
        seoPrimaryCategory: current.seoPrimaryCategory ?? defaultCategory.seoPrimaryCategory ?? null,
        updated_at: current.updated_at || current.updatedAt || defaultCategory.updated_at || defaultCategory.updatedAt || nowIso(),
        created_at: current.created_at || current.createdAt || defaultCategory.created_at || defaultCategory.createdAt || nowIso()
      };

      const hasDiff =
        (current.slug || '') !== (next.slug || '') ||
        (current.description ?? '') !== (next.description ?? '') ||
        (current.status || 'active') !== (next.status || 'active') ||
        (current.image ?? null) !== (next.image ?? null) ||
        Number(current.count ?? 0) !== Number(next.count ?? 0) ||
        Number(currentSortOrder ?? 0) !== Number(next.sortOrder ?? 0) ||
        Number(current.sort_order ?? currentSortOrder ?? 0) !== Number(next.sort_order ?? 0) ||
        (current.isDefault ?? true) !== (next.isDefault ?? true) ||
        (current.defaultKey ?? null) !== (next.defaultKey ?? null) ||
        (current.group ?? null) !== (next.group ?? null) ||
        (current.parent_id ?? null) !== (next.parent_id ?? null) ||
        (current.parent_slug ?? null) !== (next.parent_slug ?? null) ||
        (current.kind ?? 'category') !== (next.kind ?? 'category') ||
        (current.seoPrimaryCategory ?? null) !== (next.seoPrimaryCategory ?? null);

      if (hasDiff) {
        merged[index] = next;
        changed = true;
      }
      continue;
    }

    merged.push(defaultCategory);
    changed = true;
  }

  return { merged, changed };
};

const computeBlogCategoryCounts = (posts: any[], categories: CmsCategoryRecord[]) => {
  const counts: Record<string, number> = {};
  for (const post of posts) {
    const categoryId = String(post?.category_id || post?.categoryId || '').trim();
    if (!categoryId) continue;
    counts[categoryId] = (counts[categoryId] || 0) + 1;
  }

  return categories.map((category) => ({
    ...category,
    count: counts[String(category.id || '')] || 0
  }));
};

const DEFAULT_PAGE_CATEGORY_NAMES = [
  'Public / Marketing Pages',
  'Authentication Pages',
  'User Dashboard',
  'Social Feed Pages',
  'Content Creation Pages',
  'Content Viewing Pages',
  'User Profile Pages',
  'Social Interaction Pages',
  'Messaging Pages',
  'Creator & Monetization Pages',
  'Marketplace / Services Pages',
  'Search & Discovery Pages',
  'Admin & Moderation Pages',
  'User Settings Pages',
  'Legal & Policy Pages',
  'Live Streaming Pages',
  'Notifications Pages',
  'Utility / System Pages',
  'Growth & Engagement Pages',
  'Mobile App Screens'
];

const DEFAULT_BLOG_CATEGORY_GROUPS: BlogCategoryGroupSeed[] = [
  {
    name: 'Freelancing & Remote Work',
    description: 'Guides and best practices for building a successful freelance and remote-work career.',
    seoPrimaryCategory: 'Freelancing',
    subcategories: [
      'Freelancing Tips & Best Practices',
      'How to Start Freelancing',
      'Remote Work Strategies',
      'Productivity for Freelancers',
      'Building a Personal Brand',
      'Portfolio & Gig Optimization',
      'Client Communication Skills',
      'Pricing & Negotiation Strategies',
      'Time Management for Remote Workers',
      'Scaling Your Freelance Business'
    ]
  },
  {
    name: 'Hiring & Talent Acquisition',
    description: 'Hiring playbooks for clients, employers, and teams building with freelance talent.',
    seoPrimaryCategory: 'Hiring',
    subcategories: [
      'How to Hire Freelancers',
      'Writing Effective Job Posts',
      'Interviewing Remote Talent',
      'Managing Remote Teams',
      'Contract & Milestone Planning',
      'Avoiding Hiring Mistakes',
      'Scaling with Freelance Talent',
      'Budgeting for Freelance Projects'
    ]
  },
  {
    name: 'Social Commerce & Creator Economy',
    description: 'Strategies for creators and brands growing revenue through community and content.',
    seoPrimaryCategory: 'Business',
    subcategories: [
      'Monetizing Your Audience',
      'Social Selling Strategies',
      'Creator Growth Tactics',
      'Influencer Collaboration',
      'Content Monetization Models',
      'Subscription & Premium Content',
      'Community Building Strategies'
    ]
  },
  {
    name: 'Escrow, Payments & Financial Security',
    description: 'Payment safety, escrow education, and finance operations for digital work.',
    seoPrimaryCategory: 'Escrow & Payments',
    subcategories: [
      'How Escrow Protects Freelancers',
      'Safe Online Payments',
      'Stripe Connect Explained',
      'Managing Freelance Income',
      'International Payments Guide',
      'Withdrawal & Payout Tips',
      'Avoiding Payment Scams',
      'Tax Considerations for Freelancers'
    ]
  },
  {
    name: 'AI & Productivity',
    description: 'AI workflows, prompt engineering, and productivity systems for digital professionals.',
    seoPrimaryCategory: 'AI & Productivity',
    subcategories: [
      'Using AI for Freelance Success',
      'AI-Powered Content Creation',
      'Automating Workflows',
      'Prompt Engineering Basics',
      'Responsible AI Usage',
      'AI for Business Growth',
      'AI Tools for Entrepreneurs'
    ]
  },
  {
    name: 'Platform Guides (Scrolith Tutorials)',
    description: 'Official tutorials for using Scrolith features, security, payments, and verification.',
    seoPrimaryCategory: 'Platform Guides',
    subcategories: [
      'How to Create a Gig',
      'How to Post a Job',
      'How Escrow Works',
      'How to Withdraw Earnings',
      'How to Get Verified (KYC)',
      'Monetization Requirements',
      'Using Scrolitha AI',
      'Account Security Guide',
      'Policy & Community Standards'
    ]
  },
  {
    name: 'Business & Entrepreneurship',
    description: 'Practical operating advice for founders, startups, and online businesses.',
    seoPrimaryCategory: 'Business',
    subcategories: [
      'Starting an Online Business',
      'Scaling a Startup',
      'Building Digital Products',
      'SaaS Growth Strategies',
      'Business Automation',
      'Digital Marketing Insights',
      'Revenue Diversification'
    ]
  },
  {
    name: 'Technology & Development',
    description: 'Engineering best practices across frontend, backend, realtime systems, and security.',
    seoPrimaryCategory: 'Business',
    subcategories: [
      'Modern Web Development',
      'TypeScript Best Practices',
      'Node.js Architecture',
      'React & Frontend Optimization',
      'Real-Time Web Applications',
      'API Design Patterns',
      'Security in Web Apps'
    ]
  },
  {
    name: 'Cybersecurity & Online Safety',
    description: 'Security guidance for identity protection, privacy, and compliance on the web.',
    seoPrimaryCategory: 'Security',
    subcategories: [
      'Protecting Your Online Identity',
      'Secure Authentication Practices',
      'Avoiding Phishing Attacks',
      'Data Protection Strategies',
      'Privacy Compliance Basics'
    ]
  },
  {
    name: 'Case Studies & Success Stories',
    description: 'Real examples of freelancers, clients, marketplace growth, and product wins.',
    seoPrimaryCategory: 'Freelancing',
    subcategories: [
      'Freelancer Success Stories',
      'Client Hiring Case Studies',
      'Marketplace Growth Stories',
      'AI Productivity Transformations',
      'Platform Milestones'
    ]
  },
  {
    name: 'Industry News & Trends',
    description: 'Reports and commentary on remote work, fintech, AI, and creator-economy shifts.',
    seoPrimaryCategory: 'Business',
    subcategories: [
      'Freelance Industry Reports',
      'Remote Work Trends',
      'AI in Business',
      'Fintech Innovations',
      'Creator Economy Insights'
    ]
  },
  {
    name: 'Marketing & Growth',
    description: 'Audience growth, SEO, branding, and content distribution strategies.',
    seoPrimaryCategory: 'Business',
    subcategories: [
      'SEO for Freelancers',
      'Social Media Growth Strategies',
      'Personal Branding Tips',
      'Content Marketing Guides',
      'Building an Online Presence'
    ]
  },
  {
    name: 'Legal & Compliance',
    description: 'Contracts, policies, dispute handling, and digital compliance for online work.',
    seoPrimaryCategory: 'Security',
    subcategories: [
      'Freelance Contracts 101',
      'Dispute Resolution Tips',
      'Understanding Platform Policies',
      'Digital Work Agreements',
      'Financial Compliance Basics'
    ]
  },
  {
    name: 'Community & Announcements',
    description: 'Scrolith product updates, policy announcements, and community highlights.',
    seoPrimaryCategory: 'Platform Guides',
    subcategories: [
      'Product Updates',
      'New Features',
      'Platform Announcements',
      'Policy Updates',
      'Community Spotlights'
    ]
  }
];

const DEFAULT_SUPPORT_CATEGORY_GROUPS: SupportCategoryGroupSeed[] = [
  {
    group: 'Technical Support',
    items: [
      'Website Not Loading / Errors',
      'Dashboard Issues',
      'API / Integration Issues',
      'Performance & Speed Problems',
      'Mobile App Issues',
      'Bug Report',
      'Feature Not Working',
      'Upload Errors (Files / Media)',
      'Login / Session Timeout Issues'
    ]
  },
  {
    group: 'Account & Access',
    items: [
      'Account Registration Issues',
      'Login / Sign-in Problems',
      'Password Reset',
      'Two-Factor Authentication (2FA)',
      'Account Verification Issues',
      'Account Suspension / Restriction',
      'Change Email / Username',
      'Delete Account Request'
    ]
  },
  {
    group: 'Freelancer Support',
    items: [
      'Gig Creation / Editing Issues',
      'Gig Review / Approval Status',
      'Gig Visibility Problems',
      'Orders Not Appearing',
      'Delivery / Revision Issues',
      'Earnings Not Updating',
      'ATM Time Tracker Issues',
      'KYC Verification (Freelancer)',
      'Freelancer Pro Subscription'
    ]
  },
  {
    group: 'Employer / Client Support',
    items: [
      'Job Posting Issues',
      'Proposals Not Showing',
      'Contract Creation Problems',
      'Hiring / Offer Acceptance Issues',
      'Employer Pro Subscription',
      'Favorites / Saved Gigs Issues',
      'Project Brief (AI) Issues'
    ]
  },
  {
    group: 'Payments, Wallet & Escrow',
    items: [
      'Payment Failed / Declined',
      'Escrow Funding Issues',
      'Wallet Balance Incorrect',
      'Pending Clearance Problems',
      'Withdrawal Request Issues',
      'Refund Request',
      'Invoice / Receipt Request',
      'Currency Conversion Issues'
    ]
  },
  {
    group: 'Gcoin & Rewards',
    items: [
      'Gcoin Balance Issue',
      'Gcoin Earnings Missing',
      'Send / Receive Gcoin',
      'Donation / Tipping Issues',
      'Gcoin Conversion Request',
      'Gcoin Wallet Frozen',
      'Fraud Review / Appeal'
    ]
  },
  {
    group: 'Ads & Promotions',
    items: [
      'Create Ad Issues',
      'Ad Payment Problems',
      'Ad Approval / Rejection',
      'Ad Performance Tracking',
      'Ad Billing Discrepancies',
      'Promote Post Issues'
    ]
  },
  {
    group: 'Community & Forum',
    items: [
      'Community Post Issues',
      'Image / Video Upload in Community',
      'Story / Feed Problems',
      'Follow / Unfollow Issues',
      'Business Page Management',
      'Mentions / Tags Not Working',
      'Community Ads Issues',
      'Community Profile Issues'
    ]
  },
  {
    group: 'Uploaded Files & Media Library',
    items: [
      'Upload File Failed',
      'File Not Displaying',
      'Copy URL Not Working',
      'Delete File Issues',
      'File Permission / Access',
      'Media Usage Conflict'
    ]
  },
  {
    group: 'Notifications & Messaging',
    items: [
      'Messages Not Delivering',
      'Notifications Not Appearing',
      'Real-Time Updates Not Working',
      'Message Attachments Issues',
      'Conversation Missing'
    ]
  },
  {
    group: 'Disputes & Reports',
    items: [
      'Order Dispute',
      'Contract Dispute',
      'Refund Dispute',
      'Report User',
      'Report Content',
      'Policy Violation Appeal'
    ]
  },
  {
    group: 'Security & Privacy',
    items: [
      'Suspicious Activity',
      'Account Hacked / Compromised',
      'Privacy Concern',
      'Data Access Request',
      'GDPR / Data Deletion Request'
    ]
  },
  {
    group: 'Admin & Platform Governance',
    items: [
      'Content Moderation Review',
      'User Management',
      'System Configuration',
      'Platform Settings',
      'Role & Permission Issues',
      'Audit / Compliance Review'
    ]
  },
  {
    group: 'Feature Requests & Feedback',
    items: [
      'Feature Request',
      'UI/UX Feedback',
      'Platform Improvement Suggestion',
      'Beta Feature Access'
    ]
  },
  {
    group: 'Legal & Compliance',
    items: [
      'Terms & Conditions Inquiry',
      'Copyright / DMCA',
      'Trademark Concern',
      'Legal Notice'
    ]
  },
  {
    group: 'General Support',
    items: [
      'General Inquiry',
      'How-To Questions',
      'Platform Guidance',
      'Other / Not Listed'
    ]
  }
];

const buildDefaultPageCategories = () => {
  const timestamp = nowIso();
  return DEFAULT_PAGE_CATEGORY_NAMES.map((name, index) => {
    const slug = slugify(name);
    return {
      id: makeStableId('page-category', slug),
      name,
      slug,
      count: 0,
      status: 'active',
      description: `${name} used to organize Scrolith pages and screen-level content.`,
      image: null,
      sortOrder: index + 1,
      sort_order: index + 1,
      isDefault: true,
      defaultKey: slug,
      created_at: timestamp,
      updated_at: timestamp
    };
  });
};

const buildDefaultBlogCategories = () => {
  const timestamp = nowIso();
  const categories: CmsCategoryRecord[] = [];

  DEFAULT_BLOG_CATEGORY_GROUPS.forEach((group, groupIndex) => {
    const groupSlug = slugify(group.name);
    const groupId = makeStableId('blog-category', groupSlug);

    categories.push({
      id: groupId,
      name: group.name,
      slug: groupSlug,
      description: group.description,
      status: 'active',
      count: 0,
      kind: 'group',
      group: group.name,
      parent_id: null,
      parent_slug: null,
      seoPrimaryCategory: group.seoPrimaryCategory,
      sortOrder: groupIndex + 1,
      sort_order: groupIndex + 1,
      isDefault: true,
      defaultKey: groupSlug,
      created_at: timestamp,
      updated_at: timestamp
    });

    group.subcategories.forEach((subcategory, subIndex) => {
      const subSlug = `${groupSlug}-${slugify(subcategory)}`;
      categories.push({
        id: makeStableId('blog-category', subSlug),
        name: subcategory,
        slug: subSlug,
        description: `${subcategory} resources and articles under ${group.name}.`,
        status: 'active',
        count: 0,
        kind: 'subcategory',
        group: group.name,
        parent_id: groupId,
        parent_slug: groupSlug,
        seoPrimaryCategory: group.seoPrimaryCategory,
        sortOrder: (groupIndex + 1) * 100 + subIndex + 1,
        sort_order: (groupIndex + 1) * 100 + subIndex + 1,
        isDefault: true,
        defaultKey: subSlug,
        created_at: timestamp,
        updated_at: timestamp
      });
    });
  });

  return categories;
};

const buildDefaultSupportCategoryNames = () => {
  const names: string[] = [];
  for (const group of DEFAULT_SUPPORT_CATEGORY_GROUPS) {
    for (const item of group.items) {
      names.push(`${group.group} / ${item}`);
    }
  }
  return names;
};

type CategoryStore = {
  category: {
    findFirst: (...args: any[]) => Promise<any>;
    findMany: (...args: any[]) => Promise<any[]>;
    create: (...args: any[]) => Promise<any>;
    update: (...args: any[]) => Promise<any>;
    count: (...args: any[]) => Promise<number>;
  };
};

const resolveUniqueCategorySlug = async (
  tx: CategoryStore,
  candidate: string,
  options: { excludeId?: string; fallbackPrefix?: string } = {}
) => {
  const base = slugify(candidate) || slugify(options.fallbackPrefix || 'category') || 'category';
  let attempt = base;
  let counter = 2;

  while (true) {
    const existing = await tx.category.findFirst({
      where: {
        slug: attempt,
        ...(options.excludeId ? { NOT: { id: options.excludeId } } : {})
      },
      select: { id: true }
    });

    if (!existing) {
      return attempt;
    }

    attempt = `${base}-${counter}`;
    counter += 1;
  }
};

export const ensureDefaultPageCategories = async () => {
  const data = await getAppSettingData(CMS_PAGE_CATEGORIES_SCOPE, { categories: [] });
  const categories = Array.isArray((data as any)?.categories) ? (data as any).categories : [];
  const { merged, changed } = mergeDefaultCmsCategories(categories, buildDefaultPageCategories());

  if (changed) {
    await saveAppSettingData(CMS_PAGE_CATEGORIES_SCOPE, { categories: merged });
  }

  return merged;
};

export const ensureDefaultBlogCategories = async () => {
  const [categoriesData, postsData] = await Promise.all([
    getAppSettingData(CMS_BLOG_CATEGORIES_SCOPE, { categories: [] }),
    getAppSettingData(CMS_BLOG_POSTS_SCOPE, { posts: [] })
  ]);

  const categories = Array.isArray((categoriesData as any)?.categories) ? (categoriesData as any).categories : [];
  const posts = Array.isArray((postsData as any)?.posts) ? (postsData as any).posts : [];
  const defaults = buildDefaultBlogCategories();
  const { merged, changed } = mergeDefaultCmsCategories(categories, defaults);
  const withCounts = computeBlogCategoryCounts(posts, merged);
  const countsChanged =
    merged.length !== withCounts.length ||
    merged.some((category, index) => Number(category.count ?? 0) !== Number(withCounts[index]?.count ?? 0));

  if (changed || countsChanged) {
    await saveAppSettingData(CMS_BLOG_CATEGORIES_SCOPE, { categories: withCounts });
  }

  return withCounts;
};

export const ensureDefaultSupportTicketCategories = async () => {
  const defaultNames = buildDefaultSupportCategoryNames();
  const existing = await prisma.supportTicketCategory.findMany({
    select: { id: true, name: true, isActive: true },
    orderBy: { name: 'asc' }
  });

  const existingNames = new Set(existing.map((item) => String(item.name || '').trim().toLowerCase()));
  const missingNames = defaultNames.filter((name) => !existingNames.has(name.toLowerCase()));

  if (missingNames.length > 0) {
    await prisma.supportTicketCategory.createMany({
      data: missingNames.map((name) => ({ name, isActive: true })),
      skipDuplicates: true
    });
  }

  return prisma.supportTicketCategory.findMany({
    orderBy: { name: 'asc' }
  });
};

export const syncStandardListingCategories = async () => {
  return prisma.$transaction(async (tx) => {
    const result = {
      categoriesCreated: 0,
      categoriesUpdated: 0,
      subcategoriesCreated: 0,
      subcategoriesUpdated: 0
    };

    for (let catIndex = 0; catIndex < STANDARD_LISTING_CATEGORIES.length; catIndex += 1) {
      const item = STANDARD_LISTING_CATEGORIES[catIndex];
      const name = String(item.name || '').trim();
      if (!name) continue;

      const baseSlug = slugify(name);
      const existing = await tx.category.findFirst({
        where: {
          parentId: null,
          OR: [{ slug: baseSlug }, { name: { equals: name, mode: 'insensitive' } }]
        },
        include: { children: true }
      });

      const parentSlug = await resolveUniqueCategorySlug(tx, baseSlug, {
        excludeId: existing?.id,
        fallbackPrefix: 'category'
      });

      const parent = existing
        ? await tx.category.update({
            where: { id: existing.id },
            data: {
              name,
              slug: parentSlug,
              description: item.description || existing.description || null,
              isActive: true,
              type: 'BOTH',
              order: catIndex + 1
            }
          })
        : await tx.category.create({
            data: {
              name,
              slug: parentSlug,
              description: item.description || null,
              isActive: true,
              type: 'BOTH',
              order: catIndex + 1
            }
          });

      if (existing) result.categoriesUpdated += 1;
      else result.categoriesCreated += 1;

      const existingChildren = (await tx.category.findMany({
        where: { parentId: parent.id },
        select: { id: true, name: true, slug: true }
      })) as Array<{ id: string; name: string; slug: string }>;
      const childrenByName = new Map<string, { id: string; name: string; slug: string }>(
        existingChildren.map((child) => [String(child.name).toLowerCase(), child])
      );
      const seen = new Set<string>();

      for (let subIndex = 0; subIndex < item.subcategories.length; subIndex += 1) {
        const subName = String(item.subcategories[subIndex] || '').trim();
        if (!subName) continue;

        const normalizedName = subName.toLowerCase();
        if (seen.has(normalizedName)) continue;
        seen.add(normalizedName);

        const existingChild = childrenByName.get(normalizedName);
        const subSlugCandidate = `${parentSlug}-${slugify(subName) || `sub-${subIndex + 1}`}`;
        const resolvedSubSlug = await resolveUniqueCategorySlug(tx, subSlugCandidate, {
          excludeId: existingChild?.id,
          fallbackPrefix: parentSlug
        });

        if (existingChild) {
          await tx.category.update({
            where: { id: existingChild.id },
            data: {
              name: subName,
              slug: resolvedSubSlug,
              isActive: true,
              type: 'BOTH',
              order: subIndex + 1,
              parentId: parent.id
            }
          });
          result.subcategoriesUpdated += 1;
        } else {
          await tx.category.create({
            data: {
              name: subName,
              slug: resolvedSubSlug,
              isActive: true,
              type: 'BOTH',
              order: subIndex + 1,
              parentId: parent.id
            }
          });
          result.subcategoriesCreated += 1;
        }
      }
    }

    return result;
  });
};

export const ensureStandardListingCategoriesSeeded = async () => {
  const totalParents = await prisma.category.count({
    where: {
      parentId: null,
      isActive: true,
      type: { in: ['GIG', 'JOB', 'BOTH'] }
    }
  });

  if (totalParents < STANDARD_LISTING_CATEGORIES.length) {
    await syncStandardListingCategories();
    return;
  }

  const categories = await prisma.category.findMany({
    where: {
      parentId: null,
      isActive: true,
      type: { in: ['GIG', 'JOB', 'BOTH'] }
    },
    include: { children: { select: { id: true, name: true } } }
  });

  const names = new Set(categories.map((item) => String(item.name || '').trim().toLowerCase()));
  let needsSync = false;

  for (const standardCategory of STANDARD_LISTING_CATEGORIES) {
    const categoryName = String(standardCategory.name || '').trim().toLowerCase();
    if (!names.has(categoryName)) {
      needsSync = true;
      break;
    }

    const matching = categories.find((item) => String(item.name || '').trim().toLowerCase() === categoryName);
    if (!matching) {
      needsSync = true;
      break;
    }

    const childNames = new Set((matching.children || []).map((child) => String(child.name || '').trim().toLowerCase()));
    for (const subcategory of standardCategory.subcategories) {
      if (!childNames.has(String(subcategory || '').trim().toLowerCase())) {
        needsSync = true;
        break;
      }
    }
    if (needsSync) break;
  }

  if (needsSync) {
    await syncStandardListingCategories();
  }
};
