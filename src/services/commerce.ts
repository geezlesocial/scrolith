import api from "./api";
import type { Gig, Category } from "../types";

type ApiResult<T> = { data: T };

function unwrap<T>(res: any): T {
  // Handles both axios-style { data: ... } and direct objects.
  if (res && typeof res === "object" && "data" in res) return (res as ApiResult<T>).data;
  return res as T;
}

const unwrapResponse = <T>(response: any, fallback: T): T => {
  const data = response?.data ?? response;
  if (data?.success === false) {
    const message = data?.error || 'Request failed';
    throw new Error(message);
  }
  if (data?.success && data?.data !== undefined) return data.data as T;
  if (Array.isArray(data?.gigs)) return data.gigs as T;
  if (data?.data !== undefined) return data.data as T;
  if (data !== undefined) return data as T;
  return fallback;
};

export const commerceService = {
  // Get all gigs
  async getGigs(filters?: Record<string, any>) {
    const response = await api.get("/commerce/gigs", { params: filters || {} });
    return unwrapResponse<any[]>(response, []);
  },

  // Get gig by ID
  async getGigById(id: string): Promise<Gig> {
    if (!id) throw new Error("Gig ID is required");
    const response = await api.get(`/commerce/gigs/${encodeURIComponent(id)}`);
    return unwrapResponse<Gig>(response, {} as Gig);
  },

  // Get categories
  async getCategories(): Promise<Category[]> {
    // Try the canonical public endpoint first, fall back to admin-mounted endpoint
    try {
      const response = await api.get("/commerce/categories");
      const data = unwrapResponse<any>(response, {});

      if (Array.isArray(data)) return data as Category[];
      if (data?.categories && Array.isArray(data.categories)) return data.categories as Category[];
      if (data?.data?.categories && Array.isArray(data.data.categories)) return data.data.categories as Category[];
      // If the canonical endpoint returned an empty/unknown shape, fall through to admin fallback
    } catch (e) {
      // ignore and try admin-mounted route below
    }

    // Fallback: some dev servers mount commerce routes under /api/admin
    try {
      const adminResp = await api.get("/admin/commerce/categories");
      const adminData = unwrapResponse<any>(adminResp, {});
      if (Array.isArray(adminData)) return adminData as Category[];
      if (adminData?.categories && Array.isArray(adminData.categories)) return adminData.categories as Category[];
      if (adminData?.data?.categories && Array.isArray(adminData.data.categories)) return adminData.data.categories as Category[];
    } catch (e) {
      // final fallback: return empty
    }

    return [];
  },

  // Create gig
  async createGig(gigData: Partial<Gig>): Promise<Gig> {
    const response = await api.post("/commerce/gigs", gigData);
    return unwrap<Gig>(response);
  },

  // Update gig
  async updateGig(id: string, gigData: Partial<Gig>): Promise<Gig> {
    if (!id) throw new Error("Gig ID is required");
    const response = await api.put(`/commerce/gigs/${encodeURIComponent(id)}`, gigData);
    return unwrap<Gig>(response);
  },

  // Delete gig
  async deleteGig(id: string): Promise<void> {
    if (!id) throw new Error("Gig ID is required");
    await api.delete(`/commerce/gigs/${encodeURIComponent(id)}`);
  },

  // Purchase gig
  async purchaseGig(id: string, payload: { provider?: string; packageIndex?: number; extras?: any[]; currency?: string; country?: string }) {
    if (!id) throw new Error("Gig ID is required");
    try {
      const response = await api.post(`/commerce/gigs/${encodeURIComponent(id)}/purchase`, payload || {});
      return unwrapResponse<any>(response, {});
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Unable to start payment.';
      throw new Error(message);
    }
  }
};
