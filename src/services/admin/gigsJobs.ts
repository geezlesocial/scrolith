import { ApiResponse, Gig, Job, ListingCategory, Plan, AdminDashboardStats } from '@/types';

const API_BASE = '/api/admin/gigs-jobs';

export const GigsJobsService = {
  // Get all gigs
  async getGigs(filters?: any): Promise<ApiResponse<Gig[]>> {
    const response = await fetch(`${API_BASE}/gigs`);
    return response.json();
  },

  // Get all jobs
  async getJobs(filters?: any): Promise<ApiResponse<Job[]>> {
    const response = await fetch(`${API_BASE}/jobs`);
    return response.json();
  },

  // Get gig categories
  async getGigCategories(): Promise<ApiResponse<ListingCategory[]>> {
    const response = await fetch(`${API_BASE}/categories/gigs`);
    return response.json();
  },

  // Get job categories
  async getJobCategories(): Promise<ApiResponse<ListingCategory[]>> {
    const response = await fetch(`${API_BASE}/categories/jobs`);
    return response.json();
  },

  // Get plans
  async getPlans(): Promise<ApiResponse<Plan[]>> {
    const response = await fetch(`${API_BASE}/plans`);
    return response.json();
  },

  // Get dashboard stats
  async getDashboardStats(): Promise<ApiResponse<AdminDashboardStats>> {
    const response = await fetch(`${API_BASE}/dashboard/stats`);
    return response.json();
  },

  // Approve/Reject gig
  async approveGig(gigId: string, action: 'approve' | 'reject', notes?: string): Promise<ApiResponse> {
    const response = await fetch(`${API_BASE}/gigs/${gigId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, notes }),
    });
    return response.json();
  },

  // Delete gig
  async deleteGig(gigId: string, reason: string): Promise<ApiResponse> {
    const response = await fetch(`${API_BASE}/gigs/${gigId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    });
    return response.json();
  },

  // Create/Update category
  async saveCategory(categoryData: any): Promise<ApiResponse> {
    const response = await fetch(`${API_BASE}/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(categoryData),
    });
    return response.json();
  },

  // Delete category
  async deleteCategory(categoryId: string): Promise<ApiResponse> {
    const response = await fetch(`${API_BASE}/categories/${categoryId}`, {
      method: 'DELETE',
    });
    return response.json();
  },

  // Create/Update plan
  async savePlan(planData: any): Promise<ApiResponse> {
    const response = await fetch(`${API_BASE}/plans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(planData),
    });
    return response.json();
  }
};