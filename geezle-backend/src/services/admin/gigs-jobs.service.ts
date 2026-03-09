import { Prisma } from '@prisma/client';
import { Gig, Job, ListingCategory, Plan, ApiResponse } from '../../types/index';
import prisma from '../../utils/prismaClient';

export class GigsJobsAdminService {
  
  // ==================== GIGS ====================
  
  async getAdminGigs(): Promise<ApiResponse<any[]>> {
    try {
      console.log('Fetching gigs from database...');
      const gigs = await prisma.gig.findMany({
        include: {
          user: {
            select: { name: true, email: true, avatar: true }
          },
          category: {
            select: { name: true, slug: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      console.log(`Found ${gigs.length} gigs in database`);

      // If no gigs in database, return mock data
      if (gigs.length === 0) {
        console.log('No gigs found in database, returning mock data');
        return { 
          success: true, 
          data: this.getMockGigs(),
          message: 'Using mock data - database empty'
        };
      }

      const formattedGigs = gigs.map(gig => ({
        id: gig.id,
        title: gig.title,
        description: gig.description,
        category: gig.category?.name || 'Uncategorized',
        subcategory: '',
        price: gig.price,
        pricingMode: 'fixed' as const,
        packages: [],
        extras: [],
        faqs: [],
        requirements: [],
        images: [],
        videos: [],
        documents: [],
        status: gig.status.toLowerCase(),
        adminStatus: this.mapStatusToAdminStatus(gig.status),
        image: gig.user?.avatar || 'https://via.placeholder.com/150',
        freelancerName: gig.user?.name || 'Unknown',
        freelancerId: gig.userId,
        freelancerAvatar: gig.user?.avatar,
        rating: gig.rating || 0,
        reviews: gig.reviewCount || 0,
        views: 0,
        clicks: 0,
        ordersCount: 0,
        isVisible: gig.isActive,
        createdAt: gig.createdAt.toISOString(),
        updatedAt: gig.updatedAt.toISOString()
      }));

      return { success: true, data: formattedGigs };
    } catch (error) {
      console.error('Error fetching admin gigs:', error);
      console.log('Returning mock gigs due to error');
      return { 
        success: true, 
        data: this.getMockGigs(),
        message: 'Using mock data due to database error'
      };
    }
  }

  async approveGig(id: string, action: 'approve' | 'reject'): Promise<ApiResponse> {
    try {
      console.log(`Attempting to ${action} gig with ID: ${id}`);
      
      // Check if it's a mock gig ID
      if (id.startsWith('gig-mock-')) {
        return { 
          success: true, 
          message: `Mock gig ${action === 'approve' ? 'approved' : 'rejected'} (mock operation)`,
          data: { id, action }
        };
      }

      const gig = await prisma.gig.findUnique({ where: { id } });
      if (!gig) {
        return { 
          success: false, 
          error: 'Gig not found',
          message: `Gig with ID ${id} not found in database`
        };
      }

      const newStatus = action === 'approve' ? 'ACTIVE' : 'REJECTED';
      console.log(`Updating gig ${id} to status: ${newStatus}`);
      
      await prisma.gig.update({
        where: { id },
        data: { 
          status: newStatus, 
          isActive: action === 'approve',
          updatedAt: new Date()
        }
      });

      return { 
        success: true, 
        message: `Gig ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
        data: { id, status: newStatus }
      };
    } catch (error) {
      console.error('Error approving gig:', error);
      return { 
        success: false, 
        error: 'Failed to update gig status',
        message: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async deleteGig(id: string): Promise<ApiResponse> {
    try {
      console.log(`Attempting to delete gig with ID: ${id}`);
      
      // Check if it's a mock gig ID
      if (id.startsWith('gig-mock-')) {
        return { 
          success: true, 
          message: 'Mock gig deleted (mock operation)',
          data: { id }
        };
      }

      const gig = await prisma.gig.findUnique({ where: { id } });
      if (!gig) {
        return { 
          success: false, 
          error: 'Gig not found',
          message: `Gig with ID ${id} not found in database`
        };
      }

      await prisma.gig.delete({ where: { id } });
      console.log(`Successfully deleted gig ${id}`);

      return { 
        success: true, 
        message: 'Gig deleted successfully',
        data: { id }
      };
    } catch (error) {
      console.error('Error deleting gig:', error);
      return { 
        success: false, 
        error: 'Failed to delete gig',
        message: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async saveGig(gigData: any): Promise<ApiResponse> {
    try {
      console.log('Saving gig:', gigData);
      
      // Check if it's a mock gig
      if (gigData.id && gigData.id.startsWith('gig-mock-')) {
        return { 
          success: true, 
          data: gigData,
          message: 'Mock gig saved (mock operation)'
        };
      }

      const gig = await prisma.gig.upsert({
        where: { id: gigData.id || '' },
        update: {
          title: gigData.title,
          description: gigData.description,
          price: gigData.price,
          deliveryTime: gigData.deliveryDays || 7,
          revisions: gigData.revisions || 1,
          status: 'PENDING',
          isActive: false,
          updatedAt: new Date()
        },
        create: {
          title: gigData.title,
          slug: this.generateSlug(gigData.title),
          description: gigData.description,
          price: gigData.price,
          deliveryTime: gigData.deliveryDays || 7,
          revisions: gigData.revisions || 1,
          userId: gigData.freelancerId || 'dev-user-id-123',
          categoryId: 'cat-1', // Default category
          status: 'PENDING',
          isActive: false
        }
      });

      console.log('Gig saved successfully:', gig.id);

      return { 
        success: true, 
        data: gig,
        message: 'Gig saved successfully'
      };
    } catch (error) {
      console.error('Error saving gig:', error);
      return { 
        success: false, 
        error: 'Failed to save gig',
        message: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // ==================== JOBS ====================
  
  async getAdminJobs(): Promise<ApiResponse<any[]>> {
    try {
      console.log('Fetching jobs (using mock data)...');
      return { 
        success: true, 
        data: this.getMockJobs(),
        message: 'Using mock data for jobs'
      };
    } catch (error) {
      console.error('Error in getAdminJobs:', error);
      return { 
        success: true, 
        data: this.getMockJobs(),
        message: 'Using mock data due to error'
      };
    }
  }

  // ==================== CATEGORIES ====================
  
  async getGigCategories(): Promise<ApiResponse<ListingCategory[]>> {
    try {
      console.log('Fetching gig categories from database...');
      const categories = await prisma.category.findMany({
        where: { 
          type: { in: ['GIG', 'BOTH'] }, 
          isActive: true 
        },
        include: { 
          children: { 
            where: { isActive: true }, 
            orderBy: { order: 'asc' } 
          } 
        },
        orderBy: { order: 'asc' }
      });

      console.log(`Found ${categories.length} gig categories in database`);

      // If no categories in database, return mock data
      if (categories.length === 0) {
        console.log('No categories found in database, returning mock data');
        return { 
          success: true, 
          data: this.getMockGigCategories(),
          message: 'Using mock data - database empty'
        };
      }

      const formattedCategories: ListingCategory[] = [];
      for (const cat of categories) {
        const count = await this.getCategoryCount(cat.id);
        formattedCategories.push({
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          type: cat.type === 'JOB' ? 'job' : 'gig',
          status: cat.isActive ? 'active' : 'hidden',
          count: count,
          sortOrder: cat.order || 0,
          subcategories: cat.children.map(child => ({
            id: child.id,
            name: child.name,
            slug: child.slug,
            status: child.isActive ? 'active' : 'hidden',
            sortOrder: child.order || 0,
            icon: child.icon || undefined
          })),
          description: cat.description || undefined,
          logo: cat.icon || undefined
        });
      }

      return { success: true, data: formattedCategories };
    } catch (error) {
      console.error('Error fetching gig categories:', error);
      console.log('Returning mock categories due to error');
      return { 
        success: true, 
        data: this.getMockGigCategories(),
        message: 'Using mock data due to database error'
      };
    }
  }

  async getJobCategories(): Promise<ApiResponse<ListingCategory[]>> {
    try {
      console.log('Fetching job categories from database...');
      const categories = await prisma.category.findMany({
        where: { 
          type: { in: ['JOB', 'BOTH'] }, 
          isActive: true 
        },
        include: { 
          children: { 
            where: { isActive: true }, 
            orderBy: { order: 'asc' } 
          } 
        },
        orderBy: { order: 'asc' }
      });

      console.log(`Found ${categories.length} job categories in database`);

      // If no categories in database, return mock data
      if (categories.length === 0) {
        console.log('No job categories found, returning mock data');
        return { 
          success: true, 
          data: this.getMockJobCategories(),
          message: 'Using mock data - database empty'
        };
      }

      const formattedCategories: ListingCategory[] = [];
      for (const cat of categories) {
        const count = await this.getCategoryCount(cat.id);
        formattedCategories.push({
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          type: 'job',
          status: cat.isActive ? 'active' : 'hidden',
          count: count,
          sortOrder: cat.order || 0,
          subcategories: cat.children.map(child => ({
            id: child.id,
            name: child.name,
            slug: child.slug,
            status: child.isActive ? 'active' : 'hidden',
            sortOrder: child.order || 0,
            icon: child.icon || undefined
          })),
          description: cat.description || undefined,
          logo: cat.icon || undefined
        });
      }

      return { success: true, data: formattedCategories };
    } catch (error) {
      console.error('Error fetching job categories:', error);
      console.log('Returning mock categories due to error');
      return { 
        success: true, 
        data: this.getMockJobCategories(),
        message: 'Using mock data due to database error'
      };
    }
  }

  async saveListingCategory(category: ListingCategory): Promise<ApiResponse> {
    try {
      console.log('Saving category:', category);
      
      // Check if it's a mock category
      if (category.id && category.id.startsWith('cat-mock-')) {
        return { 
          success: true, 
          data: category,
          message: 'Mock category saved (mock operation)'
        };
      }

      const subcategories = category.subcategories?.map(sub => ({
        name: sub.name,
        slug: sub.slug,
        icon: sub.icon,
        type: category.type === 'job' ? 'JOB' : 'GIG',
        isActive: sub.status === 'active',
        order: sub.sortOrder || 0
      })) || [];

      const savedCategory = await prisma.category.upsert({
        where: { id: category.id || '' },
        update: {
          name: category.name,
          slug: category.slug,
          type: category.type === 'job' ? 'JOB' : 'GIG',
          isActive: category.status === 'active',
          order: category.sortOrder || 0,
          description: category.description,
          icon: category.logo,
          children: { 
            deleteMany: {}, 
            create: subcategories as Prisma.CategoryCreateWithoutParentInput[] 
          }
        },
        create: {
          name: category.name,
          slug: category.slug,
          type: category.type === 'job' ? 'JOB' : 'GIG',
          isActive: category.status === 'active',
          order: category.sortOrder || 0,
          description: category.description,
          icon: category.logo,
          children: { 
            create: subcategories as Prisma.CategoryCreateWithoutParentInput[] 
          }
        }
      });

      console.log('Category saved successfully:', savedCategory.id);

      return { 
        success: true, 
        data: savedCategory,
        message: 'Category saved successfully'
      };
    } catch (error) {
      console.error('Error saving category:', error);
      return { 
        success: false, 
        error: 'Failed to save category',
        message: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async deleteListingCategory(id: string): Promise<ApiResponse> {
    try {
      console.log(`Attempting to delete category with ID: ${id}`);
      
      // Check if it's a mock category ID
      if (id.startsWith('cat-mock-')) {
        return { 
          success: true, 
          message: 'Mock category deleted (mock operation)',
          data: { id }
        };
      }

      const category = await prisma.category.findUnique({ where: { id } });
      if (!category) {
        return { 
          success: false, 
          error: 'Category not found',
          message: `Category with ID ${id} not found in database`
        };
      }

      await prisma.category.delete({ where: { id } });
      console.log(`Successfully deleted category ${id}`);

      return { 
        success: true, 
        message: 'Category deleted successfully',
        data: { id }
      };
    } catch (error) {
      console.error('Error deleting category:', error);
      return { 
        success: false, 
        error: 'Failed to delete category',
        message: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // ==================== PLANS ====================
  
  async getPlans(): Promise<ApiResponse<Plan[]>> {
    try {
      console.log('Fetching plans (using mock data)...');
      return { 
        success: true, 
        data: this.getMockPlans(),
        message: 'Using mock data for plans'
      };
    } catch (error) {
      console.error('Error in getPlans:', error);
      return { 
        success: true, 
        data: this.getMockPlans(),
        message: 'Using mock data due to error'
      };
    }
  }

  async savePlan(plan: Plan): Promise<ApiResponse> {
    try {
      console.log('Saving plan:', plan);
      // TODO: Implement plan saving when Plan model is created
      return { 
        success: true, 
        data: plan, 
        message: 'Plan saved successfully (mock operation)'
      };
    } catch (error) {
      console.error('Error saving plan:', error);
      return { 
        success: false, 
        error: 'Failed to save plan',
        message: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // ==================== DASHBOARD ====================
  
  async getDashboardStats(): Promise<ApiResponse> {
    try {
      console.log('Fetching dashboard stats...');
      
      const totalGigs = await prisma.gig.count();
      const activeGigs = await prisma.gig.count({ 
        where: { status: 'ACTIVE', isActive: true } 
      });
      const pendingGigs = await prisma.gig.count({ 
        where: { status: 'PENDING' } 
      });
      const totalCategories = await prisma.category.count();

      console.log(`Stats: ${totalGigs} gigs, ${activeGigs} active, ${pendingGigs} pending, ${totalCategories} categories`);

      const stats = {
        totalGigs,
        totalJobs: 0,
        activeGigs,
        pendingGigs,
        activeJobs: 0,
        pendingJobs: 0,
        totalCategories,
        totalPlans: 2,
        recentActivity: [
          { 
            type: 'gig', 
            action: 'created', 
            title: 'New logo design gig', 
            time: '2 hours ago' 
          },
          { 
            type: 'gig', 
            action: 'approved', 
            title: 'Web design gig approved', 
            time: '1 day ago' 
          },
          { 
            type: 'category', 
            action: 'created', 
            title: 'New category added', 
            time: '3 days ago' 
          }
        ]
      };

      return { success: true, data: stats };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      // Return mock stats if database error
      return { 
        success: true, 
        data: {
          totalGigs: 5,
          totalJobs: 3,
          activeGigs: 3,
          pendingGigs: 2,
          activeJobs: 2,
          pendingJobs: 1,
          totalCategories: 8,
          totalPlans: 2,
          recentActivity: [
            { type: 'gig', action: 'created', title: 'Mock gig created', time: 'Recently' }
          ]
        },
        message: 'Using mock stats due to database error'
      };
    }
  }

  // ==================== MOCK DATA GENERATORS ====================
  
  private getMockGigs(): any[] {
    return [
      {
        id: 'gig-mock-1',
        title: 'I will design a modern logo for your brand',
        description: 'Professional logo design service with multiple concepts and revisions.',
        category: 'Graphics & Design',
        subcategory: 'Logo Design',
        price: 50,
        pricingMode: 'packages',
        packages: [
          {
            name: 'Basic',
            description: 'Simple logo with 2 concepts',
            deliveryDays: 3,
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
        adminStatus: 'approved',
        image: 'https://picsum.photos/800/600?random=1',
        freelancerName: 'Alex Johnson',
        freelancerId: 'user-mock-1',
        freelancerAvatar: 'https://i.pravatar.cc/150?img=1',
        rating: 4.9,
        reviews: 127,
        views: 1250,
        clicks: 340,
        ordersCount: 89,
        isVisible: true,
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-03-20T14:15:00Z'
      },
      {
        id: 'gig-mock-2',
        title: 'Build a responsive website with React',
        description: 'Modern website development using React, TypeScript, and Tailwind CSS.',
        category: 'Programming & Tech',
        subcategory: 'Web Development',
        price: 500,
        pricingMode: 'packages',
        packages: [
          {
            name: 'Standard',
            description: 'Responsive website with CMS',
            deliveryDays: 14,
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
        status: 'pending',
        adminStatus: 'pending',
        image: 'https://picsum.photos/800/600?random=2',
        freelancerName: 'Sam Wilson',
        freelancerId: 'user-mock-2',
        freelancerAvatar: 'https://i.pravatar.cc/150?img=2',
        rating: 0,
        reviews: 0,
        views: 0,
        clicks: 0,
        ordersCount: 0,
        isVisible: false,
        createdAt: '2024-03-18T09:00:00Z',
        updatedAt: '2024-03-18T09:00:00Z'
      },
      {
        id: 'gig-mock-3',
        title: 'Social media graphics package',
        description: 'Complete set of social media graphics for your brand.',
        category: 'Graphics & Design',
        subcategory: 'Social Media Design',
        price: 100,
        pricingMode: 'fixed',
        packages: [],
        extras: [],
        faqs: [],
        requirements: [],
        images: ['https://picsum.photos/800/600?random=3'],
        videos: [],
        documents: [],
        status: 'paused',
        adminStatus: 'approved',
        image: 'https://picsum.photos/800/600?random=3',
        freelancerName: 'Jamie Smith',
        freelancerId: 'user-mock-3',
        freelancerAvatar: 'https://i.pravatar.cc/150?img=3',
        rating: 4.7,
        reviews: 45,
        views: 560,
        clicks: 120,
        ordersCount: 32,
        isVisible: false,
        createdAt: '2024-02-10T14:20:00Z',
        updatedAt: '2024-03-15T11:30:00Z'
      }
    ];
  }

  private getMockJobs(): any[] {
    return [
      {
        id: 'job-mock-1',
        title: 'React Developer Needed for E-commerce Project',
        description: 'We are looking for an experienced React developer to build a modern e-commerce dashboard. Must have experience with TypeScript, Redux, and Material-UI.',
        budget: '$5,000 - $10,000',
        type: 'fixed',
        category: 'Programming & Tech',
        subcategory: 'Web Development',
        tags: ['React', 'TypeScript', 'Redux', 'Material-UI'],
        status: 'active',
        adminStatus: 'approved',
        employerName: 'TechCorp Inc.',
        employerId: 'employer-mock-1',
        postedTime: '2 days ago',
        applications: 24,
        isRemote: true,
        location: 'Remote',
        duration: '3-6 months',
        skills: ['React', 'TypeScript', 'Redux', 'Material-UI', 'REST APIs'],
        experienceLevel: 'intermediate',
        createdAt: '2024-03-18T09:00:00Z',
        updatedAt: '2024-03-18T09:00:00Z'
      }
    ];
  }

  private getMockGigCategories(): ListingCategory[] {
    return [
      {
        id: 'cat-mock-1',
        name: 'Graphics & Design',
        slug: 'graphics-design',
        type: 'gig',
        status: 'active',
        count: 24,
        sortOrder: 1,
        subcategories: [
          {
            id: 'sub-mock-1',
            name: 'Logo Design',
            slug: 'logo-design',
            status: 'active',
            sortOrder: 1,
            icon: 'https://cdn-icons-png.flaticon.com/512/732/732004.png'
          },
          {
            id: 'sub-mock-2',
            name: 'Brand Style Guides',
            slug: 'brand-style-guides',
            status: 'active',
            sortOrder: 2,
            icon: 'https://cdn-icons-png.flaticon.com/512/2972/2972544.png'
          }
        ],
        description: 'Design services including logos, branding, and graphics',
        logo: 'https://cdn-icons-png.flaticon.com/512/2972/2972544.png'
      },
      {
        id: 'cat-mock-2',
        name: 'Programming & Tech',
        slug: 'programming-tech',
        type: 'gig',
        status: 'active',
        count: 42,
        sortOrder: 2,
        subcategories: [
          {
            id: 'sub-mock-3',
            name: 'Web Development',
            slug: 'web-development',
            status: 'active',
            sortOrder: 1,
            icon: '🌐'
          },
          {
            id: 'sub-mock-4',
            name: 'Mobile App Development',
            slug: 'mobile-app-development',
            status: 'active',
            sortOrder: 2,
            icon: '📱'
          }
        ],
        description: 'Programming and technical services',
        logo: '💻'
      }
    ];
  }

  private getMockJobCategories(): ListingCategory[] {
    return [
      {
        id: 'cat-mock-3',
        name: 'Programming & Tech',
        slug: 'programming-tech-jobs',
        type: 'job',
        status: 'active',
        count: 15,
        sortOrder: 1,
        subcategories: [
          {
            id: 'sub-mock-5',
            name: 'Web Development',
            slug: 'web-development-jobs',
            status: 'active',
            sortOrder: 1,
            icon: '🌐'
          },
          {
            id: 'sub-mock-6',
            name: 'Data Science',
            slug: 'data-science-jobs',
            status: 'active',
            sortOrder: 2,
            icon: '📊'
          }
        ],
        description: 'Programming and technical job opportunities',
        logo: '💻'
      },
      {
        id: 'cat-mock-4',
        name: 'Marketing',
        slug: 'marketing-jobs',
        type: 'job',
        status: 'active',
        count: 8,
        sortOrder: 2,
        subcategories: [
          {
            id: 'sub-mock-7',
            name: 'Digital Marketing',
            slug: 'digital-marketing-jobs',
            status: 'active',
            sortOrder: 1,
            icon: '📈'
          },
          {
            id: 'sub-mock-8',
            name: 'Content Writing',
            slug: 'content-writing-jobs',
            status: 'active',
            sortOrder: 2,
            icon: '✍️'
          }
        ],
        description: 'Marketing and advertising job opportunities',
        logo: '📢'
      }
    ];
  }

  private getMockPlans(): Plan[] {
    return [
      {
        id: 'plan-mock-1',
        name: 'Freelancer Basic',
        type: 'freelancer',
        price: 9.99,
        interval: 'monthly',
        currency: 'USD',
        isActive: true,
        isPopular: false,
        features: [
          { id: 'ft-1', name: '5 Active Gigs', included: true },
          { id: 'ft-2', name: 'Basic Analytics', included: true },
          { id: 'ft-3', name: '24/7 Support', included: false }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'plan-mock-2',
        name: 'Freelancer Pro',
        type: 'freelancer',
        price: 19.99,
        interval: 'monthly',
        currency: 'USD',
        isActive: true,
        isPopular: true,
        features: [
          { id: 'ft-4', name: 'Unlimited Gigs', included: true },
          { id: 'ft-5', name: 'Advanced Analytics', included: true },
          { id: 'ft-6', name: 'Priority Support', included: true }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
  }

  // ==================== HELPER METHODS ====================
  
  private mapStatusToAdminStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'PENDING': 'pending',
      'ACTIVE': 'approved',
      'REJECTED': 'rejected',
      'PAUSED': 'paused',
      'DRAFT': 'draft'
    };
    return statusMap[status] || 'pending';
  }

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  private async getCategoryCount(categoryId: string): Promise<number> {
    try {
      const gigCount = await prisma.gig.count({ where: { categoryId } });
      return gigCount;
    } catch (error) {
      console.error(`Error getting count for category ${categoryId}:`, error);
      return 0;
    }
  }
}

export const gigsJobsAdminService = new GigsJobsAdminService();
