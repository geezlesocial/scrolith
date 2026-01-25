import { db } from '../data/db';
import { Gig, ApiResponse } from '../types';

export class GigService {
  getAllGigs(): ApiResponse<Gig[]> {
    try {
      const gigs = db.getGigs();
      return { success: true, data: gigs };
    } catch (error) {
      return { success: false, error: 'Failed to fetch gigs' };
    }
  }

  getGigById(id: string): ApiResponse<Gig> {
    try {
      const gig = db.getGigById(id);
      if (!gig) {
        return { success: false, error: 'Gig not found' };
      }
      return { success: true, data: gig };
    } catch (error) {
      return { success: false, error: 'Failed to fetch gig' };
    }
  }

  createGig(gigData: Partial<Gig>): ApiResponse<Gig> {
    try {
      const gig: Gig = {
        id: '',
        title: gigData.title || '',
        description: gigData.description || '',
        category: gigData.category || '',
        subcategory: gigData.subcategory || '',
        price: gigData.price || 0,
        pricingMode: gigData.pricingMode || 'packages',
        packages: gigData.packages || [],
        extras: gigData.extras || [],
        faqs: gigData.faqs || [],
        requirements: gigData.requirements || [],
        images: gigData.images || [],
        videos: gigData.videos || [],
        documents: gigData.documents || [],
        freelancerName: gigData.freelancerName || '',
        freelancerId: gigData.freelancerId || '',
        freelancerAvatar: gigData.freelancerAvatar || '',
        status: gigData.status || 'draft',
        adminStatus: gigData.adminStatus || 'pending',
        rating: 0,
        reviews: 0,
        views: 0,
        clicks: 0,
        ordersCount: 0,
        isVisible: true,
        createdAt: '',
        updatedAt: ''
      };

      const savedGig = db.saveGig(gig);
      return { success: true, data: savedGig, message: 'Gig created successfully' };
    } catch (error) {
      return { success: false, error: 'Failed to create gig' };
    }
  }

  updateGig(id: string, gigData: Partial<Gig>): ApiResponse<Gig> {
    try {
      const existingGig = db.getGigById(id);
      if (!existingGig) {
        return { success: false, error: 'Gig not found' };
      }

      const updatedGig = { ...existingGig, ...gigData, updatedAt: new Date().toISOString() };
      db.saveGig(updatedGig);
      return { success: true, data: updatedGig, message: 'Gig updated successfully' };
    } catch (error) {
      return { success: false, error: 'Failed to update gig' };
    }
  }

  deleteGig(id: string): ApiResponse {
    try {
      const success = db.deleteGig(id);
      if (!success) {
        return { success: false, error: 'Gig not found' };
      }
      return { success: true, message: 'Gig deleted successfully' };
    } catch (error) {
      return { success: false, error: 'Failed to delete gig' };
    }
  }

  updateGigStatus(id: string, status: Gig['status'], adminStatus?: Gig['adminStatus']): ApiResponse<Gig> {
    try {
      const gig = db.getGigById(id);
      if (!gig) {
        return { success: false, error: 'Gig not found' };
      }

      const updates: Partial<Gig> = {
        status,
        updatedAt: new Date().toISOString()
      };

      if (adminStatus) {
        updates.adminStatus = adminStatus;
      }

      const updatedGig = db.saveGig({ ...gig, ...updates });
      return { success: true, data: updatedGig, message: 'Gig status updated' };
    } catch (error) {
      return { success: false, error: 'Failed to update gig status' };
    }
  }

  getGigsByStatus(status: Gig['status']): ApiResponse<Gig[]> {
    try {
      const gigs = db.getGigs().filter(g => g.status === status);
      return { success: true, data: gigs };
    } catch (error) {
      return { success: false, error: 'Failed to fetch gigs by status' };
    }
  }

  searchGigs(query: string): ApiResponse<Gig[]> {
    try {
      const gigs = db.getGigs().filter(g => 
        g.title.toLowerCase().includes(query.toLowerCase()) ||
        g.description.toLowerCase().includes(query.toLowerCase()) ||
        g.category.toLowerCase().includes(query.toLowerCase())
      );
      return { success: true, data: gigs };
    } catch (error) {
      return { success: false, error: 'Failed to search gigs' };
    }
  }
}

export const gigService = new GigService();