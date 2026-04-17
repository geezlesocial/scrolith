import { ListingCategory, Plan, ApiResponse } from '../../types/index';
import prisma from '../../utils/prismaClient';
import { ensureStandardListingCategoriesSeeded } from '../defaultCategorySeed.service';
import { listPlans, savePlan as saveStoredPlan } from '../planStore';

type CategoryKind = 'gig' | 'job';

const toLower = (value: unknown) => String(value || '').toLowerCase();
const toNumber = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const safeArray = <T = any>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);
const slugify = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const mapAdminStatus = (value: unknown): 'pending' | 'approved' | 'rejected' => {
  const status = toLower(value);
  if (status === 'approved' || status === 'active') return 'approved';
  if (status === 'rejected') return 'rejected';
  return 'pending';
};

const mapGigStatus = (value: unknown): any => {
  const status = toLower(value);
  if (status === 'active') return 'ACTIVE';
  if (status === 'paused') return 'PAUSED';
  if (status === 'rejected') return 'REJECTED';
  if (status === 'draft') return 'DRAFT';
  return 'PENDING';
};

const mapJobStatus = (value: unknown): any => {
  const status = toLower(value);
  if (status === 'active') return 'ACTIVE';
  if (status === 'closed' || status === 'paused') return 'CLOSED';
  if (status === 'rejected') return 'REJECTED';
  if (status === 'archived') return 'ARCHIVED';
  if (status === 'submitted') return 'SUBMITTED';
  if (status === 'under_review' || status === 'pending') return 'UNDER_REVIEW';
  return 'DRAFT';
};

const publicGigStatus = (value: unknown): any => {
  const status = toLower(value);
  if (status === 'active') return 'active';
  if (status === 'paused') return 'paused';
  if (status === 'rejected') return 'rejected';
  if (status === 'draft') return 'draft';
  if (status === 'archived') return 'archived';
  return 'under_review';
};

const publicJobStatus = (value: unknown): any => {
  const status = toLower(value);
  if (status === 'active') return 'active';
  if (status === 'closed') return 'closed';
  if (status === 'rejected') return 'rejected';
  if (status === 'submitted') return 'submitted';
  if (status === 'under_review') return 'under_review';
  return 'draft';
};

const normalizeCategoryType = (type: CategoryKind) => (type === 'job' ? 'JOB' : 'GIG');

export class GigsJobsAdminService {
  async getAdminGigs(): Promise<ApiResponse<any[]>> {
    try {
      const gigs = await prisma.gig.findMany({
        include: {
          user: { select: { name: true, email: true, avatar: true } },
          category: { select: { name: true, slug: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      return {
        success: true,
        data: gigs.map((gig) => ({
          id: gig.id,
          title: gig.title,
          description: gig.description,
          category: gig.category?.name || 'Uncategorized',
          subcategory: gig.subcategory || '',
          price: gig.price,
          pricingMode: (gig.pricingMode === 'fixed' || gig.pricingMode === 'hourly' ? gig.pricingMode : 'packages') as any,
          packages: safeArray(gig.packages),
          extras: safeArray(gig.extras),
          faqs: safeArray(gig.faqs),
          requirements: safeArray(gig.requirements),
          images: safeArray(gig.images),
          videos: safeArray(gig.videos),
          documents: safeArray(gig.documents),
          status: publicGigStatus(gig.status),
          adminStatus: mapAdminStatus(gig.adminStatus || gig.status),
          image: gig.image || gig.user?.avatar || '',
          freelancerName: gig.user?.name || gig.user?.email || 'Unknown freelancer',
          freelancerId: gig.userId,
          freelancerAvatar: gig.user?.avatar || '',
          rating: gig.rating || 0,
          reviews: gig.reviewCount || 0,
          views: 0,
          clicks: 0,
          ordersCount: 0,
          isVisible: Boolean(gig.isActive),
          createdAt: gig.createdAt.toISOString(),
          updatedAt: gig.updatedAt.toISOString()
        }))
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        error: 'Failed to load gigs',
        message: error instanceof Error ? error.message : 'Database error'
      };
    }
  }

  async approveGig(id: string, action: 'approve' | 'reject'): Promise<ApiResponse> {
    if (!id) {
      return { success: false, error: 'Invalid gig id', message: 'Only persisted gigs can be moderated.' };
    }

    const gig = await prisma.gig.findUnique({ where: { id } });
    if (!gig) return { success: false, error: 'Gig not found' };

    const status = action === 'approve' ? 'ACTIVE' : 'REJECTED';
    const adminStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
    await prisma.gig.update({
      where: { id },
      data: { status: status as any, adminStatus: adminStatus as any, isActive: action === 'approve' }
    });
    return { success: true, data: { id, status }, message: `Gig ${action === 'approve' ? 'approved' : 'rejected'} successfully` };
  }

  async deleteGig(id: string): Promise<ApiResponse> {
    if (!id) {
      return { success: false, error: 'Invalid gig id', message: 'Only persisted gigs can be deleted.' };
    }
    const gig = await prisma.gig.findUnique({ where: { id } });
    if (!gig) return { success: false, error: 'Gig not found' };
    await prisma.gig.delete({ where: { id } });
    return { success: true, data: { id }, message: 'Gig deleted successfully' };
  }

  async saveGig(gigData: any): Promise<ApiResponse> {
    try {
      const existing = gigData?.id ? await prisma.gig.findUnique({ where: { id: String(gigData.id) } }) : null;
      const userId = String(gigData?.freelancerId || existing?.userId || '').trim();
      if (!userId) return { success: false, error: 'freelancerId is required' };

      const fallbackCategory = await prisma.category.findFirst({
        where: { type: { in: ['GIG', 'BOTH'] as any }, isActive: true },
        select: { id: true }
      });
      const categoryId = String(gigData?.categoryId || existing?.categoryId || fallbackCategory?.id || '').trim() || null;
      const title = String(gigData?.title || existing?.title || '').trim();
      if (!title) return { success: false, error: 'title is required' };

      const data = {
        title,
        slug: existing?.slug || slugify(title) || `gig-${Date.now()}`,
        description: String(gigData?.description || existing?.description || '').trim(),
        price: toNumber(gigData?.price ?? existing?.price, 0),
        deliveryTime: Math.max(1, toNumber(gigData?.deliveryDays ?? gigData?.deliveryTime ?? existing?.deliveryTime, 7)),
        revisions: Math.max(0, toNumber(gigData?.revisions ?? existing?.revisions, 1)),
        categoryId,
        subcategory: String(gigData?.subcategory || existing?.subcategory || '').trim() || null,
        pricingMode: String(gigData?.pricingMode || existing?.pricingMode || 'packages'),
        packages: safeArray(gigData?.packages ?? existing?.packages),
        extras: safeArray(gigData?.extras ?? existing?.extras),
        faqs: safeArray(gigData?.faqs ?? existing?.faqs),
        requirements: safeArray(gigData?.requirements ?? existing?.requirements),
        images: safeArray<string>(gigData?.images ?? existing?.images),
        videos: safeArray<string>(gigData?.videos ?? existing?.videos),
        documents: safeArray<string>(gigData?.documents ?? existing?.documents),
        image: String(gigData?.image || existing?.image || '').trim() || null,
        userId,
        status: mapGigStatus(gigData?.status || existing?.status),
        adminStatus: mapAdminStatus(gigData?.adminStatus || existing?.adminStatus) === 'approved' ? 'APPROVED' as any : mapAdminStatus(gigData?.adminStatus || existing?.adminStatus) === 'rejected' ? 'REJECTED' as any : 'PENDING' as any,
        isActive: Boolean(gigData?.isVisible ?? gigData?.isActive ?? existing?.isActive ?? false)
      };

      const saved = existing
        ? await prisma.gig.update({ where: { id: existing.id }, data })
        : await prisma.gig.create({ data });

      return { success: true, data: saved, message: 'Gig saved successfully' };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to save gig',
        message: error instanceof Error ? error.message : 'Database error'
      };
    }
  }

  async getAdminJobs(): Promise<ApiResponse<any[]>> {
    try {
      const jobs = await prisma.job.findMany({
        include: {
          client: { select: { id: true, name: true, email: true } },
          category: { select: { name: true, slug: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      return {
        success: true,
        data: jobs.map((job) => ({
          id: job.id,
          title: job.title,
          description: job.description,
          budget: job.budget || '',
          type: toLower(job.type) === 'hourly' ? 'hourly' : 'fixed',
          category: job.category?.name || 'Uncategorized',
          subcategory: job.subcategory || '',
          tags: safeArray<string>(job.tags),
          status: publicJobStatus(job.status),
          adminStatus: mapAdminStatus(job.adminStatus || job.status),
          employerName: job.client?.name || job.client?.email || 'Unknown employer',
          employerId: job.clientId,
          postedTime: job.postedTime.toISOString(),
          applications: job.proposalsCount || 0,
          isRemote: true,
          duration: job.duration || undefined,
          skills: safeArray<string>(job.tags),
          experienceLevel: toLower(job.experienceLevel) || 'intermediate',
          createdAt: job.createdAt.toISOString(),
          updatedAt: job.updatedAt.toISOString()
        }))
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        error: 'Failed to load jobs',
        message: error instanceof Error ? error.message : 'Database error'
      };
    }
  }

  async getGigCategories(): Promise<ApiResponse<ListingCategory[]>> {
    return this.getListingCategories('gig');
  }

  async getJobCategories(): Promise<ApiResponse<ListingCategory[]>> {
    return this.getListingCategories('job');
  }

  async saveListingCategory(category: ListingCategory): Promise<ApiResponse> {
    try {
      const data = {
        name: category.name,
        slug: category.slug || slugify(category.name),
        type: normalizeCategoryType(category.type) as any,
        isActive: category.status !== 'hidden',
        order: category.sortOrder || 0,
        description: category.description || null,
        icon: category.logo || null
      };

      const saved = category.id
        ? await prisma.category.update({ where: { id: category.id }, data })
        : await prisma.category.create({ data });

      return { success: true, data: saved, message: 'Category saved successfully' };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to save category',
        message: error instanceof Error ? error.message : 'Database error'
      };
    }
  }

  async deleteListingCategory(id: string): Promise<ApiResponse> {
    if (!id) {
      return { success: false, error: 'Invalid category id', message: 'Only persisted categories can be deleted.' };
    }
    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) return { success: false, error: 'Category not found' };
    await prisma.category.delete({ where: { id } });
    return { success: true, data: { id }, message: 'Category deleted successfully' };
  }

  async getPlans(): Promise<ApiResponse<Plan[]>> {
    return { success: true, data: listPlans() as Plan[] };
  }

  async savePlan(plan: Plan): Promise<ApiResponse> {
    const saved = saveStoredPlan(plan) as Plan;
    return { success: true, data: saved, message: 'Plan saved successfully' };
  }

  async getDashboardStats(): Promise<ApiResponse> {
    try {
      const [totalGigs, activeGigs, pendingGigs, totalJobs, activeJobs, pendingJobs, totalCategories] = await Promise.all([
        prisma.gig.count(),
        prisma.gig.count({ where: { status: 'ACTIVE' as any, isActive: true } }),
        prisma.gig.count({ where: { status: 'PENDING' as any } }),
        prisma.job.count(),
        prisma.job.count({ where: { status: 'ACTIVE' as any, isActive: true } }),
        prisma.job.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] as any } } }),
        prisma.category.count()
      ]);

      return {
        success: true,
        data: {
          totalGigs,
          totalJobs,
          activeGigs,
          pendingGigs,
          activeJobs,
          pendingJobs,
          totalCategories,
          totalPlans: listPlans().length,
          recentActivity: []
        }
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to load dashboard stats',
        message: error instanceof Error ? error.message : 'Database error'
      };
    }
  }

  private async getListingCategories(type: CategoryKind): Promise<ApiResponse<ListingCategory[]>> {
    try {
      await ensureStandardListingCategoriesSeeded();
      const prismaType = normalizeCategoryType(type);
      const categories = await prisma.category.findMany({
        where: { parentId: null, type: { in: [prismaType, 'BOTH'] as any }, isActive: true },
        include: { children: { where: { isActive: true }, orderBy: { order: 'asc' } } },
        orderBy: { order: 'asc' }
      });

      const data = await Promise.all(
        categories.map(async (category) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
          type,
          status: category.isActive ? 'active' as const : 'hidden' as const,
          count: await this.getCategoryCount(category.id),
          sortOrder: category.order || 0,
          subcategories: category.children.map((child) => ({
            id: child.id,
            name: child.name,
            slug: child.slug,
            status: child.isActive ? 'active' as const : 'hidden' as const,
            sortOrder: child.order || 0,
            icon: child.icon || undefined
          })),
          description: category.description || undefined,
          logo: category.icon || undefined
        }))
      );

      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        data: [],
        error: `Failed to load ${type} categories`,
        message: error instanceof Error ? error.message : 'Database error'
      };
    }
  }

  private async getCategoryCount(categoryId: string): Promise<number> {
    const [gigs, jobs] = await Promise.all([
      prisma.gig.count({ where: { categoryId } }),
      prisma.job.count({ where: { categoryId } })
    ]);
    return gigs + jobs;
  }
}

export const gigsJobsAdminService = new GigsJobsAdminService();
