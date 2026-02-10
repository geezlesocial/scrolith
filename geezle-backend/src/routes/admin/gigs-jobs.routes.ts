import express, { Request, Response } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import prisma from '../../utils/prismaClient';
import { listPlans, savePlan, togglePlanActive } from '../../services/planStore';

const router = express.Router();

// Use the existing auth middleware (admin middleware applied at parent router)
router.use(authMiddleware);

type AnyRecord = Record<string, any>;

const nowIso = () => new Date().toISOString();
const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const toLower = (value: unknown) =>
  typeof value === 'string' ? value.toLowerCase() : '';
const toNumber = (value: unknown, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};
const safeArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value : []);
const toUpper = (value: unknown) =>
  typeof value === 'string' ? value.toUpperCase() : '';

const gigStatuses = new Set([
  'draft',
  'submitted',
  'under_review',
  'active',
  'paused',
  'rejected',
  'archived'
]);

const jobStatuses = new Set([
  'draft',
  'submitted',
  'under_review',
  'active',
  'paused',
  'rejected',
  'archived',
  'closed'
]);

const normalizeStatus = (value: unknown, allowed: Set<string>, fallback: string) => {
  const status = toLower(value);
  if (status === 'pending') return 'under_review';
  return allowed.has(status) ? status : fallback;
};

const normalizeGigAdminStatus = (value: unknown, status: string) => {
  const adminStatus = toLower(value);
  if (adminStatus === 'approved' || adminStatus === 'rejected' || adminStatus === 'pending') {
    return adminStatus;
  }
  if (status === 'active') return 'approved';
  if (status === 'rejected') return 'rejected';
  return 'pending';
};

const normalizeCategoryType = (value: unknown): 'GIG' | 'JOB' | 'BOTH' => {
  const v = toLower(value);
  if (v === 'job' || v === 'jobs') return 'JOB';
  if (v === 'both') return 'BOTH';
  return 'GIG';
};

const normalizeCategoryStatus = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  const v = toLower(value);
  if (!v) return true;
  return v === 'active' || v === 'true' || v === '1';
};

const slugify = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const normalizeJobAdminStatus = (value: unknown, status: string) => {
  const adminStatus = toLower(value);
  if (adminStatus === 'approved' || adminStatus === 'rejected' || adminStatus === 'pending') {
    return adminStatus;
  }
  if (status === 'active') return 'approved';
  if (status === 'rejected') return 'rejected';
  return 'pending';
};

const mapGigStatusInput = (value: unknown, fallback: string) => {
  const v = toLower(value);
  if (v === 'draft') return 'DRAFT';
  if (v === 'submitted' || v === 'under_review' || v === 'pending') return 'PENDING';
  if (v === 'active') return 'ACTIVE';
  if (v === 'paused') return 'PAUSED';
  if (v === 'rejected') return 'REJECTED';
  return fallback;
};

const mapJobStatusInput = (value: unknown, fallback: string) => {
  const v = toLower(value);
  if (v === 'draft') return 'DRAFT';
  if (v === 'submitted') return 'SUBMITTED';
  if (v === 'under_review') return 'UNDER_REVIEW';
  if (v === 'active') return 'ACTIVE';
  if (v === 'paused') return 'CLOSED';
  if (v === 'rejected') return 'REJECTED';
  if (v === 'archived') return 'ARCHIVED';
  return fallback;
};

const mapJobTypeInput = (value: unknown, fallback: string) => {
  const v = toLower(value).replace(/\s+/g, '_');
  if (v === 'fixed_price' || v === 'fixed') return 'FIXED_PRICE';
  if (v === 'hourly') return 'HOURLY';
  if (v === 'contract') return 'CONTRACT';
  return fallback;
};

const mapAdminStatusInput = (value: unknown, fallback: string) => {
  const v = toUpper(value);
  if (v === 'APPROVED' || v === 'REJECTED' || v === 'PENDING') return v;
  return fallback;
};

const resolveCategoryId = async (value: unknown, type: 'GIG' | 'JOB') => {
  if (!value) return null;
  const search = String(value);
  const category = await prisma.category.findFirst({
    where: {
      OR: [{ id: search }, { name: search }, { slug: search }],
      type: { in: [type, 'BOTH'] }
    }
  });
  return category?.id || null;
};

const toAdminGig = (gig: any) => {
  const status = (gig.status || '').toString().toUpperCase();
  const adminStatus = (gig.adminStatus || '').toString().toUpperCase();
  const mappedStatus = status === 'PENDING' ? 'submitted' : status.toLowerCase();
  const images = Array.isArray(gig.images) ? gig.images : [];
  return {
    id: gig.id,
    title: gig.title,
    description: gig.description || '',
    category: gig.category?.name || gig.categoryId || '',
    subcategory: gig.subcategory || '',
    price: Number(gig.price || 0),
    pricing_mode: gig.pricingMode || gig.pricing_mode || 'packages',
    pricingMode: gig.pricingMode || gig.pricing_mode || 'packages',
    packages: Array.isArray(gig.packages) ? gig.packages : [],
    extras: Array.isArray(gig.extras) ? gig.extras : [],
    faqs: Array.isArray(gig.faqs) ? gig.faqs : [],
    requirements: Array.isArray(gig.requirements) ? gig.requirements : [],
    images,
    videos: Array.isArray(gig.videos) ? gig.videos : [],
    documents: Array.isArray(gig.documents) ? gig.documents : [],
    tags: Array.isArray(gig.tags) ? gig.tags : [],
    meta: gig.meta || null,
    status: mappedStatus,
    admin_status: adminStatus ? adminStatus.toLowerCase() : 'pending',
    adminStatus: adminStatus ? adminStatus.toLowerCase() : 'pending',
    admin_reason: gig.adminReason || null,
    is_visible: status === 'ACTIVE',
    is_active: Boolean(gig.isActive),
    is_featured: Boolean(gig.isFeatured),
    is_top_selected: Boolean(gig.isTopSelected),
    is_recommended: Boolean(gig.isRecommended),
    freelancer_id: gig.userId,
    freelancer_name: gig.user?.name || 'Freelancer',
    freelancer_avatar: gig.user?.avatar || '',
    image: gig.image || images[0] || '',
    created_at: gig.createdAt,
    updated_at: gig.updatedAt
  };
};

const toAdminJob = (job: any) => {
  const status = (job.status || '').toString().toUpperCase();
  const adminStatus = (job.adminStatus || '').toString().toUpperCase();
  const mappedStatus = status === 'UNDER_REVIEW' ? 'under_review' : status.toLowerCase();
  return {
    id: job.id,
    title: job.title,
    description: job.description || '',
    category: job.category?.name || job.categoryId || '',
    subcategory: job.subcategory || '',
    budget: job.budget || '',
    type: job.type ? job.type.toLowerCase() : 'fixed_price',
    status: mappedStatus,
    admin_status: adminStatus ? adminStatus.toLowerCase() : 'pending',
    adminStatus: adminStatus ? adminStatus.toLowerCase() : 'pending',
    admin_reason: job.adminReason || null,
    is_visible: Boolean(job.isVisible),
    is_active: Boolean(job.isActive),
    is_featured: Boolean(job.isFeatured),
    is_top_selected: Boolean(job.isTopSelected),
    is_recommended: Boolean(job.isRecommended),
    client_id: job.clientId,
    client_name: job.client?.name || 'Client',
    created_at: job.createdAt,
    updated_at: job.updatedAt
  };
};

const normalizeGigPackages = (value: unknown) =>
  safeArray<AnyRecord>(value).map((pkg) => ({
    name: pkg?.name ?? 'Package',
    description: pkg?.description ?? '',
    delivery_days: toNumber(pkg?.delivery_days ?? pkg?.deliveryDays, 0),
    revisions: toNumber(pkg?.revisions, 0),
    price: toNumber(pkg?.price, 0),
    features: safeArray<string>(pkg?.features)
  }));

const normalizeGigExtras = (value: unknown) =>
  safeArray<AnyRecord>(value).map((extra) => ({
    id: extra?.id ?? makeId('extra'),
    title: extra?.title ?? '',
    description: extra?.description ?? '',
    price: toNumber(extra?.price, 0),
    additional_days: toNumber(extra?.additional_days ?? extra?.additionalDays, 0),
    applies_to: extra?.applies_to ?? extra?.appliesTo ?? 'all'
  }));

const normalizeGigFaqs = (value: unknown) =>
  safeArray<AnyRecord>(value).map((faq) => ({
    id: faq?.id ?? makeId('faq'),
    question: faq?.question ?? '',
    answer: faq?.answer ?? ''
  }));

const normalizeGigRequirements = (value: unknown) =>
  safeArray<AnyRecord>(value).map((req) => ({
    id: req?.id ?? makeId('req'),
    question: req?.question ?? '',
    type: req?.type ?? 'text',
    required: Boolean(req?.required ?? true)
  }));

const buildGigRecord = (payload: AnyRecord, existing?: AnyRecord) => {
  const status = normalizeStatus(
    payload?.status ?? payload?.admin_status ?? payload?.adminStatus ?? existing?.status,
    gigStatuses,
    existing?.status ?? 'draft'
  );
  const adminStatus = normalizeGigAdminStatus(
    payload?.admin_status ?? payload?.adminStatus ?? existing?.admin_status,
    status
  );
  const images = safeArray<string>(payload?.images ?? existing?.images);

  return {
    id: existing?.id ?? payload?.id ?? makeId('gig'),
    title: payload?.title ?? existing?.title ?? 'Untitled Gig',
    description: payload?.description ?? existing?.description ?? '',
    category: payload?.category ?? existing?.category ?? '',
    subcategory: payload?.subcategory ?? existing?.subcategory ?? '',
    price: toNumber(payload?.price ?? existing?.price, 0),
    pricing_mode: payload?.pricing_mode ?? payload?.pricingMode ?? existing?.pricing_mode ?? 'fixed',
    packages: normalizeGigPackages(payload?.packages ?? existing?.packages),
    extras: normalizeGigExtras(payload?.extras ?? existing?.extras),
    faqs: normalizeGigFaqs(payload?.faqs ?? existing?.faqs),
    requirements: normalizeGigRequirements(payload?.requirements ?? existing?.requirements),
    images,
    videos: safeArray<string>(payload?.videos ?? existing?.videos),
    documents: safeArray<string>(payload?.documents ?? existing?.documents),
    status,
    admin_status: adminStatus,
    image: payload?.image ?? images[0] ?? existing?.image ?? '',
    freelancer_name: payload?.freelancer_name ?? payload?.freelancerName ?? existing?.freelancer_name ?? 'Admin',
    freelancer_id: payload?.freelancer_id ?? payload?.freelancerId ?? existing?.freelancer_id ?? 'admin',
    freelancer_avatar: payload?.freelancer_avatar ?? payload?.freelancerAvatar ?? existing?.freelancer_avatar ?? '',
    rating: toNumber(payload?.rating ?? existing?.rating, 0),
    reviews: toNumber(payload?.reviews ?? existing?.reviews, 0),
    views: toNumber(payload?.views ?? existing?.views, 0),
    clicks: toNumber(payload?.clicks ?? existing?.clicks, 0),
    orders_count: toNumber(payload?.orders_count ?? payload?.ordersCount ?? existing?.orders_count, 0),
    is_visible: Boolean(payload?.is_visible ?? payload?.isVisible ?? existing?.is_visible ?? status === 'active'),
    is_featured: Boolean(payload?.is_featured ?? payload?.isFeatured ?? existing?.is_featured ?? false),
    is_top_selected: Boolean(payload?.is_top_selected ?? payload?.isTopSelected ?? existing?.is_top_selected ?? false),
    is_recommended: Boolean(payload?.is_recommended ?? payload?.isRecommended ?? existing?.is_recommended ?? false),
    created_at: existing?.created_at ?? payload?.created_at ?? nowIso(),
    updated_at: nowIso()
  };
};

const buildJobRecord = (payload: AnyRecord, existing?: AnyRecord) => {
  const status = normalizeStatus(
    payload?.status ?? payload?.admin_status ?? payload?.adminStatus ?? existing?.status,
    jobStatuses,
    existing?.status ?? 'draft'
  );
  const adminStatus = normalizeJobAdminStatus(
    payload?.admin_status ?? payload?.adminStatus ?? existing?.admin_status,
    status
  );

  return {
    id: existing?.id ?? payload?.id ?? makeId('job'),
    title: payload?.title ?? existing?.title ?? 'Untitled Job',
    client_name: payload?.client_name ?? payload?.clientName ?? existing?.client_name ?? 'Admin',
    budget: payload?.budget ?? existing?.budget ?? '',
    type: payload?.type ?? existing?.type ?? 'Fixed Price',
    posted_time: payload?.posted_time ?? existing?.posted_time ?? nowIso(),
    description: payload?.description ?? existing?.description ?? '',
    tags: safeArray<string>(payload?.tags ?? existing?.tags),
    proposals: toNumber(payload?.proposals ?? existing?.proposals, 0),
    status,
    is_active: Boolean(payload?.is_active ?? payload?.isActive ?? existing?.is_active ?? status === 'active'),
    is_visible: Boolean(payload?.is_visible ?? payload?.isVisible ?? existing?.is_visible ?? status === 'active'),
    is_featured: Boolean(payload?.is_featured ?? payload?.isFeatured ?? existing?.is_featured ?? false),
    is_top_selected: Boolean(payload?.is_top_selected ?? payload?.isTopSelected ?? existing?.is_top_selected ?? false),
    is_recommended: Boolean(payload?.is_recommended ?? payload?.isRecommended ?? existing?.is_recommended ?? false),
    category: payload?.category ?? existing?.category ?? '',
    subcategory: payload?.subcategory ?? existing?.subcategory ?? '',
    experience_level: payload?.experience_level ?? payload?.experienceLevel ?? existing?.experience_level ?? 'Intermediate',
    admin_status: adminStatus,
    created_at: existing?.created_at ?? payload?.created_at ?? nowIso(),
    updated_at: nowIso()
  };
};

const formatAdminCategory = (cat: any, type: 'gig' | 'job') => ({
  id: cat.id,
  name: cat.name,
  slug: cat.slug || '',
  type,
  status: cat.isActive ? 'active' : 'hidden',
  count: 0,
  sort_order: Number.isFinite(cat.order) ? cat.order : 0,
  subcategories: Array.isArray(cat.children)
    ? cat.children.map((child: any) => ({
        id: child.id,
        name: child.name,
        slug: child.slug || '',
        status: child.isActive ? 'active' : 'hidden',
        sort_order: Number.isFinite(child.order) ? child.order : 0,
        icon: child.icon || ''
      }))
    : [],
  description: cat.description || '',
  logo: cat.icon || ''
});

let gigs: AnyRecord[] = [
  {
    id: 'gig-mock-1',
    title: 'I will design a modern logo for your brand',
    description: 'Professional logo design service with multiple concepts and revisions.',
    category: 'Graphics & Design',
    subcategory: 'Logo Design',
    price: 50,
    pricing_mode: 'packages',
    packages: [
      {
        name: 'Basic',
        description: 'Simple logo with 2 concepts',
        delivery_days: 3,
        revisions: 1,
        price: 50,
        features: ['1 Logo Concept', 'Basic Source File']
      }
    ],
    extras: [],
    faqs: [],
    requirements: [],
    images: ['https://picsum.photos/800/600?random=1'],
    videos: [],
    documents: [],
    status: 'active',
    admin_status: 'approved',
    image: 'https://picsum.photos/800/600?random=1',
    freelancer_name: 'Alex Johnson',
    freelancer_id: 'user-mock-1',
    freelancer_avatar: 'https://i.pravatar.cc/150?img=1',
    rating: 4.9,
    reviews: 127,
    views: 1250,
    clicks: 340,
    orders_count: 89,
    is_visible: true,
    is_featured: true,
    is_top_selected: false,
    is_recommended: true,
    created_at: '2024-01-15T10:30:00Z',
    updated_at: '2024-03-20T14:15:00Z'
  },
  {
    id: 'gig-mock-2',
    title: 'Build a responsive website with React',
    description: 'Modern website development using React, TypeScript, and Tailwind CSS.',
    category: 'Programming & Tech',
    subcategory: 'Web Development',
    price: 500,
    pricing_mode: 'packages',
    packages: [
      {
        name: 'Standard',
        description: 'Responsive website with CMS',
        delivery_days: 14,
        revisions: 3,
        price: 500,
        features: ['Responsive Design', 'CMS Integration', 'SEO Optimization']
      }
    ],
    extras: [],
    faqs: [],
    requirements: [],
    images: ['https://picsum.photos/800/600?random=2'],
    videos: [],
    documents: [],
    status: 'under_review',
    admin_status: 'pending',
    image: 'https://picsum.photos/800/600?random=2',
    freelancer_name: 'Sam Wilson',
    freelancer_id: 'user-mock-2',
    freelancer_avatar: 'https://i.pravatar.cc/150?img=2',
    rating: 0,
    reviews: 0,
    views: 0,
    clicks: 0,
    orders_count: 0,
    is_visible: false,
    is_featured: false,
    is_top_selected: false,
    is_recommended: false,
    created_at: '2024-03-18T09:00:00Z',
    updated_at: '2024-03-18T09:00:00Z'
  },
  {
    id: 'gig-mock-3',
    title: 'Social media graphics package',
    description: 'Complete set of social media graphics for your brand.',
    category: 'Graphics & Design',
    subcategory: 'Social Media Design',
    price: 100,
    pricing_mode: 'fixed',
    packages: [],
    extras: [],
    faqs: [],
    requirements: [],
    images: ['https://picsum.photos/800/600?random=3'],
    videos: [],
    documents: [],
    status: 'paused',
    admin_status: 'approved',
    image: 'https://picsum.photos/800/600?random=3',
    freelancer_name: 'Jamie Smith',
    freelancer_id: 'user-mock-3',
    freelancer_avatar: 'https://i.pravatar.cc/150?img=3',
    rating: 4.7,
    reviews: 45,
    views: 560,
    clicks: 120,
    orders_count: 32,
    is_visible: false,
    is_featured: false,
    is_top_selected: true,
    is_recommended: false,
    created_at: '2024-02-10T14:20:00Z',
    updated_at: '2024-03-15T11:30:00Z'
  }
];

let jobs: AnyRecord[] = [
  {
    id: 'job-mock-1',
    title: 'Need a React Developer for E-commerce Project',
    client_name: 'TechCorp Inc',
    budget: '$5000',
    type: 'Fixed Price',
    posted_time: '2 days ago',
    description: 'Looking for experienced React developer to build an e-commerce platform.',
    tags: ['React', 'TypeScript', 'E-commerce', 'Tailwind'],
    proposals: 12,
    status: 'active',
    is_active: true,
    is_visible: true,
    is_featured: true,
    is_top_selected: true,
    is_recommended: false,
    category: 'Programming & Tech',
    subcategory: 'Web Development',
    experience_level: 'Intermediate',
    admin_status: 'approved',
    created_at: '2024-03-18T09:00:00Z',
    updated_at: '2024-03-18T09:00:00Z'
  },
  {
    id: 'job-mock-2',
    title: 'Mobile App UI/UX Designer',
    client_name: 'StartupXYZ',
    budget: '$3000',
    type: 'Fixed Price',
    posted_time: '1 week ago',
    description: 'Looking for talented UI/UX designer for mobile banking app.',
    tags: ['UI/UX', 'Mobile', 'Figma', 'Prototyping'],
    proposals: 8,
    status: 'active',
    is_active: true,
    is_visible: true,
    is_featured: false,
    is_top_selected: false,
    is_recommended: true,
    category: 'Design & Creative',
    subcategory: 'UI/UX Design',
    experience_level: 'Expert',
    admin_status: 'approved',
    created_at: '2024-03-10T12:00:00Z',
    updated_at: '2024-03-10T12:00:00Z'
  }
];

let gigCategories: AnyRecord[] = [
  {
    id: 'cat-gig-1',
    name: 'Graphics & Design',
    slug: 'graphics-design',
    type: 'gig',
    status: 'active',
    count: 24,
    sort_order: 1,
    subcategories: [
      {
        id: 'sub-gig-1',
        name: 'Logo Design',
        slug: 'logo-design',
        status: 'active',
        sort_order: 1,
        icon: 'https://cdn-icons-png.flaticon.com/512/732/732004.png'
      },
      {
        id: 'sub-gig-2',
        name: 'Brand Style Guides',
        slug: 'brand-style-guides',
        status: 'active',
        sort_order: 2,
        icon: 'https://cdn-icons-png.flaticon.com/512/2972/2972544.png'
      }
    ],
    description: 'Design services including logos, branding, and graphics',
    logo: 'https://cdn-icons-png.flaticon.com/512/2972/2972544.png'
  },
  {
    id: 'cat-gig-2',
    name: 'Programming & Tech',
    slug: 'programming-tech',
    type: 'gig',
    status: 'active',
    count: 42,
    sort_order: 2,
    subcategories: [
      {
        id: 'sub-gig-3',
        name: 'Web Development',
        slug: 'web-development',
        status: 'active',
        sort_order: 1,
        icon: ''
      },
      {
        id: 'sub-gig-4',
        name: 'Mobile App Development',
        slug: 'mobile-app-development',
        status: 'active',
        sort_order: 2,
        icon: ''
      }
    ],
    description: 'Programming and technical services',
    logo: ''
  }
];

let jobCategories: AnyRecord[] = [
  {
    id: 'cat-job-1',
    name: 'Software Development',
    slug: 'software-development',
    type: 'job',
    status: 'active',
    count: 15,
    sort_order: 1,
    subcategories: [
      {
        id: 'sub-job-1',
        name: 'Full Stack Development',
        slug: 'full-stack-development',
        status: 'active',
        sort_order: 1,
        icon: ''
      },
      {
        id: 'sub-job-2',
        name: 'Mobile Development',
        slug: 'mobile-development',
        status: 'active',
        sort_order: 2,
        icon: ''
      }
    ],
    description: 'Software development and programming jobs',
    logo: ''
  }
];

const applyFilters = (
  items: AnyRecord[],
  filters: {
    status?: string;
    adminStatus?: string;
    search?: string;
    category?: string;
    subcategory?: string;
  }
) => {
  const search = toLower(filters.search);
  return items.filter((item) => {
    if (filters.status && toLower(item.status) !== toLower(filters.status)) return false;
    if (filters.adminStatus && toLower(item.admin_status) !== toLower(filters.adminStatus)) return false;
    if (filters.category && toLower(item.category) !== toLower(filters.category)) return false;
    if (filters.subcategory && toLower(item.subcategory) !== toLower(filters.subcategory)) return false;

    if (!search) return true;
    const haystack = [
      item.title,
      item.description,
      item.category,
      item.subcategory,
      item.client_name
    ]
      .map((value) => toLower(value))
      .join(' ');
    return haystack.includes(search);
  });
};

const applyPagination = (items: AnyRecord[], page?: number, limit?: number) => {
  if (!page || !limit || page < 1 || limit < 1) {
    return { items, meta: null };
  }
  const start = (page - 1) * limit;
  const end = start + limit;
  return {
    items: items.slice(start, end),
    meta: { page, limit, total: items.length }
  };
};

// Root endpoint
router.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Gigs & Jobs Admin API',
    version: '1.0.0',
    user: req.user,
    endpoints: {
      gigs: '/api/admin/gigs-jobs/gigs',
      jobs: '/api/admin/gigs-jobs/jobs',
      categories: '/api/admin/gigs-jobs/categories?type=gig|job',
      plans: '/api/admin/gigs-jobs/plans',
      dashboard: '/api/admin/gigs-jobs/dashboard/stats',
      test: '/api/admin/gigs-jobs/test'
    }
  });
});

// Test endpoint
router.get('/test', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'GigsJobs admin API is working!',
    user: req.user,
    endpoints: [
      'GET    /api/admin/gigs-jobs/gigs',
      'POST   /api/admin/gigs-jobs/gigs',
      'PUT    /api/admin/gigs-jobs/gigs/:id',
      'POST   /api/admin/gigs-jobs/gigs/:id/approve',
      'DELETE /api/admin/gigs-jobs/gigs/:id',
      'GET    /api/admin/gigs-jobs/jobs',
      'POST   /api/admin/gigs-jobs/jobs',
      'PUT    /api/admin/gigs-jobs/jobs/:id',
      'POST   /api/admin/gigs-jobs/jobs/:id/approve',
      'DELETE /api/admin/gigs-jobs/jobs/:id',
      'GET    /api/admin/gigs-jobs/categories',
      'POST   /api/admin/gigs-jobs/categories',
      'DELETE /api/admin/gigs-jobs/categories/:id',
      'GET    /api/admin/gigs-jobs/plans',
      'POST   /api/admin/gigs-jobs/plans',
      'PATCH  /api/admin/gigs-jobs/plans/:id/toggle',
      'GET    /api/admin/gigs-jobs/dashboard/stats'
    ]
  });
});

// Get all gigs
router.get('/gigs', async (req: Request, res: Response) => {
  const status = (req.query.status as string) || undefined;
  const adminStatus =
    (req.query.adminStatus as string) ||
    (req.query.admin_status as string) ||
    undefined;
  const search = (req.query.search as string) || undefined;
  const category = (req.query.category as string) || undefined;
  const subcategory = (req.query.subcategory as string) || undefined;
  const page = req.query.page ? Number(req.query.page) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  try {
    const where: any = {};
    if (status) where.status = mapGigStatusInput(status, 'PENDING');
    if (adminStatus) where.adminStatus = mapAdminStatusInput(adminStatus, 'PENDING');
    if (category) where.category = { name: { equals: String(category), mode: 'insensitive' } };
    if (search) {
      where.OR = [
        { title: { contains: String(search), mode: 'insensitive' } },
        { description: { contains: String(search), mode: 'insensitive' } }
      ];
    }

    const take = limit && Number.isFinite(limit) ? Number(limit) : 50;
    const skip = page && Number.isFinite(page) ? (Number(page) - 1) * take : 0;

    const [rows, total] = await Promise.all([
      prisma.gig.findMany({
        where,
        include: { category: true, user: true },
        orderBy: { updatedAt: 'desc' },
        skip,
        take
      }),
      prisma.gig.count({ where })
    ]);

    res.json({
      success: true,
      data: rows.map(toAdminGig),
      meta: { total, page: page || 1, limit: take, pages: Math.max(1, Math.ceil(total / take)) }
    });
  } catch (error) {
    console.error('Error fetching gigs:', error);
    const filtered = applyFilters(gigs, { status, adminStatus, search, category, subcategory });
    const { items, meta } = applyPagination(filtered, page, limit);
    res.json({
      success: true,
      data: items,
      meta: meta || undefined
    });
  }
});

// Create gig
router.post('/gigs', async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    const existing = payload?.id ? await prisma.gig.findUnique({ where: { id: payload.id } }) : null;
    const categoryId = payload.categoryId || (await resolveCategoryId(payload.category, 'GIG'));
    const status = mapGigStatusInput(payload.status, existing?.status || 'DRAFT');
    const adminStatus = mapAdminStatusInput(payload.admin_status ?? payload.adminStatus, existing?.adminStatus || 'PENDING');
    const userId = payload.freelancerId || payload.freelancer_id || req.user?.id;

    const images = safeArray<string>(payload.images ?? existing?.images);
    const data: any = {
      title: payload.title || existing?.title || 'Untitled Gig',
      description: payload.description ?? existing?.description ?? '',
      price: Number(payload.price ?? existing?.price ?? 0),
      categoryId: categoryId ?? existing?.categoryId ?? null,
      subcategory: payload.subcategory ?? existing?.subcategory ?? null,
      pricingMode: payload.pricing_mode ?? payload.pricingMode ?? existing?.pricingMode ?? 'packages',
      packages: payload.packages ?? existing?.packages ?? [],
      extras: payload.extras ?? existing?.extras ?? [],
      faqs: payload.faqs ?? existing?.faqs ?? [],
      requirements: payload.requirements ?? existing?.requirements ?? [],
      images,
      videos: safeArray<string>(payload.videos ?? existing?.videos),
      documents: safeArray<string>(payload.documents ?? existing?.documents),
      tags: safeArray<string>(payload.tags ?? existing?.tags),
      image: payload.image ?? images[0] ?? existing?.image ?? null,
      meta: payload.meta ?? existing?.meta ?? null,
      status,
      adminStatus,
      adminReason: payload.admin_reason ?? payload.adminReason ?? existing?.adminReason ?? null,
      isActive: status === 'ACTIVE',
      isFeatured: Boolean(payload.is_featured ?? payload.isFeatured ?? existing?.isFeatured ?? false),
      isTopSelected: Boolean(payload.is_top_selected ?? payload.isTopSelected ?? existing?.isTopSelected ?? false),
      isRecommended: Boolean(payload.is_recommended ?? payload.isRecommended ?? existing?.isRecommended ?? false),
      userId: userId || existing?.userId
    };

    const record = existing
      ? await prisma.gig.update({ where: { id: existing.id }, data, include: { category: true, user: true } })
      : await prisma.gig.create({ data, include: { category: true, user: true } });

    res.json({
      success: true,
      data: toAdminGig(record),
      message: existing ? 'Gig updated successfully' : 'Gig created successfully'
    });
  } catch (error) {
    console.error('Error saving gig:', error);
    const payload = req.body || {};
    const existing = payload?.id ? gigs.find((gig) => gig.id === payload.id) : undefined;
    const record = buildGigRecord(payload, existing);
    if (existing) {
      gigs = gigs.map((gig) => (gig.id === existing.id ? record : gig));
    } else {
      gigs = [record, ...gigs];
    }
    res.json({
      success: true,
      data: record,
      message: existing ? 'Gig updated successfully' : 'Gig created successfully'
    });
  }
});

// Update gig
router.put('/gigs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.gig.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Gig not found'
      });
    }

    const payload = req.body || {};
    const categoryId = payload.categoryId || (await resolveCategoryId(payload.category, 'GIG'));
    const status = mapGigStatusInput(payload.status ?? existing.status, existing.status);
    const adminStatus = mapAdminStatusInput(payload.admin_status ?? payload.adminStatus ?? existing.adminStatus, existing.adminStatus);

    const record = await prisma.gig.update({
      where: { id },
      data: {
        title: payload.title ?? existing.title,
        description: payload.description ?? existing.description,
        price: payload.price !== undefined ? Number(payload.price) : existing.price,
        categoryId: categoryId ?? existing.categoryId ?? null,
        subcategory: payload.subcategory ?? existing.subcategory,
        pricingMode: payload.pricing_mode ?? payload.pricingMode ?? existing.pricingMode ?? 'packages',
        packages: payload.packages ?? existing.packages ?? [],
        extras: payload.extras ?? existing.extras ?? [],
        faqs: payload.faqs ?? existing.faqs ?? [],
        requirements: payload.requirements ?? existing.requirements ?? [],
        images: payload.images !== undefined ? safeArray<string>(payload.images) : existing.images,
        videos: payload.videos !== undefined ? safeArray<string>(payload.videos) : existing.videos,
        documents: payload.documents !== undefined ? safeArray<string>(payload.documents) : existing.documents,
        tags: payload.tags !== undefined ? safeArray<string>(payload.tags) : existing.tags,
        image: payload.image ?? (Array.isArray(payload.images) ? payload.images[0] : existing.image) ?? null,
        meta: payload.meta ?? existing.meta,
        status,
        adminStatus,
        adminReason: payload.admin_reason ?? payload.adminReason ?? existing.adminReason ?? null,
        isActive: status === 'ACTIVE',
        isFeatured: Boolean(payload.is_featured ?? payload.isFeatured ?? existing.isFeatured ?? false),
        isTopSelected: Boolean(payload.is_top_selected ?? payload.isTopSelected ?? existing.isTopSelected ?? false),
        isRecommended: Boolean(payload.is_recommended ?? payload.isRecommended ?? existing.isRecommended ?? false)
      },
      include: { category: true, user: true }
    });

    return res.json({
      success: true,
      data: toAdminGig(record),
      message: 'Gig updated successfully'
    });
  } catch (error) {
    console.error('Error updating gig:', error);
    const { id } = req.params;
    const existing = gigs.find((gig) => gig.id === id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Gig not found'
      });
    }
    const record = buildGigRecord(req.body || {}, existing);
    gigs = gigs.map((gig) => (gig.id === id ? record : gig));
    return res.json({
      success: true,
      data: record,
      message: 'Gig updated successfully'
    });
  }
});

// Approve/Reject gig
router.post('/gigs/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body || {};
    const existing = await prisma.gig.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Gig not found' });
    }

    const normalizedAction = action === 'approve' ? 'approve' : 'reject';
    const updated = await prisma.gig.update({
      where: { id },
      data:
        normalizedAction === 'approve'
          ? { status: 'ACTIVE', adminStatus: 'APPROVED', isActive: true, adminReason: null }
          : { status: 'REJECTED', adminStatus: 'REJECTED', isActive: false, adminReason: notes || null },
      include: { category: true, user: true }
    });

    return res.json({
      success: true,
      message: `Gig ${id} has been ${normalizedAction}d`,
      data: toAdminGig(updated)
    });
  } catch (error) {
    console.error('Error approving gig:', error);
    const { id } = req.params;
    const { action, notes } = req.body || {};
    const existing = gigs.find((gig) => gig.id === id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Gig not found' });
    }
    const normalizedAction = action === 'approve' ? 'approve' : 'reject';
    const status = normalizedAction === 'approve' ? 'active' : 'rejected';
    const updated = {
      ...existing,
      status,
      admin_status: normalizedAction === 'approve' ? 'approved' : 'rejected',
      is_visible: normalizedAction === 'approve',
      admin_reason: normalizedAction === 'reject' ? notes || null : null,
      updated_at: nowIso()
    };
    gigs = gigs.map((gig) => (gig.id === id ? updated : gig));
    return res.json({
      success: true,
      message: `Gig ${id} has been ${normalizedAction}d`,
      data: updated
    });
  }
});

// Delete gig
router.delete('/gigs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const existing = await prisma.gig.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Gig not found' });
    }

    await prisma.gig.delete({ where: { id } });

    return res.json({
      success: true,
      message: `Gig ${id} has been deleted`,
      data: {
        id,
        reason,
        deleted_at: nowIso()
      }
    });
  } catch (error) {
    console.error('Error deleting gig:', error);
    const { id } = req.params;
    const { reason } = req.body || {};
    const existing = gigs.find((gig) => gig.id === id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Gig not found' });
    }
    gigs = gigs.filter((gig) => gig.id !== id);
    return res.json({
      success: true,
      message: `Gig ${id} has been deleted`,
      data: {
        id,
        reason,
        deleted_at: nowIso()
      }
    });
  }
});

// Get all jobs
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || undefined;
    const adminStatus =
      (req.query.adminStatus as string) ||
      (req.query.admin_status as string) ||
      undefined;
    const search = (req.query.search as string) || undefined;
    const category = (req.query.category as string) || undefined;
    const subcategory = (req.query.subcategory as string) || undefined;
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const where: any = {};
    if (status) where.status = mapJobStatusInput(status, 'DRAFT');
    if (adminStatus) where.adminStatus = mapAdminStatusInput(adminStatus, 'PENDING');
    if (category) where.category = { name: { equals: String(category), mode: 'insensitive' } };
    if (search) {
      where.OR = [
        { title: { contains: String(search), mode: 'insensitive' } },
        { description: { contains: String(search), mode: 'insensitive' } }
      ];
    }

    const take = limit && Number.isFinite(limit) ? Number(limit) : 50;
    const skip = page && Number.isFinite(page) ? (Number(page) - 1) * take : 0;

    const [rows, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: { category: true, client: true },
        orderBy: { updatedAt: 'desc' },
        skip,
        take
      }),
      prisma.job.count({ where })
    ]);

    res.json({
      success: true,
      data: rows.map(toAdminJob),
      meta: { total, page: page || 1, limit: take, pages: Math.max(1, Math.ceil(total / take)) }
    });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    const filtered = applyFilters(jobs, { status, adminStatus, search, category, subcategory });
    const { items, meta } = applyPagination(filtered, page, limit);
    res.json({
      success: true,
      data: items,
      meta: meta || undefined
    });
  }
});

// Create job
router.post('/jobs', async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    const existing = payload?.id ? await prisma.job.findUnique({ where: { id: payload.id } }) : null;
    const categoryId = payload.categoryId || (await resolveCategoryId(payload.category, 'JOB'));
    const status = mapJobStatusInput(payload.status, existing?.status || 'DRAFT');
    const adminStatus = mapAdminStatusInput(payload.admin_status ?? payload.adminStatus, existing?.adminStatus || 'PENDING');
    const clientId = payload.clientId || payload.client_id || req.user?.id;

    const data: any = {
      title: payload.title || existing?.title || 'Untitled Job',
      description: payload.description ?? existing?.description ?? '',
      budget: payload.budget ?? existing?.budget ?? '',
      type: payload.type ? mapJobTypeInput(payload.type, existing?.type ?? 'FIXED_PRICE') : existing?.type ?? 'FIXED_PRICE',
      tags: payload.tags ?? existing?.tags ?? [],
      status,
      adminStatus,
      adminReason: payload.admin_reason ?? payload.adminReason ?? existing?.adminReason ?? null,
      isActive: status === 'ACTIVE',
      isVisible: status === 'ACTIVE',
      isFeatured: Boolean(payload.is_featured ?? payload.isFeatured ?? existing?.isFeatured ?? false),
      isTopSelected: Boolean(payload.is_top_selected ?? payload.isTopSelected ?? existing?.isTopSelected ?? false),
      isRecommended: Boolean(payload.is_recommended ?? payload.isRecommended ?? existing?.isRecommended ?? false),
      categoryId: categoryId ?? existing?.categoryId ?? null,
      subcategory: payload.subcategory ?? existing?.subcategory ?? null,
      experienceLevel: payload.experienceLevel ? payload.experienceLevel.toUpperCase() : existing?.experienceLevel ?? null,
      visibility: payload.visibility ? payload.visibility.toUpperCase() : existing?.visibility ?? 'PUBLIC',
      duration: payload.duration ?? existing?.duration ?? null,
      attachments: payload.attachments ?? existing?.attachments ?? [],
      clientId: clientId || existing?.clientId
    };

    const record = existing
      ? await prisma.job.update({ where: { id: existing.id }, data, include: { category: true, client: true } })
      : await prisma.job.create({ data, include: { category: true, client: true } });

    res.json({
      success: true,
      data: toAdminJob(record),
      message: existing ? 'Job updated successfully' : 'Job created successfully'
    });
  } catch (error) {
    console.error('Error saving job:', error);
    const payload = req.body || {};
    const existing = payload?.id ? jobs.find((job) => job.id === payload.id) : undefined;
    const record = buildJobRecord(payload, existing);
    if (existing) {
      jobs = jobs.map((job) => (job.id === existing.id ? record : job));
    } else {
      jobs = [record, ...jobs];
    }
    res.json({
      success: true,
      data: record,
      message: existing ? 'Job updated successfully' : 'Job created successfully'
    });
  }
});

// Update job
router.put('/jobs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    const payload = req.body || {};
    const categoryId = payload.categoryId || (await resolveCategoryId(payload.category, 'JOB'));
    const status = mapJobStatusInput(payload.status ?? existing.status, existing.status);
    const adminStatus = mapAdminStatusInput(payload.admin_status ?? payload.adminStatus ?? existing.adminStatus, existing.adminStatus);

    const record = await prisma.job.update({
      where: { id },
      data: {
        title: payload.title ?? existing.title,
        description: payload.description ?? existing.description,
        budget: payload.budget ?? existing.budget,
        type: payload.type ? mapJobTypeInput(payload.type, existing.type) : existing.type,
        tags: payload.tags ?? existing.tags,
        status,
        adminStatus,
        adminReason: payload.admin_reason ?? payload.adminReason ?? existing.adminReason ?? null,
        isActive: status === 'ACTIVE',
        isVisible: status === 'ACTIVE',
        isFeatured: Boolean(payload.is_featured ?? payload.isFeatured ?? existing.isFeatured ?? false),
        isTopSelected: Boolean(payload.is_top_selected ?? payload.isTopSelected ?? existing.isTopSelected ?? false),
        isRecommended: Boolean(payload.is_recommended ?? payload.isRecommended ?? existing.isRecommended ?? false),
        categoryId: categoryId ?? existing.categoryId ?? null,
        subcategory: payload.subcategory ?? existing.subcategory,
        experienceLevel: payload.experienceLevel ? payload.experienceLevel.toUpperCase() : existing.experienceLevel,
        visibility: payload.visibility ? payload.visibility.toUpperCase() : existing.visibility,
        duration: payload.duration ?? existing.duration,
        attachments: payload.attachments ?? existing.attachments
      },
      include: { category: true, client: true }
    });

    return res.json({
      success: true,
      data: toAdminJob(record),
      message: 'Job updated successfully'
    });
  } catch (error) {
    console.error('Error updating job:', error);
    const { id } = req.params;
    const existing = jobs.find((job) => job.id === id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    const record = buildJobRecord(req.body || {}, existing);
    jobs = jobs.map((job) => (job.id === id ? record : job));
    return res.json({
      success: true,
      data: record,
      message: 'Job updated successfully'
    });
  }
});

// Approve/Reject job
router.post('/jobs/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body || {};
    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const normalizedAction = action === 'approve' ? 'approve' : 'reject';
    const updated = await prisma.job.update({
      where: { id },
      data:
        normalizedAction === 'approve'
          ? { status: 'ACTIVE', adminStatus: 'APPROVED', isActive: true, isVisible: true, adminReason: null }
          : { status: 'REJECTED', adminStatus: 'REJECTED', isActive: false, isVisible: false, adminReason: notes || null },
      include: { category: true, client: true }
    });

    return res.json({
      success: true,
      message: `Job ${id} has been ${normalizedAction}d`,
      data: toAdminJob(updated)
    });
  } catch (error) {
    console.error('Error approving job:', error);
    const { id } = req.params;
    const { action, notes } = req.body || {};
    const existing = jobs.find((job) => job.id === id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    const normalizedAction = action === 'approve' ? 'approve' : 'reject';
    const status = normalizedAction === 'approve' ? 'active' : 'rejected';
    const updated = {
      ...existing,
      status,
      admin_status: normalizedAction === 'approve' ? 'approved' : 'rejected',
      admin_reason: normalizedAction === 'reject' ? notes || null : null,
      is_visible: normalizedAction === 'approve',
      is_active: normalizedAction === 'approve',
      updated_at: nowIso()
    };
    jobs = jobs.map((job) => (job.id === id ? updated : job));
    return res.json({
      success: true,
      message: `Job ${id} has been ${normalizedAction}d`,
      data: updated
    });
  }
});

// Delete job
router.delete('/jobs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    await prisma.job.delete({ where: { id } });

    return res.json({
      success: true,
      message: `Job ${id} has been deleted`,
      data: {
        id,
        reason,
        deleted_at: nowIso()
      }
    });
  } catch (error) {
    console.error('Error deleting job:', error);
    const { id } = req.params;
    const { reason } = req.body || {};
    const existing = jobs.find((job) => job.id === id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    jobs = jobs.filter((job) => job.id !== id);
    return res.json({
      success: true,
      message: `Job ${id} has been deleted`,
      data: {
        id,
        reason,
        deleted_at: nowIso()
      }
    });
  }
});

// Categories (compatible endpoints)
router.get('/categories/gigs', async (_req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true, parentId: null, type: { in: ['GIG', 'BOTH'] } },
      orderBy: { order: 'asc' },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { order: 'asc' }
        }
      }
    });
    res.json({ success: true, data: categories.map((cat) => formatAdminCategory(cat, 'gig')) });
  } catch (error) {
    console.error('Error fetching gig categories:', error);
    res.json({ success: true, data: gigCategories });
  }
});

router.get('/categories/jobs', async (_req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true, parentId: null, type: { in: ['JOB', 'BOTH'] } },
      orderBy: { order: 'asc' },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { order: 'asc' }
        }
      }
    });
    res.json({ success: true, data: categories.map((cat) => formatAdminCategory(cat, 'job')) });
  } catch (error) {
    console.error('Error fetching job categories:', error);
    res.json({ success: true, data: jobCategories });
  }
});

router.get('/categories', async (req: Request, res: Response) => {
  const type = toLower(req.query.type);
  const data = type === 'job' ? jobCategories : gigCategories;
  res.json({ success: true, data });
});

// Create/Update category
router.post('/categories', async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    const type = normalizeCategoryType(payload.type);
    const name = String(payload?.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, error: 'Category name is required' });
    }

    const requestedSlug = slugify(payload?.slug || name);
    const sortOrder = toNumber(payload?.sort_order ?? payload?.sortOrder, 0);
    const isActive = normalizeCategoryStatus(payload?.status ?? payload?.isActive);
    const icon = payload?.logo ?? payload?.icon ?? '';
    const description = payload?.description ?? '';
    const subPayloads = safeArray<AnyRecord>(payload?.subcategories);

    const existing = payload?.id
      ? await prisma.category.findUnique({ where: { id: payload.id }, include: { children: true } })
      : null;

    const slugConflict = await prisma.category.findFirst({
      where: {
        slug: requestedSlug,
        ...(existing?.id ? { NOT: { id: existing.id } } : {})
      }
    });
    if (slugConflict) {
      return res.status(400).json({ success: false, error: 'Category slug already exists' });
    }

    const nameConflict = await prisma.category.findFirst({
      where: {
        name,
        ...(existing?.id ? { NOT: { id: existing.id } } : {})
      }
    });
    if (nameConflict) {
      return res.status(400).json({ success: false, error: 'Category name already exists' });
    }

    const record = await prisma.$transaction(async (tx) => {
      if (!existing) {
        const created = await tx.category.create({
          data: {
            id: payload?.id ?? undefined,
            name,
            slug: requestedSlug,
            icon: icon || null,
            description: description || null,
            type,
            isActive,
            order: sortOrder,
            children: {
              create: subPayloads
                .filter((sub) => Boolean(sub?.name))
                .map((sub) => ({
                  id: sub?.id ?? undefined,
                  name: String(sub?.name || '').trim(),
                  slug: slugify(sub?.slug || sub?.name),
                  icon: sub?.icon ?? null,
                  description: sub?.description ?? null,
                  type,
                  isActive: normalizeCategoryStatus(sub?.status ?? sub?.isActive),
                  order: toNumber(sub?.sort_order ?? sub?.sortOrder, 0)
                }))
            }
          },
          include: { children: true }
        });
        return created;
      }

      await tx.category.update({
        where: { id: existing.id },
        data: {
          name,
          slug: requestedSlug,
          icon: icon || null,
          description: description || null,
          type,
          isActive,
          order: sortOrder
        }
      });

      const existingChildren = await tx.category.findMany({ where: { parentId: existing.id } });
      const incomingIds = new Set(
        subPayloads.map((sub) => sub?.id).filter((id): id is string => Boolean(id))
      );

      for (const sub of subPayloads) {
        const subName = String(sub?.name || '').trim();
        if (!subName) continue;
        const subSlug = slugify(sub?.slug || subName);
        if (sub?.id) {
          await tx.category.update({
            where: { id: sub.id },
            data: {
              name: subName,
              slug: subSlug,
              icon: sub?.icon ?? null,
              description: sub?.description ?? null,
              type,
              isActive: normalizeCategoryStatus(sub?.status ?? sub?.isActive),
              order: toNumber(sub?.sort_order ?? sub?.sortOrder, 0),
              parentId: existing.id
            }
          });
        } else {
          await tx.category.create({
            data: {
              name: subName,
              slug: subSlug,
              icon: sub?.icon ?? null,
              description: sub?.description ?? null,
              type,
              isActive: normalizeCategoryStatus(sub?.status ?? sub?.isActive),
              order: toNumber(sub?.sort_order ?? sub?.sortOrder, 0),
              parentId: existing.id
            }
          });
        }
      }

      const removed = existingChildren.filter((child) => !incomingIds.has(child.id));
      if (removed.length) {
        await tx.category.updateMany({
          where: { id: { in: removed.map((child) => child.id) } },
          data: { isActive: false }
        });
      }

      return tx.category.findUnique({ where: { id: existing.id }, include: { children: true } });
    });

    if (!record) {
      return res.status(500).json({ success: false, error: 'Failed to save category' });
    }

    res.json({
      success: true,
      message: existing ? 'Category updated successfully' : 'Category created successfully',
      data: formatAdminCategory(record, type === 'JOB' ? 'job' : 'gig')
    });
  } catch (error: any) {
    console.error('Error saving category:', error);
    if (error?.code === 'P2002') {
      return res.status(400).json({
        success: false,
        error: 'Category name or slug must be unique'
      });
    }
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to save category'
    });
  }
});

// Delete category
router.delete('/categories/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    await prisma.$transaction([
      prisma.category.update({ where: { id }, data: { isActive: false } }),
      prisma.category.updateMany({ where: { parentId: id }, data: { isActive: false } })
    ]);

    return res.json({
      success: true,
      message: `Category ${id} has been deactivated`,
      data: { id, deleted_at: nowIso() }
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete category'
    });
  }
});

// Get plans
router.get('/plans', async (req: Request, res: Response) => {
  try {
    const type = toLower(req.query.type);
    const filtered = listPlans({ type });
    res.json({ success: true, data: filtered });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch plans'
    });
  }
});

// Create/Update plan
router.post('/plans', async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    const existing = payload?.id ? listPlans().find((plan) => plan.id === payload.id) : undefined;
    const record = savePlan(payload);

    res.json({
      success: true,
      message: existing ? 'Plan updated successfully' : 'Plan created successfully',
      data: record
    });
  } catch (error) {
    console.error('Error saving plan:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save plan'
    });
  }
});

// Toggle plan active state
router.patch('/plans/:id/toggle', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = togglePlanActive(id);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    return res.json({
      success: true,
      data: updated,
      message: updated.isActive ? 'Plan activated' : 'Plan deactivated'
    });
  } catch (error) {
    console.error('Error toggling plan:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to toggle plan'
    });
  }
});

// Get dashboard stats
router.get('/dashboard/stats', async (_req: Request, res: Response) => {
  try {
    const [
      totalGigs,
      totalJobs,
      activeGigs,
      pendingGigs,
      activeJobs,
      pendingJobs
    ] = await Promise.all([
      prisma.gig.count(),
      prisma.job.count(),
      prisma.gig.count({ where: { status: 'ACTIVE' } }),
      prisma.gig.count({ where: { adminStatus: 'PENDING' } }),
      prisma.job.count({ where: { status: 'ACTIVE' } }),
      prisma.job.count({ where: { adminStatus: 'PENDING' } })
    ]);

    const stats = {
      total_gigs: totalGigs,
      total_jobs: totalJobs,
      active_gigs: activeGigs,
      pending_gigs: pendingGigs,
      active_jobs: activeJobs,
      pending_jobs: pendingJobs,
      total_categories: gigCategories.length + jobCategories.length,
      total_plans: listPlans().length,
      recent_activity: [
        {
          type: 'gig',
          action: 'updated',
          title: 'Gig updated',
          time: 'recent',
          user: 'Admin'
        }
      ]
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    const stats = {
      total_gigs: gigs.length,
      total_jobs: jobs.length,
      active_gigs: gigs.filter((gig) => gig.status === 'active').length,
      pending_gigs: gigs.filter((gig) => gig.admin_status === 'pending').length,
      active_jobs: jobs.filter((job) => job.status === 'active').length,
      pending_jobs: jobs.filter((job) => job.admin_status === 'pending').length,
      total_categories: gigCategories.length + jobCategories.length,
      total_plans: listPlans().length,
      recent_activity: [
        {
          type: 'gig',
          action: 'updated',
          title: gigs[0]?.title ?? 'Gig updated',
          time: 'recent',
          user: 'Admin'
        }
      ]
    };
    res.json({ success: true, data: stats });
  }
});

export default router;
