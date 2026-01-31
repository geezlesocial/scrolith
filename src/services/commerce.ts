import api from "./api";
import type { Gig, Category } from "../types";

type ApiResult<T> = { data: T };

function unwrap<T>(res: any): T {
  // Handles both axios-style { data: ... } and direct objects.
  if (res && typeof res === "object" && "data" in res) return (res as ApiResult<T>).data;
  return res as T;
}

export const commerceService = {
  // Get all gigs
  async getGigs(filters?: Record<string, any>) {
    const response = await api.get("/commerce/gigs", { params: filters || {} });
    return unwrap<any>(response);
  },

  // Get gig by ID
  async getGigById(id: string): Promise<Gig> {
    if (!id) throw new Error("Gig ID is required");
    const response = await api.get(`/commerce/gigs/${encodeURIComponent(id)}`);
    return unwrap<Gig>(response);
  },

  // Get categories
  async getCategories(): Promise<Category[]> {
    // Try the canonical public endpoint first, fall back to admin-mounted endpoint
    try {
      const response = await api.get("/commerce/categories");
      const data = unwrap<any>(response);

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
      const adminData = unwrap<any>(adminResp);
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
};
