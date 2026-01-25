import { db } from '../data/db';
import { Gig, Job, ListingCategory, Plan, ApiResponse } from '../types';
import { gigService } from './GigService';

export class AdminService {
  // Gigs
  getAdminGigs(): ApiResponse<Gig[]> {
    try {
      const gigs = db.getGigs();
      return { success: true, data: gigs };
    } catch (error) {
      return { success: false, error: 'Failed to fetch admin gigs' };
    }
  }

  approveListing(type: 'gig' | 'job', id: string, status: string): ApiResponse {
    try {
      if (type === 'gig') {
        const gig = db.getGigById(id);
        if (!gig) {
          return { success: false, error: 'Gig not found' };
        }
        gig.status = status === 'active' ? 'active' : 'rejected';
        gig.adminStatus = status === 'active' ? 'approved' : 'rejected';
        db.saveGig(gig);
        return { success: true, message: `Gig ${status} successfully` };
      } else {
        const job = db.getJobById(id);
        if (!job) {
          return { success: false, error: 'Job not found' };
        }
        job.status = status === 'active' ? 'active' : 'rejected';
        job.adminStatus = status === 'active' ? 'approved' : 'rejected';
        db.saveJob(job);
        return { success: true, message: `Job ${status} successfully` };
      }
    } catch (error) {
      return { success: false, error: 'Failed to approve listing' };
    }
  }

  // Categories
  getGigCategories(): ApiResponse<ListingCategory[]> {
    try {
      const categories = db.getCategories('gig');
      return { success: true, data: categories };
    } catch (error) {
      return { success: false, error: 'Failed to fetch gig categories' };
    }
  }

  getJobCategories(): ApiResponse<ListingCategory[]> {
    try {
      const categories = db.getCategories('job');
      return { success: true, data: categories };
    } catch (error) {
      return { success: false, error: 'Failed to fetch job categories' };
    }
  }

  saveListingCategory(category: ListingCategory): ApiResponse<ListingCategory> {
    try {
      const savedCategory = db.saveCategory(category);
      return { success: true, data: savedCategory, message: 'Category saved successfully' };
    } catch (error) {
      return { success: false, error: 'Failed to save category' };
    }
  }

  deleteListingCategory(id: string): ApiResponse {
    try {
      const success = db.deleteCategory(id);
      if (!success) {
        return { success: false, error: 'Category not found' };
      }
      return { success: true, message: 'Category deleted successfully' };
    } catch (error) {
      return { success: false, error: 'Failed to delete category' };
    }
  }

  // Plans
  getPlans(): ApiResponse<Plan[]> {
    try {
      const plans = db.getPlans();
      return { success: true, data: plans };
    } catch (error) {
      return { success: false, error: 'Failed to fetch plans' };
    }
  }

  savePlan(plan: Plan): ApiResponse<Plan> {
    try {
      const savedPlan = db.savePlan(plan);
      return { success: true, data: savedPlan, message: 'Plan saved successfully' };
    } catch (error) {
      return { success: false, error: 'Failed to save plan' };
    }
  }

  // Dashboard Stats
  getDashboardStats(): ApiResponse {
    try {
      const gigs = db.getGigs();
      const jobs = db.getJobs();
      
      const stats = {
        totalGigs: gigs.length,
        totalJobs: jobs.length,
        activeGigs: gigs.filter(g => g.status === 'active').length,
        pendingGigs: gigs.filter(g => g.adminStatus === 'pending').length,
        activeJobs: jobs.filter(j => j.status === 'active').length,
        pendingJobs: jobs.filter(j => j.adminStatus === 'pending').length,
        totalCategories: db.getCategories().length,
        totalPlans: db.getPlans().length,
        recentActivity: [
          { type: 'gig', action: 'created', title: 'New logo design gig', time: '2 hours ago' },
          { type: 'job', action: 'submitted', title: 'React developer job', time: '5 hours ago' },
          { type: 'gig', action: 'approved', title: 'Web design gig approved', time: '1 day ago' }
        ]
      };

      return { success: true, data: stats };
    } catch (error) {
      return { success: false, error: 'Failed to fetch dashboard stats' };
    }
  }
}

export const adminService = new AdminService();