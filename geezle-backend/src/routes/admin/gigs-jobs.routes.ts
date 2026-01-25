import express, { Request, Response } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';

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

const normalizeJobAdminStatus = (value: unknown, status: string) => {
  const adminStatus = toLower(value);
  if (adminStatus === 'approved' || adminStatus === 'rejected' || adminStatus === 'pending') {
    return adminStatus;
  }
  if (status === 'active') return 'approved';
  if (status === 'rejected') return 'rejected';
  return 'pending';
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
    category: payload?.category ?? existing?.category ?? '',
    subcategory: payload?.subcategory ?? existing?.subcategory ?? '',
    experience_level: payload?.experience_level ?? payload?.experienceLevel ?? existing?.experience_level ?? 'Intermediate',
    admin_status: adminStatus,
    created_at: existing?.created_at ?? payload?.created_at ?? nowIso(),
    updated_at: nowIso()
  };
};

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

let plans: AnyRecord[] = [
  {
    id: 'plan-1',
    name: 'Freelancer Basic',
    type: 'freelancer',
    price: 9.99,
    interval: 'monthly',
    currency: 'USD',
    is_active: true,
    is_popular: false,
    features: [
      { id: 'ft-1', name: '5 Active Gigs', included: true },
      { id: 'ft-2', name: 'Basic Analytics', included: true },
      { id: 'ft-3', name: '24/7 Support', included: false }
    ],
    created_at: nowIso(),
    updated_at: nowIso()
  },
  {
    id: 'plan-2',
    name: 'Freelancer Pro',
    type: 'freelancer',
    price: 19.99,
    interval: 'monthly',
    currency: 'USD',
    is_active: true,
    is_popular: true,
    features: [
      { id: 'ft-4', name: 'Unlimited Gigs', included: true },
      { id: 'ft-5', name: 'Advanced Analytics', included: true },
      { id: 'ft-6', name: 'Priority Support', included: true }
    ],
    created_at: nowIso(),
    updated_at: nowIso()
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

    const filtered = applyFilters(gigs, { status, adminStatus, search, category, subcategory });
    const { items, meta } = applyPagination(filtered, page, limit);

    res.json({
      success: true,
      data: items,
      meta: meta || undefined
    });
  } catch (error) {
    console.error('Error fetching gigs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch gigs'
    });
  }
});

// Create gig
router.post('/gigs', async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    console.error('Error saving gig:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save gig'
    });
  }
});

// Update gig
router.put('/gigs/:id', async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    console.error('Error updating gig:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update gig'
    });
  }
});

// Approve/Reject gig
router.post('/gigs/:id/approve', async (req: Request, res: Response) => {
  try {
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
      updated_at: nowIso()
    };

    gigs = gigs.map((gig) => (gig.id === id ? updated : gig));

    return res.json({
      success: true,
      message: `Gig ${id} has been ${normalizedAction}d`,
      data: {
        id,
        action: normalizedAction,
        notes,
        updated_at: updated.updated_at
      }
    });
  } catch (error) {
    console.error('Error approving gig:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process approval'
    });
  }
});

// Delete gig
router.delete('/gigs/:id', async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    console.error('Error deleting gig:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete gig'
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

    const filtered = applyFilters(jobs, { status, adminStatus, search, category, subcategory });
    const { items, meta } = applyPagination(filtered, page, limit);

    res.json({
      success: true,
      data: items,
      meta: meta || undefined
    });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch jobs'
    });
  }
});

// Create job
router.post('/jobs', async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    console.error('Error saving job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save job'
    });
  }
});

// Update job
router.put('/jobs/:id', async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    console.error('Error updating job:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update job'
    });
  }
});

// Approve/Reject job
router.post('/jobs/:id/approve', async (req: Request, res: Response) => {
  try {
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
      is_visible: normalizedAction === 'approve',
      is_active: normalizedAction === 'approve',
      updated_at: nowIso()
    };

    jobs = jobs.map((job) => (job.id === id ? updated : job));

    return res.json({
      success: true,
      message: `Job ${id} has been ${normalizedAction}d`,
      data: {
        id,
        action: normalizedAction,
        notes,
        updated_at: updated.updated_at
      }
    });
  } catch (error) {
    console.error('Error approving job:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process approval'
    });
  }
});

// Delete job
router.delete('/jobs/:id', async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    console.error('Error deleting job:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete job'
    });
  }
});

// Categories (compatible endpoints)
router.get('/categories/gigs', async (_req: Request, res: Response) => {
  res.json({ success: true, data: gigCategories });
});

router.get('/categories/jobs', async (_req: Request, res: Response) => {
  res.json({ success: true, data: jobCategories });
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
    const type = toLower(payload.type) === 'job' ? 'job' : 'gig';
    const store = type === 'job' ? jobCategories : gigCategories;

    const existing = payload?.id ? store.find((cat) => cat.id === payload.id) : undefined;
    const record = {
      id: existing?.id ?? payload?.id ?? makeId(`cat-${type}`),
      name: payload?.name ?? existing?.name ?? 'Untitled Category',
      slug: payload?.slug ?? existing?.slug ?? '',
      type,
      status: payload?.status ?? existing?.status ?? 'active',
      count: toNumber(payload?.count ?? existing?.count, 0),
      sort_order: toNumber(payload?.sort_order ?? payload?.sortOrder ?? existing?.sort_order, 0),
      subcategories: safeArray<AnyRecord>(payload?.subcategories ?? existing?.subcategories).map((sub) => ({
        id: sub?.id ?? makeId(`sub-${type}`),
        name: sub?.name ?? '',
        slug: sub?.slug ?? '',
        status: sub?.status ?? 'active',
        sort_order: toNumber(sub?.sort_order ?? sub?.sortOrder, 0),
        icon: sub?.icon ?? ''
      })),
      description: payload?.description ?? existing?.description ?? '',
      logo: payload?.logo ?? existing?.logo ?? '',
      created_at: existing?.created_at ?? nowIso(),
      updated_at: nowIso()
    };

    const updatedStore = existing
      ? store.map((cat) => (cat.id === existing.id ? record : cat))
      : [record, ...store];

    if (type === 'job') {
      jobCategories = updatedStore;
    } else {
      gigCategories = updatedStore;
    }

    res.json({
      success: true,
      message: existing ? 'Category updated successfully' : 'Category created successfully',
      data: record
    });
  } catch (error) {
    console.error('Error saving category:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save category'
    });
  }
});

// Delete category
router.delete('/categories/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const gigIndex = gigCategories.findIndex((cat) => cat.id === id);
    const jobIndex = jobCategories.findIndex((cat) => cat.id === id);

    if (gigIndex === -1 && jobIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    if (gigIndex !== -1) {
      gigCategories = gigCategories.filter((cat) => cat.id !== id);
    }
    if (jobIndex !== -1) {
      jobCategories = jobCategories.filter((cat) => cat.id !== id);
    }

    return res.json({
      success: true,
      message: `Category ${id} has been deleted`,
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
    const filtered = type && type !== 'all' ? plans.filter((plan) => plan.type === type) : plans;
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
    const existing = payload?.id ? plans.find((plan) => plan.id === payload.id) : undefined;

    const record = {
      id: existing?.id ?? payload?.id ?? makeId('plan'),
      name: payload?.name ?? existing?.name ?? 'Untitled Plan',
      type: payload?.type ?? existing?.type ?? 'freelancer',
      price: toNumber(payload?.price ?? existing?.price, 0),
      interval: payload?.interval ?? existing?.interval ?? 'monthly',
      currency: payload?.currency ?? existing?.currency ?? 'USD',
      is_active: Boolean(payload?.is_active ?? payload?.isActive ?? existing?.is_active ?? true),
      is_popular: Boolean(payload?.is_popular ?? payload?.isPopular ?? existing?.is_popular ?? false),
      features: safeArray<AnyRecord>(payload?.features ?? existing?.features).map((feat) => ({
        id: feat?.id ?? makeId('feat'),
        name: feat?.name ?? '',
        included: Boolean(feat?.included ?? false),
        limit: feat?.limit ?? undefined
      })),
      created_at: existing?.created_at ?? nowIso(),
      updated_at: nowIso()
    };

    plans = existing ? plans.map((plan) => (plan.id === existing.id ? record : plan)) : [record, ...plans];

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
    const existing = plans.find((plan) => plan.id === id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    const updated = {
      ...existing,
      is_active: !existing.is_active,
      updated_at: nowIso()
    };
    plans = plans.map((plan) => (plan.id === id ? updated : plan));

    return res.json({
      success: true,
      data: updated,
      message: updated.is_active ? 'Plan activated' : 'Plan deactivated'
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
    const stats = {
      total_gigs: gigs.length,
      total_jobs: jobs.length,
      active_gigs: gigs.filter((gig) => gig.status === 'active').length,
      pending_gigs: gigs.filter((gig) => gig.admin_status === 'pending').length,
      active_jobs: jobs.filter((job) => job.status === 'active').length,
      pending_jobs: jobs.filter((job) => job.admin_status === 'pending').length,
      total_categories: gigCategories.length + jobCategories.length,
      total_plans: plans.length,
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

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats'
    });
  }
});

export default router;
