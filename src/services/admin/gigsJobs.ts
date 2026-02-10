import { ApiResponse, Gig, Job, ListingCategory, Plan, AdminDashboardStats } from '@/types';

import { getApiBaseUrl } from '../../utils/apiBase';
import { tokenStore } from '../tokenStore';

const API_BASE = `${getApiBaseUrl()}/admin/gigs-jobs`;

const getAdminHeaders = async () => {
  const userRaw = localStorage.getItem('user');
  let userId: string | undefined;
  try {
    const parsed = userRaw ? JSON.parse(userRaw) : null;
    userId = parsed?.id;
  } catch {
    userId = undefined;
  }
  const token = await tokenStore.get();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user-role': 'admin'
  };
  if (userId) headers['x-user-id'] = userId;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

export const GigsJobsService = {
  // Get all gigs
  async getGigs(filters?: any): Promise<ApiResponse<Gig[]>> {
    const response = await fetch(`${API_BASE}/gigs`, { headers: await getAdminHeaders() });
    return response.json();
  },

  // Get all jobs
  async getJobs(filters?: any): Promise<ApiResponse<Job[]>> {
    const response = await fetch(`${API_BASE}/jobs`, { headers: await getAdminHeaders() });
    return response.json();
  },

  // Get gig categories
  async getGigCategories(): Promise<ApiResponse<ListingCategory[]>> {
    const response = await fetch(`${API_BASE}/categories/gigs`, { headers: await getAdminHeaders() });
    return response.json();
  },

  // Get job categories
  async getJobCategories(): Promise<ApiResponse<ListingCategory[]>> {
    const response = await fetch(`${API_BASE}/categories/jobs`, { headers: await getAdminHeaders() });
    return response.json();
  },

  // Get plans
  async getPlans(): Promise<ApiResponse<Plan[]>> {
    const response = await fetch(`${API_BASE}/plans`, { headers: await getAdminHeaders() });
    return response.json();
  },

  // Get dashboard stats
  async getDashboardStats(): Promise<ApiResponse<AdminDashboardStats>> {
    const response = await fetch(`${API_BASE}/dashboard/stats`, { headers: await getAdminHeaders() });
    return response.json();
  },

  // Approve/Reject gig
  async approveGig(gigId: string, action: 'approve' | 'reject', notes?: string): Promise<ApiResponse> {
    const response = await fetch(`${API_BASE}/gigs/${gigId}/approve`, {
      method: 'POST',
      headers: await getAdminHeaders(),
      body: JSON.stringify({ action, notes }),
    });
    return response.json();
  },

  // Delete gig
  async deleteGig(gigId: string, reason: string): Promise<ApiResponse> {
    const response = await fetch(`${API_BASE}/gigs/${gigId}`, {
      method: 'DELETE',
      headers: await getAdminHeaders(),
      body: JSON.stringify({ reason }),
    });
    return response.json();
  },

  // Create/Update category
  async saveCategory(categoryData: any): Promise<ApiResponse> {
    const response = await fetch(`${API_BASE}/categories`, {
      method: 'POST',
      headers: await getAdminHeaders(),
      body: JSON.stringify(categoryData),
    });
    return response.json();
  },

  // Delete category
  async deleteCategory(categoryId: string): Promise<ApiResponse> {
    const response = await fetch(`${API_BASE}/categories/${categoryId}`, {
      method: 'DELETE',
      headers: await getAdminHeaders()
    });
    return response.json();
  },

  // Create/Update plan
  async savePlan(planData: any): Promise<ApiResponse> {
    const response = await fetch(`${API_BASE}/plans`, {
      method: 'POST',
      headers: await getAdminHeaders(),
      body: JSON.stringify(planData),
    });
    return response.json();
  }
};
